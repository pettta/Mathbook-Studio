/**
 * Paper mode: target venues, their main.tex templates and paper-specific
 * snippets.  Classes that ship with TeX Live (acmart, amsart)
 * are used directly; venue style files that must be downloaded (acl.sty,
 * neurips_20xx.sty, imsart.cls) are loaded with \IfFileExists and fall back to a close
 * article-class approximation so the project always compiles.
 */
import type { Snippet } from './snippets/types'

export type ProjectMode = 'book' | 'paper'

export interface Venue {
  id: string
  name: string
  field: string
  note: string            // shown in the new-project dialog and README
  bibstyle: string
  main: (title: string, author: string) => string
  snippets: Snippet[]     // venue-specific extras on top of PAPER_SNIPPETS
}

const AMSTHM = `\\usepackage{amsmath,amssymb,amsthm}
\\newtheorem{theorem}{Theorem}
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}`

const COMMON = `\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{hyperref}
\\usepackage[capitalise,noabbrev]{cleveref}`

const BODY = `\\section{Introduction}\\label{sec:intro}

Motivate the problem and state the contributions~\\cite{knuth1984}.

\\section{Method}\\label{sec:method}

\\section{Experiments}\\label{sec:experiments}

\\section{Conclusion}\\label{sec:conclusion}
`

const MATH_BODY = `\\section{Introduction}\\label{sec:intro}

State the main result~\\cite{knuth1984}.

\\begin{theorem}\\label{thm:main}
  Statement.
\\end{theorem}

\\section{Preliminaries}\\label{sec:prelim}

\\section{Proof of \\cref{thm:main}}\\label{sec:proof}

\\begin{proof}
  Proof.
\\end{proof}
`

export const SAMPLE_BIB = `@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984},
}
`

const bib = (style: string) => `\\bibliographystyle{${style}}\n\\bibliography{refs}`

