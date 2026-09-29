<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed, nextTick } from 'vue'
import * as pdfjs from 'pdfjs-dist'
import { store, buildNow, detectCompanion, locateInPreview, editor, toast } from '../store'

// own worker so the Map-upsert polyfill also runs inside pdf.js's worker
pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('../pdf.worker.ts', import.meta.url), { type: 'module' })

const scroller = ref<HTMLDivElement | null>(null)
const pages = ref<HTMLDivElement | null>(null)
const zoom = ref(1)           // 1 = fit width
const numPages = ref(0)
const currentPage = ref(1)
const showLog = ref(false)
let doc: pdfjs.PDFDocumentProxy | null = null
let task: pdfjs.PDFDocumentLoadingTask | null = null
let renderToken = 0
let resizeObs: ResizeObserver | null = null

const c = computed(() => store.compile)
const ready = computed(() => c.value.enabled && !!c.value.health?.ok && !!c.value.health?.latexmk)
const realErrors = computed(() => c.value.errors.filter((e) => !e.warning))
const warnings = computed(() => c.value.errors.filter((e) => e.warning && !e.minor))

async function load() {
  const data = c.value.pdf
  if (!data) { numPages.value = 0; pages.value?.replaceChildren(); return }
  const token = ++renderToken
  const prevScroll = scroller.value?.scrollTop ?? 0
  const prevHeight = pages.value?.scrollHeight ?? 1
  try {
    const nextTask = pdfjs.getDocument({ data: data.slice() })
    const next = await nextTask.promise
    if (token !== renderToken) { void nextTask.destroy(); return }
    void task?.destroy()
    task = nextTask
    doc = next
    numPages.value = doc.numPages
    await renderAll(token)
    // keep the reader's place across rebuilds
    await nextTick()
    if (scroller.value && pages.value) scroller.value.scrollTop = prevScroll * (pages.value.scrollHeight / prevHeight)
  } catch (e) {
    toast('Could not open PDF: ' + String(e))
  }
}

async function renderAll(token: number) {
  if (!doc || !pages.value || !scroller.value) return
  const width = Math.max(200, scroller.value.clientWidth - 24)
  const frag = document.createDocumentFragment()
  const canvases: { canvas: HTMLCanvasElement; page: number; viewport: pdfjs.PageViewport; p: pdfjs.PDFPageProxy }[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i)
    if (token !== renderToken) return
    const base = p.getViewport({ scale: 1 })
    const scale = (width / base.width) * zoom.value
    const viewport = p.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = viewport.width + 'px'
    canvas.style.height = viewport.height + 'px'
    canvas.className = 'page'
    canvas.dataset.page = String(i)
    frag.appendChild(canvas)
    canvases.push({ canvas, page: i, viewport, p })
  }
  pages.value.replaceChildren(frag)
  for (const { canvas, viewport, p } of canvases) {
    if (token !== renderToken) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    await p.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined } as any).promise
  }
}

function onScroll() {
  if (!scroller.value || !pages.value) return
  const top = scroller.value.scrollTop + scroller.value.clientHeight / 3
  let page = 1
  for (const el of Array.from(pages.value.children) as HTMLElement[]) { if (el.offsetTop <= top) page = Number(el.dataset.page) }
  currentPage.value = page
}

function goToPage(n: number, yFrac?: number) {
  const el = pages.value?.querySelector<HTMLElement>(`[data-page="${n}"]`)
  if (!el || !scroller.value) return
  const y = el.offsetTop + (yFrac !== undefined ? yFrac * el.offsetHeight - scroller.value.clientHeight / 3 : -12)
  scroller.value.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200)
}

watch(() => c.value.pdfVersion, () => void load())
watch(zoom, () => void load())
watch(() => c.value.locate?.version, async () => {
  const l = c.value.locate
  if (!l || !doc) return
  const p = await doc.getPage(l.page)
  const h = p.getViewport({ scale: 1 }).height   // synctex y is in pt from the top
  goToPage(l.page, Math.min(1, Math.max(0, l.y / h)))
})

onMounted(() => {
  void load()
  resizeObs = new ResizeObserver(() => { if (doc) void load() })
  if (scroller.value) resizeObs.observe(scroller.value)
})
onBeforeUnmount(() => { renderToken++; void task?.destroy(); resizeObs?.disconnect() })

