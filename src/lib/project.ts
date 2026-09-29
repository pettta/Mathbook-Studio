/**
 * Projects: a project is a plain LaTeX folder kept in IndexedDB.
 * Text files are strings, binary files (PDF figures) are Uint8Array.
 * Import/export is a ZIP of that folder, so `latexmk -pdf main.tex` works
 * on the exported archive as-is.
 */
import { get, set, del, keys } from 'idb-keyval'
import JSZip from 'jszip'
import clsSrc from '../template/mathbook.cls?raw'
import mainSrc from '../template/main.tex?raw'
import prefaceSrc from '../template/frontmatter/preface.tex?raw'
import ch01Src from '../template/chapters/ch01.tex?raw'

export type FileContent = string | Uint8Array

export interface ProjectMeta {
  id: string
  name: string
  author: string
  createdAt: number
  updatedAt: number
}

export interface Project extends ProjectMeta {
  files: Record<string, FileContent>
}

export interface DiagramRecord {
  name: string          // file stem, e.g. "euler-sets"
  domain: string
  substance: string
  style: string
  variation: string
  caption: string
  label: string
  width: string         // e.g. "0.6"
  updatedAt: number
}

const TEXT_EXT = /\.(tex|cls|sty|bib|md|txt|json|csv|svg|penrose|domain|substance|style|bst|cfg|dtx|ins|log)$/i

export function isTextPath(path: string) { return TEXT_EXT.test(path) }
export function isBinary(c: FileContent): c is Uint8Array { return c instanceof Uint8Array }

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'figure'
}

// ---------------------------------------------------------------------------
// template
// ---------------------------------------------------------------------------
export const CHAPTER_SKELETON = (n: number, title: string) => `\\chapter{${title}}\\label{ch:${slugify(title)}}
\\chapterquote{Quote goes here.}{Author}{Source}

Opening paragraph of chapter ${n}.

% ------------------------------------------------------------------
\\section{First section}\\label{sec:${slugify(title)}-first}

\\begin{definition}[Something]\\label{def:${slugify(title)}-something}
  A \\emph{something} is \\dots
\\end{definition}

\\begin{theorem}\\label{thm:${slugify(title)}-main}
  Statement.
\\end{theorem}

\\begin{proof}
  Proof.
\\end{proof}

\\begin{exercises}
\\begin{exercise}\\label{exr:${slugify(title)}-1}
  First exercise. \\fromtext{thm:${slugify(title)}-main}
\\end{exercise}
\\end{exercises}
`

export function newProject(name: string, author: string): Project {
  const now = Date.now()
  const main = mainSrc
    .replace('A Book of Mathematics', name)
    .replace(/Tommy Pett/g, author || 'Author')
    .replace('\\include{chapters/ch02}\n\\include{chapters/ch03}\n', '')
  return {
    id: uid(), name, author, createdAt: now, updatedAt: now,
    files: {
      'main.tex': main,
      'mathbook.cls': clsSrc,
      'frontmatter/preface.tex': prefaceSrc,
      'chapters/ch01.tex': ch01Src,
      'figures/.keep': '',
      'README.md': `# ${name}\n\nBuild with:\n\n    latexmk -pdf main.tex\n\nCreated with Mathbook Studio.\n`,
    },
  }
}

/** Register a new chapter file in main.tex (before \backmatter). */
export function addChapter(p: Project, title: string): string {
  const existing = Object.keys(p.files).filter((f) => /^chapters\/ch\d+\.tex$/.test(f))
  const n = existing.length + 1
  const path = `chapters/ch${String(n).padStart(2, '0')}.tex`
  p.files[path] = CHAPTER_SKELETON(n, title)
  const main = p.files['main.tex']
  if (typeof main === 'string') {
    const inc = `\\include{${path.replace(/\.tex$/, '')}}\n`
    if (!main.includes(inc)) {
      p.files['main.tex'] = main.includes('\\backmatter')
        ? main.replace('\\backmatter', inc + '\n% ------------------------------------------------------------------\n\\backmatter')
        : main.replace('\\end{document}', inc + '\\end{document}')
    }
  }
  return path
}

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
const KEY = (id: string) => `mbs:project:${id}`
const LIST = 'mbs:projects'