export const VENUES: Venue[] = [
  {
    id: 'emnlp', name: 'EMNLP', field: 'NLP',
    note: 'ACL template (acl.sty). 8 pages + unlimited references; a Limitations section is required. Drop acl.sty and acl_natbib.bst from github.com/acl-org/acl-style-files into the project to get the exact format.',
    bibstyle: 'acl_natbib',
    main: (t, a) => `\\documentclass[11pt]{article}
\\IfFileExists{acl.sty}{\\usepackage[review]{acl}}{%
  \\usepackage[a4paper,margin=2.5cm,top=2.5cm]{geometry}
  \\usepackage{times}\\usepackage[numbers]{natbib}\\twocolumn}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{microtype}
${AMSTHM}
${COMMON}

\\title{${t}}
\\author{${a} \\\\ Affiliation \\\\ \\texttt{email@domain}}

\\begin{document}
\\maketitle
\\begin{abstract}
Abstract (up to 200 words).
\\end{abstract}

${BODY}
\\section*{Limitations}

\\section*{Ethics Statement}

\\IfFileExists{acl_natbib.bst}{\\bibliographystyle{acl_natbib}}{\\bibliographystyle{plainnat}}
\\bibliography{refs}

\\appendix
\\section{Appendix}\\label{sec:appendix}
\\end{document}
`,
    snippets: [
      { trigger: ';lim', replacement: '\\section*{Limitations}\n$0', options: 'tA', description: 'Limitations section (required)' },
      { trigger: ';eth', replacement: '\\section*{Ethics Statement}\n$0', options: 'tA', description: 'ethics statement' },
      { trigger: ';cp', replacement: '\\citet{$0}', options: 'tA', description: 'textual citation (Author (Year))' },
    ],
  },
  {
    id: 'neurips', name: 'NeurIPS', field: 'Machine learning',
    note: 'NeurIPS style file (neurips_2026.sty). 9 content pages; paper checklist required. Put the year\'s .sty from neurips.cc into the project for the exact format.',
    bibstyle: 'plainnat',
    main: (t, a) => `\\documentclass{article}
\\IfFileExists{neurips_2026.sty}{\\usepackage{neurips_2026}}{%
  \\usepackage[letterpaper,textwidth=5.5in,textheight=9in,top=1in]{geometry}
  \\usepackage{times}\\usepackage[numbers]{natbib}%
  \\newenvironment{ack}{\\section*{Acknowledgments}}{}}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage{microtype}
\\usepackage{nicefrac}
${AMSTHM}
${COMMON}

\\title{${t}}
\\author{${a} \\\\ Affiliation \\\\ \\texttt{email@domain}}

\\begin{document}
\\maketitle
\\begin{abstract}
One paragraph abstract.
\\end{abstract}

${BODY}
\\begin{ack}
Acknowledgements (hidden in the anonymous submission).
\\end{ack}

${bib('plainnat')}

\\appendix
\\section{Technical appendices and supplementary material}

\\section*{NeurIPS Paper Checklist}
% paste the checklist from the call for papers here
\\end{document}
`,
    snippets: [
      { trigger: ';ack', replacement: '\\begin{ack}\n$0\n\\end{ack}', options: 'tA', description: 'acknowledgements (auto-hidden when anonymous)' },
      { trigger: ';chk', replacement: '\\item {\\bf ${0:Question}}\n    \\item[] Answer: \\answer${1:Yes}\n    \\item[] Justification: $2', options: 'tA', description: 'checklist item' },
      { trigger: ';cp', replacement: '\\citep{$0}', options: 'tA', description: 'parenthetical citation' },
    ],
  },
  {
    id: 'siggraph', name: 'ACM SIGGRAPH', field: 'Graphics',
    note: 'acmart class, acmtog format (ships with TeX Live). Teaser figure, CCS concepts and keywords are required.',
    bibstyle: 'ACM-Reference-Format',
    main: (t, a) => `\\documentclass[acmtog,review,anonymous]{acmart}
\\usepackage{booktabs}
\\citestyle{acmauthoryear}

\\setcopyright{acmlicensed}
\\acmJournal{TOG}
\\acmYear{2026}

\\begin{document}
\\title{${t}}
\\author{${a}}
\\affiliation{\\institution{Institution}\\city{City}\\country{Country}}
\\email{email@domain}

\\begin{abstract}
Abstract.
\\end{abstract}

\\begin{CCSXML}
% generate at https://dl.acm.org/ccs
\\end{CCSXML}
\\ccsdesc[500]{Computing methodologies~Rendering}
\\keywords{keyword one, keyword two}

\\begin{teaserfigure}
  \\centering
  \\fbox{\\rule{0pt}{2in}\\rule{0.9\\linewidth}{0pt}}
  \\caption{Teaser.}
  \\label{fig:teaser}
\\end{teaserfigure}

\\maketitle

${BODY}
\\begin{acks}
Acknowledgements.
\\end{acks}

${bib('ACM-Reference-Format')}
\\end{document}
`,
    snippets: [
      { trigger: ';teaser', replacement: '\\begin{teaserfigure}\n  \\includegraphics[width=\\textwidth]{figures/${0:teaser}}\n  \\caption{$1}\n  \\label{fig:teaser}\n\\end{teaserfigure}', options: 'tA', description: 'teaser figure' },
      { trigger: ';ccs', replacement: '\\ccsdesc[${0:500}]{${1:Computing methodologies}~${2:Rendering}}', options: 'tA', description: 'CCS concept' },
      { trigger: ';ack', replacement: '\\begin{acks}\n$0\n\\end{acks}', options: 'tA', description: 'acknowledgements' },
      { trigger: ';fig2', replacement: '\\begin{figure*}[t]\n  \\centering\n  \\includegraphics[width=\\textwidth]{figures/${0:name}}\n  \\caption{$1}\n  \\label{fig:${2:key}}\n\\end{figure*}', options: 'tA', description: 'full-width figure' },
    ],
  },
  {
    id: 'nature', name: 'Nature', field: 'General science',
    note: 'Nature has no official class: single column, numbered references, ~150-word summary paragraph, Main text without subheadings, then Methods. Figures go at the end with legends.',
    bibstyle: 'naturemag',
    main: (t, a) => `\\documentclass[12pt]{article}
\\usepackage[a4paper,margin=2.5cm]{geometry}
\\usepackage{setspace}\\doublespacing
\\usepackage[numbers,super,sort&compress]{natbib}
\\usepackage{lineno}\\linenumbers
${AMSTHM}
${COMMON}

\\title{${t}}
\\author{${a}$^{1}$ \\\\ \\small $^{1}$Affiliation}
\\date{}

\\begin{document}
\\maketitle

\\begin{abstract}
\\noindent Summary paragraph (about 150 words, referenced, aimed at a general audience).
\\end{abstract}

% Main text: no subheadings in Letters; up to ~3,000 words for Articles.
Main text~\\cite{knuth1984}.

\\section*{Methods}
\\subsection*{Data}

\\section*{Data availability}

\\section*{Code availability}

\\IfFileExists{naturemag.bst}{\\bibliographystyle{naturemag}}{\\bibliographystyle{unsrtnat}}
\\bibliography{refs}

\\section*{Acknowledgements}

\\section*{Author contributions}

\\section*{Competing interests}
The authors declare no competing interests.

\\clearpage
\\section*{Figures}
\\end{document}
`,
    snippets: [
      { trigger: ';meth', replacement: '\\section*{Methods}\n\\subsection*{${0:Heading}}\n$1', options: 'tA', description: 'Methods section' },
      { trigger: ';avail', replacement: '\\section*{Data availability}\n$0\n\n\\section*{Code availability}\n$1', options: 'tA', description: 'data / code availability' },
      { trigger: ';leg', replacement: '\\textbf{Fig. ${0:1} | ${1:Title.}} $2', options: 'tA', description: 'figure legend' },
    ],
  },
  {
    id: 'aos', name: 'Annals of Statistics', field: 'Statistics',
    note: 'IMS imsart class, aos option. imsart is not in TeX Live: put imsart.cls (from imstat.org) in the project; until then an article-class stand-in is used. MSC2020 codes and keywords go in the frontmatter.',
    bibstyle: 'imsart-nameyear',
    main: (t, a) => `\\newif\\ifimsart\\IfFileExists{imsart.cls}{\\imsarttrue}{\\imsartfalse}
\\ifimsart\\documentclass[aos,preprint]{imsart}\\else
% imsart.cls not found: article-class stand-in for the imsart front-matter macros
\\documentclass[11pt]{article}
\\RequirePackage[margin=1.1in]{geometry}
\\let\\startlocaldefs\\relax\\let\\endlocaldefs\\relax
\\newenvironment{frontmatter}{}{\\maketitle\\thispagestyle{plain}}
\\newenvironment{aug}{}{}
\\newcommand{\\runtitle}[1]{}
\\newcommand{\\fnms}[1]{#1}\\newcommand{\\snm}[1]{#1}
\\let\\imsoldauthor\\author
\\renewcommand{\\author}[2][]{\\imsoldauthor{#2}}
\\newcommand{\\ead}[2][]{}\\newcommand{\\printead}[2][]{}
\\newcommand{\\address}[2][]{}
\\newenvironment{keyword}[1][]{\\par\\noindent\\textbf{Keywords:} }{\\par}
\\newcommand{\\kwd}[2][]{#1#2 }
\\newenvironment{acks}[1][Acknowledgments]{\\section*{#1}}{}
\\newenvironment{supplement}{\\section*{Supplementary material}}{}
\\newcommand{\\stitle}[1]{\\textbf{#1.} }\\newcommand{\\sdescription}[1]{#1}
\\fi
\\RequirePackage{amsthm,amsmath,amssymb}
\\RequirePackage[authoryear]{natbib}
\\RequirePackage[colorlinks,citecolor=blue,urlcolor=blue]{hyperref}
\\RequirePackage{graphicx}
\\RequirePackage[capitalise,noabbrev]{cleveref}

\\startlocaldefs
\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
\\endlocaldefs

\\begin{document}
\\begin{frontmatter}
\\title{${t}}
\\runtitle{${t}}

\\begin{aug}
\\author[A]{\\fnms{${a.split(' ').slice(0, -1).join(' ') || 'First'}}~\\snm{${a.split(' ').slice(-1)[0] || 'Last'}}\\ead[label=e1]{email@domain}}
\\address[A]{Department, University\\printead[presep={,\\ }]{e1}}
\\end{aug}

\\begin{abstract}
Abstract.
\\end{abstract}

\\begin{keyword}[class=MSC]
\\kwd[Primary ]{62G05}
\\kwd[; secondary ]{62G20}
\\end{keyword}

\\begin{keyword}
\\kwd{keyword one}
\\kwd{keyword two}
\\end{keyword}
\\end{frontmatter}

${MATH_BODY}
\\begin{acks}[Acknowledgments]
\\end{acks}

\\begin{supplement}
\\stitle{Supplement to \`\`${t}''}
\\sdescription{Proofs and additional simulations.}
\\end{supplement}

\\IfFileExists{imsart-nameyear.bst}{\\bibliographystyle{imsart-nameyear}}{\\bibliographystyle{plainnat}}
\\bibliography{refs}
\\end{document}
`,
    snippets: [
      { trigger: ';kw', replacement: '\\kwd{$0}', options: 'tA', description: 'keyword' },
      { trigger: ';msc', replacement: '\\begin{keyword}[class=MSC]\n\\kwd[Primary ]{${0:62G05}}\n\\kwd[; secondary ]{${1:62G20}}\n\\end{keyword}', options: 'tA', description: 'MSC classification' },
      { trigger: ';supp', replacement: '\\begin{supplement}\n\\stitle{$0}\n\\sdescription{$1}\n\\end{supplement}', options: 'tA', description: 'supplementary material' },
      { trigger: ';cp', replacement: '\\citep{$0}', options: 'tA', description: 'parenthetical citation' },
    ],
  },
  {
    id: 'annals', name: 'Annals of Mathematics', field: 'Pure mathematics',
    note: 'No required class: Annals accepts amsart. Theorem-proof structure, MSC codes in the subject class.',
    bibstyle: 'amsplain',
    main: (t, a) => `\\documentclass[11pt]{amsart}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[capitalise,noabbrev]{cleveref}

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\newtheorem{conjecture}[theorem]{Conjecture}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}

\\begin{document}
\\title{${t}}
\\author{${a}}
\\address{Department, University}
\\email{email@domain}
\\subjclass[2020]{Primary 11M06; Secondary 11F66}
\\keywords{keyword one, keyword two}

\\begin{abstract}
Abstract.
\\end{abstract}

\\maketitle

${MATH_BODY}
${bib('amsplain')}
\\end{document}
`,
    snippets: [
      { trigger: ';conj', replacement: '\\begin{conjecture}\\label{conj:${0:key}}\n  $1\n\\end{conjecture}', options: 'tA', description: 'conjecture' },
      { trigger: ';subj', replacement: '\\subjclass[2020]{Primary ${0:11M06}; Secondary ${1:11F66}}', options: 'tA', description: 'MSC subject class' },
    ],
  },
  {
    id: 'jams', name: 'JAMS', field: 'Pure mathematics',
    note: 'Journal of the AMS: jams-l class (not in TeX Live: put jams-l.cls from the AMS author package in the project; until then amsart is used).',
    bibstyle: 'amsplain',
    main: (t, a) => `\\IfFileExists{jams-l.cls}{\\documentclass{jams-l}}{\\documentclass{amsart}}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[capitalise,noabbrev]{cleveref}

\\newtheorem{theorem}{Theorem}[section]
\\newtheorem{lemma}[theorem]{Lemma}
\\newtheorem{proposition}[theorem]{Proposition}
\\newtheorem{corollary}[theorem]{Corollary}
\\theoremstyle{definition}
\\newtheorem{definition}[theorem]{Definition}
\\newtheorem{example}[theorem]{Example}
\\theoremstyle{remark}
\\newtheorem{remark}[theorem]{Remark}
\\numberwithin{equation}{section}

\\begin{document}
\\title{${t}}
\\author{${a}}
\\address{Department, University}
\\email{email@domain}
\\thanks{Funding acknowledgement.}
\\subjclass[2020]{Primary 00A00}
\\keywords{keyword one, keyword two}
\\date{\\today}

\\begin{abstract}
Abstract.
\\end{abstract}

\\maketitle

${MATH_BODY}
${bib('amsplain')}
\\end{document}
`,
    snippets: [
      { trigger: ';subj', replacement: '\\subjclass[2020]{Primary ${0:00A00}; Secondary ${1:}}', options: 'tA', description: 'MSC subject class' },
      { trigger: ';thx', replacement: '\\thanks{$0}', options: 'tA', description: 'author thanks / funding' },
    ],
  },
  {
    id: 'jasa', name: 'JASA', field: 'Statistics',
    note: 'Journal of the American Statistical Association: ASA template (12pt, double spaced, blinded version switch). Main text up to 35 pages; reproducibility materials required.',
    bibstyle: 'agsm',
    main: (t, a) => `\\documentclass[12pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[authoryear]{natbib}
\\usepackage{setspace}
${AMSTHM}
${COMMON}

\\newcommand{\\blind}{0}   % 1 = anonymous submission

\\begin{document}
\\def\\spacingset#1{\\renewcommand{\\baselinestretch}{#1}\\small\\normalsize}
\\spacingset{1}

\\if0\\blind
{
  \\title{\\bf ${t}}
  \\author{${a}\\thanks{The authors gratefully acknowledge \\dots}\\hspace{.2cm}\\\\
    Department, University}
  \\maketitle
} \\fi
\\if1\\blind
{
  \\bigskip\\bigskip\\bigskip
  \\begin{center}{\\LARGE\\bf ${t}}\\end{center}
  \\medskip
} \\fi

\\bigskip
\\begin{abstract}
Abstract (up to 200 words).
\\end{abstract}

\\noindent%
{\\it Keywords:} 3 to 6 keywords, not in the title
\\vfill

\\newpage
\\spacingset{1.9}

\\section{Introduction}\\label{sec:intro}
Motivation~\\citep{knuth1984}.

\\section{Methodology}\\label{sec:method}

\\section{Simulation Studies}\\label{sec:sim}

\\section{Real Data Analysis}\\label{sec:data}

\\section{Discussion}\\label{sec:disc}

\\bigskip
\\begin{center}
{\\large\\bf SUPPLEMENTARY MATERIAL}
\\end{center}

\\IfFileExists{agsm.bst}{\\bibliographystyle{agsm}}{\\bibliographystyle{plainnat}}
\\bibliography{refs}
\\end{document}
`,
    snippets: [
      { trigger: ';sim', replacement: '\\section{Simulation Studies}\\label{sec:sim}\n$0', options: 'tA', description: 'simulation section' },
      { trigger: ';cp', replacement: '\\citep{$0}', options: 'tA', description: 'parenthetical citation' },
      { trigger: ';ct', replacement: '\\citet{$0}', options: 'tA', description: 'textual citation' },
    ],
  },
]

