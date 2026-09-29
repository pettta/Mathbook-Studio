import { reactive, watch, toRaw } from 'vue'
import { get, set } from 'idb-keyval'
import {
  type Project, type ProjectMeta, type FileContent, newProject, saveProject, loadProject, listProjects,
  deleteProject, lastOpened, setLastOpened, importZip, exportZip, addChapter as addChapterToProject, isBinary, slugify,
} from './lib/project'
import { DEFAULT_SNIPPETS } from './lib/snippets/defaults'
import type { Snippet } from './lib/snippets/types'
import { scanLabels } from './lib/latex'
import { checkHealth, buildProject, fetchPdf, synctexForward, DEFAULT_COMPANION_URL, type BuildError, type Health } from './lib/compile'

export interface EditorBridge {
  insertAtCursor(text: string): void
  getCursorFile(): string | null
  getCursorLine(): number
  goTo(file: string, line: number): void
  focus(): void
}

interface StoreState {
  project: Project | null
  projects: ProjectMeta[]
  openFiles: string[]
  activeFile: string | null
  dirty: boolean
  saving: boolean
  savedAt: number
  assist: boolean
  snippets: Snippet[]
  snippetsSource: string
  snippetsError: string
  rightTab: 'diagram' | 'library' | 'preview' | 'snippets' | 'help'
  compile: {
    url: string
    health: Health | null
    checking: boolean
    enabled: boolean          // user toggle: use the companion when available
    auto: boolean             // rebuild after every save
    building: boolean
    queued: boolean
    errors: BuildError[]
    log: string
    ok: boolean | null
    seconds: number
    pdf: Uint8Array | null
    pdfVersion: number        // bumps whenever a new PDF arrives
    locate: { page: number; x: number; y: number; v: number; version: number } | null
  }
  dialog: 'none' | 'projects' | 'newProject' | 'newChapter'
  toast: string
}

export const store = reactive<StoreState>({
  project: null,
  projects: [],
  openFiles: [],
  activeFile: null,
  dirty: false,
  saving: false,
  savedAt: 0,
  assist: true,
  snippets: DEFAULT_SNIPPETS,
  snippetsSource: '',
  snippetsError: '',
  rightTab: 'diagram',
  compile: { url: DEFAULT_COMPANION_URL, health: null, checking: false, enabled: true, auto: true, building: false, queued: false, errors: [], log: '', ok: null, seconds: 0, pdf: null, pdfVersion: 0, locate: null },
  dialog: 'none',
  toast: '',
})

let bridge: EditorBridge | null = null
export function registerEditor(b: EditorBridge | null) { bridge = b }
export function editor(): EditorBridge | null { return bridge }

let toastTimer: number | undefined
export function toast(msg: string) {
  store.toast = msg
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { store.toast = '' }, 3200)
}

// ---------------------------------------------------------------------------
// snippets (user-editable, persisted)
// ---------------------------------------------------------------------------
export function defaultSnippetsSource(): string {
  return JSON.stringify(DEFAULT_SNIPPETS, null, 2)
}

export function applySnippetsSource(src: string): boolean {
  try {
    // accept JSON, or a JS array literal / `module.exports = [...]` as in LaTeX Suite files
    let parsed: unknown
    try { parsed = JSON.parse(src) } catch {
      const body = src.replace(/^\s*(module\.exports\s*=|export\s+default)\s*/, '')
      parsed = new Function('return (' + body + ')')()
    }
    if (!Array.isArray(parsed)) throw new Error('snippet file must be an array')
    const list: Snippet[] = parsed.map((s: any) => {
      if (s.trigger instanceof RegExp) return { ...s, trigger: s.trigger.source, flags: s.trigger.flags, options: (s.options || '') + (String(s.options || '').includes('r') ? '' : 'r') }
      return s
    })
    store.snippets = list
    store.snippetsSource = src
    store.snippetsError = ''
    void set('mbs:snippets', src)
    return true
  } catch (e) {
    store.snippetsError = String(e)
    return false
  }
}

