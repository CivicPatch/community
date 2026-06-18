// Foreground glyph for a cell, composed from its fields. Background (color/image)
// is applied as an inline style by the component; this is just what's drawn on top.
// Priority: an explicit char wins; an image speaks for itself; otherwise a role icon.

import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import DOMPurify from 'dompurify'
import type { Cell } from '../core/types'

export const renderCellGlyph = (cell: Cell | undefined): TemplateResult | string => {
  if (!cell) return ''
  if (cell.char) return html`<span class="cr-cell-char">${cell.char}</span>`
  // inline SVG, sanitized to the safe SVG profile (no scripts/foreignObject/etc.)
  if (cell.svg)
    return html`<span class="cr-cell-svg" aria-hidden="true"
      >${unsafeHTML(DOMPurify.sanitize(cell.svg, { USE_PROFILES: { svg: true, svgFilters: true } }))}</span
    >`
  if (cell.image) return '' // the image is the visual
  if (cell.link) return html`<span class="cr-cell-icon" aria-hidden="true">${cell.link.label ?? '🔗'}</span>`
  if (cell.door) return html`<span class="cr-cell-icon" aria-hidden="true">🚪</span>`
  if (cell.radio) return html`<span class="cr-cell-icon" aria-hidden="true">📻</span>`
  if (cell.audio) return html`<span class="cr-cell-icon" aria-hidden="true">🔊</span>`
  return ''
}
