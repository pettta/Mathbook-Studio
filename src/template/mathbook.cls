%% ===================================================================
%%  mathbook.cls  --  a class for writing mathematics books
%%
%%  Look & feel borrowed from three books:
%%    * Casella & Berger  -- hyperlinked table of contents, chapter
%%                           openers (rule / "Chapter N" / title / rule
%%                           / epigraph), optional theorem subtitles
%%    * Stein & Shakarchi -- theorem typography (bold head, no period,
%%                           italic statement), end-of-chapter Problems
%%    * Aluffi            -- numbering (item x.y within section x),
%%                           per-section exercise lists with the
%%                           |> / \neg forward-reference markers, running
%%                           heads, chapter-relative cross references,
%%                           footnotes
%%    * CLRS              -- pseudocode (small-caps names, bold keywords,
%%                           line numbers, optional cost/times columns),
%%                           extended with typed parameters and optional
%%                           float / figure / wrap placement
%%
%%  See main.tex for a worked example of every feature.
%% ===================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{mathbook}[2026/09/28 v1.0 Mathematics book class]

% ------------------------------------------------------------------
%  Class options
% ------------------------------------------------------------------
\newif\ifMB@romanchapters   \MB@romanchapterstrue
\newif\ifMB@bysubsection    \MB@bysubsectionfalse
\newif\ifMB@fullrefs        \MB@fullrefsfalse
\newif\ifMB@endmarks        \MB@endmarkstrue
\newif\ifMB@exercisesintoc  \MB@exercisesintocfalse
\def\MB@ptsize{11pt}

\DeclareOption{arabicchapters}{\MB@romanchaptersfalse}   % Chapter 1, 2, ...
\DeclareOption{romanchapters}{\MB@romanchapterstrue}     % Chapter I, II, ... (default)
\DeclareOption{numberbysection}{\MB@bysubsectionfalse}   % Theorem 2.3   (default, Aluffi)
\DeclareOption{numberbysubsection}{\MB@bysubsectiontrue} % Theorem 2.1.3
\DeclareOption{fullrefs}{\MB@fullrefstrue}   % always print the chapter in refs (II.2.3)
\DeclareOption{noendmarks}{\MB@endmarksfalse}% no end mark on definitions/examples/remarks
\DeclareOption{exercisesintoc}{\MB@exercisesintoctrue}
\DeclareOption{10pt}{\def\MB@ptsize{10pt}}
\DeclareOption{11pt}{\def\MB@ptsize{11pt}}
\DeclareOption{12pt}{\def\MB@ptsize{12pt}}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax

% scalable Computer Modern if Latin Modern is not installed
\IfFileExists{lmodern.sty}{}{\RequirePackage{fix-cm}}
\LoadClass[\MB@ptsize,twoside,openright]{book}

% ------------------------------------------------------------------
%  Packages
% ------------------------------------------------------------------
\IfFileExists{lmodern.sty}{%
  \RequirePackage[T1]{fontenc}%
  \RequirePackage{lmodern}}{}
\RequirePackage{amsmath,amssymb,amsthm}
\RequirePackage{etoolbox}
\RequirePackage{xcolor}
\RequirePackage{geometry}
\RequirePackage{titlesec}
\RequirePackage[titles]{tocloft}
\RequirePackage{fancyhdr}
\RequirePackage{emptypage}
\RequirePackage{enumitem}
\IfFileExists{lmodern.sty}{\RequirePackage{microtype}}{\RequirePackage[expansion=false]{microtype}}
\RequirePackage{graphicx}
\graphicspath{{figures/}{./}}
\RequirePackage{caption}
\RequirePackage{newfloat}
\RequirePackage{wrapfig}
\RequirePackage{algorithmicx}
\RequirePackage[noend]{algpseudocode}
\RequirePackage{xspace}

% Page: 7in x 10in trim, AMS-like text block. Override with \geometry{...}
\geometry{paperwidth=7in, paperheight=10in,
          textwidth=30pc, lines=44,
          inner=0.85in, top=0.85in,
          headheight=14pt, headsep=16pt, footskip=28pt}

% ------------------------------------------------------------------
%  Hyperlinks (Casella-Berger blue)
% ------------------------------------------------------------------
\definecolor{MBlink}{RGB}{0,0,230}
\RequirePackage{hyperref}
\hypersetup{colorlinks=true, linkcolor=MBlink, citecolor=MBlink,
            urlcolor=MBlink, linktoc=all, bookmarksnumbered=true,
            pdfstartview=FitH}
\RequirePackage{bookmark}
\RequirePackage[noabbrev]{cleveref}   % must come after hyperref, before \newtheorem

% ------------------------------------------------------------------
%  Numbering scheme  (Aluffi)
%
%  Chapters are Roman (I, II, ...). Inside a chapter, sections are
%  1, 2, ...; subsections 1.1, 1.2, ...; theorem-like items 1.1, 1.2,
%  ... (one shared counter per section). A reference to something in
%  the SAME chapter prints "1.6"; from another chapter it prints
%  "II.1.6" -- automatically.
% ------------------------------------------------------------------
\ifMB@romanchapters\renewcommand\thechapter{\Roman{chapter}}\fi
\renewcommand\thesection{\arabic{section}}
\renewcommand\thesubsection{\thesection.\arabic{subsection}}
\renewcommand\thesubsubsection{\thesubsection.\arabic{subsubsection}}