export function venueById(id: string | undefined): Venue | undefined {
  return VENUES.find((v) => v.id === id)
}

// Book-only snippets (mathbook class environments) are hidden in paper mode.
export const BOOK_ONLY_TRIGGERS = new Set([';chap', ';exs', ';exr', ';exh', ';prbs', ';prb', ';prh', ';hint', ';ft', ';fe', ';parts', ';proc', ';cols'])

// Generic paper shortcuts, active in every paper project.
export const PAPER_SNIPPETS: Snippet[] = [
  { trigger: ';abs', replacement: '\\begin{abstract}\n$0\n\\end{abstract}', options: 'tA', description: 'abstract' },
  { trigger: ';intro', replacement: '\\section{Introduction}\\label{sec:intro}\n$0', options: 'tA', description: 'introduction' },
  { trigger: ';rw', replacement: '\\section{Related Work}\\label{sec:related}\n$0', options: 'tA', description: 'related work' },
  { trigger: ';concl', replacement: '\\section{Conclusion}\\label{sec:conclusion}\n$0', options: 'tA', description: 'conclusion' },
  { trigger: ';app', replacement: '\\appendix\n\\section{${0:Appendix}}\\label{app:${1:key}}\n$2', options: 'tA', description: 'appendix' },
  { trigger: ';ci', replacement: '\\cite{$0}', options: 'tA', description: 'citation' },
  { trigger: ';tab', replacement: '\\begin{table}[${0:t}]\n  \\centering\n  \\caption{$1}\n  \\label{tab:${2:key}}\n  \\begin{tabular}{${3:lcc}}\n    \\toprule\n    $4 \\\\\n    \\midrule\n    $5 \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}', options: 'tA', description: 'booktabs table' },
  { trigger: ';subfig', replacement: '\\begin{figure}[t]\n  \\centering\n  \\includegraphics[width=0.48\\linewidth]{figures/${0:a}}\\hfill\n  \\includegraphics[width=0.48\\linewidth]{figures/${1:b}}\n  \\caption{$2}\n  \\label{fig:${3:key}}\n\\end{figure}', options: 'tA', description: 'side-by-side figure' },
  { trigger: ';todo', replacement: '\\textcolor{red}{[TODO: $0]}', options: 'tA', description: 'inline TODO' },
]

/** Effective snippet list for a project of the given mode/venue. */
export function snippetsFor(user: Snippet[], mode: ProjectMode | undefined, venue: string | undefined): Snippet[] {
  if (mode !== 'paper') return user
  const extra = [...PAPER_SNIPPETS, ...(venueById(venue)?.snippets ?? [])].map((s) => ({ ...s, priority: (s.priority ?? 0) + 1 }))
  return [...user.filter((s) => !BOOK_ONLY_TRIGGERS.has(s.trigger)), ...extra]
}
