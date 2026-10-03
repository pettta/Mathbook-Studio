<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { VENUES, venueById, type ProjectMode } from '../lib/venues'
import { store, createProject, openProject, removeProject, importProjectZip, refreshProjects, newChapter } from '../store'

const name = ref('')
const author = ref('')
const mode = ref<ProjectMode>('book')
const venue = ref(VENUES[0].id)
const selectedVenue = computed(() => venueById(venue.value))
const chapterTitle = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

onMounted(() => { void refreshProjects(); setTimeout(() => nameInput.value?.focus(), 30) })

async function doCreate() {
  const fallback = mode.value === 'paper' ? 'Untitled paper' : 'Untitled book'
  await createProject(name.value.trim() || fallback, author.value.trim(), mode.value, mode.value === 'paper' ? venue.value : undefined)
  store.dialog = 'none'
}
async function doOpen(id: string) { await openProject(id); store.dialog = 'none' }
async function doDelete(id: string, n: string) { if (window.confirm(`Delete project “${n}”? This cannot be undone.`)) await removeProject(id) }
async function doImport(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  await importProjectZip(f)
  store.dialog = 'none'
}
function doChapter() { newChapter(chapterTitle.value.trim() || 'New chapter'); store.dialog = 'none' }
function fmt(t: number) { return new Date(t).toLocaleString() }
</script>

<template>
  <div class="backdrop" @click.self="store.dialog = 'none'">
    <div class="dialog">
      <template v-if="store.dialog === 'newChapter'">
        <h3>New chapter</h3>
        <label>Title <input ref="nameInput" v-model="chapterTitle" placeholder="e.g. Sequences" @keydown.enter="doChapter" /></label>
        <p class="muted">Creates chapters/chNN.tex with a chapter opener, epigraph, a section and an exercise block, and adds the \include to main.tex.</p>
        <div class="btns"><button class="primary" @click="doChapter">Create</button><button @click="store.dialog = 'none'">Cancel</button></div>
      </template>

      <template v-else>
        <div class="cols">
          <div class="col">
            <h3>New project</h3>
            <div class="seg">
              <button :class="{ on: mode === 'book' }" @click="mode = 'book'">Book</button>
              <button :class="{ on: mode === 'paper' }" @click="mode = 'paper'">Paper</button>
            </div>
            <label>Title <input ref="nameInput" v-model="name" placeholder="A Book of Mathematics" @keydown.enter="doCreate" /></label>
            <label>Author <input v-model="author" placeholder="Your name" @keydown.enter="doCreate" /></label>
            <label v-if="mode === 'paper'">Target venue
              <select v-model="venue">
                <option v-for="v in VENUES" :key="v.id" :value="v.id">{{ v.name }} — {{ v.field }}</option>
              </select>
            </label>
            <p v-if="mode === 'book'" class="muted">Starts from the mathbook class: main.tex, a preface with the cheat-sheet, chapter 1, and a figures folder.</p>
            <p v-else class="muted">{{ selectedVenue?.note }} Creates main.tex in the venue's format, refs.bib and a figures folder. Paper shortcuts (;abs, ;tab, ;rw, ;app, ;ci …) replace the book-only ones.</p>
            <div class="btns">
              <button class="primary" @click="doCreate">Create</button>
              <label class="file">Import ZIP…<input type="file" accept=".zip" @change="doImport" /></label>
            </div>
          </div>
          <div class="col">
            <h3>Open</h3>
            <p v-if="!store.projects.length" class="muted">No projects yet. Projects are stored in this browser; use Export ZIP to back them up or move them.</p>
            <ul class="list">
              <li v-for="p in store.projects" :key="p.id" :class="{ current: p.id === store.project?.id }">
                <div class="info" @click="doOpen(p.id)">
                  <div class="nm">{{ p.name }}</div>
                  <div class="sub">{{ p.author || '—' }} · {{ fmt(p.updatedAt) }}</div>
                </div>
                <button class="del" title="Delete" @click="doDelete(p.id, p.name)">🗑</button>
              </li>
            </ul>
          </div>
        </div>
        <div class="btns right"><button @click="store.dialog = 'none'">Close</button></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(20, 24, 40, 0.35); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--paper); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); padding: 20px 22px; width: min(760px, 92vw); max-height: 85vh; overflow: auto; font-size: 13px; }
h3 { margin: 0 0 10px; font-size: 15px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; color: var(--fg-2); font-size: 12px; }
label input { font-size: 13px; }
.muted { color: var(--fg-2); font-size: 12px; line-height: 1.5; }
.btns { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
.btns.right { justify-content: flex-end; margin-top: 14px; }
label select { font-size: 13px; padding: 4px; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; margin-bottom: 12px; }
.seg button { border: none; border-radius: 0; background: var(--bg); padding: 5px 16px; cursor: pointer; color: var(--fg); }
.seg button.on { background: var(--accent); color: #fff; }
.file { display: inline-flex; align-items: center; padding: 5px 12px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; background: var(--bg); color: var(--fg); margin: 0; font-size: 13px; }
.file input { display: none; }
.list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; }
.list li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; }
.list li.current { border-color: var(--accent); background: var(--accent-soft); }
.list .info { flex: 1; cursor: pointer; min-width: 0; }
.list .nm { font-weight: 600; }
.list .sub { color: var(--fg-2); font-size: 11.5px; }
.del { border: none; background: transparent; cursor: pointer; opacity: 0.5; }
.del:hover { opacity: 1; }
</style>