export async function listProjects(): Promise<ProjectMeta[]> {
  const list = (await get<ProjectMeta[]>(LIST)) ?? []
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return get<Project>(KEY(id))
}

export async function saveProject(p: Project): Promise<void> {
  p.updatedAt = Date.now()
  const plain: Project = { ...p, files: { ...p.files } }
  await set(KEY(p.id), plain)
  const list = (await get<ProjectMeta[]>(LIST)) ?? []
  const meta: ProjectMeta = { id: p.id, name: p.name, author: p.author, createdAt: p.createdAt, updatedAt: p.updatedAt }
  const idx = list.findIndex((m) => m.id === p.id)
  if (idx >= 0) list[idx] = meta; else list.push(meta)
  await set(LIST, list)
}

export async function deleteProject(id: string): Promise<void> {
  await del(KEY(id))
  const list = (await get<ProjectMeta[]>(LIST)) ?? []
  await set(LIST, list.filter((m) => m.id !== id))
}

export async function lastOpened(): Promise<string | undefined> { return get<string>('mbs:last') }
export async function setLastOpened(id: string) { await set('mbs:last', id) }

export async function allKeys() { return keys() }

// ---------------------------------------------------------------------------
// zip import / export
// ---------------------------------------------------------------------------
export async function exportZip(p: Project): Promise<Blob> {
  const zip = new JSZip()
  const root = zip.folder(slugify(p.name))!
  for (const [path, content] of Object.entries(p.files)) {
    if (path.endsWith('/.keep')) { root.folder(path.slice(0, -6)); continue }
    root.file(path, content as string | Uint8Array)
  }
  root.file('.mathbook-studio.json', JSON.stringify({ name: p.name, author: p.author, id: p.id, exported: new Date().toISOString() }, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function importZip(file: File): Promise<Project> {
  const zip = await JSZip.loadAsync(file)
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  // strip a common leading directory
  const paths = entries.map((e) => e.name)
  let prefix = ''
  const firstSeg = paths.map((p) => p.split('/')[0])
  if (paths.every((p) => p.includes('/')) && new Set(firstSeg).size === 1) prefix = firstSeg[0] + '/'
  const files: Record<string, FileContent> = {}
  let meta: { name?: string; author?: string } = {}
  for (const e of entries) {
    const rel = e.name.slice(prefix.length)
    if (!rel || rel.startsWith('__MACOSX') || rel.endsWith('.DS_Store')) continue
    if (rel === '.mathbook-studio.json') { try { meta = JSON.parse(await e.async('string')) } catch { /* ignore */ } continue }
    if (/\.(aux|log|out|toc|loa|lof|lot|fls|fdb_latexmk|synctex\.gz|bbl|blg|pdf)$/i.test(rel) && !rel.startsWith('figures/')) continue
    files[rel] = isTextPath(rel) ? await e.async('string') : await e.async('uint8array')
  }
  // make sure every folder that has files also has a .keep? not needed.
  const now = Date.now()
  const name = meta.name || file.name.replace(/\.zip$/i, '')
  return { id: uid(), name, author: meta.author || '', createdAt: now, updatedAt: now, files }
}

// ---------------------------------------------------------------------------
// diagrams stored as figures/<name>.penrose.json
// ---------------------------------------------------------------------------
export function diagramPath(name: string) { return `figures/${name}.penrose.json` }

export function listDiagrams(p: Project): DiagramRecord[] {
  const out: DiagramRecord[] = []
  for (const [path, c] of Object.entries(p.files)) {
    if (path.startsWith('figures/') && path.endsWith('.penrose.json') && typeof c === 'string') {
      try { out.push(JSON.parse(c)) } catch { /* skip */ }
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function figureEnvironment(d: { name: string; caption: string; label: string; width: string }, placement = 'tbp'): string {
  return `\\begin{figure}[${placement}]
  \\centering
  \\includegraphics[width=${d.width}\\textwidth]{figures/${d.name}}
  \\caption{${d.caption}}
  \\label{${d.label}}
\\end{figure}
`
}
