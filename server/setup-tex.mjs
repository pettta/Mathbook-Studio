#!/usr/bin/env node
/**
 * setup-tex.mjs — make sure a TeX toolchain (latexmk, pdflatex, synctex and
 * the packages the mathbook class needs) exists, on any OS, without sudo.
 *
 *   node server/setup-tex.mjs             install/repair if anything is missing
 *   node server/setup-tex.mjs --serve     same, then start the compile companion
 *   node server/setup-tex.mjs --check     report only, exit 1 if incomplete
 *   node server/setup-tex.mjs --system    prefer the OS package manager
 *                                         (apt / dnf / pacman / zypper / brew / winget)
 *   node server/setup-tex.mjs --yes       no prompt
 *   node server/setup-tex.mjs --dir D     where the private TeX Live goes
 *                                         (default ~/.mathbook-studio/texlive)
 *
 * Strategy
 *   1. If latexmk is already on PATH (or in a previous private install) and
 *      every required package resolves with kpsewhich, do nothing.
 *   2. Otherwise install a private, user-owned TeX Live (scheme-basic, no
 *      docs/sources, ~350 MB) with the official installer, then
 *      `tlmgr install` the required packages.  Works the same on Linux,
 *      macOS and Windows; needs only Node + network.  With --system the OS
 *      package manager is tried first and the private install is the fallback.
 *   3. Prepend the TeX bin directory to PATH for this process, so
 *      `--serve` (which imports compile-server.mjs) sees it.  Nothing outside
 *      ~/.mathbook-studio is touched.
 *
 * Recommended package.json script:
 *   "compile-server": "node server/setup-tex.mjs --serve"
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const flag = (n) => args.includes('--' + n)
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d }

const HOME = os.homedir()
const BASE = path.join(HOME, '.mathbook-studio')
const TEXDIR = path.resolve(opt('dir', process.env.MBS_TEXDIR || path.join(BASE, 'texlive')))
const CTAN = opt('mirror', process.env.MBS_CTAN_MIRROR || 'https://mirror.ctan.org/systems/texlive/tlnet')
const IS_WIN = process.platform === 'win32'

// what the mathbook class needs: [tlmgr package, file that proves it is installed]
const REQUIRED = [
  ['latexmk', null], ['synctex', null],
  ['collection-latexrecommended', 'microtype.sty'],   // microtype, caption, hyperref deps, graphics, tools, …
  ['amsmath', 'amsmath.sty'], ['amsfonts', 'amssymb.sty'], ['amscls', 'amsthm.sty'],
  ['hyperref', 'hyperref.sty'], ['bookmark', 'bookmark.sty'], ['cleveref', 'cleveref.sty'],
  ['etoolbox', 'etoolbox.sty'], ['xcolor', 'xcolor.sty'], ['geometry', 'geometry.sty'],
  ['titlesec', 'titlesec.sty'], ['tocloft', 'tocloft.sty'], ['fancyhdr', 'fancyhdr.sty'],
  ['emptypage', 'emptypage.sty'], ['enumitem', 'enumitem.sty'], ['microtype', 'microtype.sty'],
  ['caption', 'caption.sty'], ['newfloat', 'newfloat.sty'], ['wrapfig', 'wrapfig.sty'],
  ['algorithmicx', 'algpseudocode.sty'], ['xspace', 'xspace.sty'], ['graphics', 'graphicx.sty'],
  ['lm', 'lmodern.sty'], ['l3packages', 'xparse.sty'],
]

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const log = (...a) => console.log('[setup-tex]', ...a)
const run = (cmd, argv, o = {}) => spawnSync(cmd, argv, { encoding: 'utf8', stdio: o.inherit ? 'inherit' : 'pipe', shell: false, ...o })
const ok = (r) => r && r.status === 0

function which(cmd) {
  const r = run(IS_WIN ? 'where' : 'which', [cmd])
  return ok(r) ? r.stdout.trim().split(/\r?\n/)[0] : null
}

function prependPath(dir) {
  if (!dir || !fs.existsSync(dir)) return
  const cur = process.env.PATH || ''
  if (!cur.split(path.delimiter).includes(dir)) process.env.PATH = dir + path.delimiter + cur
}

/** bin dir of a private TeX Live, if one exists there. */
function privateBinDir(texdir = TEXDIR) {
  const bin = path.join(texdir, 'bin')
  if (!fs.existsSync(bin)) return null
  // pdflatex is part of scheme-basic; latexmk only arrives with the tlmgr step
  const marker = (d) => ['pdflatex.exe', 'pdflatex', 'tlmgr.bat', 'tlmgr'].some((f) => fs.existsSync(path.join(bin, d, f)))
  const sub = fs.readdirSync(bin).find((d) => fs.statSync(path.join(bin, d)).isDirectory() && marker(d))
  return sub ? path.join(bin, sub) : null
}

