// Map-editor cell panel: the form shown in the 'cell' overlay. A self-contained
// sub-feature — both the edit logic (role/glyph exclusivity, link/radio/description
// fields, commit/clear) and its view live here. `makeCellEditor` closes over the
// working-cell state + config-commit callbacks and returns the renderer the overlay
// drops in. State itself (editCell, config) stays in the component, since movement
// and the editor toggle also touch it.

import { html } from 'lit'
import type { Cell, RoomConfig } from '../core/types'
import { clearCell, setCell } from '../core/edit'

// labels for the mutually-exclusive pickers in the cell editor
const ROLE_LABELS = { floor: 'Floor', wall: 'Wall', audio: '🔊 Audio', radio: '📻 Radio', link: '🔗 Link' } as const
const GLYPH_LABELS = { none: 'None', char: 'Character', svg: 'Inline SVG' } as const

export interface CellEditorDeps {
  editCell: Cell | null
  setEditCell: (cell: Cell | null) => void
  config: RoomConfig | null
  editConfig: (c: RoomConfig) => void
}

// A tile is exactly ONE of these (mutually exclusive behavior). Derived from the
// cell so the radio always reflects the real state — no separate UI flag to desync.
const cellRole = (c: Cell): 'floor' | 'wall' | 'audio' | 'radio' | 'link' =>
  c.link ? 'link' : c.radio ? 'radio' : c.audio ? 'audio' : c.walkable === false ? 'wall' : 'floor'

// Foreground glyph: char and inline SVG are mutually exclusive (only one renders).
const cellGlyph = (c: Cell): 'none' | 'char' | 'svg' =>
  c.char !== undefined ? 'char' : c.svg !== undefined ? 'svg' : 'none'

