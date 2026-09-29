/**
 * "Assist" mode extras (LaTeX Suite's conceal + inline math preview):
 *   - conceal: \alpha -> α, \to -> →, \mathbb{R} -> ℝ, ^{2} -> ², ... in math,
 *     revealed when the cursor is inside the macro
 *   - preview: a KaTeX tooltip while the cursor sits inside inline/block math
 */
import { Decoration, EditorView, ViewPlugin, WidgetType, showTooltip, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view'
import { StateField, type Extension } from '@codemirror/state'
import katex from 'katex'
import { getContext, mathRanges } from './context'

// ---------------------------------------------------------------------------
// conceal table
// ---------------------------------------------------------------------------
const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦', longrightarrow: '⟶',
  infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅',
  varnothing: '∅', in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cup: '∪', cap: '∩', bigcup: '⋃', bigcap: '⋂', setminus: '∖', times: '×', cdot: '·', circ: '∘',
  pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', equiv: '≡', approx: '≈',
  sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', perp: '⊥', parallel: '∥', mid: '∣',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', iiint: '∭', oint: '∮', sqrt: '√', ldots: '…', cdots: '⋯',
  dots: '…', vdots: '⋮', ddots: '⋱', langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊',
  rfloor: '⌋', neg: '¬', lnot: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨', oplus: '⊕', otimes: '⊗',
  ell: 'ℓ', hbar: 'ℏ', aleph: 'ℵ', Re: 'ℜ', Im: 'ℑ', angle: '∠', triangle: '△', square: '□',
  star: '⋆', ast: '∗', dagger: '†', prime: '′', degree: '°', because: '∵', therefore: '∴',
  qquad: '  ', quad: ' ', ',': '', ';': ' ', '!': '', ' ': ' ',
}
const BB: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', F: '𝔽', H: 'ℍ', E: '𝔼' }
const SUPER: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ', i: 'ⁱ', T: 'ᵀ', '*': '*' }
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', k: 'ₖ', x: 'ₓ', a: 'ₐ', m: 'ₘ' }

class SymWidget extends WidgetType {
  text: string
  cls: string
  constructor(text: string, cls: string) { super(); this.text = text; this.cls = cls }
  eq(o: SymWidget) { return o.text === this.text && o.cls === this.cls }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-conceal ' + this.cls; s.textContent = this.text; return s }
  ignoreEvent() { return false }
}

const MACRO_RE = /\\mathbb\{([A-Z])\}|\\([A-Za-z]+|[,;! ])|\^\{?([0-9+\-nTi*])\}?|_\{?([0-9ijnkxam])\}?/g

function buildConceal(view: EditorView): DecorationSet {
  const doc = view.state.doc.toString()
  const decos: { from: number; to: number; deco: Decoration }[] = []
  const cursor = view.state.selection.main
  for (const { from, to } of view.visibleRanges) {
    const ranges = mathRanges(doc, to).filter((r) => r.to > from)
    for (const r of ranges) {
      const start = Math.max(r.from, from), end = Math.min(r.to, to)
      const text = doc.slice(start, end)
      MACRO_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = MACRO_RE.exec(text))) {
        const a = start + m.index, b = a + m[0].length
        // reveal when the cursor touches the macro
        if (cursor.from <= b && cursor.to >= a) continue
        let rep: string | undefined, cls = ''
        if (m[1] !== undefined) { rep = BB[m[1]] }
        else if (m[2] !== undefined) { rep = SYMBOLS[m[2]] }
        else if (m[3] !== undefined) { rep = SUPER[m[3]]; cls = 'cm-conceal-sup' }
        else if (m[4] !== undefined) { rep = SUB[m[4]]; cls = 'cm-conceal-sub' }
        if (rep === undefined) continue
        decos.push({ from: a, to: b, deco: Decoration.replace({ widget: new SymWidget(rep, cls) }) })
      }
    }
  }
  decos.sort((x, y) => x.from - y.from || x.to - y.to)
  return Decoration.set(decos.map((d) => d.deco.range(d.from, d.to)))
}

export const conceal = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = buildConceal(view) }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = buildConceal(u.view)
  }
}, { decorations: (v) => v.decorations })

// ---------------------------------------------------------------------------
// inline math preview tooltip
// ---------------------------------------------------------------------------
function mathTooltip(state: import('@codemirror/state').EditorState): Tooltip | null {
  const sel = state.selection.main
  if (!sel.empty) return null
  const doc = state.doc.toString()
  const ctx = getContext(doc, sel.head)
  if (!ctx.inMath || ctx.mathStart < 0) return null
  // find the end of the math region
  const ranges = mathRanges(doc, doc.length)
  const r = ranges.find((x) => x.from === ctx.mathStart)
  if (!r) return null
  let src = doc.slice(r.from, r.to)
  let display = ctx.block
  if (src.startsWith('$$')) src = src.slice(2, src.endsWith('$$') ? -2 : undefined)
  else if (src.startsWith('$')) src = src.slice(1, src.endsWith('$') ? -1 : undefined)
  else if (src.startsWith('\\[')) src = src.slice(2, src.endsWith('\\]') ? -2 : undefined)
  else if (src.startsWith('\\(')) src = src.slice(2, src.endsWith('\\)') ? -2 : undefined)
  else {
    // environment: keep it, KaTeX renders align/gather etc. natively; strip unsupported ones
    src = src.replace(/\\label\{[^}]*\}/g, '')
    src = src.replace(/\\begin\{(equation|multline|flalign|eqnarray)\*?\}/g, '').replace(/\\end\{(equation|multline|flalign|eqnarray)\*?\}/g, '')
    src = src.replace(/\\begin\{align\}/g, '\\begin{aligned}').replace(/\\end\{align\}/g, '\\end{aligned}')
    src = src.replace(/\\begin\{align\*\}/g, '\\begin{aligned}').replace(/\\end\{align\*\}/g, '\\end{aligned}')
    src = src.replace(/\\begin\{gather\*?\}/g, '\\begin{gathered}').replace(/\\end\{gather\*?\}/g, '\\end{gathered}')
    display = true
  }
  if (!src.trim()) return null
  return {
    pos: r.from,
    above: true,
    strictSide: false,
    arrow: false,
    create() {
      const dom = document.createElement('div')
      dom.className = 'cm-math-preview'
      try {
        katex.render(src, dom, { displayMode: display, throwOnError: false, strict: false, trust: true,
          macros: { '\\R': '\\mathbb{R}', '\\N': '\\mathbb{N}', '\\Z': '\\mathbb{Z}', '\\Q': '\\mathbb{Q}', '\\C': '\\mathbb{C}', '\\twodots': '\\mathinner{\\ldotp\\ldotp}' } })
      } catch (e) {
        dom.textContent = String(e)
      }
      return { dom }
    },
  }
}

export const mathPreview = StateField.define<Tooltip | null>({
  create: mathTooltip,
  update(value, tr) { return tr.docChanged || tr.selection ? mathTooltip(tr.state) : value },
  provide: (f) => showTooltip.from(f),
})

export function assistExtensions(): Extension {
  return [conceal, mathPreview]
}
