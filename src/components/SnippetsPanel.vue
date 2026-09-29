<script setup lang="ts">
import { ref, watch } from 'vue'
import { store, applySnippetsSource, defaultSnippetsSource, toast } from '../store'

const src = ref(store.snippetsSource)
watch(() => store.snippetsSource, (v) => { if (v !== src.value) src.value = v })

function apply() { if (applySnippetsSource(src.value)) toast(`${store.snippets.length} snippets loaded`) }
function reset() { if (window.confirm('Replace your snippets with the defaults?')) { src.value = defaultSnippetsSource(); apply() } }
function download() {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([src.value], { type: 'application/json' })); a.download = 'snippets.json'; a.click()
}
async function upload(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  src.value = await f.text()
  apply()
}
</script>

<template>
  <div class="snips">
    <p class="intro">
      Same format as Obsidian LaTeX Suite (JSON or a JS array with regex triggers). Options:
      <code>t</code> text · <code>m</code> math · <code>M</code> block · <code>n</code> inline ·
      <code>A</code> auto · <code>r</code> regex · <code>v</code> visual · <code>w</code> word boundary.
      Tabstops <code>$0</code>, <code>${1:default}</code>, <code>${VISUAL}</code>; regex groups <code>[[0]]</code>.
    </p>
    <textarea v-model="src" spellcheck="false" />
    <p v-if="store.snippetsError" class="err">{{ store.snippetsError }}</p>
    <div class="btns">
      <button class="primary" @click="apply">Apply</button>
      <button @click="reset">Reset to defaults</button>
      <button @click="download">Download</button>
      <label class="file">Load file<input type="file" accept=".json,.js,.txt" @change="upload" /></label>
    </div>
  </div>
</template>

<style scoped>
.snips { display: flex; flex-direction: column; height: 100%; padding: 8px; gap: 6px; font-size: 12.5px; }
.intro { margin: 0; color: var(--fg-2); line-height: 1.5; }
textarea { flex: 1; min-height: 0; font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 11.5px; line-height: 1.45; border: 1px solid var(--line); border-radius: 6px; padding: 8px; background: var(--paper); color: var(--fg); resize: none; }
.err { margin: 0; color: #b91c1c; font-size: 11.5px; white-space: pre-wrap; }
.btns { display: flex; gap: 6px; flex-wrap: wrap; }
.file { display: inline-flex; align-items: center; padding: 3px 10px; border: 1px solid var(--line); border-radius: 6px; cursor: pointer; background: var(--bg); }
.file input { display: none; }
</style>
