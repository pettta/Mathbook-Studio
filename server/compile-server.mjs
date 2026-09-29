#!/usr/bin/env node
/**
 * Mathbook Studio compile companion.
 *
 * A tiny HTTP server that receives the project files from the browser app,
 * writes them to a build directory and runs `latexmk -pdf` on your local
 * TeX Live.  The app detects it automatically (GET /health) and shows a
 * Preview tab when it is reachable.
 *
 *   npm run compile-server              # 127.0.0.1:4747
 *   node server/compile-server.mjs --port 4747 --host 0.0.0.0 --dir ~/.mathbook-studio
 *
 * Endpoints (CORS enabled):
 *   GET  /health                -> { ok, latexmk, synctex, version }
 *   POST /build                 -> { ok, pdf: bool, log, errors[], seconds }
 *          body: { id, files: { "path": { text } | { b64 } }, main? }
 *   GET  /pdf/:id               -> application/pdf (latest build)
 *   GET  /synctex/:id?file=&line=&col= -> { page, x, y }   (forward search)
 *   GET  /log/:id               -> text/plain
 *
 * No dependencies beyond Node >= 18 and a TeX Live with latexmk.
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const VERSION = '1.0.0'
const args = process.argv.slice(2)
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def }
const PORT = Number(opt('port', process.env.PORT || 4747))
const HOST = opt('host', process.env.HOST || '127.0.0.1')
const ROOT = path.resolve(opt('dir', process.env.MBS_DIR || path.join(os.homedir(), '.mathbook-studio', 'build')))
const LATEXMK = opt('latexmk', 'latexmk')
const TIMEOUT_MS = Number(opt('timeout', 180)) * 1000

fs.mkdirSync(ROOT, { recursive: true })

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null
}
const latexmkPath = which(LATEXMK)
const synctexPath = which('synctex')
let latexmkVersion = null
if (latexmkPath) {
  const r = spawnSync(latexmkPath, ['--version'], { encoding: 'utf8' })
  latexmkVersion = (r.stdout + r.stderr).split('\n').find((l) => /Latexmk/i.test(l))?.trim() ?? 'unknown'
}

const safeId = (id) => String(id || 'default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
const safeRel = (p) => {
  const n = path.posix.normalize(String(p).replace(/\\/g, '/')).replace(/^(\.\.\/|\/)+/, '')
  if (n.includes('..')) throw new Error('bad path ' + p)
  return n
}

// ---------------------------------------------------------------------------
// building
// ---------------------------------------------------------------------------
const builds = new Map()   // id -> { running: Promise|null, queued: payload|null, last: result }

function parseErrors(log) {
  const errors = []
  const lines = log.split('\n')
  let file = ''
  const fileStack = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    // track (file ... ) nesting loosely
    for (const m of l.matchAll(/\(([^()\s]+\.(?:tex|cls|sty))/g)) { fileStack.push(m[1]); file = m[1] }
    const fle = /^(?:\.\/)?([^:\s]+\.(?:tex|cls|sty|bib)):(\d+): (.*)$/.exec(l)   // -file-line-error format
    if (fle) {
      if (!fle[3].startsWith('==>')) errors.push({ message: fle[3].trim(), file: fle[1], line: Number(fle[2]) })
      continue
    }
    if (l.startsWith('! ')) {
      const msg = l.slice(2).trim()
      let line = null
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const lm = /^l\.(\d+)/.exec(lines[j])
        if (lm) { line = Number(lm[1]); break }
      }
      errors.push({ message: msg, file: file.replace(/^\.\//, ''), line })
    } else if (/^LaTeX Warning: (Reference|Citation) `([^']+)' .*undefined/.test(l)) {
      const m = /^LaTeX Warning: (Reference|Citation) `([^']+)'.*?(?:on input line (\d+))?\.?$/.exec(l)
      errors.push({ message: `${m[1]} ${m[2]} undefined`, file: file.replace(/^\.\//, ''), line: m[3] ? Number(m[3]) : null, warning: true })
    } else if (/^(Overfull|Underfull) \\hbox/.test(l)) {
      const m = /at lines (\d+)--(\d+)/.exec(l)
      errors.push({ message: l.replace(/\s+in paragraph.*$/, ''), file: file.replace(/^\.\//, ''), line: m ? Number(m[1]) : null, warning: true, minor: true })
    } else if (/^(Package|Class) (\w+) Warning:/.test(l)) {
      errors.push({ message: l, file: file.replace(/^\.\//, ''), line: null, warning: true })
    }
  }
  return errors
}

async function runBuild(id, payload) {
  const dir = path.join(ROOT, safeId(id))
  fs.mkdirSync(dir, { recursive: true })
  const wanted = new Set()
  for (const [rel, content] of Object.entries(payload.files || {})) {
    const p = safeRel(rel)
    if (p.endsWith('/.keep')) { fs.mkdirSync(path.join(dir, p.slice(0, -6)), { recursive: true }); continue }
    wanted.add(p)
    const full = path.join(dir, p)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    const data = content.b64 !== undefined ? Buffer.from(content.b64, 'base64') : Buffer.from(content.text ?? '', 'utf8')
    // only rewrite when changed, so latexmk's dependency tracking stays useful
    try { if (Buffer.compare(fs.readFileSync(full), data) === 0) continue } catch { /* new file */ }
    fs.writeFileSync(full, data)
  }
  // remove project files that no longer exist in the app (build artefacts are kept)
  const isSource = (rel) => rel.startsWith('figures/') || /\.(tex|cls|sty|bib|bst|md)$/i.test(rel)
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) { walk(full); continue }
      const rel = path.relative(dir, full).split(path.sep).join('/')
      if (isSource(rel) && !wanted.has(rel)) { try { fs.unlinkSync(full) } catch { /* ignore */ } }
    }
  }
  walk(dir)

  const main = safeRel(payload.main || 'main.tex')
  const t0 = Date.now()
  const result = await new Promise((resolve) => {
    if (!latexmkPath) return resolve({ ok: false, log: 'latexmk not found on PATH', code: -1 })
    const child = spawn(latexmkPath, ['-pdf', '-interaction=nonstopmode', '-synctex=1', '-file-line-error', '-halt-on-error', main], { cwd: dir, env: { ...process.env, max_print_line: '2000' } })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    const timer = setTimeout(() => { child.kill('SIGKILL'); out += '\n[compile-server] timed out\n' }, TIMEOUT_MS)
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, log: out, code }) })
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, log: String(e), code: -1 }) })
  })
  const seconds = (Date.now() - t0) / 1000
  const stem = main.replace(/\.tex$/, '')
  const logPath = path.join(dir, stem + '.log')
  let texlog = ''
  try { texlog = fs.readFileSync(logPath, 'utf8') } catch { /* no log */ }
  const pdfPath = path.join(dir, stem + '.pdf')
  const pdfExists = fs.existsSync(pdfPath)
  const errors = parseErrors(texlog || result.log)
  const tail = result.log.split('\n').slice(-40).join('\n')
  return { ok: result.ok, pdf: pdfExists, pdfMtime: pdfExists ? fs.statSync(pdfPath).mtimeMs : 0, errors, log: tail, seconds, stem }
}

