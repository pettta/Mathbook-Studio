<script lang="ts">
// State lives at module level so the Diagram and Library views (docked, or popped out
// into their own windows) share one workbench and survive being moved between windows.
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { renderTrio, RenderCancelled, randomVariation, svgToString, svgToPdf, svgSize, cropToContent, type RenderProgress } from '../lib/penrose/render'
import { store, editor, updateFile, toast, markDirty } from '../store'
import { showPanel, activeWindow } from '../lib/popout'
import { listDiagrams, diagramPath, figureEnvironment, slugify, type DiagramRecord } from '../lib/project'

interface Example { id: string; name: string; group: string; gallery: boolean; domain: string; substance: string; style: string; variation: string }

// ---- state ------------------------------------------------------------------
const tab = ref<'substance' | 'style' | 'domain'>('substance')
const domain = ref('')
const substance = ref('')
const style = ref('')
const variation = ref(randomVariation())
const examples = shallowRef<Example[]>([])
const exampleId = ref('')
const search = ref('')
const status = ref<RenderProgress>({ phase: 'done' })
const errorText = ref('')
const currentSvg = shallowRef<SVGSVGElement | null>(null)
const autoRender = ref(false)
const showEditors = ref(true)

// insert form
const figName = ref('diagram')
const caption = ref('')
const label = ref('fig:diagram')
const width = ref('0.6')
const placement = ref('tbp')
const nameTouched = ref(false)

const rendering = computed(() => status.value.phase === 'compiling' || status.value.phase === 'optimizing' || status.value.phase === 'rendering')
const diagrams = computed<DiagramRecord[]>(() => (store.project ? listDiagrams(store.project) : []))

const grouped = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = examples.value.filter((e) => !q || e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
  const map = new Map<string, Example[]>()
  for (const e of list) { const g = e.gallery ? '★ Gallery' : e.group; if (!map.has(g)) map.set(g, []); map.get(g)!.push(e) }
  return [...map.entries()].sort((a, b) => (a[0].startsWith('★') ? -1 : b[0].startsWith('★') ? 1 : a[0].localeCompare(b[0])))
})

let examplesLoading = false
async function loadExamples() {
  if (examplesLoading) return
  examplesLoading = true
  const mod = await import('../lib/penrose/examples.json')
  examples.value = (mod.default as Example[])
  const first = examples.value.find((e) => e.id === 'set-theory-domain/tree-euler') ?? examples.value[0]
  if (first && !substance.value) loadExample(first.id)
}

function loadExample(id: string) {
  const e = examples.value.find((x) => x.id === id)
  if (!e) return
  exampleId.value = id
  domain.value = e.domain; substance.value = e.substance; style.value = e.style; variation.value = e.variation || randomVariation()
  if (!nameTouched.value) { figName.value = slugify(e.name); label.value = 'fig:' + figName.value }
  if (!caption.value) caption.value = e.name
  void render()
}

// ---- rendering ---------------------------------------------------------------
let renderTimer: number | undefined
async function render() {
  errorText.value = ''
  try {
    const { svg: raw } = await renderTrio({ domain: domain.value, substance: substance.value, style: style.value, variation: variation.value }, (p) => { status.value = p })
    const svg = cropToContent(raw)
    svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%')
    svg.style.maxHeight = '100%'
    currentSvg.value = svg
  } catch (e) {
    if (e instanceof RenderCancelled) return
    status.value = { phase: 'error' }
    errorText.value = (e as Error).message
  }
}
function resample() { variation.value = randomVariation(); void render() }
watch([domain, substance, style], () => {
  if (!autoRender.value) return
  window.clearTimeout(renderTimer)
  renderTimer = window.setTimeout(() => void render(), 600)
})
const labelTouched = ref(false)
watch(figName, (v) => { if (!labelTouched.value) label.value = 'fig:' + slugify(v) })

// ---- insert into the book ----------------------------------------------------
async function saveFigure(insert: boolean) {
  if (!store.project) { toast('Open a project first'); return }
  if (!currentSvg.value) { toast('Render the diagram first'); return }
  const name = slugify(figName.value)
  status.value = { phase: 'rendering', message: 'PDF' }
  try {
    // render a clean copy at natural size (the preview copy has width=100%)
    const { svg: raw } = await renderTrio({ domain: domain.value, substance: substance.value, style: style.value, variation: variation.value })
    const svg = cropToContent(raw)
    const pdf = await svgToPdf(svg)
    updateFile(`figures/${name}.svg`, svgToString(svg))
    updateFile(`figures/${name}.pdf`, pdf)
    const rec: DiagramRecord = { name, domain: domain.value, substance: substance.value, style: style.value, variation: variation.value, caption: caption.value, label: label.value, width: width.value, updatedAt: Date.now() }
    updateFile(diagramPath(name), JSON.stringify(rec, null, 2))
    markDirty()
    status.value = { phase: 'done' }
    const { width: w, height: h } = svgSize(svg)
    if (insert) {
      const ed = editor()
      if (!ed || !ed.getCursorFile()) { toast(`Saved figures/${name}.pdf — open a chapter to insert it`); return }
      ed.insertAtCursor(figureEnvironment({ name, caption: caption.value, label: label.value, width: width.value }, placement.value))
      toast(`Inserted figures/${name} (${Math.round(w)}×${Math.round(h)})`)
    } else {
      toast(`Saved figures/${name}.svg and .pdf`)
    }
  } catch (e) {
    status.value = { phase: 'error' }
    errorText.value = (e as Error).message
  }
}