export const makeCellEditor = (deps: CellEditorDeps) => {
  const { editCell, setEditCell, config, editConfig } = deps

  const editPatch = (patch: Partial<Cell>) => editCell && setEditCell({ ...editCell, ...patch })

  const setRole = (role: ReturnType<typeof cellRole>) => {
    // each role is exclusive: clear the others. radio is walkable (you stand on it).
    if (role === 'link')
      editPatch({ link: editCell?.link ?? { url: '' }, radio: undefined, audio: undefined, walkable: false })
    else if (role === 'radio')
      editPatch({ radio: editCell?.radio ?? { url: '' }, link: undefined, audio: undefined, walkable: undefined })
    else if (role === 'audio') editPatch({ audio: true, radio: undefined, link: undefined, walkable: undefined })
    else if (role === 'wall') editPatch({ walkable: false, audio: undefined, radio: undefined, link: undefined })
    else editPatch({ walkable: undefined, audio: undefined, radio: undefined, link: undefined })
  }

  const setGlyph = (g: ReturnType<typeof cellGlyph>) => {
    if (g === 'char') editPatch({ char: editCell?.char ?? '', svg: undefined })
    else if (g === 'svg') editPatch({ svg: editCell?.svg ?? '', char: undefined })
    else editPatch({ char: undefined, svg: undefined })
  }

  const applyEdit = () => {
    if (config && editCell) {
      // drop fields the user revealed but left blank, so they don't pollute the JSON
      const c: Cell = { ...editCell }
      if (c.char === '') delete c.char
      if (c.svg === '') delete c.svg
      if (c.link && !c.link.url.trim()) {
        delete c.link
        if (c.walkable === false) delete c.walkable // an unfinished link reverts to floor
      }
      if (c.radio && !c.radio.url.trim()) delete c.radio // an unfinished radio reverts to floor
      editConfig(setCell(config, c))
    }
    setEditCell(null)
  }

  const clearEditedCell = () => {
    if (config && editCell) editConfig(clearCell(config, editCell.coord))
    setEditCell(null)
  }

  const editLink = (field: 'url' | 'label', value: string) => {
    const cur = editCell?.link
    const url = (field === 'url' ? value : (cur?.url ?? '')).trim()
    const label = (field === 'label' ? value : (cur?.label ?? '')).trim() || undefined
    // a link is a non-walkable kiosk: setting one forces walkable:false; clearing resets it
    editPatch(url ? { link: { url, label }, walkable: false } : { link: undefined, walkable: undefined })
  }

  const editRadio = (field: 'url' | 'label', value: string) => {
    const cur = editCell?.radio
    const url = (field === 'url' ? value : (cur?.url ?? '')).trim()
    const label = (field === 'label' ? value : (cur?.label ?? '')).trim() || undefined
    // a radio tile stays WALKABLE — you stand on it to listen
    editPatch({ radio: { url, label } })
  }

  const editDesc = (patch: Partial<NonNullable<Cell['description']>>) => {
    const d = { ...(editCell?.description ?? {}), ...patch }
    const empty = !d.title && !d.body && !d.links?.length
    editPatch({ description: empty ? undefined : d })
  }

  const editDescLink = (field: 'url' | 'label', value: string) => {
    const cur = editCell?.description?.links?.[0]
    const url = (field === 'url' ? value : (cur?.url ?? '')).trim()
    const label = (field === 'label' ? value : (cur?.label ?? '')).trim()
    editDesc({ links: url ? [{ url, label: label || url }] : undefined })
  }

  return (cell: Cell) => {
    const val = (e: Event) => (e.target as HTMLInputElement).value
    const role = cellRole(cell)
    const glyph = cellGlyph(cell)
    return html`
        <h3 class="cr-modal-title">Cell ${cell.coord.col}, ${cell.coord.row}</h3>
        <div class="cr-field cr-field-col">
          <label>This tile is…</label>
          <div class="cr-seg" role="radiogroup" aria-label="Tile type">
            ${(['floor', 'wall', 'audio', 'radio', 'link'] as const).map(
              (r) => html`<label class="cr-seg-opt ${role === r ? 'cr-seg-on' : ''}">
                <input type="radio" name="cr-role" .checked=${role === r} @change=${() => setRole(r)} />
                <span>${ROLE_LABELS[r]}</span>
              </label>`,
            )}
          </div>
          ${role === 'link'
            ? html`<div class="cr-subfields">
                <input
                  type="url"
                  placeholder="https://… (link URL)"
                  .value=${cell.link?.url ?? ''}
                  @input=${(e: Event) => editLink('url', val(e))}
                />
                <input
                  placeholder="label / icon (e.g. 📹)"
                  .value=${cell.link?.label ?? ''}
                  @input=${(e: Event) => editLink('label', val(e))}
                />
              </div>`
            : ''}
          ${role === 'radio'
            ? html`<div class="cr-subfields">
                <input
                  type="url"
                  placeholder="https://… (stream URL, e.g. a SomaFM station)"
                  .value=${cell.radio?.url ?? ''}
                  @input=${(e: Event) => editRadio('url', val(e))}
                />
                <input
                  placeholder="station name (e.g. Groove Salad)"
                  .value=${cell.radio?.label ?? ''}
                  @input=${(e: Event) => editRadio('label', val(e))}
                />
              </div>`
            : ''}
        </div>
        <div class="cr-field">
          <label>Color</label>
          <input
            type="color"
            .value=${cell.color ?? '#888888'}
            @input=${(e: Event) => editPatch({ color: val(e) })}
          />
          ${cell.color
            ? html`<button class="cr-btn" @click=${() => editPatch({ color: undefined })}>clear</button>`
            : ''}
        </div>
        <div class="cr-field">
          <label>Image URL</label>
          <input
            type="url"
            .value=${cell.image ?? ''}
            @input=${(e: Event) => editPatch({ image: val(e) || undefined })}
          />
        </div>
        <div class="cr-field cr-field-col">
          <label>Glyph</label>
          <div class="cr-seg" role="radiogroup" aria-label="Glyph">
            ${(['none', 'char', 'svg'] as const).map(
              (g) => html`<label class="cr-seg-opt ${glyph === g ? 'cr-seg-on' : ''}">
                <input type="radio" name="cr-glyph" .checked=${glyph === g} @change=${() => setGlyph(g)} />
                <span>${GLYPH_LABELS[g]}</span>
              </label>`,
            )}
          </div>
          ${glyph === 'char'
            ? html`<input
                class="cr-subfields"
                maxlength="2"
                placeholder="a character (e.g. ★)"
                .value=${cell.char ?? ''}
                @input=${(e: Event) => editPatch({ char: val(e) })}
              />`
            : ''}
          ${glyph === 'svg'
            ? html`<textarea
                class="cr-subfields"
                rows="3"
                placeholder="<svg …>…</svg>"
                .value=${cell.svg ?? ''}
                @input=${(e: Event) => editPatch({ svg: val(e) })}
              ></textarea>`
            : ''}
        </div>
        <fieldset class="cr-fieldset">
          <legend>Description — hover preview & side panel when standing</legend>
          <input
            placeholder="title"
            .value=${cell.description?.title ?? ''}
            @input=${(e: Event) => editDesc({ title: val(e) || undefined })}
          />
          <textarea
            placeholder="body"
            rows="2"
            .value=${cell.description?.body ?? ''}
            @input=${(e: Event) => editDesc({ body: val(e) || undefined })}
          ></textarea>
          <input
            type="url"
            placeholder="link url (e.g. a Meet link)"
            .value=${cell.description?.links?.[0]?.url ?? ''}
            @input=${(e: Event) => editDescLink('url', val(e))}
          />
          <input
            placeholder="link label"
            .value=${cell.description?.links?.[0]?.label ?? ''}
            @input=${(e: Event) => editDescLink('label', val(e))}
          />
        </fieldset>
        <div class="cr-modal-actions">
          <button class="cr-btn" @click=${() => setEditCell(null)}>Cancel</button>
          <button class="cr-btn" @click=${clearEditedCell}>Clear cell</button>
          <button class="cr-btn cr-btn-primary" @click=${applyEdit}>Apply</button>
        </div>
    `
  }
}
