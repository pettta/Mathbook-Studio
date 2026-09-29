<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import FileTree from './components/FileTree.vue'
import EditorPane from './components/EditorPane.vue'
import PenrosePanel from './components/PenrosePanel.vue'
import SnippetsPanel from './components/SnippetsPanel.vue'
import HelpPanel from './components/HelpPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import ProjectsDialog from './components/ProjectsDialog.vue'
import { store, initSnippets, restoreLast, exportProjectZip, flushSave, markDirty, buildNow, companionReady } from './store'

const rightWidth = ref(440)
const leftWidth = ref(220)
const dragging = ref<'left' | 'right' | null>(null)

onMounted(async () => {
  await initSnippets()
  const ok = await restoreLast()
  if (!ok) store.dialog = 'projects'
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', () => { dragging.value = null })
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void flushSave() }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey) { e.preventDefault(); store.dialog = 'projects' }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); store.rightTab = 'preview'; void buildNow() }
  })
})
function onDrag(e: MouseEvent) {
  if (dragging.value === 'right') rightWidth.value = Math.min(Math.max(320, window.innerWidth - e.clientX), window.innerWidth * 0.7)
  if (dragging.value === 'left') leftWidth.value = Math.min(Math.max(150, e.clientX), 420)
}

const saveState = computed(() => store.saving ? 'saving…' : store.dirty ? 'unsaved' : store.savedAt ? 'saved' : '')
function renameProject() {
  if (!store.project) return
  const n = window.prompt('Book title:', store.project.name)
  if (n && n !== store.project.name) { store.project.name = n; markDirty() }
}
</script>

<template>
  <div class="app" :class="{ dragging }">
    <header class="top">
      <div class="brand">Mathbook <span>Studio</span></div>
      <div class="project" v-if="store.project" @dblclick="renameProject" title="Double-click to rename">{{ store.project.name }}</div>
      <div class="project muted" v-else>no project</div>
      <span class="save" :class="saveState">{{ saveState }}</span>
      <div class="spacer" />
      <button @click="store.dialog = 'projects'">Projects</button>
      <button :disabled="!store.project" @click="store.dialog = 'newChapter'">+ Chapter</button>
      <button :disabled="!store.project" @click="exportProjectZip">Export ZIP</button>
      <button class="primary" :disabled="!store.project || !companionReady() || store.compile.building" @click="store.rightTab = 'preview'; buildNow()" :title="companionReady() ? 'Compile with the companion (Ctrl/⌘-Enter)' : 'Start the compile companion to build in-app'">
        {{ store.compile.building ? 'Building…' : 'Build PDF' }}
      </button>
    </header>

    <div class="body" :style="{ gridTemplateColumns: `${leftWidth}px 6px 1fr 6px ${rightWidth}px` }">
      <aside class="left"><FileTree @new-chapter="store.dialog = 'newChapter'" /></aside>
      <div class="gutter" @mousedown.prevent="dragging = 'left'" />
      <main class="center"><EditorPane /></main>
      <div class="gutter" @mousedown.prevent="dragging = 'right'" />
      <aside class="right">
        <div class="rtabs">
          <button :class="{ on: store.rightTab === 'diagram' }" @click="store.rightTab = 'diagram'">Diagram</button>
          <button :class="{ on: store.rightTab === 'library' }" @click="store.rightTab = 'library'">Library</button>
          <button :class="{ on: store.rightTab === 'preview' }" @click="store.rightTab = 'preview'">
            Preview<span v-if="store.compile.ok === false" class="dot bad" /><span v-else-if="companionReady()" class="dot ok" />
          </button>
          <button :class="{ on: store.rightTab === 'snippets' }" @click="store.rightTab = 'snippets'">Snippets</button>
          <button :class="{ on: store.rightTab === 'help' }" @click="store.rightTab = 'help'">Help</button>
        </div>
        <div class="rbody">
          <PenrosePanel v-show="store.rightTab === 'diagram' || store.rightTab === 'library'" />
          <PreviewPanel v-show="store.rightTab === 'preview'" />
          <SnippetsPanel v-if="store.rightTab === 'snippets'" />
          <HelpPanel v-if="store.rightTab === 'help'" />
        </div>
      </aside>
    </div>

    <ProjectsDialog v-if="store.dialog !== 'none'" />
    <div class="toast" v-if="store.toast">{{ store.toast }}</div>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.app.dragging { user-select: none; cursor: col-resize; }
.top { display: flex; align-items: center; gap: 10px; padding: 0 12px; height: 42px; border-bottom: 1px solid var(--line); background: var(--bg-2); flex: none; }
.brand { font-weight: 700; letter-spacing: 0.02em; }
.brand span { color: var(--accent); font-weight: 500; }
.project { font-size: 13px; padding: 2px 8px; border-radius: 6px; cursor: default; }
.project.muted { color: var(--fg-2); }
.save { font-size: 11px; color: var(--fg-2); min-width: 60px; }
.save.unsaved { color: #b45309; }
.spacer { flex: 1; }
.body { display: grid; flex: 1; min-height: 0; }
.left, .right, .center { min-width: 0; min-height: 0; overflow: hidden; }
.left { background: var(--bg); border-right: 1px solid var(--line); }
.right { background: var(--bg); border-left: 1px solid var(--line); display: flex; flex-direction: column; }
.gutter { cursor: col-resize; background: transparent; }
.gutter:hover { background: var(--accent-soft); }
.rtabs { display: flex; flex: none; border-bottom: 1px solid var(--line); background: var(--bg-2); }
.rtabs button { flex: 1; font: inherit; font-size: 12.5px; padding: 7px 0; border: none; border-right: 1px solid var(--line); background: transparent; color: var(--fg-2); cursor: pointer; }
.rtabs button.on { background: var(--bg); color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-left: 5px; vertical-align: middle; }
.dot.ok { background: #16a34a; }
.dot.bad { background: #dc2626; }
.rbody { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rbody > * { flex: 1; min-height: 0; }
.toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: #1f2937; color: white; padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 60; }
</style>
