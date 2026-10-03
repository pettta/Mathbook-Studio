<script setup lang="ts">
import { computed, ref } from 'vue'
import { store, openFile, renameFile, deleteFile, createFile, toast } from '../store'
import TreeNode from './TreeNode'

interface Node { name: string; path: string; children?: Node[]; binary?: boolean }

const tree = computed<Node[]>(() => {
  const p = store.project
  if (!p) return []
  const root: Node = { name: '', path: '', children: [] }
  const paths = Object.keys(p.files).filter((f) => !f.endsWith('/.keep')).sort((a, b) => {
    // main.tex first, then folders alphabetically
    if (a === 'main.tex') return -1
    if (b === 'main.tex') return 1
    return a.localeCompare(b)
  })
  for (const path of paths) {
    const parts = path.split('/')
    let cur = root
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1
      const sub = path.split('/').slice(0, i + 1).join('/')
      let n = cur.children!.find((c) => c.name === part && !!c.children === !isLeaf)
      if (!n) {
        n = isLeaf ? { name: part, path, binary: typeof p.files[path] !== 'string' } : { name: part, path: sub, children: [] }
        cur.children!.push(n)
      }
      cur = n
    })
  }
  // folders that exist only through .keep
  for (const f of Object.keys(p.files)) {
    if (f.endsWith('/.keep')) {
      const dir = f.slice(0, -6)
      if (!root.children!.find((c) => c.name === dir && c.children)) root.children!.push({ name: dir, path: dir, children: [] })
    }
  }
  const sortNodes = (ns: Node[]) => {
    ns.sort((a, b) => (a.path === 'main.tex' ? -1 : b.path === 'main.tex' ? 1 : (!!a.children === !!b.children ? a.name.localeCompare(b.name) : a.children ? 1 : -1)))
    ns.forEach((n) => n.children && sortNodes(n.children))
  }
  sortNodes(root.children!)
  return root.children!
})

const collapsed = ref<Set<string>>(new Set())
function toggle(path: string) {
  const s = new Set(collapsed.value)
  s.has(path) ? s.delete(path) : s.add(path)
  collapsed.value = s
}

function icon(n: Node) {
  if (n.children) return collapsed.value.has(n.path) ? '▸' : '▾'
  if (n.path.endsWith('.tex')) return 'T'
  if (n.path.endsWith('.cls') || n.path.endsWith('.sty')) return 'C'
  if (n.path.endsWith('.svg')) return 'S'
  if (n.path.endsWith('.pdf')) return 'P'
  if (n.path.endsWith('.json')) return '{}'
  return '·'
}

function doRename(n: Node) {
  const to = window.prompt('Rename to (path relative to project):', n.path)
  if (!to || to === n.path) return
  if (store.project && to in store.project.files) { toast('A file with that name exists'); return }
  renameFile(n.path, to)
}
function doDelete(n: Node) {
  if (n.path === 'main.tex' || n.path === 'mathbook.cls') { toast('That file is required'); return }
  if (window.confirm(`Delete ${n.path}?`)) deleteFile(n.path)
}
function doNewFile() {
  const path = window.prompt('New file path (e.g. chapters/appendix.tex or macros.sty):')
  if (!path) return
  createFile(path.replace(/^\/+/, ''), '')
}

const emit = defineEmits<{ (e: 'new-chapter'): void }>()
</script>

<template>
  <div class="tree">
    <div class="tree-head">
      <span class="label">Files</span>
      <span class="actions">
        <button v-if="store.project?.mode !== 'paper'" title="New chapter" @click="emit('new-chapter')">+ chapter</button>
        <button title="New file" @click="doNewFile">+ file</button>
      </span>
    </div>
    <div class="nodes">
      <template v-for="n in tree" :key="n.path">
        <TreeNode :node="n" :depth="0" :collapsed="collapsed" :active="store.activeFile" :icon="icon"
          @open="openFile" @toggle="toggle" @rename="doRename" @delete="doDelete" />
      </template>
    </div>
  </div>
</template>



<style scoped>
.tree { display: flex; flex-direction: column; height: 100%; font-size: 13px; }
.tree-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid var(--line); }
.tree-head .label { font-weight: 600; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-2); }
.actions button { font: inherit; font-size: 11px; padding: 2px 6px; margin-left: 4px; border: 1px solid var(--line); border-radius: 5px; background: var(--bg); color: var(--fg-2); cursor: pointer; }
.actions button:hover { color: var(--fg); border-color: var(--fg-2); }
.nodes { overflow: auto; flex: 1; padding: 4px 0; }
.nodes :deep(.row) { display: flex; align-items: center; gap: 6px; padding: 3px 8px; cursor: pointer; color: var(--fg); white-space: nowrap; }
.nodes :deep(.row:hover) { background: var(--bg-2); }
.nodes :deep(.row.active) { background: var(--accent-soft); color: var(--accent-ink); }
.nodes :deep(.row.dir) { color: var(--fg-2); font-weight: 600; }
.nodes :deep(.ic) { display: inline-block; width: 16px; text-align: center; font-size: 10px; color: var(--fg-2); font-family: ui-monospace, monospace; }
.nodes :deep(.nm) { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.nodes :deep(.row-actions) { display: none; gap: 2px; }
.nodes :deep(.row:hover .row-actions) { display: inline-flex; }
.nodes :deep(.row-actions button) { border: none; background: transparent; cursor: pointer; font-size: 11px; color: var(--fg-2); padding: 0 3px; }
</style>
