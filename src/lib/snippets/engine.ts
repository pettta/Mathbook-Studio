/**
 * CodeMirror 6 extension implementing the LaTeX Suite editing model:
 *   - auto-expanding and Tab-expanding snippets with tabstops
 *   - visual snippets (select text, press a key)
 *   - auto-fraction: "a+b/" -> \frac{a+b}{}
 *   - tab-out of brackets and math delimiters
 *   - matrix / align shortcuts: Tab -> " & ", Enter -> " \\", Shift-Enter
 */
import { EditorView, keymap } from '@codemirror/view'
import { EditorSelection, Prec, Facet, type Extension, type EditorState } from '@codemirror/state'
import { snippet, hasNextSnippetField, nextSnippetField, prevSnippetField, clearSnippet } from '@codemirror/autocomplete'
import { getContext, type LatexContext } from './context'
import { compileSnippet, type CompiledSnippet, type Snippet } from './types'

export interface SnippetSettings {
  snippets: Snippet[]
  autofraction: boolean
  tabout: boolean
  matrixShortcuts: boolean
  enabled: boolean
}

export const snippetSettings = Facet.define<SnippetSettings, SnippetSettings>({
  combine: (v) => v[0] ?? { snippets: [], autofraction: true, tabout: true, matrixShortcuts: true, enabled: true },
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function modeOk(s: CompiledSnippet, ctx: LatexContext): boolean {
  const inMath = ctx.inMath && !ctx.inTextMacro
  switch (s.mode) {
    case 'any': return true
    case 'text': return !inMath
    case 'math': return inMath
    case 'block': return inMath && ctx.block
    case 'inline': return inMath && !ctx.block
  }
}

/** Convert LaTeX-Suite tabstop syntax to CodeMirror's `${n}` / `${n:default}`. */
function toCmTemplate(rep: string): string {
  // LaTeX Suite visits $0 first; CodeMirror treats ${0} as the *final* stop.
  // So shift every number up by one: $0 -> ${1}, ${1:x} -> ${2:x}, ...
  return rep
    .replace(/\$\{(\d+)(:[^}]*)?\}/g, (_, n, d) => '${' + (Number(n) + 1) + (d ?? '') + '}')
    .replace(/\$(\d+)/g, (_, n) => '${' + (Number(n) + 1) + '}')
}

function applyRegexGroups(rep: string, m: RegExpMatchArray): string {
  return rep.replace(/\[\[(\d+)\]\]/g, (_, g) => m[Number(g) + 1] ?? '')
}

interface Match { snippet: CompiledSnippet; from: number; template: string }

const MAX_LOOKBACK = 300

/** Find the best snippet whose trigger ends exactly at `pos` in `text` (text = doc up to pos). */
function findTrigger(state: EditorState, pos: number, snippets: CompiledSnippet[], auto: boolean): Match | null {
  const startWindow = Math.max(0, pos - MAX_LOOKBACK)
  const before = state.sliceDoc(startWindow, pos)
  const ctx = getContext(state.doc.toString(), pos)
  let best: Match | null = null
  let bestPrio = -Infinity
  let bestLen = -1
  for (const s of snippets) {
    if (s.visual || s.auto !== auto) continue
    if (!modeOk(s, ctx)) continue
    const prio = s.priority ?? 0
    if (s.regex) {
      const m = s.regex.exec(before)
      if (!m || m[0].length === 0) continue
      if (s.word && m.index > 0 && /\w/.test(before[m.index - 1])) continue
      const len = m[0].length
      if (prio > bestPrio || (prio === bestPrio && len > bestLen)) {
        const rep = typeof s.replacement === 'function' ? s.replacement(m) : applyRegexGroups(s.replacement, m)
        best = { snippet: s, from: pos - len, template: toCmTemplate(rep) }
        bestPrio = prio; bestLen = len
      }
    } else {
      const t = s.trigger
      if (!before.endsWith(t)) continue
      const start = before.length - t.length
      const prev = start > 0 ? before[start - 1] : ''
      if (s.word && prev && /\w/.test(prev)) continue
      // don't fire on the tail of a control word: "\sum" must not re-expand "sum"
      if (/^[A-Za-z]/.test(t) && prev === '\\') continue
      if (/^[A-Za-z]/.test(t) && !s.word && prev && /[A-Za-z]/.test(prev)) {
        // trigger is the tail of a longer identifier inside a macro, e.g. "\mathrm"+"rm"
        const wordStart = before.slice(0, start).search(/[A-Za-z]+$/)
        if (wordStart >= 0 && before[wordStart - 1] === '\\') continue
      }
      if (prio > bestPrio || (prio === bestPrio && t.length > bestLen)) {
        best = { snippet: s, from: pos - t.length, template: toCmTemplate(s.replacement as string) }
        bestPrio = prio; bestLen = t.length
      }
    }
  }
  return best
}

function expand(view: EditorView, m: Match, to: number) {
  snippet(m.template)(view, null, m.from, to)
}

// ---------------------------------------------------------------------------
// auto-fraction
// ---------------------------------------------------------------------------

const OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
const STOP = new Set([' ', '\t', '\n', '$', '=', '+', '-', '<', '>', ',', ';', ':', '&', '(', '[', '{', '|', '~'])

/** Returns [from, numerator] for the fraction numerator ending at pos, or null. */
function numeratorBefore(doc: string, pos: number): { from: number; text: string } | null {
  let i = pos
  // walk back
  while (i > 0) {
    const ch = doc[i - 1]
    if (ch in OPEN) {
      // skip to the matching opener (bracket-aware)
      let depth = 0
      let j = i - 1
      for (; j >= 0; j--) {
        const c = doc[j]
        if (c in OPEN) depth++
        else if (c === OPEN[ch]) { depth--; if (depth === 0) break }
      }
      if (j < 0) return null
      i = j
      // include a preceding control word or \left
      const macro = /\\[A-Za-z]+\s*$/.exec(doc.slice(Math.max(0, i - 40), i))
      if (macro) i -= macro[0].length
      // and keep going: a bracketed group could be preceded by more (e.g. x^{2})
      continue
    }
    if (STOP.has(ch)) break
    if (ch === '\\') { i--; break }  // lone backslash: stop (escaped char handled below)
    // allow letters, digits, ., ^, _, ', \ inside macros
    i--
    // if we've just consumed a control word, include its backslash
    if (/[A-Za-z]/.test(ch)) {
      let k = i
      while (k > 0 && /[A-Za-z]/.test(doc[k - 1])) k--
      if (doc[k - 1] === '\\') { i = k - 1 }
    }
  }
  const text = doc.slice(i, pos)
  if (!text.trim()) return null
  // a bare bracketed group loses its parentheses:  (a+b)/ -> \frac{a+b}{}
  if (/^\((.*)\)$/s.test(text) && balanced(text.slice(1, -1))) return { from: i, text: text.slice(1, -1) }
  return { from: i, text }
}

function balanced(s: string): boolean {
  let d = 0
  for (const c of s) { if (c === '(') d++; else if (c === ')') { d--; if (d < 0) return false } }
  return d === 0
}

// ---------------------------------------------------------------------------
// tab-out
// ---------------------------------------------------------------------------

const CLOSERS = ['\\right)', '\\right]', '\\right\\}', '\\right|', '\\right\\rangle', '\\right\\rceil', '\\right\\rfloor', '\\right.', '\\rangle', '\\rvert', '\\rVert', '\\rceil', '\\rfloor', '\\}', '$$', ')', ']', '}', '$', '|']

function tabout(view: EditorView, ctx: LatexContext): boolean {
  const { state } = view
  const pos = state.selection.main.head
  const after = state.sliceDoc(pos, pos + 20)
  // skip whitespace then a closer
  const ws = /^\s*/.exec(after)![0]
  for (const c of CLOSERS) {
    if (after.startsWith(c, ws.length)) {
      const np = pos + ws.length + c.length
      view.dispatch({ selection: { anchor: np }, scrollIntoView: true })
      return true
    }
  }
  // inside inline math with only whitespace before the closing $: jump past it
  if (ctx.inMath && ctx.mathDelim === '$') {
    const rest = state.sliceDoc(pos, Math.min(state.doc.length, pos + 400))
    const m = /^[ \t]*\$/.exec(rest)
    if (m) { view.dispatch({ selection: { anchor: pos + m[0].length } }); return true }
  }
  return false
}

// ---------------------------------------------------------------------------
// the extension
// ---------------------------------------------------------------------------

export function latexSnippets(): Extension {
  let compiledCache: { src: Snippet[]; list: CompiledSnippet[] } | null = null
  const compiled = (state: EditorState): CompiledSnippet[] => {
    const src = state.facet(snippetSettings).snippets
    if (!compiledCache || compiledCache.src !== src) {
      const list = src.map((s) => { try { return compileSnippet(s) } catch { return null } }).filter(Boolean) as CompiledSnippet[]
      compiledCache = { src, list }
    }
    return compiledCache.list
  }

  const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
    const settings = view.state.facet(snippetSettings)
    if (!settings.enabled || text.length === 0 || text.includes('\n')) return false
    const sel = view.state.selection.main
    const snippets = compiled(view.state)

    // ---- visual snippets: selection + single key (not while a tabstop default is selected)
    if (!sel.empty && text.length === 1 && !hasNextSnippetField(view.state)) {
      const ctx = getContext(view.state.doc.toString(), sel.from)
      const vis = snippets.filter((s) => s.visual && s.trigger === text && modeOk(s, ctx))
      if (vis.length) {
        const selected = view.state.sliceDoc(sel.from, sel.to)
        const template = toCmTemplate((vis[0].replacement as string).replace(/\$\{VISUAL\}/g, selected))
        snippet(template)(view, null, sel.from, sel.to)
        return true
      }
    }
    if (!sel.empty || from !== sel.from || to !== sel.to) return false

    // ---- auto-fraction
    if (settings.autofraction && text === '/') {
      const doc = view.state.doc.toString()
      const ctx = getContext(doc, from)
      if (ctx.inMath && !ctx.inTextMacro) {
        if (doc[from - 1] === '/') {
          // "//" -> \frac{}{}
          snippet('\\frac{${0}}{${1}}${2}')(view, null, from - 1, to)
          return true
        }
        const num = numeratorBefore(doc, from)
        if (num) {
          const esc = num.text.replace(/\$\{/g, '$\\{')
          snippet('\\frac{' + esc + '}{${0}}${1}')(view, null, num.from, to)
          return true
        }
      }
    }

    // ---- auto snippets: check with the typed text appended
    const probe = view.state.update({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    const m = findTrigger(probe.state, from + text.length, snippets, true)
    if (m) {
      // the trigger ends with the pending text, so replace [m.from, to] in the
      // current document with the expansion in a single transaction
      snippet(m.template)(view, null, m.from, to)
      return true
    }
    return false
  })

  const tabKey = (view: EditorView): boolean => {
    const settings = view.state.facet(snippetSettings)
    if (!settings.enabled) return false
    const sel = view.state.selection.main
    if (!sel.empty) return false
    const pos = sel.head
    // 1. Tab-triggered snippet
    const m = findTrigger(view.state, pos, compiled(view.state), false)
    if (m) { expand(view, m, pos); return true }
    // 2. next tabstop
    if (hasNextSnippetField(view.state)) return nextSnippetField(view)
    const ctx = getContext(view.state.doc.toString(), pos)
    // 3. matrix: insert &
    if (settings.matrixShortcuts && ctx.inMath && ctx.matrixEnv) {
      view.dispatch(view.state.replaceSelection(' & '))
      return true
    }
    // 4. tab-out
    if (settings.tabout && tabout(view, ctx)) return true
    return false
  }

  const enterKey = (view: EditorView): boolean => {
    const settings = view.state.facet(snippetSettings)
    if (!settings.enabled || !settings.matrixShortcuts) return false
    const sel = view.state.selection.main
    if (!sel.empty) return false
    const ctx = getContext(view.state.doc.toString(), sel.head)
    if (!(ctx.inMath && ctx.matrixEnv)) return false
    const line = view.state.doc.lineAt(sel.head)
    const indent = /^\s*/.exec(line.text)![0]
    const trail = view.state.sliceDoc(sel.head, line.to)
    // don't add \\ on the (empty) line right before \end
    view.dispatch(view.state.replaceSelection(' \\\\\n' + indent), { scrollIntoView: true })
    void trail
    return true
  }

  const shiftEnterKey = (view: EditorView): boolean => {
    const settings = view.state.facet(snippetSettings)
    if (!settings.enabled || !settings.matrixShortcuts) return false
    const sel = view.state.selection.main
    const ctx = getContext(view.state.doc.toString(), sel.head)
    if (!(ctx.inMath && ctx.matrixEnv)) return false
    const line = view.state.doc.lineAt(sel.head)
    if (line.number >= view.state.doc.lines) return false
    const next = view.state.doc.line(line.number + 1)
    view.dispatch({ selection: { anchor: next.to }, scrollIntoView: true })
    return true
  }

  const shiftTab = (view: EditorView): boolean => {
    if (hasNextSnippetField(view.state)) return prevSnippetField(view)
    return false
  }
  const escape = (view: EditorView): boolean => {
    if (hasNextSnippetField(view.state)) return clearSnippet(view)
    return false
  }

  return [
    inputHandler,
    Prec.highest(keymap.of([
      { key: 'Tab', run: tabKey },
      { key: 'Shift-Tab', run: shiftTab },
      { key: 'Enter', run: enterKey },
      { key: 'Shift-Enter', run: shiftEnterKey },
      { key: 'Escape', run: escape },
    ])),
  ]
}

/** Utility for the UI: which snippets would fire at the current cursor? */
export function contextAt(state: EditorState): LatexContext {
  return getContext(state.doc.toString(), state.selection.main.head)
}

export function selectionOrWord(state: EditorState) {
  const r = state.selection.main
  if (!r.empty) return r
  const w = state.wordAt(r.head)
  return w ?? EditorSelection.range(r.head, r.head)
}
