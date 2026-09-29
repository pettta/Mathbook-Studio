<script setup lang="ts">
const rows = {
  'Entering math': [['mk', '$ | $ (inline)'], ['dm', '$$ … $$ (display)'], ['Tab', 'jump out of ) ] } $ \\right… or to the next tabstop'], ['Shift-Tab / Esc', 'previous tabstop / leave snippet']],
  'Inside math (auto)': [
    ['x/ · (a+b)/ · //', '\\frac{x}{|} · \\frac{a+b}{|} · \\frac{|}{}'], ['sr  cb  rd  invs', '^{2}  ^{3}  ^{|}  ^{-1}'], ['sq  ee', '\\sqrt{ | }  e^{ | }'],
    ['@a @b @g @l @s …  :e :t', '\\alpha \\beta \\gamma \\lambda \\sigma …  \\varepsilon \\vartheta'], ['xhat xbar xvec xtilde xdot xund', '\\hat{x} \\bar{x} \\vec{x} …'],
    ['sin cos log ln lim sup inf …', '\\sin \\cos …'], ['sum prod int  then Tab', '\\sum_{n=1}^{\\infty}  \\int_{a}^{b} … dx'],
    ['-> !> => =< iff != <= >= ~~ ...', '\\to \\mapsto \\implies \\impliedby \\iff \\neq \\leq \\geq \\sim \\dots'],
    ['oo OO AA EE inn notin cc c= cup cap UU Nn', '\\infty \\emptyset \\forall \\exists \\in \\notin \\subset \\subseteq \\cup \\cap \\bigcup \\bigcap'],
    ['RR NN ZZ QQ CC  mbb mcal mfr bf rm', '\\mathbb{R} …  \\mathbb{|} \\mathcal{|} \\mathfrak{|} \\mathbf{|} \\mathrm{|}'],
    ['lr( lr[ lr{ lr| lra abs norm ceil floor set', '\\left( | \\right) … \\{ | \\}'],
    ['pmat bmat vmat cases align array', 'matrix / cases / aligned environments'], ['" (quote)', '\\text{|}'],
    ['in matrix/cases/align: Tab  Enter  Shift-Enter', '&   \\\\ + newline   go to end of next line'],
  ],
  'Visual (select, then press)': [['U O B C K', 'underbrace overbrace underset cancel cancelto'], ['S F P T', 'sqrt frac \\left(…\\right) text'], ['M E B  (text mode)', '$…$  \\emph  \\textbf']],
  'mathbook class (text mode, auto)': [
    [';thm ;lem ;prop ;cor ;clm', 'theorem lemma proposition corollary claim'], [';def ;exm ;rmk ;not ;prf', 'definition example remark notation proof'],
    [';exs ;exr ;exh', 'exercises block · exercise · harder exercise*'], [';prbs ;prb ;prh ;hint', 'problems section · problem · problem* · \\hint'],
    [';ft ;fe', '\\fromtext{…} ▷ · \\fromex{…} ¬'], [';chap ;sec ;ssec', 'chapter + \\chapterquote · section · subsection'],
    [';proc ;cols', 'CLRS procedure · \\Cols{cost & times}'], [';fig ;fn ;ref ;Ref ;eq ;al ;al* ;it ;en ;parts ;em ;bf', 'figure footnote cref Cref equation align itemize enumerate parts emph textbf'],
  ],
  'Hotkeys': [
    ['Ctrl/⌘-B  Ctrl/⌘-I  Ctrl/⌘-/', 'bold · emph · comment'], ['Ctrl/⌘-Alt-T L D E P X', 'theorem lemma definition example proof exercise'],
    ['Ctrl/⌘-Alt-A F R N M', 'procedure figure \\cref footnote $…$'], ['Ctrl/⌘-Alt-Shift-M', '\\[ … \\]'], ['Ctrl/⌘-F', 'search / replace'],
    ['typing \\cref{ or label=', 'completes labels from the whole project'],
  ],
  'Penrose panel': [
    ['Examples', 'the Penrose gallery, bundled; pick one, edit Substance / Style / Domain'], ['Render / Resample', 're-run the layout · new random seed'],
    ['Insert into book', 'saves figures/<name>.svg + .pdf + .penrose.json and inserts a numbered figure at the cursor'], ['Library', 'every diagram in the project — re-edit, re-insert, delete'],
    ['Docs', 'the Penrose language reference (Domain / Substance / Style, shapes, constraints); needs a network connection'],
  ],
  'Windows': [
    ['⧉ (right of the tabs)', 'open the current panel in its own window, e.g. Preview on a second monitor; it stays live and remembers its size and place'],
    ['Dock · close the window', 'put the panel back in the right pane'],
  ],
  'Building the PDF': [
    ['npm run dev · npm run compile-server', 'the dev server also starts the compile companion; compile-server runs it alone. The Preview tab lights up when it is reachable'],
    ['Build PDF · Ctrl/⌘-Enter · auto', 'compile now · rebuild after every save'], ['Locate', 'SyncTeX: scroll the preview to the cursor line; click an error to jump to its source'],
    ['Export ZIP', 'unzip, then  latexmk -pdf main.tex  (needs cleveref, titlesec, tocloft, fancyhdr, algorithmicx, caption, newfloat, wrapfig, xspace, graphicx)'],
  ],
}
</script>

<template>
  <div class="help">
    <section v-for="(list, title) in rows" :key="title">
      <h4>{{ title }}</h4>
      <table><tbody><tr v-for="[k, v] in list" :key="k"><td class="k">{{ k }}</td><td>{{ v }}</td></tr></tbody></table>
    </section>
  </div>
</template>

<style scoped>
.help { overflow: auto; padding: 6px 10px 20px; font-size: 12px; }
h4 { margin: 12px 0 4px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-2); }
table { border-collapse: collapse; width: 100%; }
td { padding: 3px 6px 3px 0; vertical-align: top; border-bottom: 1px solid var(--line); line-height: 1.45; }
td.k { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 11px; color: var(--accent-ink); white-space: pre-wrap; width: 44%; }
</style>
