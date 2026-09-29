import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.env.SMOKE_OUT || '.'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })

await page.goto('http://localhost:4173/')
await page.waitForSelector('.dialog')
await page.fill('.dialog input[placeholder="A Book of Mathematics"]', 'Test Book')
await page.fill('.dialog input[placeholder="Your name"]', 'Tommy Pett')
await page.click('.dialog button.primary')
await page.waitForSelector('.cm-content')
await page.screenshot({ path: OUT + '/s1-project.png' })

// ---- snippet tests: go to end of doc and type
const cm = page.locator('.cm-host .cm-content')
await cm.click()
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')

async function type(s) { await page.keyboard.type(s, { delay: 8 }) }
async function tail(n = 400) { return page.evaluate((n) => { const el = document.querySelector('.cm-host .cm-editor'); const v = window.__cmView(el); return v.state.doc.toString().slice(-n) }, n) }
async function lastLine() { const t = await tail(); return t.split('\n').pop() }

const results = []
function check(name, got, expect) { const ok = typeof expect === 'function' ? expect(got) : got.includes(expect); results.push(`${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}`) }

// mk -> $ $ ; then math snippets
await type('Let mk')
check('mk', await lastLine(), 'Let $$')
await type('@a + @b sr')
check('greek+sr', await lastLine(), '$\\alpha + \\beta^{2}$')
await type(' -> RR')
check('arrow, RR', await lastLine(), '\\to \\mathbb{R}')
await page.keyboard.press('Tab')   // tab out of $
await type(' and mk')
await type('xhat')
check('xhat', await lastLine(), '\\hat{x}')
await type(' + (a+b)/')
check('autofrac', await lastLine(), '\\frac{a+b}{}')
await type('2')
await page.keyboard.press('Tab')
await type(' sq')
check('sq', await lastLine(), '\\sqrt{ ')
await type('y')
await page.keyboard.press('Tab')
await type(' sin')
check('sin', await lastLine(), '\\sin')
await type(' \\sum')
await page.keyboard.press('Tab')
check('sum tab', await lastLine(), '\\sum_{n=1}^{\\infty}')
await page.keyboard.press('Escape')
await page.keyboard.press('End')
await page.keyboard.press('Enter')

// text-mode mathbook snippet
await type(';thm')
await page.waitForTimeout(50)
const t2 = await tail(300)
check(';thm', t2, (s) => s.includes('\\begin{theorem}[') && s.includes('\\end{theorem}'))
await type('Bolzano')
await page.keyboard.press('Tab')
await type('bw')
await page.keyboard.press('Tab')
await type('Every bounded sequence has a convergent subsequence.')
check('thm filled', await tail(300), 'label{thm:bw}')
await page.keyboard.press('Escape')
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')

// visual snippet
await type('mk')
await type('a+b')
await page.keyboard.press('Shift+Home')
// selection from line start includes the $ ... select just a+b instead
await page.keyboard.press('End')
await page.keyboard.press('ArrowLeft')
await page.keyboard.down('Shift'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift')
await type('U')
check('visual U', await lastLine(), '\\underbrace{ a+b }_{')
await page.keyboard.press('Escape')
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')

// matrix shortcuts: dm then pmat, Tab -> &, Enter -> \\
await type('dm')
await type('pmat')
await type('1')
await page.keyboard.press('Tab')
await type('2')
await page.keyboard.press('Enter')
await type('3')
check('matrix', await tail(200), (s) => s.includes('1 & 2 \\\\') && s.includes('\\begin{pmatrix}'))

// conceal/preview present?
const hasPreview = await page.locator('.cm-math-preview').count()
results.push(`preview tooltips: ${hasPreview}`)
await page.screenshot({ path: OUT + '/s2-editor.png' })

// label completion
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
await type('See \\cref{thm:')
await page.waitForTimeout(400)
const completions = await page.locator('.cm-tooltip-autocomplete li').allTextContents()
results.push(`completions: ${completions.slice(0, 5).join(' | ')}`)
await page.keyboard.press('Escape')
await page.keyboard.press('End'); await page.keyboard.press('Enter')

// ---- Penrose: wait for default example render
await page.waitForFunction(() => document.querySelector('.svg-host svg') !== null, null, { timeout: 60000 })
await page.waitForFunction(() => !document.querySelector('.preview.busy'), null, { timeout: 60000 })
const svgCount = await page.locator('.svg-host svg *').count()
results.push(`penrose default example svg nodes: ${svgCount}`)
await page.screenshot({ path: OUT + '/s3-penrose.png' })

// pick another example (Continuous Map) and render
await page.selectOption('.toolbar select', 'set-theory-domain/continuousmap')
await page.waitForTimeout(500)
await page.waitForFunction(() => !document.querySelector('.preview.busy'), null, { timeout: 90000 })
const err = await page.locator('.preview .error').count()
results.push(`continuousmap error boxes: ${err}`)

// insert into book
await page.fill('.insert input[placeholder="Caption text"]', 'A continuous map between two sets.')
await page.click('.insert button.primary')
await page.waitForTimeout(3000)
const afterInsert = await tail(600)
check('figure inserted', afterInsert, '\\includegraphics[width=0.6\\textwidth]{figures/')
await page.screenshot({ path: OUT + '/s4-inserted.png' })

// library tab
await page.click('.rtabs button:nth-child(2)')
await page.waitForTimeout(300)
results.push(`library cards: ${await page.locator('.card').count()}`)
await page.screenshot({ path: OUT + '/s5-library.png' })

// export zip
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('header button:has-text("Export ZIP")')])
const zipPath = OUT + '/export.zip'
await dl.saveAs(zipPath)
results.push(`zip: ${fs.statSync(zipPath).size} bytes`)

// reload -> project restored?
await page.reload()
await page.waitForSelector('.cm-content', { timeout: 20000 })
await page.waitForTimeout(500)
const restored = await page.evaluate(() => document.querySelector('.project')?.textContent)
results.push(`restored project: ${restored}`)

console.log(results.join('\n'))
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
