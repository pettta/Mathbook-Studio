/**
 * Penrose rendering: compile -> optimise in small chunks (so the UI stays
 * responsive and a render can be cancelled) -> SVG.  Also SVG -> PDF for
 * \includegraphics.
 */
import { compile, stepTimes, isOptimized, toSVG, showError, resample } from '@penrose/core'
import type { State } from '@penrose/core'
import { jsPDF } from 'jspdf'
import 'svg2pdf.js'

export interface Trio { domain: string; substance: string; style: string; variation: string }

export interface RenderProgress { phase: 'compiling' | 'optimizing' | 'rendering' | 'done' | 'error'; steps?: number; message?: string }

export class RenderCancelled extends Error { constructor() { super('cancelled') } }

const STEP_CHUNK = 200
const MAX_STEPS = 60000

let activeToken = 0

const noResolver = async (_path: string): Promise<string | undefined> => undefined

/**
 * Render a trio. Only the most recent call is allowed to finish: an older
 * in-flight render throws RenderCancelled at its next yield point.
 */
export async function renderTrio(trio: Trio, onProgress?: (p: RenderProgress) => void, opts: { texLabels?: boolean } = {}): Promise<{ svg: SVGSVGElement; state: State }> {
  const token = ++activeToken
  const check = () => { if (token !== activeToken) throw new RenderCancelled() }
  onProgress?.({ phase: 'compiling' })
  const compiled = await compile({ ...trio, excludeWarnings: [] })
  check()
  if (compiled.isErr()) throw new Error(showError(compiled.error))
  let state = compiled.value
  onProgress?.({ phase: 'optimizing', steps: 0 })
  let steps = 0
  while (!isOptimized(state)) {
    const r = stepTimes(state, STEP_CHUNK)
    if (r.isErr()) throw new Error(showError(r.error))
    state = r.value
    steps += STEP_CHUNK
    onProgress?.({ phase: 'optimizing', steps })
    if (steps >= MAX_STEPS) break
    await new Promise((res) => setTimeout(res, 0))
    check()
  }
  onProgress?.({ phase: 'rendering' })
  const svg = await toSVG(state, noResolver, 'mbs', opts.texLabels ?? false)
  check()
  onProgress?.({ phase: 'done', steps })
  return { svg, state }
}

export function resampleState(state: State): State { return resample(state) }

export function randomVariation(): string {
  const adjectives = ['Amber', 'Brisk', 'Calm', 'Deep', 'Eager', 'Fern', 'Gold', 'Hazel', 'Ivory', 'Jade', 'Keen', 'Lunar', 'Misty', 'Noble', 'Opal', 'Pale', 'Quiet', 'Rosy', 'Silver', 'Terse', 'Umber', 'Vivid', 'Warm', 'Zesty']
  const nouns = ['Heron', 'Otter', 'Falcon', 'Badger', 'Lynx', 'Osprey', 'Marten', 'Ibis', 'Finch', 'Wren', 'Puffin', 'Stoat', 'Sable', 'Tern', 'Vole']
  return adjectives[Math.floor(Math.random() * adjectives.length)] + nouns[Math.floor(Math.random() * nouns.length)] + Math.floor(Math.random() * 100000)
}

/**
 * Penrose records the bounding box of the drawn shapes in its metadata.
 * Crop the (usually much larger) canvas to that box, with some padding, so
 * the figure in the book has no dead space around it.
 */
export function cropToContent(svg: SVGSVGElement, padding = 12): SVGSVGElement {
  const meta = svg.querySelector('croppedViewBox')
  if (meta?.textContent) {
    const [x, y, w, h] = meta.textContent.trim().split(/\s+/).map(Number)
    if ([x, y, w, h].every((v) => Number.isFinite(v)) && w > 0 && h > 0) {
      svg.setAttribute('viewBox', `${x - padding} ${y - padding} ${w + 2 * padding} ${h + 2 * padding}`)
      svg.setAttribute('width', String(w + 2 * padding))
      svg.setAttribute('height', String(h + 2 * padding))
    }
  }
  svg.querySelector('penrose')?.remove()
  return svg
}

/** Serialise an SVG element to a standalone .svg file (with XML header). */
export function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
}

/** Dimensions in px from the viewBox (fallback: width/height attributes). */
export function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const [, , w, h] = vb.split(/[\s,]+/).map(Number)
    if (w > 0 && h > 0) return { width: w, height: h }
  }
  const w = parseFloat(svg.getAttribute('width') || '0'), h = parseFloat(svg.getAttribute('height') || '0')
  return { width: w || 400, height: h || 300 }
}

/** Convert the rendered SVG to a PDF (vector) for pdflatex's \includegraphics. */
export async function svgToPdf(svg: SVGSVGElement): Promise<Uint8Array> {
  const { width, height } = svgSize(svg)
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  // svg2pdf needs the element in the DOM for computed styles
  const host = document.createElement('div')
  host.style.position = 'fixed'; host.style.left = '-100000px'; host.style.top = '0'
  host.appendChild(clone)
  document.body.appendChild(host)
  try {
    const doc = new jsPDF({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'pt', format: [width, height], compress: true })
    await doc.svg(clone, { x: 0, y: 0, width, height })
    return new Uint8Array(doc.output('arraybuffer'))
  } finally {
    host.remove()
  }
}