export async function initSnippets() {
  const src = await get<string>('mbs:snippets')
  if (src) applySnippetsSource(src); else store.snippetsSource = defaultSnippetsSource()
  const assist = await get<boolean>('mbs:assist')
  if (assist !== undefined) store.assist = assist
  const c = await get<{ url: string; enabled: boolean; auto: boolean }>('mbs:compile')
  if (c) { store.compile.url = c.url || DEFAULT_COMPANION_URL; store.compile.enabled = c.enabled ?? true; store.compile.auto = c.auto ?? true }
  void detectCompanion()
}
watch(() => [store.compile.url, store.compile.enabled, store.compile.auto], () => {
  void set('mbs:compile', { url: store.compile.url, enabled: store.compile.enabled, auto: store.compile.auto })
})
watch(() => store.assist, (v) => { void set('mbs:assist', v) })

// ---------------------------------------------------------------------------
// project lifecycle
// ---------------------------------------------------------------------------
export async function refreshProjects() { store.projects = await listProjects() }

function firstChapter(p: Project): string {
  const ch = Object.keys(p.files).filter((f) => /^chapters\/.*\.tex$/.test(f)).sort()
  return ch[0] ?? (p.files['main.tex'] !== undefined ? 'main.tex' : Object.keys(p.files)[0])
}

export function setProject(p: Project) {
  store.project = p
  store.openFiles = []
  store.activeFile = null
  store.dirty = false
  store.compile.pdf = null; store.compile.pdfVersion++; store.compile.errors = []; store.compile.ok = null; store.compile.locate = null
  openFile(firstChapter(p))
  void setLastOpened(p.id)
  void refreshProjects()
  if (store.compile.auto && companionReady()) scheduleBuild(300)
}

export async function createProject(name: string, author: string) {
  const p = newProject(name || 'Untitled book', author)
  await saveProject(p)
  setProject(p)
  toast(`Created “${p.name}”`)
}

export async function openProject(id: string) {
  await flushSave()
  const p = await loadProject(id)
  if (!p) { toast('Project not found'); return }
  setProject(p)
}

export async function removeProject(id: string) {
  await deleteProject(id)
  if (store.project?.id === id) { store.project = null; store.openFiles = []; store.activeFile = null }
  await refreshProjects()
}

export async function importProjectZip(file: File) {
  const p = await importZip(file)
  await saveProject(p)
  setProject(p)
  toast(`Imported “${p.name}” (${Object.keys(p.files).length} files)`)
}

export async function exportProjectZip() {
  if (!store.project) return
  await flushSave()
  const blob = await exportZip(toRaw(store.project))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = slugify(store.project.name) + '.zip'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export async function restoreLast(): Promise<boolean> {
  await refreshProjects()
  const id = await lastOpened()
  if (id) { const p = await loadProject(id); if (p) { setProject(p); return true } }
  if (store.projects.length) { await openProject(store.projects[0].id); return true }
  return false
}

// ---------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------
export function openFile(path: string) {
  if (!store.project || !(path in store.project.files)) return
  if (!store.openFiles.includes(path)) store.openFiles.push(path)
  store.activeFile = path
}

export function closeFile(path: string) {
  const i = store.openFiles.indexOf(path)
  if (i >= 0) store.openFiles.splice(i, 1)
  if (store.activeFile === path) store.activeFile = store.openFiles[Math.max(0, i - 1)] ?? null
}

export function updateFile(path: string, content: FileContent) {
  if (!store.project) return
  store.project.files[path] = content
  markDirty()
}

export function fileText(path: string): string {
  const c = store.project?.files[path]
  return typeof c === 'string' ? c : ''
}

export function renameFile(from: string, to: string) {
  const p = store.project
  if (!p || !(from in p.files) || to in p.files) return
  p.files[to] = p.files[from]
  delete p.files[from]
  const i = store.openFiles.indexOf(from)
  if (i >= 0) store.openFiles[i] = to
  if (store.activeFile === from) store.activeFile = to
  // keep \include in main.tex in sync
  const main = p.files['main.tex']
  if (typeof main === 'string' && from.endsWith('.tex') && to.endsWith('.tex')) {
    p.files['main.tex'] = main.split(`{${from.replace(/\.tex$/, '')}}`).join(`{${to.replace(/\.tex$/, '')}}`)
  }
  markDirty()
}

export function deleteFile(path: string) {
  const p = store.project
  if (!p) return
  delete p.files[path]
  closeFile(path)
  const main = p.files['main.tex']
  if (typeof main === 'string' && path.endsWith('.tex')) {
    p.files['main.tex'] = main.replace(new RegExp(`\\\\(include|input)\\{${path.replace(/\.tex$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\n?`), '')
  }
  markDirty()
}

export function createFile(path: string, content: FileContent = '') {
  if (!store.project || path in store.project.files) return
  store.project.files[path] = content
  markDirty()
  if (!isBinary(content)) openFile(path)
}

export function newChapter(title: string) {
  if (!store.project) return
  const path = addChapterToProject(store.project, title)
  markDirty()
  openFile(path)
  toast(`Added ${path}`)
}

export function projectLabels() {
  const p = store.project
  if (!p) return []
  const out: { label: string; file: string; kind: string }[] = []
  for (const [path, c] of Object.entries(p.files)) if (typeof c === 'string' && path.endsWith('.tex')) out.push(...scanLabels(c, path))
  return out
}

// ---------------------------------------------------------------------------
// autosave
// ---------------------------------------------------------------------------
let saveTimer: number | undefined
export function markDirty() {
  store.dirty = true
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void flushSave(), 800)
}