function kpsewhich(file) {
  const r = run('kpsewhich', [file])
  return ok(r) && r.stdout.trim().length > 0
}

/** Returns { latexmk, synctex, pdflatex, missingPkgs[] } for the current PATH. */
function status() {
  const latexmk = which('latexmk'), synctex = which('synctex'), pdflatex = which('pdflatex'), tlmgr = which('tlmgr')
  const missingPkgs = latexmk ? REQUIRED.filter(([, f]) => f && !kpsewhich(f)).map(([p]) => p) : REQUIRED.map(([p]) => p)
  return { latexmk, synctex, pdflatex, tlmgr, missingPkgs, complete: !!latexmk && !!pdflatex && missingPkgs.length === 0 }
}

async function confirm(question) {
  if (flag('yes') || !process.stdin.isTTY) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const a = await new Promise((res) => rl.question(question + ' [Y/n] ', res))
  rl.close()
  return !/^n/i.test(a.trim())
}

async function download(url, dest) {
  log('downloading', url)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${url}`)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest))
}

/** mirror.ctan.org redirects to a random mirror; pin one so installer and tlmgr agree. */
async function resolveMirror() {
  try {
    const res = await fetch(CTAN + '/', { redirect: 'manual' })
    const loc = res.headers.get('location')
    if (loc) return loc.replace(/\/$/, '')
  } catch { /* fall through */ }
  return CTAN
}

// ---------------------------------------------------------------------------
// 1. OS package managers (only with --system)
// ---------------------------------------------------------------------------
function systemInstall() {
  const sudo = !IS_WIN && process.getuid?.() !== 0 && which('sudo') ? ['sudo'] : []
  const tryRun = (cmd, argv) => { log('$', [...sudo, cmd, ...argv].join(' ')); return ok(run(sudo[0] ?? cmd, sudo.length ? [cmd, ...argv] : argv, { inherit: true })) }
  if (process.platform === 'darwin' && which('brew')) {
    // BasicTeX is small; tlmgr adds what we need
    if (!which('latexmk')) tryRun('brew', ['install', '--cask', 'basictex'])
    prependPath('/Library/TeX/texbin')
    if (which('tlmgr')) {
      tryRun('tlmgr', ['update', '--self'])
      tryRun('tlmgr', ['install', ...REQUIRED.map(([p]) => p)])
    }
    return status().complete
  }
  if (process.platform === 'linux') {
    if (which('apt-get')) return tryRun('apt-get', ['install', '-y', 'latexmk', 'texlive-latex-recommended', 'texlive-latex-extra', 'texlive-fonts-recommended', 'texlive-science']) && status().complete
    if (which('dnf')) return tryRun('dnf', ['install', '-y', 'latexmk', 'texlive-scheme-basic', 'texlive-collection-latexrecommended', ...REQUIRED.filter(([p]) => !p.startsWith('collection')).map(([p]) => 'texlive-' + p)]) && status().complete
    if (which('pacman')) return tryRun('pacman', ['-S', '--noconfirm', '--needed', 'texlive-basic', 'texlive-latex', 'texlive-latexrecommended', 'texlive-latexextra', 'texlive-fontsrecommended', 'texlive-binextra']) && status().complete
    if (which('zypper')) return tryRun('zypper', ['--non-interactive', 'install', 'texlive-latexmk', 'texlive-collection-latexrecommended', 'texlive-collection-latexextra', 'texlive-collection-fontsrecommended']) && status().complete
  }
  if (IS_WIN && which('winget')) {
    // MiKTeX installs packages on first use; latexmk needs its Perl
    tryRun('winget', ['install', '-e', '--id', 'MiKTeX.MiKTeX', '--accept-package-agreements', '--accept-source-agreements'])
    tryRun('winget', ['install', '-e', '--id', 'StrawberryPerl.StrawberryPerl', '--accept-package-agreements', '--accept-source-agreements'])
    for (const p of [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'), 'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64', 'C:\\Strawberry\\perl\\bin']) prependPath(p)
    if (which('initexmf')) run('initexmf', ['--set-config-value', '[MPM]AutoInstall=1'])
    if (which('miktex')) run('miktex', ['packages', 'install', ...REQUIRED.filter(([p]) => !p.startsWith('collection')).map(([p]) => p)], { inherit: true })
    return status().complete
  }
  log('no supported package manager found; falling back to a private TeX Live')
  return false
}

// ---------------------------------------------------------------------------
// 2. private TeX Live via the official installer
// ---------------------------------------------------------------------------
async function privateInstall() {
  fs.mkdirSync(BASE, { recursive: true })
  const mirror = await resolveMirror()
  log('using mirror', mirror)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-tl-'))
  const profile = path.join(tmp, 'texlive.profile')
  const p = (s) => s.split(path.sep).join('/')
  fs.writeFileSync(profile, [
    'selected_scheme scheme-basic',
    `TEXDIR ${p(TEXDIR)}`,
    `TEXMFCONFIG ${p(TEXDIR)}/texmf-config`,
    `TEXMFHOME ${p(TEXDIR)}/texmf-home`,
    `TEXMFLOCAL ${p(TEXDIR)}/texmf-local`,
    `TEXMFSYSCONFIG ${p(TEXDIR)}/texmf-config`,
    `TEXMFSYSVAR ${p(TEXDIR)}/texmf-var`,
    `TEXMFVAR ${p(TEXDIR)}/texmf-var`,
    'instopt_adjustpath 0',
    'instopt_adjustrepo 1',
    'instopt_letter 0',
    'instopt_portable 1',
    'tlpdbopt_autobackup 0',
    'tlpdbopt_install_docfiles 0',
    'tlpdbopt_install_srcfiles 0',
    '',
  ].join('\n'))

  let installer
  if (IS_WIN) {
    const zip = path.join(tmp, 'install-tl.zip')
    await download(mirror + '/install-tl.zip', zip)
    // PowerShell Expand-Archive is present on every supported Windows
    if (!ok(run('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${tmp}'`], { inherit: true }))) throw new Error('could not unzip installer')
    const dir = fs.readdirSync(tmp).find((d) => d.startsWith('install-tl') && fs.statSync(path.join(tmp, d)).isDirectory())
    installer = { cmd: path.join(tmp, dir, 'install-tl-windows.bat'), argv: [], cwd: path.join(tmp, dir) }
  } else {
    if (!which('perl')) throw new Error('perl is required by the TeX Live installer (and by latexmk); install it with your package manager first')
    if (!which('tar')) throw new Error('tar is required')
    const tgz = path.join(tmp, 'install-tl-unx.tar.gz')
    await download(mirror + '/install-tl-unx.tar.gz', tgz)
    if (!ok(run('tar', ['-xzf', tgz, '-C', tmp]))) throw new Error('could not extract installer')
    const dir = fs.readdirSync(tmp).find((d) => d.startsWith('install-tl-') && fs.statSync(path.join(tmp, d)).isDirectory())
    installer = { cmd: 'perl', argv: [path.join(tmp, dir, 'install-tl')], cwd: path.join(tmp, dir) }
  }
  log(`installing TeX Live (scheme-basic) into ${TEXDIR} — this downloads ~150 MB and takes a few minutes`)
  const r = run(installer.cmd, [...installer.argv, '-no-gui', '-profile', profile, '-repository', mirror], { inherit: true, cwd: installer.cwd, shell: IS_WIN })
  if (!ok(r)) throw new Error('install-tl failed')
  fs.rmSync(tmp, { recursive: true, force: true })
  const bin = privateBinDir()
  if (!bin) throw new Error('installer finished but no bin directory was found under ' + TEXDIR)
  prependPath(bin)
  return true
}

