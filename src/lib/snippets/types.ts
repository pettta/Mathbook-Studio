/**
 * Snippet format: identical to Obsidian LaTeX Suite so existing snippet files
 * can be pasted in.
 *
 *   trigger      string, or a regex (options must contain "r"; capture groups
 *                are referenced from the replacement as [[0]], [[1]], ...)
 *   replacement  string with tabstops $0, $1, ${2:default}; visual snippets
 *                use ${VISUAL} for the selected text
 *   options      t  text mode only          m  math mode (inline or block)
 *                M  block math only         n  inline math only
 *                A  auto-expand (no Tab)    r  regex trigger
 *                v  visual (needs selection) w  word boundary before trigger
 *   priority     higher wins when several triggers match (default 0)
 */
export interface Snippet {
  trigger: string
  replacement: string | ((match: RegExpMatchArray) => string)
  options: string
  priority?: number
  description?: string
  flags?: string
}

export interface CompiledSnippet extends Snippet {
  auto: boolean
  visual: boolean
  regex: RegExp | null    // anchored at end of the text before the cursor
  mode: 'any' | 'text' | 'math' | 'block' | 'inline'
  word: boolean
  triggerLen: number      // for plain triggers
}

export function compileSnippet(s: Snippet): CompiledSnippet {
  const o = s.options || ''
  const isRegex = o.includes('r')
  let mode: CompiledSnippet['mode'] = 'any'
  if (o.includes('t')) mode = 'text'
  else if (o.includes('M')) mode = 'block'
  else if (o.includes('n')) mode = 'inline'
  else if (o.includes('m')) mode = 'math'
  const flags = (s.flags || '').replace(/[gy]/g, '')
  return {
    ...s,
    auto: o.includes('A'),
    visual: o.includes('v'),
    regex: isRegex ? new RegExp('(?:' + s.trigger + ')$', flags) : null,
    mode,
    word: o.includes('w'),
    triggerLen: s.trigger.length,
  }
}
