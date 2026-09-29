/**
 * Client for the optional compile companion (server/compile-server.mjs).
 */
import type { Project } from './project'
import { isBinary } from './project'

export interface BuildError { message: string; file: string; line: number | null; warning?: boolean; minor?: boolean }
export interface BuildResult { ok: boolean; pdf: boolean; pdfMtime: number; errors: BuildError[]; log: string; seconds: number; stem: string }
export interface Health { ok: boolean; version: string; latexmk: string | null; synctex: boolean; dir: string }

export const DEFAULT_COMPANION_URL = 'http://127.0.0.1:4747'

function b64(bytes: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  return btoa(s)
}

export async function checkHealth(url: string, timeoutMs = 1500): Promise<Health | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal })
    if (!r.ok) return null
    return (await r.json()) as Health
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

export async function buildProject(url: string, p: Project): Promise<BuildResult> {
  const files: Record<string, { text?: string; b64?: string }> = {}
  for (const [path, c] of Object.entries(p.files)) files[path] = isBinary(c) ? { b64: b64(c) } : { text: c }
  const r = await fetch(url.replace(/\/$/, '') + '/build', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id, main: 'main.tex', files }),
  })
  if (!r.ok) throw new Error(`companion responded ${r.status}`)
  return (await r.json()) as BuildResult
}

export async function fetchPdf(url: string, id: string, stem = 'main'): Promise<Uint8Array> {
  const r = await fetch(`${url.replace(/\/$/, '')}/pdf/${encodeURIComponent(id)}?stem=${encodeURIComponent(stem)}&t=${Date.now()}`)
  if (!r.ok) throw new Error('no PDF')
  return new Uint8Array(await r.arrayBuffer())
}

export async function synctexForward(url: string, id: string, file: string, line: number, col = 1): Promise<{ page: number; x: number; y: number; h: number; v: number } | null> {
  const r = await fetch(`${url.replace(/\/$/, '')}/synctex/${encodeURIComponent(id)}?file=${encodeURIComponent(file)}&line=${line}&col=${col}`)
  if (!r.ok) return null
  const j = await r.json()
  return j.page ? j : null
}
