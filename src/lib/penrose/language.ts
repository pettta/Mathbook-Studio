/** Minimal syntax highlighting for the Penrose DSLs (Domain / Substance / Style). */
import { StreamLanguage } from '@codemirror/language'

const KEYWORDS = /^(type|predicate|function|constructor|symmetric|forall|where|with|as|in|canvas|layout|override|delete|ensure|encourage|collect|into|foreach|repeat|listof|numberof|nameof|AutoLabel|Label|NoLabel|All|true|false|if|then|else|let|import|from|namespace|const)\b/
const SHAPES = /^(Circle|Ellipse|Equation|Group|Image|Line|Path|Polygon|Polyline|Rectangle|Text)\b/

export const penroseLanguage = StreamLanguage.define<{ inString: boolean }>({
  name: 'penrose',
  startState: () => ({ inString: false }),
  token(stream, state) {
    if (state.inString) {
      while (!stream.eol()) { const c = stream.next(); if (c === '"') { state.inString = false; return 'string' } }
      return 'string'
    }
    if (stream.match('--')) { stream.skipToEnd(); return 'comment' }
    if (stream.match('/*')) { const i = stream.string.indexOf('*/', stream.pos); if (i >= 0) stream.pos = i + 2; else stream.skipToEnd(); return 'comment' }
    if (stream.match('"')) { state.inString = true; return 'string' }
    if (stream.match(/^\$[^$]*\$/)) return 'string'
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return 'number'
    if (stream.match(KEYWORDS)) return 'keyword'
    if (stream.match(SHAPES)) return 'typeName'
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_']*/)) return 'variableName'
    if (stream.match(/^[{}()[\]]/)) return 'bracket'
    if (stream.match(/^[:=<>+\-*/.,?!|&~^]/)) return 'operator'
    stream.next()
    return null
  },
  languageData: { commentTokens: { line: '--', block: { open: '/*', close: '*/' } } },
})
