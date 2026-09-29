/**
 * Math-mode detection for LaTeX source, in the spirit of Obsidian LaTeX Suite.
 *
 * Scans the document from the start (or from a safe restart point) up to `pos`
 * and reports whether the position is inside inline math, block math, a
 * \text{...}-like macro inside math, and which matrix-like environment (if
 * any) is innermost. Chapter-sized files scan in well under a millisecond.
 */

export interface LatexContext {
  inMath: boolean
  block: boolean            // $$..$$, \[..\], equation/align/... environments
  inTextMacro: boolean      // inside \text{}, \mbox{}, \intertext{} within math
  mathStart: number         // offset where the current math region began (-1 if none)
  mathDelim: string         // "$", "$$", "\\[", "\\(" or environment name
  matrixEnv: string | null  // innermost matrix/align/cases environment (for Tab/Enter shortcuts)
  envStack: string[]
}

const BLOCK_MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'gather', 'gather*',
  'multline', 'multline*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'displaymath',
  'math', 'xalignat', 'xxalignat',
])

const MATRIX_ENVS = new Set([
  'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix', 'smallmatrix', 'array',
  'cases', 'rcases', 'dcases', 'aligned', 'gathered', 'split', 'alignedat', 'align', 'align*',
  'alignat', 'alignat*', 'gather', 'gather*', 'multline', 'multline*', 'eqnarray', 'eqnarray*',
  'tabular', 'tabular*', 'tabularx', 'subarray',
])

const TEXT_MACROS = ['text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'mbox', 'intertext', 'mathrm']

export function isMatrixEnv(name: string): boolean {
  return MATRIX_ENVS.has(name)
}

export function getContext(doc: string, pos: number): LatexContext {
  let inMath = false
  let block = false
  let mathStart = -1
  let mathDelim = ''
  const envStack: string[] = []
  // \text{...} tracking: brace depth at which the text macro opened
  let textDepth = -1
  let braceDepth = 0

  let i = 0
  const n = Math.min(pos, doc.length)
  while (i < n) {
    const ch = doc[i]
    if (ch === '\\') {
      const next = doc[i + 1]
      if (next === undefined) break
      // escaped single characters: \$ \% \{ \} \\ etc.
      if (!/[A-Za-z]/.test(next)) {
        if (next === '[' && !inMath) { inMath = true; block = true; mathStart = i; mathDelim = '\\['; }
        else if (next === ']' && inMath && mathDelim === '\\[') { inMath = false; block = false; mathStart = -1; mathDelim = ''; textDepth = -1 }
        else if (next === '(' && !inMath) { inMath = true; block = false; mathStart = i; mathDelim = '\\('; }
        else if (next === ')' && inMath && mathDelim === '\\(') { inMath = false; block = false; mathStart = -1; mathDelim = ''; textDepth = -1 }
        i += 2
        continue
      }
      // control word
      let j = i + 1
      while (j < doc.length && /[A-Za-z]/.test(doc[j])) j++
      const word = doc.slice(i + 1, j)
      if (word === 'begin' || word === 'end') {
        const m = /^\s*\{([^}]*)\}/.exec(doc.slice(j, j + 60))
        if (m) {
          const env = m[1].trim()
          if (word === 'begin') {
            envStack.push(env)
            if (BLOCK_MATH_ENVS.has(env) && !inMath) { inMath = true; block = true; mathStart = i; mathDelim = env }
          } else {
            const idx = envStack.lastIndexOf(env)
            if (idx >= 0) envStack.splice(idx)
            if (BLOCK_MATH_ENVS.has(env) && inMath && mathDelim === env) { inMath = false; block = false; mathStart = -1; mathDelim = ''; textDepth = -1 }
          }
          i = j + m[0].length
          continue
        }
      } else if (word === 'verb') {
        // \verb|...| skip
        const d = doc[j]
        if (d) {
          const end = doc.indexOf(d, j + 1)
          i = end < 0 ? doc.length : end + 1
          continue
        }
      } else if (inMath && textDepth < 0 && TEXT_MACROS.includes(word)) {
        // look for the opening brace
        let k = j
        while (k < doc.length && (doc[k] === ' ' || doc[k] === '*')) k++
        if (doc[k] === '{') {
          textDepth = braceDepth
          braceDepth++
          i = k + 1
          continue
        }
      }
      i = j
      continue
    }
    if (ch === '%') {
      const nl = doc.indexOf('\n', i)
      i = nl < 0 ? doc.length : nl + 1
      continue
    }
    if (ch === '{') { braceDepth++; i++; continue }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      if (textDepth >= 0 && braceDepth === textDepth) textDepth = -1
      i++
      continue
    }
    if (ch === '$') {
      if (doc[i + 1] === '$') {
        if (!inMath) { inMath = true; block = true; mathStart = i; mathDelim = '$$' }
        else if (mathDelim === '$$') { inMath = false; block = false; mathStart = -1; mathDelim = ''; textDepth = -1 }
        i += 2
        continue
      }
      if (!inMath) { inMath = true; block = false; mathStart = i; mathDelim = '$' }
      else if (mathDelim === '$') { inMath = false; block = false; mathStart = -1; mathDelim = ''; textDepth = -1 }
      i++
      continue
    }
    i++
  }

  let matrixEnv: string | null = null
  for (let k = envStack.length - 1; k >= 0; k--) {
    if (MATRIX_ENVS.has(envStack[k])) { matrixEnv = envStack[k]; break }
  }
  return { inMath, block, inTextMacro: inMath && textDepth >= 0, mathStart, mathDelim, matrixEnv, envStack }
}

/** Ranges [from,to) of math regions intersecting [0, upto). Used by conceal. */
export function mathRanges(doc: string, upto: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  let i = 0
  let open = -1
  let delim = ''
  const n = Math.min(upto, doc.length)
  const close = (end: number) => { out.push({ from: open, to: end }); open = -1; delim = '' }
  while (i < n) {
    const ch = doc[i]
    if (ch === '\\') {
      const next = doc[i + 1]
      if (next === undefined) break
      if (!/[A-Za-z]/.test(next)) {
        if (open < 0 && next === '[') { open = i; delim = '\\[' }
        else if (open >= 0 && next === ']' && delim === '\\[') close(i + 2)
        else if (open < 0 && next === '(') { open = i; delim = '\\(' }
        else if (open >= 0 && next === ')' && delim === '\\(') close(i + 2)
        i += 2; continue
      }
      let j = i + 1
      while (j < doc.length && /[A-Za-z]/.test(doc[j])) j++
      const word = doc.slice(i + 1, j)
      if (word === 'begin' || word === 'end') {
        const m = /^\s*\{([^}]*)\}/.exec(doc.slice(j, j + 60))
        if (m) {
          const env = m[1].trim()
          if (BLOCK_MATH_ENVS.has(env)) {
            if (word === 'begin' && open < 0) { open = i; delim = env }
            else if (word === 'end' && open >= 0 && delim === env) close(j + m[0].length)
          }
          i = j + m[0].length; continue
        }
      }
      i = j; continue
    }
    if (ch === '%') { const nl = doc.indexOf('\n', i); i = nl < 0 ? doc.length : nl + 1; continue }
    if (ch === '$') {
      if (doc[i + 1] === '$') {
        if (open < 0) { open = i; delim = '$$' } else if (delim === '$$') close(i + 2)
        i += 2; continue
      }
      if (open < 0) { open = i; delim = '$' } else if (delim === '$') close(i + 1)
      i++; continue
    }
    i++
  }
  if (open >= 0) out.push({ from: open, to: n })
  return out
}