% \MBchapprefix{<chapter of the label>} prints "<chapter>." only when
% the label lives in a different chapter from the reference.
\def\MB@prefix#1{\ifx\relax#1\relax\else#1.\fi}
\DeclareRobustCommand\MBchapprefix[1]{%
  \ifMB@fullrefs\MB@prefix{#1}\else
    \begingroup
      \protected@edef\@tempa{#1}\protected@edef\@tempb{\thechapter}%
      \ifx\@tempa\@tempb\endgroup\else\endgroup\MB@prefix{#1}\fi
  \fi}
\def\MB@chapterprefixed#1{\expandafter\def\csname p@#1\endcsname{\MBchapprefix{\thechapter}}}
\MB@chapterprefixed{section}
\MB@chapterprefixed{subsection}
\MB@chapterprefixed{subsubsection}

% Equations: (1.1), (1.2), ... within each section
\numberwithin{equation}{section}
\MB@chapterprefixed{equation}

% Shared counter for all theorem-like environments
\newcounter{MBitem}
\counterwithin*{MBitem}{chapter}
\counterwithin*{MBitem}{section}
\ifMB@bysubsection
  \counterwithin*{MBitem}{subsection}
  \renewcommand\theMBitem{%
    \ifnum\value{subsection}=0 \thesection\else\thesubsection\fi.\arabic{MBitem}}
\else
  \renewcommand\theMBitem{\thesection.\arabic{MBitem}}
\fi
\MB@chapterprefixed{MBitem}

% ------------------------------------------------------------------
%  Theorem-like environments  (Stein-Shakarchi typography)
%
%    \begin{theorem}[Optional subtitle] ... \end{theorem}
%      -> **Theorem 2.4 (Optional subtitle)** _statement in italics_
% ------------------------------------------------------------------
\newlength\MBthmskip \setlength\MBthmskip{0.6\baselineskip plus 0.2\baselineskip minus 0.1\baselineskip}

\newtheoremstyle{MBplain}{\MBthmskip}{\MBthmskip}{\itshape}{0pt}{\bfseries}{}{0.5em}
  {\thmname{#1}\thmnumber{ #2}\thmnote{ (#3)}}
\newtheoremstyle{MBdefinition}{\MBthmskip}{\MBthmskip}{\normalfont}{0pt}{\bfseries}{}{0.5em}
  {\thmname{#1}\thmnumber{ #2}\thmnote{ (#3)}}
\newtheoremstyle{MBremark}{\MBthmskip}{\MBthmskip}{\normalfont}{0pt}{\bfseries}{}{0.5em}
  {\thmname{#1}\thmnumber{ #2}\thmnote{ (#3)}}

\theoremstyle{MBplain}
\newtheorem{theorem}[MBitem]{Theorem}
\newtheorem{proposition}[MBitem]{Proposition}
\newtheorem{lemma}[MBitem]{Lemma}
\newtheorem{corollary}[MBitem]{Corollary}
\newtheorem{claim}[MBitem]{Claim}
\newtheorem{conjecture}[MBitem]{Conjecture}
\newtheorem*{theorem*}{Theorem}
\newtheorem*{proposition*}{Proposition}
\newtheorem*{lemma*}{Lemma}
\newtheorem*{corollary*}{Corollary}
\newtheorem*{claim*}{Claim}

\theoremstyle{MBdefinition}
\newtheorem{definition}[MBitem]{Definition}
\newtheorem{example}[MBitem]{Example}
\newtheorem{notation}[MBitem]{Notation}
\newtheorem*{definition*}{Definition}
\newtheorem*{example*}{Example}

\theoremstyle{MBremark}
\newtheorem{remark}[MBitem]{Remark}
\newtheorem*{remark*}{Remark}
\newtheorem*{note}{Note}

% Define your own numbered environment that shares the numbering:
%   \MBnewtheorem{plain|definition|remark}{envname}{Printed Name}{Short.}
\NewDocumentCommand\MBnewtheorem{m m m m}{%
  \theoremstyle{MB#1}\newtheorem{#2}[MBitem]{#3}%
  \crefname{#2}{#3}{#3s}\Crefname{#2}{#3}{#3s}%
  \MB@crefshort{#2}{#4}{#3}%
  \ifMB@endmarks\ifstrequal{#1}{plain}{}{\MB@addendmark{#2}}\fi}

% Aluffi's end mark on non-italic items (definitions, examples, remarks)
\newcommand\MBendmarksymbol{\ensuremath{\lrcorner}}
\DeclareRobustCommand\MBendmark{%
  \begingroup\let\qedsymbol\MBendmarksymbol\qed\endgroup}
\def\MB@addendmark#1{%
  \AtBeginEnvironment{#1}{\pushQED{\MBendmark}}%
  \AtEndEnvironment{#1}{\popQED}}
\ifMB@endmarks
  \forcsvlist\MB@addendmark{definition,example,notation,remark,definition*,example*,remark*}
\fi

% Proofs: italic "Proof." (Stein), open box at the end
\renewcommand\qedsymbol{\ensuremath{\square}}

% ------------------------------------------------------------------
%  Chapter openers  (Casella-Berger)
% ------------------------------------------------------------------
\newcommand\MBchaptertitlefont{\fontsize{24.88}{30}\selectfont}
\titleformat{\chapter}[display]
  {\normalfont\centering}
  {\titlerule[0.6pt]\vspace{3.2ex}\large\chaptertitlename\ \thechapter}
  {3ex}
  {\MBchaptertitlefont}
  [{\vspace{2ex}\titlerule[0.8pt]}]
\titleformat{name=\chapter,numberless}[display]
  {\normalfont\centering}
  {\titlerule[0.6pt]\vspace{3.2ex}\large\strut}
  {3ex}
  {\MBchaptertitlefont}
  [{\vspace{2ex}\titlerule[0.8pt]}]
\titlespacing*{\chapter}{0pt}{0pt}{6ex}

% Epigraph right under \chapter{...}:
%   \chapterquote{Quote text}{Author}{Source}      (Source may be empty)
\newlength\MBquoteindent \setlength\MBquoteindent{1.5em}
\NewDocumentCommand\chapterquote{m m m}{%
  \par\vspace*{-1ex}%
  \begingroup
    \leftskip=\MBquoteindent \rightskip=\MBquoteindent \parindent=0pt
    \itshape #1\par\nopagebreak\vspace{0.3ex}%
    \leftskip=0pt plus 1fil \parfillskip=0pt
    {\normalfont\bfseries #2\par}%
    \if\relax\detokenize{#3}\relax\else
      {\normalfont\itshape #3\par}\fi
  \endgroup
  \vspace{2.5ex}%
  \@afterindentfalse\@afterheading}

% ------------------------------------------------------------------
%  Sections  (Aluffi)
%    1. Section title          (bold, large)
%    1.3. Subsection title.    (bold, run-in)
% ------------------------------------------------------------------
\titleformat{\section}{\normalfont\large\bfseries}{\thesection.}{0.5em}{}
\titlespacing*{\section}{0pt}{3.5ex plus 1ex minus .2ex}{2ex plus .2ex}
\titleformat{\subsection}[runin]{\normalfont\bfseries}{\thesubsection.}{0.5em}{}[.]
\titlespacing*{\subsection}{0pt}{2.5ex plus 1ex minus .2ex}{0.6em}
\titleformat{\subsubsection}[runin]{\normalfont\itshape}{\thesubsubsection.}{0.5em}{}[.]
\titlespacing*{\subsubsection}{0pt}{2ex plus .5ex minus .2ex}{0.6em}
\setcounter{secnumdepth}{3}

% ------------------------------------------------------------------
%  Running heads  (Aluffi)
%    even:  page                         II. Chapter title
%    odd:   3. Section title                          page
% ------------------------------------------------------------------
\renewcommand\chaptermark[1]{%
  \if@mainmatter\markboth{\thechapter. #1}{\thechapter. #1}%
  \else\markboth{#1}{#1}\fi}
\renewcommand\sectionmark[1]{\markright{\thesection. #1}}
\renewcommand\subsectionmark[1]{}

\newcommand\MBfootbar{\rule{1.6em}{2.5pt}}
\fancypagestyle{MBmain}{%
  \fancyhf{}%
  \fancyhead[LE,RO]{\thepage}%
  \fancyhead[RE]{\itshape\nouppercase{\leftmark}}%
  \fancyhead[LO]{\itshape\nouppercase{\rightmark}}%
  \renewcommand\headrulewidth{0.4pt}%
  \renewcommand\footrulewidth{0pt}}
\fancypagestyle{plain}{%   first page of a chapter
  \fancyhf{}%
  \fancyfoot[R]{\parbox[b]{3em}{\raggedleft\MBfootbar\\[-1pt]\thepage}}%
  \renewcommand\headrulewidth{0pt}%
  \renewcommand\footrulewidth{0pt}}
\pagestyle{MBmain}

% ------------------------------------------------------------------
%  Table of contents  (Casella-Berger: blue links, no dot leaders)
% ------------------------------------------------------------------
\setcounter{tocdepth}{2}
\renewcommand\cftchapfont{\bfseries}
\renewcommand\cftchappagefont{\bfseries}
\renewcommand\cftchapleader{\hfill}
\renewcommand\cftsecleader{\hfill}
\renewcommand\cftsubsecleader{\hfill}
\setlength\cftbeforechapskip{1.4ex plus .3ex}
\setlength\cftbeforesecskip{0pt}
\setlength\cftbeforesubsecskip{0pt}
\setlength\cftchapindent{0pt}
\setlength\cftchapnumwidth{2.4em}
\setlength\cftsecindent{2.4em}
\setlength\cftsecnumwidth{2em}
\setlength\cftsubsecindent{4.4em}
\setlength\cftsubsecnumwidth{2.8em}

% ------------------------------------------------------------------
%  Cross references (cleveref).  \cref{key} gives "Theorem 1.6" in the
%  same chapter and "Theorem II.1.6" from elsewhere.  Inside the
%  exercise brackets the short forms ("Thm. 1.6", "§2", "2.5") are used.
% ------------------------------------------------------------------
\newif\ifMBshortrefs \MBshortrefsfalse
\def\MB@crefshort#1#2#3{% type, short name, long name
  \crefformat{#1}{##2\ifMBshortrefs #2\else #3\fi~##1##3}%
  \Crefformat{#1}{##2\ifMBshortrefs #2\else #3\fi~##1##3}}

\crefname{theorem}{Theorem}{Theorems}          \MB@crefshort{theorem}{Thm.}{Theorem}
\crefname{proposition}{Proposition}{Propositions}\MB@crefshort{proposition}{Prop.}{Proposition}
\crefname{lemma}{Lemma}{Lemmas}                \MB@crefshort{lemma}{Lem.}{Lemma}
\crefname{corollary}{Corollary}{Corollaries}   \MB@crefshort{corollary}{Cor.}{Corollary}
\crefname{claim}{Claim}{Claims}                \MB@crefshort{claim}{Claim}{Claim}
\crefname{conjecture}{Conjecture}{Conjectures} \MB@crefshort{conjecture}{Conj.}{Conjecture}
\crefname{definition}{Definition}{Definitions} \MB@crefshort{definition}{Def.}{Definition}
\crefname{example}{Example}{Examples}          \MB@crefshort{example}{Ex.}{Example}
\crefname{notation}{Notation}{Notations}       \MB@crefshort{notation}{Not.}{Notation}
\crefname{remark}{Remark}{Remarks}             \MB@crefshort{remark}{Rem.}{Remark}
\crefname{problem}{Problem}{Problems}          \MB@crefshort{problem}{Prob.}{Problem}
\crefname{chapter}{Chapter}{Chapters}          \MB@crefshort{chapter}{Ch.}{Chapter}
\crefname{exercise}{Exercise}{Exercises}
\crefformat{exercise}{#2\ifMBshortrefs\else Exercise~\fi#1#3}
\Crefformat{exercise}{#2\ifMBshortrefs\else Exercise~\fi#1#3}
\crefname{section}{\S}{\S\S}      \Crefname{section}{\S}{\S\S}
\crefname{subsection}{\S}{\S\S}   \Crefname{subsection}{\S}{\S\S}
\crefname{subsubsection}{\S}{\S\S}\Crefname{subsubsection}{\S}{\S\S}
\crefformat{section}{#2\S#1#3}        \Crefformat{section}{#2\S#1#3}
\crefformat{subsection}{#2\S#1#3}     \Crefformat{subsection}{#2\S#1#3}
\crefformat{subsubsection}{#2\S#1#3}  \Crefformat{subsubsection}{#2\S#1#3}
\crefformat{equation}{#2(#1)#3}       \Crefformat{equation}{#2(#1)#3}

% ------------------------------------------------------------------
%  Exercises  (Aluffi)
%
%   \begin{exercises}                 <- "Exercises" block ending a section
%     \begin{exercise}[opt. title]     <- numbered 2.1, 2.2, ... (section.n)
%       ... \fromtext{thm:foo, sec:bar}  ->  |> marker + [Thm. 3.4, §3]
%       ... \fromex{ex:baz}              ->  \neg marker + [3.7]
%     \end{exercise}
%   \end{exercises}
%
%  \fromtext / \fromex may appear anywhere inside the exercise; the
%  marker next to the number is resolved on the next LaTeX run.
%  If both are used, the |> marker wins (Aluffi's convention) and all
%  references are listed together in one bracket.
% ------------------------------------------------------------------
\newcommand\exercisesname{Exercises}
\newcommand\problemsname{Problems}
\newcommand\hintname{Hint}
\newcommand\MBtextmarker{\ensuremath{\triangleright}}
\newcommand\MBexmarker{\ensuremath{\neg}}
\newlength\MBexerciseskip \setlength\MBexerciseskip{1.1ex plus .4ex minus .2ex}

\newcounter{exercise}
\counterwithin*{exercise}{chapter}
\counterwithin*{exercise}{section}
\renewcommand\theexercise{\thesection.\arabic{exercise}}
\MB@chapterprefixed{exercise}

\newcounter{problem}
\counterwithin*{problem}{chapter}
\renewcommand\theproblem{\arabic{problem}}
\MB@chapterprefixed{problem}

\newcounter{MB@exid}          % absolute id, used for the marker bookkeeping
\newif\ifMB@inexercise
\newif\ifMB@hastext
\newif\ifMB@hasex
\newif\ifMB@rerun

\ExplSyntaxOn
\clist_new:N \g__mb_refs_clist
\seq_new:N \l__mb_refs_seq
\cs_new_protected:Npn \MB@clearrefs { \clist_gclear:N \g__mb_refs_clist }
\cs_new_protected:Npn \MB@addrefs #1 { \clist_gput_right:Nn \g__mb_refs_clist {#1} }
\cs_new:Npn \MB@ifrefs #1 #2 { \clist_if_empty:NTF \g__mb_refs_clist {#2} {#1} }
\cs_new_protected:Npn \MB@printrefs
  {
    \group_begin:
      \MBshortrefstrue
      \clist_gremove_duplicates:N \g__mb_refs_clist
      \seq_clear:N \l__mb_refs_seq
      \clist_map_inline:Nn \g__mb_refs_clist
        { \seq_put_right:Nn \l__mb_refs_seq { \cref{##1} } }
      \seq_use:Nn \l__mb_refs_seq { ,~ }
    \group_end:
  }
\ExplSyntaxOff

% aux-file bookkeeping: \MBsetmark{<id>}{0|1|2}  (none / text / exercises)
\newcommand\MBsetmark[2]{\global\@namedef{MB@mark@#1}{#2}}
\def\MB@oldmark#1{\ifcsname MB@mark@#1\endcsname\csname MB@mark@#1\endcsname\else0\fi}
\def\MB@printmark#1{%
  \ifcase\MB@oldmark{#1}\relax\or\MBtextmarker\ \or\MBexmarker\ \fi}

\NewDocumentCommand\fromtext{m}{%
  \ifMB@inexercise\global\MB@hastexttrue\MB@addrefs{#1}\ignorespaces
  \else\ClassError{mathbook}{\string\fromtext\space used outside an exercise}{}\fi}
\NewDocumentCommand\fromex{m}{%
  \ifMB@inexercise\global\MB@hasextrue\MB@addrefs{#1}\ignorespaces
  \else\ClassError{mathbook}{\string\fromex\space used outside an exercise}{}\fi}

% #1 counter, #2 star flag (text), #3 optional title
\def\MB@exbegin#1#2#3{%
  \par\addvspace{\MBexerciseskip}%
  \refstepcounter{#1}\stepcounter{MB@exid}%
  \global\MB@hastextfalse\global\MB@hasexfalse\MB@clearrefs
  \MB@inexercisetrue
  \noindent{\bfseries\csname the#1\endcsname.}%
  #2\ \MB@printmark{\the\c@MB@exid}%
  \IfValueT{#3}{{\bfseries(#3)}\ }%
  \ignorespaces}
\def\MB@exend{%
  \MB@ifrefs{%
    \ifhmode\unskip\nobreak\space\else\noindent\fi[\MB@printrefs]}{}%
  \edef\MB@newmark{\ifMB@hastext1\else\ifMB@hasex2\else0\fi\fi}%
  \edef\MB@prevmark{\MB@oldmark{\the\c@MB@exid}}%
  \ifx\MB@newmark\MB@prevmark\else\global\MB@reruntrue\fi
  \immediate\write\@auxout{\string\MBsetmark{\the\c@MB@exid}{\MB@newmark}}%
  \par}
\AtEndDocument{\ifMB@rerun
  \ClassWarningNoLine{mathbook}{Exercise markers changed.\MessageBreak
    Rerun to get cross-references right}\fi}

\NewDocumentEnvironment{exercises}{}{%
  \par\addvspace{3ex plus 1ex minus .2ex}%
  \ifMB@exercisesintoc\phantomsection
    \addcontentsline{toc}{subsection}{\exercisesname}\fi
  \noindent{\normalfont\large\bfseries\exercisesname}\par
  \markright{\exercisesname}%
  \nobreak\vspace{1ex}\@afterheading}
  {\par}

\NewDocumentEnvironment{exercise}{o}
  {\MB@exbegin{exercise}{}{#1}}{\MB@exend}
\NewDocumentEnvironment{exercise*}{o}   % harder exercise, marked with *
  {\MB@exbegin{exercise}{\textsuperscript{*}}{#1}}{\MB@exend}

% ------------------------------------------------------------------
%  End-of-chapter harder problems  (Stein-Shakarchi)
%
%   \begin{problems}           <- starts a numbered section "Problems"
%     \begin{problem}[title]    <- numbered 1, 2, ... within the chapter
%     \begin{problem*}          <- marked with * (harder)
%   \end{problems}
%  \fromtext / \fromex also work inside problems.
% ------------------------------------------------------------------
\NewDocumentEnvironment{problems}{O{\problemsname}}{\section{#1}}{\par}
\NewDocumentEnvironment{problem}{o}
  {\MB@exbegin{problem}{}{#1}}{\MB@exend}
\NewDocumentEnvironment{problem*}{o}
  {\MB@exbegin{problem}{\textsuperscript{*}}{#1}}{\MB@exend}

% [Hint: ...] on its own line (Stein)
\newcommand\hint[1]{\par\noindent[\hintname: #1]\par}

% Sub-parts of exercises: (a), (b), ... and (i), (ii), ...
\newlist{parts}{enumerate}{1}
\setlist[parts]{label=(\alph*), leftmargin=2.2em, topsep=0.5ex, itemsep=0.3ex}
\newlist{romparts}{enumerate}{1}
\setlist[romparts]{label=(\roman*), leftmargin=2.4em, topsep=0.5ex, itemsep=0.3ex}

% ------------------------------------------------------------------
%  Footnotes  (Aluffi)
%    short rule, generous gap above it, marker indented like a paragraph,
%    black superscripts (still hyperlinked), numbered per chapter
% ------------------------------------------------------------------
\newlength\MBfnindent \setlength\MBfnindent{1.5em}
\newlength\MBfnrulewidth \setlength\MBfnrulewidth{5pc}
\setlength{\skip\footins}{1.8\baselineskip plus 4pt minus 2pt}
\renewcommand\footnoterule{\kern-3\p@\hrule\@width\MBfnrulewidth\kern2.6\p@}
\renewcommand\@makefnmark{\hbox{\normalfont\color{black}\@textsuperscript{\normalfont\@thefnmark}}}
\renewcommand\@makefntext[1]{\parindent\MBfnindent\noindent\hspace*{\MBfnindent}\@makefnmark#1}

% ------------------------------------------------------------------
%  Figures, tables, algorithms: numbered within the section like
%  everything else (Figure 2.1), with the chapter prefixed from
%  other chapters (Figure II.2.1).  CLRS-style captions.
% ------------------------------------------------------------------
\DeclareFloatingEnvironment[fileext=loa, listname={List of Algorithms},
  name=Algorithm, placement=tbp]{algorithm}
\def\MB@secnumbered#1{%
  \counterwithout*{#1}{chapter}\counterwithin*{#1}{chapter}\counterwithin*{#1}{section}%
  \expandafter\def\csname the#1\endcsname{\thesection.\arabic{#1}}%
  \MB@chapterprefixed{#1}}
\MB@secnumbered{figure}
\MB@secnumbered{table}
\MB@secnumbered{algorithm}
\captionsetup{font=small, labelfont=bf, labelsep=quad, skip=1ex}
\crefname{figure}{Figure}{Figures}       \MB@crefshort{figure}{Fig.}{Figure}
\crefname{table}{Table}{Tables}          \MB@crefshort{table}{Tab.}{Table}
\crefname{algorithm}{Algorithm}{Algorithms}\MB@crefshort{algorithm}{Alg.}{Algorithm}
\crefname{ALG@line}{line}{lines}         \Crefname{ALG@line}{Line}{Lines}

% ------------------------------------------------------------------
%  Pseudocode  (CLRS)
%
%  \begin{procedure}[<options>]{Insertion-Sort}{A: \R^n, n: \N}
%    \For{$j = 2$ \To $n$}             \Cols{c_1 & n}
%      \State $key = A[j]$              \Cols{c_2 & n-1}
%      \LComment{Insert $A[j]$ into $A[1\twodots j-1]$.}
%      ...
%  \end{procedure}
%
%  Parameters are "name: type" pairs separated by commas (brace a type
%  that itself contains a comma: {S: {\{1,\dots,n\}}}).  The header is
%  INSERTION-SORT(A: R^n, n: N) -> <returns>.
%
%  Options (key = value):
%    returns   = <math>          return type, printed after an arrow
%    columns   = {cost, times}   headers of the extra right-hand columns
%    colwidth  = <dim>           width of every extra column   (4em)
%    colwidths = {3em, 7em}      individual column widths
%    width     = <dim>           width of the whole procedure  (\linewidth;
%                                0.5\textwidth when wrapped)
%    caption   = {...}           numbered caption ("Algorithm 2.1 ...")
%    label     = <key>           label for that number (use \cref)
%    figure                      number/caption it as a Figure instead
%    float     [= tbp]           float it to wherever there is room
%    wrap      [= o|i|r|l]       set it beside the text (wrapfig), outer
%                                margin side by default
%    numbers   = true|false      line numbers                  (true)
%  \MBprocsetup{...} changes the defaults for the whole book.
%
%  Body: algpseudocode commands (\State, \If, \ElsIf, \Else, \For,
%  \ForAll, \While, \Repeat/\Until, \Return, \Call{Name}{args}) with
%  CLRS spelling: no "do"/"then"/"end".  Extras: \To \Downto \By \AND
%  \OR \NOT \Nil \True \False \twodots, \Comment{..} (inline // ...),
%  \LComment{..} (comment on its own numbered line), \proc{Name} (for
%  prose).  \label{...} on a line + \cref gives "line 5".
% ------------------------------------------------------------------
\algrenewcommand\algorithmicdo{}
\algrenewcommand\algorithmicthen{}
\algrenewcommand\alglinenumber[1]{#1}
\algrenewcommand\algorithmicindent{1.4em}
\algrenewcommand\algorithmiccomment[1]{\hskip1em{\itshape//}\ #1}
\algnewcommand\LComment[1]{\State{\itshape//}\ #1}
\providecommand\To{\textbf{to}\xspace}
\providecommand\Downto{\textbf{downto}\xspace}
\providecommand\By{\textbf{by}\xspace}
\providecommand\AND{\textbf{and}\xspace}   % (\And is taken by amsmath)
\providecommand\OR{\textbf{or}\xspace}
\providecommand\NOT{\textbf{not}\xspace}
\providecommand\Nil{\textsc{nil}\xspace}
\providecommand\True{\textsc{true}\xspace}
\providecommand\False{\textsc{false}\xspace}
\providecommand\twodots{\mathinner{\ldotp\ldotp}}
\newcommand\proc[1]{\textsc{#1}}
\newcommand\MBprocname[1]{\textsc{#1}}
\newcommand\MBtypestyle[1]{#1}          % e.g. \renewcommand\MBtypestyle[1]{\textcolor{gray}{#1}}
\newcommand\MBtypesep{\mathpunct{:}\,}
\newcommand\MBreturnsep{\;\to\;}
\newcommand\MBcolheadstyle[1]{\textit{#1}}

\ExplSyntaxOn
\tl_new:N   \l__mb_proc_returns_tl
\clist_new:N \l__mb_proc_cols_clist
\clist_new:N \l__mb_proc_colwidths_clist
\dim_new:N  \l__mb_proc_colwidth_dim
\tl_new:N   \l__mb_proc_width_tl
\bool_new:N \l__mb_proc_width_set_bool
\tl_new:N   \l__mb_proc_float_tl
\tl_new:N   \l__mb_proc_wrap_tl
\tl_new:N   \l__mb_proc_caption_tl
\tl_new:N   \l__mb_proc_label_tl
\tl_new:N   \l__mb_proc_type_tl
\tl_set:Nn  \l__mb_proc_type_tl { algorithm }
\bool_new:N \l__mb_proc_numbers_bool
\bool_new:N \l__mb_proc_caption_bool
\seq_new:N  \l__mb_proc_params_seq
\seq_new:N  \l__mb_proc_parts_seq
\seq_new:N  \l__mb_proc_out_seq
\seq_new:N  \l__mb_cols_seq

\keys_define:nn { mathbook/procedure }
  {
    returns   .tl_set:N    = \l__mb_proc_returns_tl ,
    columns   .clist_set:N = \l__mb_proc_cols_clist ,
    colwidth  .dim_set:N   = \l__mb_proc_colwidth_dim ,
    colwidth  .initial:n   = 4em ,
    colwidths .clist_set:N = \l__mb_proc_colwidths_clist ,
    width     .code:n      = { \tl_set:Nn \l__mb_proc_width_tl {#1}
                               \bool_set_true:N \l__mb_proc_width_set_bool } ,
    float     .tl_set:N    = \l__mb_proc_float_tl ,
    float     .default:n   = tbp ,
    wrap      .tl_set:N    = \l__mb_proc_wrap_tl ,
    wrap      .default:n   = o ,
    caption   .code:n      = { \tl_set:Nn \l__mb_proc_caption_tl {#1}
                               \bool_set_true:N \l__mb_proc_caption_bool } ,
    label     .tl_set:N    = \l__mb_proc_label_tl ,
    figure    .code:n      = { \tl_set:Nn \l__mb_proc_type_tl { figure } } ,
    figure    .value_forbidden:n = true ,
    algorithm .code:n      = { \tl_set:Nn \l__mb_proc_type_tl { algorithm } } ,
    algorithm .value_forbidden:n = true ,
    numbers   .bool_set:N  = \l__mb_proc_numbers_bool ,
    numbers   .default:n   = true ,
    numbers   .initial:n   = true ,
  }
\NewDocumentCommand \MBprocsetup { m } { \keys_set:nn { mathbook/procedure } {#1} }

% width of extra column #1
\cs_new:Npn \__mb_colwidth:n #1
  {
    \int_compare:nNnTF { \clist_count:N \l__mb_proc_colwidths_clist } < {#1}
      { \dim_use:N \l__mb_proc_colwidth_dim }
      { \clist_item:Nn \l__mb_proc_colwidths_clist {#1} }
  }

% "A: R^n, n: N"  ->  A: R^n, n: N  typeset
\cs_new_protected:Npn \__mb_proc_params:n #1
  {
    \seq_set_split:Nnn \l__mb_proc_params_seq { , } {#1}
    \seq_remove_all:Nn \l__mb_proc_params_seq { }
    \seq_clear:N \l__mb_proc_out_seq
    \seq_map_inline:Nn \l__mb_proc_params_seq
      {
        \exp_args:NNo \seq_set_split:Nnn \l__mb_proc_parts_seq { \c_colon_str } {##1}
        \seq_pop_left:NN \l__mb_proc_parts_seq \l_tmpa_tl
        \seq_if_empty:NTF \l__mb_proc_parts_seq
          { \seq_put_right:Nx \l__mb_proc_out_seq { \exp_not:n { \( } \exp_not:o \l_tmpa_tl \exp_not:n { \) } } }
          {
            \tl_set:Nx \l_tmpb_tl { \seq_use:Nn \l__mb_proc_parts_seq { : } }
            \seq_put_right:Nx \l__mb_proc_out_seq
              {
                \exp_not:n { \( } \exp_not:o \l_tmpa_tl
                \exp_not:N \MBtypesep
                \exp_not:N \MBtypestyle { \exp_not:o \l_tmpb_tl }
                \exp_not:n { \) }
              }
          }
      }
    \seq_use:Nn \l__mb_proc_out_seq { ,~ }
  }

\cs_new_protected:Npn \__mb_proc_colheads:
  {
    \clist_if_empty:NF \l__mb_proc_cols_clist
      {
        \hskip 0pt plus 1filll
        \int_step_inline:nn { \clist_count:N \l__mb_proc_cols_clist }
          {
            \makebox [ \__mb_colwidth:n {##1} ] [ l ]
              { \MBcolheadstyle { \clist_item:Nn \l__mb_proc_cols_clist {##1} } }
          }
      }
  }

\NewDocumentCommand \Cols { m }
  {
    \seq_set_split:Nnn \l__mb_cols_seq { & } {#1}
    \hskip 0pt plus 1filll
    \int_step_inline:nn { \seq_count:N \l__mb_cols_seq }
      {
        \makebox [ \__mb_colwidth:n {##1} ] [ l ]
          { \( \seq_item:Nn \l__mb_cols_seq {##1} \) }
      }
  }

\cs_new_protected:Npn \__mb_proc_header:nn #1 #2
  {
    \par \noindent
    \MBprocname {#1} ( \__mb_proc_params:n {#2} )
    \tl_if_empty:NF \l__mb_proc_returns_tl
      { \( \MBreturnsep \MBtypestyle { \tl_use:N \l__mb_proc_returns_tl } \) }
    \__mb_proc_colheads:
    \par \nopagebreak
  }

\cs_new_protected:Npn \__mb_proc_caption_label:
  {
    \tl_if_empty:NF \l__mb_proc_label_tl
      { \exp_args:No \label { \l__mb_proc_label_tl } }
  }

\cs_new_protected:Npn \__mb_proc_open:
  {
    \tl_if_empty:NTF \l__mb_proc_wrap_tl
      {
        \tl_if_empty:NTF \l__mb_proc_float_tl
          {
            \bool_if:NF \l__mb_proc_width_set_bool
              { \tl_set:Nn \l__mb_proc_width_tl { \linewidth } }
            \par \addvspace { \medskipamount } \noindent
            \begin{minipage}{\linewidth}
            \begin{minipage}{\l__mb_proc_width_tl}
          }
          {
            \bool_if:NF \l__mb_proc_width_set_bool
              { \tl_set:Nn \l__mb_proc_width_tl { \linewidth } }
            \use:x
              {
                \exp_not:N \begin { \l__mb_proc_type_tl }
                  [ \tl_use:N \l__mb_proc_float_tl ]
              }
            \centering
            \begin{minipage}{\l__mb_proc_width_tl}
          }
      }
      {
        % wrapfig must not sit inside a group that ends before the text
        % it wraps, so the procedure is built in a box here and the
        % wrapfigure is issued just after \end{procedure}.
        \bool_if:NF \l__mb_proc_width_set_bool
          { \tl_set:Nn \l__mb_proc_width_tl { 0.5\textwidth } }
        \par
        \tl_gset:No \g__mb_wrap_place_tl \l__mb_proc_wrap_tl
        \tl_gset:No \g__mb_wrap_width_tl \l__mb_proc_width_tl
        \global \setbox \g__mb_proc_box \hbox \bgroup
        \begin{minipage}{\l__mb_proc_width_tl}
      }
  }
\box_new:N \g__mb_proc_box
\tl_new:N \g__mb_wrap_place_tl
\tl_new:N \g__mb_wrap_width_tl
\cs_new_protected:Npn \__mb_emit_wrap:
  {
    \use:x
      {
        \exp_not:N \begin{wrapfigure} { \tl_use:N \g__mb_wrap_place_tl }
          { \exp_not:o \g__mb_wrap_width_tl }
      }
    \box_use_drop:N \g__mb_proc_box
    \end{wrapfigure}
  }

\cs_new_protected:Npn \__mb_proc_close:
  {
    \tl_if_empty:NTF \l__mb_proc_wrap_tl
      {
        \tl_if_empty:NTF \l__mb_proc_float_tl
          {
            \end{minipage}
            \bool_if:NT \l__mb_proc_caption_bool
              {
                \exp_args:NV \captionof \l__mb_proc_type_tl { \tl_use:N \l__mb_proc_caption_tl }
                \__mb_proc_caption_label:
              }
            \end{minipage}
            \par \addvspace { \medskipamount }
          }
          {
            \end{minipage}
            \caption { \tl_use:N \l__mb_proc_caption_tl }
            \__mb_proc_caption_label:
            \use:x { \exp_not:N \end { \l__mb_proc_type_tl } }
          }
      }
      {
        \bool_if:NT \l__mb_proc_caption_bool
          {
            \exp_args:NV \captionof \l__mb_proc_type_tl { \tl_use:N \l__mb_proc_caption_tl }
            \__mb_proc_caption_label:
          }
        \end{minipage}
        \egroup
        \group_insert_after:N \__mb_emit_wrap:
      }
  }

\NewDocumentEnvironment { procedure } { O{} m m }
  {
    \keys_set:nn { mathbook/procedure } {#1}
    \__mb_proc_open:
    \__mb_proc_header:nn {#2} {#3}
    \bool_if:NTF \l__mb_proc_numbers_bool
      { \begin{algorithmic}[1] }
      { \begin{algorithmic} }
  }
  {
    \end{algorithmic}
    \__mb_proc_close:
  }
\ExplSyntaxOff

% ------------------------------------------------------------------
%  Misc
% ------------------------------------------------------------------
\setlength\parindent{1.5em}
\raggedbottom

\endinput