function loadDiagram(d: DiagramRecord) {
  domain.value = d.domain; substance.value = d.substance; style.value = d.style; variation.value = d.variation
  figName.value = d.name; caption.value = d.caption; label.value = d.label; width.value = d.width
  nameTouched.value = true; labelTouched.value = true
  exampleId.value = ''
  showPanel('diagram', true)
  void render()
}
function removeDiagram(d: DiagramRecord) {
  if (!store.project || !activeWindow().confirm(`Delete figures/${d.name}.* ?`)) return
  for (const ext of ['.svg', '.pdf', '.penrose.json']) delete store.project.files[`figures/${d.name}${ext}`]
  markDirty()
}
function insertExisting(d: DiagramRecord) {
  const ed = editor()
  if (!ed || !ed.getCursorFile()) { toast('Open a chapter first'); return }
  ed.insertAtCursor(figureEnvironment(d))
  toast(`Inserted figures/${d.name}`)
}
function downloadSvg() {
  if (!currentSvg.value) return
  const blob = new Blob([svgToString(currentSvg.value)], { type: 'image/svg+xml' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = slugify(figName.value) + '.svg'; a.click()
}
function newBlank() {
  exampleId.value = ''
  domain.value = 'type Set\npredicate Subset(Set a, Set b)\n'
  substance.value = 'Set A, B\nSubset(B, A)\nAutoLabel All\n'
  style.value = `canvas {
  width = 400
  height = 300
}

forall Set x {
  x.icon = Circle {
    r: 60
    strokeWidth: 1
    strokeColor: #000
    fillColor: #f1f5f9
  }
  x.text = Equation {
    string: x.label
    fontSize: "18px"
  }
  ensure contains(x.icon, x.text)
  ensure onCanvas(x.icon, canvas.width, canvas.height)
}

forall Set a, b
where Subset(b, a) {
  ensure contains(a.icon, b.icon, 10)
  ensure disjoint(a.text, b.icon)
  a.icon above b.icon
}
`
  void render()
}
</script>

<script setup lang="ts">
import CodeBox from './CodeBox.vue'

defineProps<{ mode: 'diagram' | 'library' }>()
const svgHost = ref<HTMLDivElement | null>(null)
watch([svgHost, currentSvg], ([host, svg]) => { if (host && svg) host.replaceChildren(svg) })
onMounted(() => { void loadExamples() })
</script>

<template>
  <div class="penrose">
    <!-- ================= Diagram tab ================= -->
    <div v-if="mode === 'diagram'" class="diagram">
      <div class="toolbar">
        <select :value="exampleId" @change="loadExample(($event.target as HTMLSelectElement).value)" title="Load a Penrose example">
          <option value="" disabled>Examples…</option>
          <optgroup v-for="[g, list] in grouped" :key="g" :label="g">
            <option v-for="e in list" :key="e.id" :value="e.id">{{ e.name }}</option>
          </optgroup>
        </select>
        <input v-model="search" class="search" placeholder="filter examples" />
        <button @click="newBlank" title="Start from a tiny set diagram">blank</button>
      </div>

      <div class="preview" :class="{ busy: rendering }">
        <div ref="svgHost" class="svg-host" />
        <div v-if="rendering" class="status">
          {{ status.phase }}<span v-if="status.steps"> · {{ status.steps }} steps</span>
        </div>
        <pre v-if="errorText" class="error">{{ errorText }}</pre>
      </div>

      <div class="toolbar">
        <button class="primary" @click="render" :disabled="rendering">Render</button>
        <button @click="resample" :disabled="rendering" title="New random layout seed">Resample</button>
        <label class="chk"><input type="checkbox" v-model="autoRender" /> auto</label>
        <input v-model="variation" class="variation" title="variation (layout seed)" />
        <span class="spacer" />
        <button @click="showEditors = !showEditors">{{ showEditors ? 'hide code' : 'show code' }}</button>
      </div>

      <div v-show="showEditors" class="editors">
        <div class="subtabs">
          <button :class="{ on: tab === 'substance' }" @click="tab = 'substance'">Substance</button>
          <button :class="{ on: tab === 'style' }" @click="tab = 'style'">Style</button>
          <button :class="{ on: tab === 'domain' }" @click="tab = 'domain'">Domain</button>
        </div>
        <div class="editor-slot">
          <CodeBox v-show="tab === 'substance'" v-model="substance" />
          <CodeBox v-show="tab === 'style'" v-model="style" />
          <CodeBox v-show="tab === 'domain'" v-model="domain" />
        </div>
      </div>

      <div class="insert">
        <div class="row"><label>file</label><input v-model="figName" @input="nameTouched = true" /><span class="hint">figures/{{ slugify(figName) }}.pdf</span></div>
        <div class="row"><label>caption</label><input v-model="caption" placeholder="Caption text" /></div>
        <div class="row"><label>label</label><input v-model="label" @input="labelTouched = true" /></div>
        <div class="row">
          <label>width</label><input v-model="width" class="short" /><span class="hint">×\textwidth</span>
          <label>place</label><input v-model="placement" class="short" />
        </div>
        <div class="row buttons">
          <button class="primary" @click="saveFigure(true)" :disabled="rendering || !currentSvg">Insert into book</button>
          <button @click="saveFigure(false)" :disabled="rendering || !currentSvg">Save only</button>
          <button @click="downloadSvg" :disabled="!currentSvg">↓ svg</button>
        </div>
      </div>
    </div>

    <!-- ================= Library tab ================= -->
    <div v-else class="library">
      <p v-if="!diagrams.length" class="muted">No diagrams saved in this project yet. Render one and press <em>Insert into book</em>.</p>
      <div v-for="d in diagrams" :key="d.name" class="card">
        <div class="thumb" v-html="(store.project?.files[`figures/${d.name}.svg`] as string) || ''"></div>
        <div class="meta">
          <div class="name">{{ d.name }}</div>
          <div class="cap">{{ d.caption }}</div>
          <div class="lbl">\cref{{ '{' }}{{ d.label }}{{ '}' }}</div>
          <div class="btns">
            <button @click="loadDiagram(d)">edit</button>
            <button @click="insertExisting(d)">insert</button>
            <button @click="removeDiagram(d)">delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.penrose { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12.5px; }
.diagram { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--line); flex: none; }
.toolbar select { flex: 1; min-width: 0; font: inherit; padding: 3px 4px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg); }
.toolbar .search { width: 110px; }
.toolbar .variation { width: 120px; font-family: ui-monospace, monospace; font-size: 11px; }
.spacer { flex: 1; }
.chk { display: flex; align-items: center; gap: 3px; color: var(--fg-2); }
.preview { position: relative; flex: 0 0 38%; min-height: 160px; background: white; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.preview.busy .svg-host { opacity: 0.4; }
.svg-host { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; padding: 6px; }
.svg-host :deep(> svg) { width: 100%; height: 100%; }
.status { position: absolute; top: 8px; left: 10px; font-size: 11px; color: var(--fg-2); background: rgba(255,255,255,0.8); padding: 2px 6px; border-radius: 4px; }
.error { position: absolute; inset: auto 8px 8px 8px; max-height: 60%; overflow: auto; margin: 0; font-size: 11px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 8px; white-space: pre-wrap; }
.editors { flex: 1; min-height: 120px; display: flex; flex-direction: column; border-bottom: 1px solid var(--line); }
.subtabs { display: flex; flex: none; background: var(--bg-2); border-bottom: 1px solid var(--line); }
.subtabs button { font: inherit; font-size: 12px; padding: 4px 12px; border: none; border-right: 1px solid var(--line); background: transparent; color: var(--fg-2); cursor: pointer; }
.subtabs button.on { background: var(--paper); color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
.editor-slot { flex: 1; min-height: 0; }
.editor-slot > * { height: 100%; }
.insert { flex: none; padding: 6px 8px 8px; display: flex; flex-direction: column; gap: 4px; background: var(--bg-2); }
.insert .row { display: flex; align-items: center; gap: 6px; }
.insert label { width: 44px; color: var(--fg-2); font-size: 11px; text-align: right; }
.insert input { flex: 1; min-width: 0; }
.insert input.short { flex: 0 0 52px; }
.insert .hint { color: var(--fg-2); font-size: 11px; white-space: nowrap; }
.insert .buttons { justify-content: flex-start; margin-top: 2px; }
.library { overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.card { display: flex; gap: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: var(--paper); }
.thumb { width: 110px; height: 80px; flex: none; display: flex; align-items: center; justify-content: center; background: white; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.thumb :deep(> svg) { max-width: 100%; max-height: 100%; width: auto; height: auto; }
.meta { flex: 1; min-width: 0; }
.meta .name { font-weight: 600; }
.meta .cap { color: var(--fg-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta .lbl { font-family: ui-monospace, monospace; font-size: 11px; color: var(--accent-ink); }
.btns { margin-top: 4px; display: flex; gap: 4px; }
.muted { color: var(--fg-2); padding: 8px; }
</style>
