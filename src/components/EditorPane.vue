<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, highlightSpecialChars, rectangularSelection, crosshairCursor, dropCursor } from '@codemirror/view'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { indentOnInput, indentUnit } from '@codemirror/language'
import { snippet } from '@codemirror/autocomplete'
import { latexSnippets, snippetSettings } from '../lib/snippets/engine'
import { assistExtensions } from '../lib/snippets/assist'
import { latexExtensions, labelCompletion } from '../lib/latex'
import { store, registerEditor, updateFile, closeFile, openFile, projectLabels, fileText } from '../store'

const host = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
const states = new Map<string, EditorState>()   // per-file editor states (keeps undo history)
const assistCompartment = new Compartment()
const snippetCompartment = new Compartment()

const currentPath = computed(() => store.activeFile)
const isText = computed(() => currentPath.value ? typeof store.project?.files[currentPath.value] === 'string' : false)

// ---- hotkeys for the mathbook class ---------------------------------------
function wrapOrInsert(before: string, after: string) {
  return (v: EditorView) => {
    const r = v.state.selection.main
    const sel = v.state.sliceDoc(r.from, r.to)
    snippet(before + (sel ? sel : '${0}') + after + (sel ? '${0}' : ''))(v, null, r.from, r.to)
    return true
  }
}
function insertSnippet(tpl: string) {
  return (v: EditorView) => { const r = v.state.selection.main; snippet(tpl)(v, null, r.from, r.to); return true }
}
const mathbookKeymap = keymap.of([
  { key: 'Mod-b', run: wrapOrInsert('\\textbf{', '}') },
  { key: 'Mod-i', run: wrapOrInsert('\\emph{', '}') },
  { key: 'Mod-/', run: toggleComment },
  { key: 'Mod-Alt-t', run: insertSnippet('\\begin{theorem}[${0:}]\\label{thm:${1:key}}\n  ${2}\n\\end{theorem}') },
  { key: 'Mod-Alt-l', run: insertSnippet('\\begin{lemma}\\label{lem:${0:key}}\n  ${1}\n\\end{lemma}') },
  { key: 'Mod-Alt-d', run: insertSnippet('\\begin{definition}[${0:}]\\label{def:${1:key}}\n  ${2}\n\\end{definition}') },
  { key: 'Mod-Alt-e', run: insertSnippet('\\begin{example}[${0:}]\\label{ex:${1:key}}\n  ${2}\n\\end{example}') },
  { key: 'Mod-Alt-p', run: insertSnippet('\\begin{proof}\n  ${0}\n\\end{proof}') },
  { key: 'Mod-Alt-x', run: insertSnippet('\\begin{exercise}\\label{exr:${0:key}}\n  ${1}\n\\end{exercise}') },
  { key: 'Mod-Alt-a', run: insertSnippet('\\begin{procedure}[returns=${0:\\N}, caption={${1:}}, label=alg:${2:key}]\n  {${3:Name}}{${4:A: \\R^n, n: \\N}}\n  \\State ${5}\n\\end{procedure}') },
  { key: 'Mod-Alt-f', run: insertSnippet('\\begin{figure}[${0:tbp}]\n  \\centering\n  \\includegraphics[width=${1:0.6}\\textwidth]{figures/${2:name}}\n  \\caption{${3:}}\n  \\label{fig:${4:key}}\n\\end{figure}') },
  { key: 'Mod-Alt-r', run: insertSnippet('\\cref{${0}}') },
  { key: 'Mod-Alt-n', run: insertSnippet('\\footnote{${0}}') },
  { key: 'Mod-Alt-m', run: insertSnippet('$${0}$') },
  { key: 'Mod-Alt-Shift-m', run: insertSnippet('\\[\n  ${0}\n\\]') },
])

function baseExtensions(path: string): Extension {
  return [
    lineNumbers(), highlightActiveLine(), highlightSpecialChars(), drawSelection(), dropCursor(),
    rectangularSelection(), crosshairCursor(), history(), indentOnInput(), indentUnit.of('  '),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    snippetCompartment.of(snippetSettings.of({ snippets: store.snippets, autofraction: true, tabout: true, matrixShortcuts: true, enabled: store.assist })),
    latexSnippets(),
    mathbookKeymap,
    labelCompletion(projectLabels),
    latexExtensions(),
    assistCompartment.of(store.assist ? assistExtensions() : []),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) updateFile(path, u.state.doc.toString())
      states.set(path, u.state)
    }),
    EditorView.theme({
      '&': { height: '100%', fontSize: '14px' },
      '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace', lineHeight: '1.6' },
      '.cm-content': { padding: '12px 0 40vh 0' },
      '.cm-gutters': { background: 'transparent', border: 'none', color: '#b0b4bc' },
      '.cm-activeLine': { background: 'rgba(90,110,180,0.06)' },
      '.cm-activeLineGutter': { background: 'transparent', color: '#6b7280' },
      '.cm-snippetField': { background: 'rgba(255,200,0,0.25)', borderRadius: '2px' },
      '.cm-tooltip.cm-tooltip-autocomplete': { fontFamily: 'inherit' },
    }),
  ]
}

