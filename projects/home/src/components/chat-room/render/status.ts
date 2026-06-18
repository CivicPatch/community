// The bottom status line: connection badge, your name + coord, what your audio/huddle
// situation is, and how many others are online. Pure — derived from current state.

import { html } from 'lit'
import type { Coord } from '../core/types'
import type { ConnStatus } from '../core/fsm/session'

export interface StatusDeps {
  status: ConnStatus
  name: string
  myCoord: Coord | null
  audioOn: boolean
  myHuddle: number | null
  /** others in my huddle */
  huddleCount: number
  connectedCount: number
  othersCount: number
}

export const statusBar = (d: StatusDeps) => html`
  <div class="cr-status">
    <span class="cr-badge" data-status=${d.status}>${d.status}</span>
    <strong>${d.name}</strong>
    ${d.myCoord ? html` @ ${d.myCoord.col},${d.myCoord.row}` : ''} ·
    ${d.audioOn
      ? d.myHuddle === null
        ? 'step onto an audio tile to talk'
        : d.huddleCount === 0
          ? 'no one else in this huddle yet'
          : `talking with ${d.connectedCount}`
      : d.myHuddle === null
        ? 'not in a huddle'
        : `huddle #${d.myHuddle} — ${d.huddleCount + 1} here`}
    · ${d.othersCount} other${d.othersCount === 1 ? '' : 's'} online
    <div class="cr-hint">click the room, then move with WASD / arrows or click a cell</div>
  </div>
`
