// Foreground glyph for a cell, composed from its fields. Background (color/image)
// is applied as an inline style by the component; this is just what's drawn on top.
// Priority: an explicit char wins; an image speaks for itself; otherwise a role icon.

import { html } from 'lit'
import type { TemplateResult } from 'lit'
import type { Cell } from '../core/types'

export const renderCellGlyph = (cell: Cell | undefined): TemplateResult | string => {
  if (!cell) return ''
  if (cell.char) return html`<span class="cg-cell-char">${cell.char}</span>`
  if (cell.image) return '' // the image is the visual
  if (cell.link) return html`<span class="cg-cell-icon" aria-hidden="true">${cell.link.label ?? '🔗'}</span>`
  if (cell.audio) return html`<span class="cg-cell-icon" aria-hidden="true">🔊</span>`
  return ''
}
