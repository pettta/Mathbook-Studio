<script setup lang="ts">
// A small CodeMirror editor for the Penrose programs (v-model on a string).
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, bracketMatching } from '@codemirror/language'
import { closeBrackets } from '@codemirror/autocomplete'
import { penroseLanguage } from '../lib/penrose/language'
import { latexHighlight } from '../lib/latex'

const props = defineProps<{ modelValue: string; placeholder?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()
const host = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
let internal = false

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        lineNumbers(), drawSelection(), highlightActiveLine(), history(), bracketMatching(), closeBrackets(),
        penroseLanguage, syntaxHighlighting(latexHighlight),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => { if (u.docChanged) { internal = true; emit('update:modelValue', u.state.doc.toString()); internal = false } }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '12.5px' },
          '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace', lineHeight: '1.5' },
          '.cm-gutters': { background: 'transparent', border: 'none', color: '#b0b4bc' },
          '.cm-activeLine': { background: 'rgba(90,110,180,0.06)' },
        }),
      ],
    }),
  })
})
onBeforeUnmount(() => view?.destroy())
watch(() => props.modelValue, (v) => {
  if (internal || !view || v === view.state.doc.toString()) return
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
})
</script>

<template>
  <div ref="host" class="codebox" />
</template>

<style scoped>
.codebox { height: 100%; min-height: 0; overflow: hidden; background: var(--paper); }
.codebox :deep(.cm-editor) { height: 100%; }
.codebox :deep(.cm-editor.cm-focused) { outline: none; }
</style>
