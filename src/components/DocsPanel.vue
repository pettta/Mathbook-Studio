<script setup lang="ts">
// The Penrose reference, embedded from penrose.cs.cmu.edu (needs a network connection).
import { ref } from 'vue'

const BASE = 'https://penrose.cs.cmu.edu/docs/'
const sections: [string, [string, string][]][] = [
  ['Start', [['Reference overview', 'ref'], ['Tutorial', 'tutorial/welcome']]],
  ['Domain', [['Overview', 'ref/domain/overview'], ['Types', 'ref/domain/types'], ['Predicates', 'ref/domain/predicates'], ['Functions', 'ref/domain/functions']]],
  ['Substance', [['Overview', 'ref/substance/overview'], ['Statements', 'ref/substance/statements'], ['Indexed statements', 'ref/substance/indexed-statements'], ['Literal expressions', 'ref/substance/literal-expressions']]],
  ['Style', [
    ['Overview', 'ref/style/overview'], ['Selectors', 'ref/style/selectors'], ['Selector blocks', 'ref/style/selector-blocks'], ['Collectors', 'ref/style/collectors'],
    ['Expressions', 'ref/style/expressions'], ['Literals', 'ref/style/literals'], ['Value types', 'ref/style/value-types'], ['Vectors & matrices', 'ref/style/vectors-matrices'],
    ['Namespaces', 'ref/style/namespaces'], ['Random sampling', 'ref/style/random-sampling'], ['Passthrough', 'ref/style/passthrough'],
  ]],
  ['Shapes', [
    ['All shapes', 'ref/style/shapes-overview'], ['Circle', 'ref/style/shapes/circle'], ['Ellipse', 'ref/style/shapes/ellipse'], ['Equation', 'ref/style/shapes/equation'],
    ['Group', 'ref/style/shapes/group'], ['Image', 'ref/style/shapes/image'], ['Line', 'ref/style/shapes/line'], ['Path', 'ref/style/shapes/path'],
    ['Polygon', 'ref/style/shapes/polygon'], ['Polyline', 'ref/style/shapes/polyline'], ['Rectangle', 'ref/style/shapes/rectangle'], ['Text', 'ref/style/shapes/text'],
  ]],
  ['Functions', [['Constraints & objectives', 'ref/constraints'], ['Style functions', 'ref/style/functions']]],
]

const page = ref('ref')
const src = ref(BASE + page.value)
function go(p: string) { page.value = p; src.value = BASE + p + '?t=' + Date.now() }
</script>

<template>
  <div class="docs">
    <div class="bar">
      <select :value="page" @change="go(($event.target as HTMLSelectElement).value)">
        <optgroup v-for="[g, list] in sections" :key="g" :label="g">
          <option v-for="[name, p] in list" :key="p" :value="p">{{ name }}</option>
        </optgroup>
      </select>
      <button @click="go('ref/style/shapes-overview')">Shapes</button>
      <button @click="go('ref/constraints')">Constraints</button>
      <a class="ext" :href="BASE + page" target="_blank" rel="noopener" title="Open in a browser tab">↗</a>
    </div>
    <iframe :src="src" title="Penrose documentation" />
  </div>
</template>

<style scoped>
.docs { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--line); flex: none; }
.bar select { flex: 1; min-width: 0; }
.ext { text-decoration: none; color: var(--fg-2); padding: 2px 6px; }
.ext:hover { color: var(--accent); }
iframe { flex: 1; min-height: 0; width: 100%; border: none; background: white; }
</style>
