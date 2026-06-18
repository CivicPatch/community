// The grid tiles: one <button> per coord (or a real <a> for link kiosks), with the
// composed background (colour + image), role classes, and a hover popover for tiles
// that carry a description. Pure render off current room/huddle state + handlers.

import { html } from 'lit'
import type { TemplateResult } from 'lit'
import type { Coord, Room } from '../core/types'
import { cellAt } from '../core/room'
import { huddleOf } from '../core/huddles'
import { readableInk } from '../core/color'
import { renderCellGlyph } from './cell'
import { popover } from './popover'

export interface CellsDeps {
  room: Room
  huddles: Map<string, number>
  myHuddle: number | null
  mapMode: boolean
  popAlign: (col: number) => 'left' | 'right' | undefined
  onCellClick: (c: Coord) => void
}

export const renderCells = ({
  room,
  huddles,
  myHuddle,
  mapMode,
  popAlign,
  onCellClick,
}: CellsDeps): (TemplateResult | string)[] => {
  const cells: (TemplateResult | string)[] = []
  for (let row = 0; row < room.rows; row++) {
    for (let col = 0; col < room.columns; col++) {
      const coord = { col, row }
      const cell = cellAt(room, coord)
      const isAudioCell = cell?.audio === true
      const isRadioCell = !!cell?.radio
      const link = cell?.link ?? null
      const wall = cell?.walkable === false
      const hasDesc = !!cell?.description
      const activeHuddle = isAudioCell && myHuddle !== null && huddleOf(huddles, coord) === myHuddle
      const classes = ['cr-cell']
      if (isAudioCell) classes.push('cr-audio')
      if (isRadioCell) classes.push('cr-radio')
      if (activeHuddle) classes.push('cr-active-huddle')
      if (link) classes.push('cr-link')
      if (hasDesc) classes.push('cr-has-desc')
      if (wall) classes.push('cr-wall')
      // compose the visual background: colour fill + image, both optional. A
      // user-set colour doesn't track the theme, so derive a legible glyph colour
      // from it (else fall back to the theme text colour).
      const ink = cell?.color ? readableInk(cell.color) : undefined
      const bg = [
        cell?.color ? `background-color:${cell.color}` : '',
        ink ? `color:${ink}` : '',
        cell?.image ? `background-image:url(${cell.image});background-size:cover;background-position:center` : '',
      ]
        .filter(Boolean)
        .join(';')
      // hover/focus preview popover (title + body), pure CSS — no JS state. The
      // FULL description (with links) shows in the side panel when you STAND here.
      const desc = cell?.description
      const pop = hasDesc
        ? popover({ title: desc?.title, body: desc?.body, below: row === 0, align: popAlign(col) })
        : ''
      cells.push(
        link
          ? // a real anchor: native new-tab, middle-click, screen-reader "link", no popup-blocker
            html`<a
              class=${classes.join(' ')}
              style=${bg}
              href=${link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label=${`Open link: ${link.label ?? link.url}`}
              @click=${(e: Event) => {
                if (mapMode) {
                  e.preventDefault() // edit the tile instead of following the link
                  onCellClick(coord)
                }
              }}
              >${renderCellGlyph(cell)}${pop}</a
            >`
          : html`<button
              class=${classes.join(' ')}
              style=${bg}
              ?disabled=${wall}
              tabindex="-1"
              title=${`${col},${row}`}
              @click=${() => onCellClick(coord)}
            >
              ${renderCellGlyph(cell)}${pop}
            </button>`,
      )
    }
  }
  return cells
}
