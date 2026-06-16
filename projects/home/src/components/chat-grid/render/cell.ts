// Extensible cell-content renderer. v1 implements `audio`; register more types
// (text/link/meet) later without touching the grid or other types.

import { html } from 'lit'
import type { TemplateResult } from 'lit'
import type { Cell } from '../core/types'

type CellRenderer = (cell: Cell) => TemplateResult

const renderers: Record<string, CellRenderer> = {
  audio: () => html`<span class="cg-cell-icon" aria-hidden="true">🔊</span>`,
}

export const registerCellRenderer = (type: string, fn: CellRenderer): void => {
  renderers[type] = fn
}

export const renderCellContent = (cell: Cell | undefined): TemplateResult | string => {
  if (!cell?.content) return ''
  const r = renderers[cell.content.type]
  return r ? r(cell) : ''
}