function tlmgrInstall(pkgs) {
  const tlmgr = which('tlmgr')
  if (!tlmgr || !pkgs.length) return true
  log('$ tlmgr install', pkgs.join(' '))
  const r = run(tlmgr, ['install', ...pkgs], { shell: IS_WIN })
  process.stdout.write((r.stdout || '') + (r.stderr || ''))
  if (!ok(r)) {
    if (/user mode|Debian/i.test((r.stdout || '') + (r.stderr || '')) || which('apt-get') || which('dnf') || which('pacman')) {
      log('this TeX comes from the OS package manager, where tlmgr cannot install packages; rerun with --system (uses apt/dnf/pacman)')
      return false
    }
    // a stale tlmgr is the usual cause: update it and retry once
    run(tlmgr, ['update', '--self'], { inherit: true, shell: IS_WIN })
    return ok(run(tlmgr, ['install', ...pkgs], { inherit: true, shell: IS_WIN }))
  }
  return true
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
export async function ensureTex({ interactive = true } = {}) {
  // a previous private install takes precedence over whatever else is on PATH
  prependPath(privateBinDir())
  if (process.platform === 'darwin') prependPath('/Library/TeX/texbin')

  let s = status()
  if (s.complete) {
    log(`ok: ${s.latexmk}${s.synctex ? '' : ' (synctex missing — Locate will be disabled)'}`)
    return s
  }
  if (flag('check')) {
    log(s.latexmk ? `latexmk found but packages missing: ${s.missingPkgs.join(', ')}` : 'latexmk not found')
    process.exit(1)
  }

  if (s.latexmk && s.tlmgr) {
    // an existing TeX Live only lacks packages
    log('missing packages:', s.missingPkgs.join(', '))
    if (!interactive || await confirm('Install them with tlmgr?')) tlmgrInstall(s.missingPkgs)
    s = status()
    if (s.complete) return s
  }

  if (flag('system')) {
    log('trying the system package manager (--system)')
    if (systemInstall()) return status()
  }

  if (!s.latexmk) {
    if (interactive && !(await confirm(`No usable TeX found. Install a private TeX Live into ${TEXDIR} (~350 MB)?`))) {
      log('skipped. Install TeX Live / MacTeX / MiKTeX yourself, or rerun with --system.')
      return status()
    }
    await privateInstall()
  }
  s = status()
  if (s.missingPkgs.length) tlmgrInstall(s.missingPkgs)
  s = status()
  if (!s.complete) log('still missing after install:', s.missingPkgs.join(', '), s.latexmk ? '' : '(latexmk not found)')
  else log('done:', s.latexmk)
  return s
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  ensureTex({ interactive: !flag('yes') })
    .then(async (s) => {
      if (flag('serve')) {
        // start the companion in this process so it inherits the PATH we built
        await import(new URL('./compile-server.mjs', import.meta.url))
      } else {
        process.exit(s.complete ? 0 : 1)
      }
    })
    .catch((e) => { console.error('[setup-tex] failed:', e.message); process.exit(1) })
}