export async function flushSave() {
  window.clearTimeout(saveTimer)
  if (!store.project || !store.dirty) return
  store.saving = true
  try {
    await saveProject(toRaw(store.project))
    store.dirty = false
    store.savedAt = Date.now()
  } finally {
    store.saving = false
  }
  if (store.compile.auto && companionReady()) scheduleBuild()
}

// ---------------------------------------------------------------------------
// compile companion
// ---------------------------------------------------------------------------
export function companionReady(): boolean {
  return store.compile.enabled && !!store.compile.health?.ok && !!store.compile.health.latexmk
}

export async function detectCompanion(): Promise<boolean> {
  store.compile.checking = true
  try {
    store.compile.health = await checkHealth(store.compile.url)
  } finally {
    store.compile.checking = false
  }
  const ok = companionReady()
  if (ok && store.project && !store.compile.pdf && store.compile.auto) scheduleBuild(200)
  return ok
}

let buildTimer: number | undefined
export function scheduleBuild(delay = 2000) {
  window.clearTimeout(buildTimer)
  buildTimer = window.setTimeout(() => void buildNow(), delay)
}

export async function buildNow(): Promise<void> {
  window.clearTimeout(buildTimer)
  if (!store.project) return
  if (!companionReady()) { toast('Compile companion not reachable'); return }
  if (store.compile.building) { store.compile.queued = true; return }
  store.compile.building = true
  const c = store.compile
  try {
    await flushSaveOnly()
    const r = await buildProject(c.url, toRaw(store.project))
    c.errors = r.errors
    c.log = r.log
    c.ok = r.ok
    c.seconds = r.seconds
    if (r.pdf) {
      c.pdf = await fetchPdf(c.url, store.project.id, r.stem)
      c.pdfVersion++
    }
    if (!r.ok) {
      const firstErr = r.errors.find((e) => !e.warning)
      toast(firstErr ? `Build failed: ${firstErr.message.slice(0, 80)}` : 'Build failed — see the Preview tab')
    }
  } catch (e) {
    c.ok = false
    c.log = String(e)
    c.health = await checkHealth(c.url)
    toast('Build error: ' + String(e))
  } finally {
    c.building = false
    if (c.queued) { c.queued = false; scheduleBuild(300) }
  }
}

async function flushSaveOnly() {
  window.clearTimeout(saveTimer)
  if (!store.project || !store.dirty) return
  store.saving = true
  try { await saveProject(toRaw(store.project)); store.dirty = false; store.savedAt = Date.now() } finally { store.saving = false }
}

/** Forward search: scroll the preview to the cursor's position. */
export async function locateInPreview(): Promise<void> {
  const ed = editor()
  if (!ed || !store.project || !companionReady() || !store.compile.health?.synctex) return
  const file = ed.getCursorFile()
  if (!file) return
  const r = await synctexForward(store.compile.url, store.project.id, file, ed.getCursorLine())
  if (!r) { toast('No SyncTeX match for this line (build first)'); return }
  store.compile.locate = { page: r.page, x: r.x, y: r.y, v: r.v, version: (store.compile.locate?.version ?? 0) + 1 }
  store.rightTab = 'preview'
}

window.addEventListener('beforeunload', () => { void flushSave() })