function stateFor(path: string): EditorState {
  let s = states.get(path)
  if (!s) {
    s = EditorState.create({ doc: fileText(path), extensions: baseExtensions(path) })
    states.set(path, s)
  }
  return s
}

function showFile(path: string | null) {
  if (!view) return
  if (!path || !isText.value) { view.setState(EditorState.create({ doc: '', extensions: [EditorState.readOnly.of(true)] })); return }
  view.setState(stateFor(path))
  // the file may have been changed outside the editor (rename, import)
  const text = fileText(path)
  if (view.state.doc.toString() !== text) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  }
  reconfigure()
  view.focus()
}

function reconfigure() {
  if (!view) return
  view.dispatch({
    effects: [
      assistCompartment.reconfigure(store.assist ? assistExtensions() : []),
      snippetCompartment.reconfigure(snippetSettings.of({ snippets: store.snippets, autofraction: true, tabout: true, matrixShortcuts: true, enabled: store.assist })),
    ],
  })
}

onMounted(() => {
  view = new EditorView({ parent: host.value!, state: EditorState.create({ doc: '' }) })
  ;(window as any).__cmView = () => view   // used by scripts/smoke.mjs
  showFile(store.activeFile)
  registerEditor({
    insertAtCursor(text: string) {
      if (!view || !store.activeFile) return
      const r = view.state.selection.main
      const line = view.state.doc.lineAt(r.from)
      const prefix = line.from === r.from ? '' : '\n'
      view.dispatch({ changes: { from: r.from, to: r.to, insert: prefix + text }, selection: { anchor: r.from + prefix.length + text.length }, scrollIntoView: true })
      view.focus()
    },
    getCursorFile() { return store.activeFile },
    getCursorLine() { return view ? view.state.doc.lineAt(view.state.selection.main.head).number : 1 },
    goTo(file: string, line: number) {
      openFile(file)
      requestAnimationFrame(() => {
        if (!view) return
        const l = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines))
        view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) })
        view.focus()
      })
    },
    focus() { view?.focus() },
  })
})
onBeforeUnmount(() => { registerEditor(null); view?.destroy() })

watch(() => store.activeFile, (p) => showFile(p))
watch(() => store.project?.id, () => { states.clear(); showFile(store.activeFile) })
watch(() => [store.assist, store.snippets], () => reconfigure())
// external edits to the active file (e.g. rename of an included chapter)
watch(() => store.activeFile && store.project?.files[store.activeFile], (c) => {
  if (!view || typeof c !== 'string' || c === view.state.doc.toString()) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: c } })
})

function shortName(p: string) { return p.split('/').pop() ?? p }
</script>

<template>
  <div class="editor-pane">
    <div class="tabs">
      <button v-for="f in store.openFiles" :key="f" class="tab" :class="{ active: f === store.activeFile }" :title="f" @click="openFile(f)">
        <span>{{ shortName(f) }}</span>
        <span class="close" @click.stop="closeFile(f)">×</span>
      </button>
      <div class="spacer" />
      <div class="mode-toggle" title="Assist: snippets, conceal and math preview. Raw: plain LaTeX.">
        <button :class="{ on: store.assist }" @click="store.assist = true">Assist</button>
        <button :class="{ on: !store.assist }" @click="store.assist = false">Raw</button>
      </div>
    </div>
    <div v-if="!store.project" class="empty">
      <p>No project open.</p>
      <p><button class="primary" @click="store.dialog = 'projects'">Open or create a project</button></p>
    </div>
    <div v-else-if="!store.activeFile" class="empty"><p>Pick a file on the left.</p></div>
    <div v-else-if="!isText" class="empty"><p>{{ store.activeFile }} is a binary file ({{ (store.project.files[store.activeFile] as Uint8Array).byteLength }} bytes).</p></div>
    <div ref="host" class="cm-host" v-show="store.project && store.activeFile && isText" />
  </div>
</template>

<style scoped>
.editor-pane { display: flex; flex-direction: column; height: 100%; min-width: 0; background: var(--paper); }
.tabs { display: flex; align-items: stretch; border-bottom: 1px solid var(--line); background: var(--bg-2); overflow-x: auto; flex: none; }
.tab { display: flex; align-items: center; gap: 6px; padding: 6px 10px 6px 12px; border: none; border-right: 1px solid var(--line); background: transparent; color: var(--fg-2); font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.tab.active { background: var(--paper); color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
.tab .close { opacity: 0.4; font-size: 14px; line-height: 1; padding: 0 2px; border-radius: 3px; }
.tab .close:hover { opacity: 1; background: var(--line); }
.spacer { flex: 1; }
.mode-toggle { display: flex; align-items: center; padding: 4px 8px; gap: 2px; }
.mode-toggle button { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid var(--line); background: var(--bg); color: var(--fg-2); cursor: pointer; }
.mode-toggle button:first-child { border-radius: 6px 0 0 6px; }
.mode-toggle button:last-child { border-radius: 0 6px 6px 0; }
.mode-toggle button.on { background: var(--accent); color: white; border-color: var(--accent); }
.cm-host { flex: 1; min-height: 0; overflow: hidden; }
.cm-host :deep(.cm-editor) { height: 100%; }
.cm-host :deep(.cm-editor.cm-focused) { outline: none; }
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--fg-2); }
</style>
