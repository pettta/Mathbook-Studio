// Pop right-pane panels out into their own browser windows (e.g. on another monitor).
// The popup is a same-origin about:blank window; App.vue <Teleport>s the panel into it,
// so it keeps sharing this app's store, editor bridge and compile state.
import { shallowReactive } from 'vue'
import { store, toast, type PanelId } from '../store'

export type { PanelId }

export const PANEL_LABELS: Record<PanelId, string> = {
  diagram: 'Diagram', library: 'Library', preview: 'Preview', snippets: 'Snippets', docs: 'Penrose docs', help: 'Help',
}

/** Where each popped-out panel renders; absent = docked in the right pane. */
export const popTargets = shallowReactive<Partial<Record<PanelId, HTMLElement>>>({})
const popWindows = new Map<PanelId, Window>()

let keyHandler: ((e: KeyboardEvent) => void) | null = null
/** App-wide shortcuts, attached to every popup too. */
export function setPopupKeyHandler(h: (e: KeyboardEvent) => void) { keyHandler = h }

const boundsKey = (id: PanelId) => `mbs-popout-${id}`
function savedFeatures(id: PanelId): string {
  let b = { w: 760, h: 900, x: window.screenX + 60, y: window.screenY + 60 }
  try { b = { ...b, ...JSON.parse(localStorage.getItem(boundsKey(id)) || '{}') } } catch { /* first time */ }
  return `popup,width=${b.w},height=${b.h},left=${b.x},top=${b.y}`
}
function saveBounds(id: PanelId, w: Window) {
  try { localStorage.setItem(boundsKey(id), JSON.stringify({ w: w.outerWidth, h: w.outerHeight, x: w.screenX, y: w.screenY })) } catch { /* private mode */ }
}

// ---- styles: mirror <style>/<link> from the main document (Vite injects and hot-updates them)
function copyStyles(w: Window) {
  const head = w.document.head
  head.querySelectorAll('[data-mbs-copy]').forEach((n) => n.remove())
  for (const n of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    const c = n.cloneNode(true) as HTMLElement
    if (c instanceof HTMLLinkElement) c.href = (n as HTMLLinkElement).href
    c.setAttribute('data-mbs-copy', '')
    head.appendChild(c)
  }
}
let styleTimer: number | undefined
const styleObserver = new MutationObserver(() => {
  window.clearTimeout(styleTimer)
  styleTimer = window.setTimeout(() => popWindows.forEach(copyStyles), 50)
})

export function isPopped(id: PanelId) { return !!popTargets[id] }

export function popOut(id: PanelId) {
  const existing = popWindows.get(id)
  if (existing && !existing.closed) { existing.focus(); return }
  const w = window.open('', `mbs-${id}`, savedFeatures(id))
  if (!w) { toast('Pop-up blocked. Allow pop-ups for this site to open panels in their own window.'); return }
  const d = w.document
  d.title = `${PANEL_LABELS[id]} · Mathbook Studio`
  d.head.replaceChildren()
  const base = d.createElement('base'); base.href = document.baseURI; d.head.appendChild(base)
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) { const i = d.createElement('link'); i.rel = 'icon'; i.href = icon.href; d.head.appendChild(i) }
  copyStyles(w)
  const host = d.createElement('div')
  host.id = 'app'
  d.body.replaceChildren(host)

  if (keyHandler) w.addEventListener('keydown', keyHandler)
  w.addEventListener('pagehide', () => { if (popWindows.get(id) === w) dock(id, false) })
  if (popWindows.size === 0) styleObserver.observe(document.head, { childList: true, subtree: true, characterData: true })
  popWindows.set(id, w)
  popTargets[id] = host

  // the docked copy disappears; show a neighbouring tab instead of a placeholder
  if (store.rightTab === id) {
    const next = (Object.keys(PANEL_LABELS) as PanelId[]).find((p) => !popTargets[p])
    if (next) store.rightTab = next
  }
}

/** Bring a panel back into the right pane (closing its window). */
export function dock(id: PanelId, close = true) {
  const w = popWindows.get(id)
  popWindows.delete(id)
  delete popTargets[id]
  if (w && !w.closed) { saveBounds(id, w); if (close) w.close() }
  if (popWindows.size === 0) styleObserver.disconnect()
  if (close) store.rightTab = id
}

/** Show a panel: switch the right-pane tab, or (if popped out) optionally raise its window. */
export function showPanel(id: PanelId, focus = false) {
  const w = popWindows.get(id)
  if (w && !w.closed) { if (focus) w.focus() }
  else store.rightTab = id
}

/** The window the user is interacting with, for confirm()/prompt() dialogs. */
export function activeWindow(): Window {
  for (const w of popWindows.values()) if (!w.closed && w.document.hasFocus()) return w
  return window
}

window.addEventListener('beforeunload', () => {
  for (const [id, w] of popWindows) { saveBounds(id, w); w.close() }
})
