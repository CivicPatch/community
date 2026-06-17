// Renders the hangout page in real WebKit (the engine behind iOS Safari) at an
// iPhone viewport, auto-completes the join gate, screenshots, and measures the
// grid. Set BLOCK_STORAGE=1 to make localStorage/sessionStorage throw on access —
// that mimics a hardened privacy browser like Firefox Focus and is how the
// "blank grid" bug reproduces. With the storage access guarded, the grid should
// render even under BLOCK_STORAGE.
//
// Not part of the app — run via docker-compose.mobile-preview.yml.

import { webkit, devices } from 'playwright'
import { mkdir } from 'node:fs/promises'

const TARGET = process.env.TARGET_URL || 'http://localhost:4173/hangout/'
const OUT = process.env.OUT_DIR || '/shot/out'
const BLOCK_STORAGE = !!process.env.BLOCK_STORAGE
await mkdir(OUT, { recursive: true })

const browser = await webkit.launch()
const context = await browser.newContext({ ...devices['iPhone 13'] })

if (BLOCK_STORAGE) {
  // Simulate Firefox Focus / blocked-cookies: any access to web storage throws.
  await context.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('storage blocked', 'SecurityError')
    }
    for (const key of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, key, { configurable: true, get: blocked })
    }
  })
}

const page = await context.newPage()

const logLines = []
page.on('console', (m) => logLines.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logLines.push(`[pageerror] ${e.message}`))
page.on('requestfailed', (r) => logLines.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`))

console.log(`→ loading ${TARGET} in WebKit @ iPhone 13${BLOCK_STORAGE ? ' (storage BLOCKED — Firefox Focus sim)' : ''}`)
await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 })

await page
  .waitForFunction(
    () => {
      const el = document.querySelector('chat-grid')
      return el?.shadowRoot?.querySelector('.cg-grid')
    },
    null,
    { timeout: 30000 },
  )
  .catch(() => logLines.push('[warn] .cg-grid never appeared in the shadow DOM'))

await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: true })

const joined = await page.evaluate(() => {
  const root = document.querySelector('chat-grid')?.shadowRoot
  if (!root) return 'no-shadow-root'
  const name = root.querySelector('#cg-join-name')
  if (name) {
    name.value = 'Mobile Test'
    name.dispatchEvent(new Event('input', { bubbles: true }))
  }
  root.querySelector('.cg-avatar-opt')?.click()
  const submit = root.querySelector('.cg-btn-primary')
  if (submit) {
    submit.click()
    return 'submitted'
  }
  return 'no-join-gate-found'
})
logLines.push(`[join] ${joined}`)
await page.waitForTimeout(1500)

const diag = await page.evaluate(() => {
  const host = document.querySelector('chat-grid')
  const root = host?.shadowRoot
  const grid = root?.querySelector('.cg-grid')
  const cell0 = root?.querySelector('.cg-cell')
  const cs = grid ? getComputedStyle(grid) : null
  const rect = (el) =>
    el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null
  return {
    hostWidth: host?.clientWidth ?? null,
    cssCellVar: cs?.getPropertyValue('--cell').trim() || null,
    gridSize: rect(grid),
    firstCellSize: rect(cell0),
    cellCount: root ? root.querySelectorAll('.cg-cell').length : 0,
  }
})

console.log('\n=== grid diagnostics ===')
console.log(JSON.stringify(diag, null, 2))

await page.screenshot({ path: `${OUT}/02-after-join.png`, fullPage: true })
const host = await page.$('chat-grid')
if (host) await host.screenshot({ path: `${OUT}/03-chat-grid.png` }).catch((e) => logLines.push(`[warn] element screenshot failed: ${e.message}`))

console.log('\n=== console / page errors ===')
console.log(logLines.join('\n') || '(none)')

const cw = diag.firstCellSize?.w ?? 0
console.log(
  `\nVERDICT (${BLOCK_STORAGE ? 'storage blocked' : 'normal'}): first cell ${cw}px, ${diag.cellCount} cells → ` +
    (diag.cellCount > 0 && cw >= 2 ? 'GRID RENDERS.' : 'BLANK — grid did not render.'),
)

await browser.close()
