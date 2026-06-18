// What the side panel shows when you STAND on a tile. An authored `description`
// always wins; otherwise we fall back to a helpful default keyed on the tile's
// role, so interactive tiles explain themselves without per-cell authoring.
// Pure — no DOM, no network — so it's trivially testable.

import type { Cell } from './types'

export type CellDescription = NonNullable<Cell['description']>

export const describeCell = (cell: Cell | undefined): CellDescription | undefined => {
  if (!cell) return undefined
  if (cell.description) return cell.description

  if (cell.radio)
    return {
      title: cell.radio.label ? `📻 ${cell.radio.label}` : '📻 Radio',
      body: 'Music streams while you stand here. Step off the tile to stop.',
    }
  if (cell.audio)
    return {
      title: '🔊 Huddle',
      body: "You're in a huddle — enable audio to listen & talk!",
    }
  if (cell.link)
    return {
      title: '🔗 Link',
      body: 'Click this tile to open it in a new tab.',
    }
  if (cell.door)
    return {
      title: cell.door.label ? `🚪 ${cell.door.label}` : '🚪 Door',
      body: cell.door.label
        ? `Walk onto this door to head to ${cell.door.label}.`
        : 'Walk onto this door to head to another room.',
    }
  return undefined
}
