<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import FileTree from './components/FileTree.vue'
import EditorPane from './components/EditorPane.vue'
import PenrosePanel from './components/PenrosePanel.vue'
import SnippetsPanel from './components/SnippetsPanel.vue'
import HelpPanel from './components/HelpPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import ProjectsDialog from './components/ProjectsDialog.vue'
import DocsPanel from './components/DocsPanel.vue'
import { venueById } from './lib/venues'
import { popTargets, popOut, dock, showPanel, setPopupKeyHandler, PANEL_LABELS, type PanelId } from './lib/popout'
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
  window.addEventListener('keydown', onKey)
  setPopupKeyHandler(onKey)
})
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void flushSave() }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o' && !e.shiftKey) { e.preventDefault(); store.dialog = 'projects' }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); showPanel('preview'); void buildNow() }
}
function onDrag(e: MouseEvent) {
  if (dragging.value === 'right') rightWidth.value = Math.min(Math.max(320, window.innerWidth - e.clientX), window.innerWidth * 0.7)
  if (dragging.value === 'left') leftWidth.value = Math.min(Math.max(150, e.clientX), 420)
}

const venueName = computed(() => venueById(store.project?.venue)?.name ?? 'Paper')
const saveState = computed(() => store.saving ? 'saving…' : store.dirty ? 'unsaved' : store.savedAt ? 'saved' : '')
const TABS = Object.keys(PANEL_LABELS) as PanelId[]
const tabLabel = (id: PanelId) => id === 'docs' ? 'Docs' : PANEL_LABELS[id]
const poppedTabs = computed(() => TABS.filter((id) => popTargets[id]))
// the docs iframe loads an external site: only mount it once the tab is first opened
const docsSeen = ref(false)
watch(() => store.rightTab, (t) => { if (t === 'docs') docsSeen.value = true }, { immediate: true })
function clickTab(id: PanelId) { if (popTargets[id]) showPanel(id, true); else store.rightTab = id }

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
      <button v-if="store.project?.mode !== 'paper'" :disabled="!store.project" @click="store.dialog = 'newChapter'">+ Chapter</button>
      <span v-else class="venue-chip" :title="'Paper mode: ' + (venueName || '')">{{ venueName }}</span>
      <button :disabled="!store.project" @click="exportProjectZip">Export ZIP</button>
      <button class="primary" :disabled="!store.project || !companionReady() || store.compile.building" @click="showPanel('preview'); buildNow()" :title="companionReady() ? 'Compile with the companion (Ctrl/⌘-Enter)' : 'Start the compile companion to build in-app'">
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
          <button v-for="id in TABS" :key="id" :class="{ on: store.rightTab === id && !popTargets[id], popped: popTargets[id] }"
                  :title="popTargets[id] ? 'Open in its own window (click to raise)' : ''" @click="clickTab(id)">
            {{ tabLabel(id) }}<template v-if="id === 'preview'"><span v-if="store.compile.ok === false" class="dot bad" /><span v-else-if="companionReady()" class="dot ok" /></template><span v-if="popTargets[id]" class="out">↗</span>
          </button>
          <button class="popbtn" :disabled="!!popTargets[store.rightTab]" @click="popOut(store.rightTab)" :title="`Open ${PANEL_LABELS[store.rightTab]} in its own window`">⧉</button>
        </div>
        <div class="rbody">
          <PenrosePanel v-if="!popTargets.diagram" v-show="store.rightTab === 'diagram'" mode="diagram" />
          <PenrosePanel v-if="!popTargets.library" v-show="store.rightTab === 'library'" mode="library" />
          <PreviewPanel v-if="!popTargets.preview" v-show="store.rightTab === 'preview'" />
          <SnippetsPanel v-if="store.rightTab === 'snippets' && !popTargets.snippets" />
          <DocsPanel v-if="docsSeen && !popTargets.docs" v-show="store.rightTab === 'docs'" />
          <HelpPanel v-if="store.rightTab === 'help' && !popTargets.help" />
          <div v-if="popTargets[store.rightTab]" class="allout">
            <p>{{ PANEL_LABELS[store.rightTab] }} is open in its own window.</p>
            <button @click="dock(store.rightTab)">Bring it back</button>
          </div>
        </div>
      </aside>
    </div>

    <!-- popped-out panels: rendered by this app, displayed in their own windows -->
    <Teleport v-for="id in poppedTabs" :key="id" :to="popTargets[id]!">
      <div class="popwin">
        <div class="popbar">
          <span class="poptitle">{{ PANEL_LABELS[id] }}</span>
          <span class="project muted">{{ store.project?.name }}</span>
          <span class="spacer" />
          <button @click="dock(id)" title="Put this panel back in the main window">Dock</button>
        </div>
        <div class="rbody">
          <PenrosePanel v-if="id === 'diagram' || id === 'library'" :mode="id" />
          <PreviewPanel v-else-if="id === 'preview'" />
          <SnippetsPanel v-else-if="id === 'snippets'" />
          <DocsPanel v-else-if="id === 'docs'" />
          <HelpPanel v-else-if="id === 'help'" />
        </div>
        <div class="toast" v-if="store.toast">{{ store.toast }}</div>
      </div>
    </Teleport>

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
/* paper-mode venue badge in the header */
.venue-chip { font-size: 11.5px; padding: 3px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-weight: 600; }
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
.rtabs button.popped { color: var(--fg-2); font-style: italic; }
.rtabs .out { margin-left: 3px; font-size: 10px; }
.rtabs button.popbtn { flex: none; width: 30px; border-right: none; }
.allout { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--fg-2); }
.popwin { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg); }
.popbar { display: flex; align-items: center; gap: 10px; padding: 0 10px; height: 36px; border-bottom: 1px solid var(--line); background: var(--bg-2); flex: none; }
.poptitle { font-weight: 600; }
.toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: #1f2937; color: white; padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 60; }
</style>
