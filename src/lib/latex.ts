/**
 * LaTeX language support for CodeMirror: highlighting (legacy stex mode),
 * bracket matching, and a completion source for \cref{...}, \label{...},
 * \fromtext{...}, \fromex{...} and label= keys that offers every label in the
 * project.
 */
import { StreamLanguage, syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { tags as t } from '@lezer/highlight'
import { autocompletion, type CompletionContext, type CompletionResult, closeBrackets } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'

export const latexLanguage = StreamLanguage.define({
  ...stex,
  languageData: {
    closeBrackets: { brackets: ['(', '[', '{'] },
    commentTokens: { line: '%' },
  },
})

export const latexHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#1a4a9c', fontWeight: '600' },
  { tag: t.tagName, color: '#1a4a9c', fontWeight: '600' },
  { tag: t.atom, color: '#7a3e9d' },
  { tag: t.comment, color: '#8a8f98', fontStyle: 'italic' },
  { tag: t.string, color: '#0b6e4f' },
  { tag: t.number, color: '#b3541e' },
  { tag: t.bracket, color: '#6b5b95' },
  { tag: t.variableName, color: '#333' },
])

export type LabelProvider = () => { label: string; file: string; kind: string }[]

const REF_MACROS = /\\(cref|Cref|ref|eqref|pageref|autoref|fromtext|fromex|label)\{([^}]*)$/
const KEY_LABEL = /(?:^|[,\[\s])label=([^,\]\s]*)$/

export function labelCompletion(provider: LabelProvider): Extension {
  return autocompletion({
    activateOnTyping: true,
    override: [
      (ctx: CompletionContext): CompletionResult | null => {
        const line = ctx.state.doc.lineAt(ctx.pos)
        const before = ctx.state.sliceDoc(line.from, ctx.pos)
        let m = REF_MACROS.exec(before)
        let from: number
        if (m) {
          // inside \cref{a, b|}: complete the last comma-separated item
          const inner = m[2]
          const lastComma = inner.lastIndexOf(',')
          from = ctx.pos - (inner.length - (lastComma + 1))
          const word = inner.slice(lastComma + 1).trimStart()
          from = ctx.pos - word.length
        } else {
          const k = KEY_LABEL.exec(before)
          if (!k) return null
          from = ctx.pos - k[1].length
        }
        const labels = provider()
        if (!labels.length) return null
        return {
          from,
          options: labels.map((l) => ({ label: l.label, detail: l.kind, info: l.file, type: 'variable' })),
          validFor: /^[\w:.\-*]*$/,
        }
      },
    ],
  })
}

export function latexExtensions(): Extension {
  return [latexLanguage, syntaxHighlighting(latexHighlight), bracketMatching(), closeBrackets()]
}

/** Scan a file's contents for \label{...} and label=... */
export function scanLabels(text: string, file: string) {
  const out: { label: string; file: string; kind: string }[] = []
  const re = /\\label\{([^}]+)\}|\blabel=([^,\]\s]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const label = (m[1] ?? m[2]).trim()
    const kind = label.includes(':') ? label.split(':')[0] : ''
    out.push({ label, file, kind })
  }
  return out
}
