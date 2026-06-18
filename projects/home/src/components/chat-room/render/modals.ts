// Overlay modals: the map-cell editor, JSON export, room settings, and a player's
// full status. `makeRenderOverlay` closes over the component's current overlay +
// callbacks and returns the `renderOverlay()` the template calls.
//
// The cell editor itself lives elsewhere (it's a sub-feature of its own); the
// 'cell' overlay just wraps whatever `renderCellEditor` produces, so this module
// stays agnostic about the editor's internals.

import { html } from 'lit'
import { ref } from 'lit/directives/ref.js'
import type { Cell, RoomConfig } from '../core/types'
import { serializeConfig, setRoomMeta } from '../core/edit'
import { GITHUB_EDIT_BASE } from '../shell/config'

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
  config: RoomConfig | null
  /** the current room's file path (e.g. /rooms/garden.json) — for the Edit-on-GitHub link */
  roomPath: string
  closeOverlay: () => void
  copyJson: () => void
  editConfig: (c: RoomConfig) => void
  /** body for the 'cell' overlay — supplied by the cell-editor sub-feature. */
  renderCellEditor: (cell: Cell) => unknown
}

export const makeRenderOverlay = (deps: OverlayDeps) => {
  const { closeOverlay } = deps

  // Shared modal chrome: backdrop (click to dismiss) + focusable dialog (Esc to
  // dismiss, handled globally). Only the inner body differs per modal.
  const modal = (label: string, body: unknown, extra = '') =>
    html`<div class="cr-modal-backdrop" @click=${closeOverlay}>
      <div
        class="cr-modal ${extra}"
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
    <h3 class="cr-modal-title">${name}</h3>
    <p class="cr-status-full">${text}</p>
    <div class="cr-modal-actions">
      <button class="cr-btn cr-btn-primary" @click=${closeOverlay}>Close</button>
    </div>
  `

  const jsonModal = (c: RoomConfig) => html`
    <h3 class="cr-modal-title">Map JSON</h3>
    <p class="cr-modal-hint">
      Copy this, then <strong>Edit on GitHub</strong> → paste into
      <code>public${deps.roomPath}</code> → <em>Propose changes</em> (opens a PR).
    </p>
    <textarea class="cr-json" readonly .value=${serializeConfig(c)}></textarea>
    <div class="cr-modal-actions">
      <button class="cr-btn" @click=${closeOverlay}>Close</button>
      <a class="cr-btn" href=${`${GITHUB_EDIT_BASE}${deps.roomPath}`} target="_blank" rel="noopener noreferrer">
        Edit on GitHub ↗
      </a>
      <button class="cr-btn cr-btn-primary" @click=${deps.copyJson}>Copy JSON</button>
    </div>
  `

  const settingsModal = (c: RoomConfig) => {
    const num = (e: Event) => Number(inputValue(e))
    const set = (patch: Parameters<typeof setRoomMeta>[1]) => deps.editConfig(setRoomMeta(c, patch))
    return html`
      <h3 class="cr-modal-title">Room settings</h3>
      <div class="cr-field">
        <label>Columns</label>
        <input type="number" min="1" .value=${String(c.columns)} @input=${(e: Event) => set({ columns: num(e) || 1 })} />
      </div>
      <div class="cr-field">
        <label>Rows</label>
        <input type="number" min="1" .value=${String(c.rows)} @input=${(e: Event) => set({ rows: num(e) || 1 })} />
      </div>
      <div class="cr-field">
        <label>Spawn col</label>
        <input
          type="number"
          min="0"
          .value=${String(c.spawn?.col ?? 0)}
          @input=${(e: Event) => set({ spawn: { col: num(e) || 0, row: c.spawn?.row ?? 0 } })}
        />
      </div>
      <div class="cr-field">
        <label>Spawn row</label>
        <input
          type="number"
          min="0"
          .value=${String(c.spawn?.row ?? 0)}
          @input=${(e: Event) => set({ spawn: { col: c.spawn?.col ?? 0, row: num(e) || 0 } })}
        />
      </div>
      <div class="cr-field">
        <label>Max huddle cells</label>
        <input
          type="number"
          min="1"
          .value=${String(c.maxHuddleCells ?? 6)}
          @input=${(e: Event) => set({ maxHuddleCells: num(e) || 1 })}
        />
      </div>
      <p class="cr-modal-hint">Shrinking the room drops any cells outside the new bounds.</p>
      <div class="cr-modal-actions">
        <button class="cr-btn cr-btn-primary" @click=${closeOverlay}>Done</button>
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
        return config ? modal('Map JSON', jsonModal(config), 'cr-modal-wide') : ''
      case 'settings':
        return config ? modal('Room settings', settingsModal(config)) : ''
      case 'status':
        return modal(`${overlay.name}'s status`, statusModal(overlay.name, overlay.text))
    }
  }
}
