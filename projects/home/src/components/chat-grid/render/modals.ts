// Overlay modals: the map-cell editor, JSON export, grid settings, and a player's
// full status. `makeRenderOverlay` closes over the component's current overlay +
// callbacks and returns the `renderOverlay()` the template calls.
//
// The cell editor itself lives elsewhere (it's a sub-feature of its own); the
// 'cell' overlay just wraps whatever `renderCellEditor` produces, so this module
// stays agnostic about the editor's internals.

import { html } from 'lit'
import { ref } from 'lit/directives/ref.js'
import type { Cell, GridConfig } from '../core/types'
import { serializeConfig, setGridMeta } from '../core/edit'
import { GITHUB_EDIT_URL } from '../shell/config'

export type Overlay =
  | { kind: 'none' }
  | { kind: 'cell'; cell: Cell }
  | { kind: 'json' }
  | { kind: 'settings' }
  | { kind: 'status'; name: string; text: string }

// callback ref: focus the dialog when it mounts, so Esc/Tab work immediately.
const focusEl = (el?: Element) => {
  if (el instanceof HTMLElement) el.focus()
}

const inputValue = (e: Event) => (e.target as HTMLInputElement).value

export interface OverlayDeps {
  overlay: Overlay
  config: GridConfig | null
  closeOverlay: () => void
  copyJson: () => void
  editConfig: (c: GridConfig) => void
  /** body for the 'cell' overlay — supplied by the cell-editor sub-feature. */
  renderCellEditor: (cell: Cell) => unknown
}

export const makeRenderOverlay = (deps: OverlayDeps) => {
  const { closeOverlay } = deps

  // Shared modal chrome: backdrop (click to dismiss) + focusable dialog (Esc to
  // dismiss, handled globally). Only the inner body differs per modal.
  const modal = (label: string, body: unknown, extra = '') =>
    html`<div class="cg-modal-backdrop" @click=${closeOverlay}>
      <div
        class="cg-modal ${extra}"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        aria-label=${label}
        ${ref(focusEl)}
        @click=${(e: Event) => e.stopPropagation()}
      >
        ${body}
      </div>
    </div>`

  const statusModal = (name: string, text: string) => html`
    <h3 class="cg-modal-title">${name}</h3>
    <p class="cg-status-full">${text}</p>
    <div class="cg-modal-actions">
      <button class="cg-btn cg-btn-primary" @click=${closeOverlay}>Close</button>
    </div>
  `

  const jsonModal = (c: GridConfig) => html`
    <h3 class="cg-modal-title">Map JSON</h3>
    <p class="cg-modal-hint">
      Copy this, then <strong>Edit on GitHub</strong> → paste into
      <code>public/grid.json</code> → <em>Propose changes</em> (opens a PR).
    </p>
    <textarea class="cg-json" readonly .value=${serializeConfig(c)}></textarea>
    <div class="cg-modal-actions">
      <button class="cg-btn" @click=${closeOverlay}>Close</button>
      <a class="cg-btn" href=${GITHUB_EDIT_URL} target="_blank" rel="noopener noreferrer">
        Edit on GitHub ↗
      </a>
      <button class="cg-btn cg-btn-primary" @click=${deps.copyJson}>Copy JSON</button>
    </div>
  `

  const settingsModal = (c: GridConfig) => {
    const num = (e: Event) => Number(inputValue(e))
    const set = (patch: Parameters<typeof setGridMeta>[1]) => deps.editConfig(setGridMeta(c, patch))
    return html`
      <h3 class="cg-modal-title">Grid settings</h3>
      <div class="cg-field">
        <label>Columns</label>
        <input type="number" min="1" .value=${String(c.columns)} @input=${(e: Event) => set({ columns: num(e) || 1 })} />
      </div>
      <div class="cg-field">
        <label>Rows</label>
        <input type="number" min="1" .value=${String(c.rows)} @input=${(e: Event) => set({ rows: num(e) || 1 })} />
      </div>
      <div class="cg-field">
        <label>Spawn col</label>
        <input
          type="number"
          min="0"
          .value=${String(c.spawn?.col ?? 0)}
          @input=${(e: Event) => set({ spawn: { col: num(e) || 0, row: c.spawn?.row ?? 0 } })}
        />
      </div>
      <div class="cg-field">
        <label>Spawn row</label>
        <input
          type="number"
          min="0"
          .value=${String(c.spawn?.row ?? 0)}
          @input=${(e: Event) => set({ spawn: { col: c.spawn?.col ?? 0, row: num(e) || 0 } })}
        />
      </div>
      <div class="cg-field">
        <label>Max huddle cells</label>
        <input
          type="number"
          min="1"
          .value=${String(c.maxHuddleCells ?? 6)}
          @input=${(e: Event) => set({ maxHuddleCells: num(e) || 1 })}
        />
      </div>
      <p class="cg-modal-hint">Shrinking the grid drops any cells outside the new bounds.</p>
      <div class="cg-modal-actions">
        <button class="cg-btn cg-btn-primary" @click=${closeOverlay}>Done</button>
      </div>
    `
  }

  return () => {
    const { overlay, config } = deps
    switch (overlay.kind) {
      case 'none':
        return ''
      case 'cell':
        return modal(
          `Edit cell ${overlay.cell.coord.col}, ${overlay.cell.coord.row}`,
          deps.renderCellEditor(overlay.cell),
        )
      case 'json':
        return config ? modal('Map JSON', jsonModal(config), 'cg-modal-wide') : ''
      case 'settings':
        return config ? modal('Grid settings', settingsModal(config)) : ''
      case 'status':
        return modal(`${overlay.name}'s status`, statusModal(overlay.name, overlay.text))
    }
  }
}