function jump(e: { file: string; line: number | null }) {
  if (!e.file || !e.line) return
  const file = e.file.replace(/^\.\//, '')
  if (store.project && file in store.project.files) editor()?.goTo(file, e.line)
}
function setUrl() {
  const u = window.prompt('Compile companion URL (run `npm run compile-server`, or point at a homelab instance):', c.value.url)
  if (u) { c.value.url = u.trim().replace(/\/$/, ''); void detectCompanion() }
}
</script>

<template>
  <div class="preview-panel">
    <div class="bar">
      <template v-if="ready">
        <button class="primary" :disabled="c.building" @click="buildNow" title="Ctrl/⌘-Enter">{{ c.building ? 'Building…' : 'Build' }}</button>
        <label class="chk" title="Rebuild after every save"><input type="checkbox" v-model="c.auto" /> auto</label>
        <button :disabled="!c.pdf || !c.health?.synctex" @click="locateInPreview" title="Scroll to the cursor's line (SyncTeX)">Locate</button>
        <span class="spacer" />
        <span class="status" :class="{ ok: c.ok === true, bad: c.ok === false }">
          <template v-if="c.ok === true">✓ {{ c.seconds.toFixed(1) }}s</template>
          <template v-else-if="c.ok === false">✗ {{ realErrors.length }} error{{ realErrors.length === 1 ? '' : 's' }}</template>
          <template v-else>—</template>
        </span>
        <button class="ghost" @click="zoom = Math.max(0.5, zoom - 0.15)">−</button>
        <span class="zoom">{{ Math.round(zoom * 100) }}%</span>
        <button class="ghost" @click="zoom = Math.min(3, zoom + 0.15)">+</button>
        <button class="ghost" @click="zoom = 1" title="fit width">fit</button>
      </template>
      <template v-else>
        <span class="muted">Compile companion {{ c.checking ? 'checking…' : c.enabled ? 'not reachable' : 'disabled' }} at <code>{{ c.url }}</code></span>
        <span class="spacer" />
        <label class="chk"><input type="checkbox" v-model="c.enabled" @change="detectCompanion" /> use</label>
        <button @click="detectCompanion" :disabled="c.checking">Retry</button>
        <button @click="setUrl">URL…</button>
      </template>
    </div>

    <div v-if="!ready" class="howto">
      <p><strong>Whole-book preview</strong> needs a TeX engine. Run the companion on any machine with TeX Live / MacTeX:</p>
      <pre>cd mathbook-studio
npm run compile-server        # serves http://127.0.0.1:4747</pre>
      <p>It receives the project, runs <code>latexmk -pdf</code>, and returns the PDF; SyncTeX <em>Locate</em> jumps the preview to your cursor. The app checks for it on startup and when you press Retry. For a homelab instance, build <code>Dockerfile.compile</code> and set the URL.</p>
      <p v-if="c.health && !c.health.latexmk" class="warn">The companion is running but <code>latexmk</code> was not found on its PATH.</p>
    </div>

    <div v-else class="body">
      <div v-if="realErrors.length || warnings.length" class="errors">
        <div v-for="(e, i) in realErrors" :key="'e' + i" class="err" @click="jump(e)"><span class="loc">{{ e.file }}<template v-if="e.line">:{{ e.line }}</template></span> {{ e.message }}</div>
        <details v-if="warnings.length"><summary>{{ warnings.length }} warning{{ warnings.length === 1 ? '' : 's' }}</summary>
          <div v-for="(e, i) in warnings" :key="'w' + i" class="warnline" @click="jump(e)"><span class="loc">{{ e.file }}<template v-if="e.line">:{{ e.line }}</template></span> {{ e.message }}</div>
        </details>
        <details v-if="c.log" :open="showLog"><summary @click="showLog = !showLog">latexmk output</summary><pre class="log">{{ c.log }}</pre></details>
      </div>
      <div ref="scroller" class="scroller" @scroll="onScroll">
        <div ref="pages" class="pages" />
        <div v-if="!c.pdf" class="muted center">{{ c.building ? 'Building…' : 'No PDF yet — press Build.' }}</div>
      </div>
      <div class="foot" v-if="numPages">page {{ currentPage }} / {{ numPages }}</div>
    </div>
  </div>
</template>

<style scoped>
.preview-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12.5px; }
.bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--line); flex: none; flex-wrap: wrap; }
.spacer { flex: 1; }
.chk { display: flex; align-items: center; gap: 3px; color: var(--fg-2); }
.status { font-size: 11.5px; color: var(--fg-2); }
.status.ok { color: #15803d; }
.status.bad { color: #b91c1c; }
.ghost { padding: 2px 7px; }
.zoom { font-size: 11px; color: var(--fg-2); min-width: 34px; text-align: center; }
.muted { color: var(--fg-2); }
.muted.center { padding: 30px; text-align: center; }
.howto { padding: 12px 14px; line-height: 1.55; color: var(--fg); overflow: auto; }
.howto pre { background: var(--bg-2); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font-size: 11.5px; }
.warn { color: #b45309; }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.errors { flex: none; max-height: 40%; overflow: auto; border-bottom: 1px solid var(--line); background: #fffaf5; padding: 4px 0; }
.err, .warnline { padding: 3px 10px; cursor: pointer; font-size: 12px; line-height: 1.4; }
.err { color: #b91c1c; }
.err:hover, .warnline:hover { background: rgba(0,0,0,0.04); }
.warnline { color: #92400e; }
.loc { font-family: ui-monospace, Menlo, monospace; font-size: 11px; opacity: 0.8; margin-right: 6px; }
details { padding: 2px 10px; }
summary { cursor: pointer; color: var(--fg-2); font-size: 11.5px; }
.log { font-size: 10.5px; white-space: pre-wrap; max-height: 200px; overflow: auto; margin: 4px 0; color: var(--fg-2); }
.scroller { flex: 1; min-height: 0; overflow: auto; background: #d9dce3; padding: 12px; }
.pages { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.pages :deep(canvas.page) { background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.18); transition: box-shadow 0.4s; }
.pages :deep(canvas.page.flash) { box-shadow: 0 0 0 3px var(--accent), 0 2px 10px rgba(0,0,0,0.18); }
.foot { flex: none; padding: 3px 10px; font-size: 11px; color: var(--fg-2); border-top: 1px solid var(--line); background: var(--bg-2); }
</style>