async function build(id, payload) {
  const key = safeId(id)
  let b = builds.get(key)
  if (!b) { b = { running: null, queued: null, last: null }; builds.set(key, b) }
  if (b.running) {
    // coalesce: one more build with the newest payload once the current finishes
    b.queued = payload
    await b.running
    if (b.queued !== payload) return b.last   // superseded by an even newer payload
    b.queued = null
  }
  b.running = runBuild(id, payload).then((r) => { b.last = r; b.running = null; return r })
  return b.running
}

function synctexForward(id, file, line, col, stem = 'main') {
  if (!synctexPath) return { error: 'synctex not found' }
  const dir = path.join(ROOT, safeId(id))
  const r = spawnSync(synctexPath, ['view', '-i', `${line}:${col || 1}:${safeRel(file)}`, '-o', `${stem}.pdf`], { cwd: dir, encoding: 'utf8' })
  const text = r.stdout || ''
  const page = /^Page:(\d+)/m.exec(text), x = /^x:([\d.]+)/m.exec(text), y = /^y:([\d.]+)/m.exec(text), h = /^h:([\d.]+)/m.exec(text), v = /^v:([\d.]+)/m.exec(text)
  if (!page) return { error: 'no match', raw: text.slice(0, 400) }
  return { page: Number(page[1]), x: x ? Number(x[1]) : 0, y: y ? Number(y[1]) : 0, h: h ? Number(h[1]) : 0, v: v ? Number(v[1]) : 0 }
}

// ---------------------------------------------------------------------------
// http
// ---------------------------------------------------------------------------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
const json = (res, code, obj) => { res.writeHead(code, { ...CORS, 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true, version: VERSION, latexmk: latexmkVersion, synctex: !!synctexPath, dir: ROOT })
    if (req.method === 'POST' && url.pathname === '/build') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const r = await build(payload.id, payload)
      return json(res, 200, r)
    }
    let m
    if ((m = /^\/pdf\/([^/]+)$/.exec(url.pathname))) {
      const dir = path.join(ROOT, safeId(m[1]))
      const stem = safeRel(url.searchParams.get('stem') || 'main')
      const p = path.join(dir, stem + '.pdf')
      if (!fs.existsSync(p)) return json(res, 404, { error: 'no pdf yet' })
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' })
      return fs.createReadStream(p).pipe(res)
    }
    if ((m = /^\/log\/([^/]+)$/.exec(url.pathname))) {
      const p = path.join(ROOT, safeId(m[1]), 'main.log')
      res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end(fs.existsSync(p) ? fs.readFileSync(p) : '')
    }
    if ((m = /^\/synctex\/([^/]+)$/.exec(url.pathname))) {
      return json(res, 200, synctexForward(m[1], url.searchParams.get('file') || 'main.tex', Number(url.searchParams.get('line') || 1), Number(url.searchParams.get('col') || 1), url.searchParams.get('stem') || 'main'))
    }
    json(res, 404, { error: 'not found' })
  } catch (e) {
    json(res, 500, { error: String(e) })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Mathbook Studio compile companion v${VERSION}`)
  console.log(`  listening on http://${HOST}:${PORT}`)
  console.log(`  build dir   ${ROOT}`)
  console.log(`  latexmk     ${latexmkPath ? latexmkVersion : 'NOT FOUND — install TeX Live / MacTeX / MiKTeX'}`)
  console.log(`  synctex     ${synctexPath ? 'available' : 'not found (Locate disabled)'}`)
})
