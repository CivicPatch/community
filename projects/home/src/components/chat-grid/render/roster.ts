// Roster rows. `full` rows (your audio blob) are real peers — connection dot,
// connecting state, and the mute/block menu. Light rows (rest of the grid) are
// presence-only: avatar, name, status.
//
// Presentational: `makeRosterRow` closes over the component's current state +
// callbacks and returns the per-row renderer the template maps over. No state of
// its own — re-created each render, like the inline closures it replaces.

import { html } from 'lit'
import type { Player } from '../core/types'
import type { PeerState } from '../core/fsm/peer'

const STATUS_PREVIEW = 80 // roster status chars shown inline before a "more" badge → modal

export interface RosterDeps {
  peerStates: Record<string, PeerState>
  mutedPeers: Set<string>
  blockedPeers: Set<string>
  menuOpenFor: string | null
  setMenuOpenFor: (id: string | null) => void
  toggleMutePeer: (id: string) => void
  toggleBlockPeer: (id: string) => void
  /** open the full status in a modal (long statuses are truncated inline). */
  onShowStatus: (name: string, text: string) => void
}

// Roster status: show up to STATUS_PREVIEW chars inline (wrapped); if the full
// status is longer, append a "more" badge that opens it in a modal.
const statusCell = (p: Player, onShowStatus: RosterDeps['onShowStatus']) => {
  const s = p.status ?? ''
  if (s.length <= STATUS_PREVIEW)
    return html`<span class="cg-roster-saying" title=${s}>${s}</span>`
  return html`<span class="cg-roster-saying" title=${s}
    >${s.slice(0, STATUS_PREVIEW).trimEnd()}…<button
      class="cg-roster-more"
      @click=${() => onShowStatus(p.name, s)}
    >
      more</button
    ></span
  >`
}

export const makeRosterRow =
  (deps: RosterDeps) =>
  (p: Player, full: boolean) => {
    const connected = deps.peerStates[p.id] === 'connected'
    const isMuted = deps.mutedPeers.has(p.id)
    const isBlocked = deps.blockedPeers.has(p.id)
    const menuOpen = deps.menuOpenFor === p.id
    const act = (fn: () => void) => () => {
      fn()
      deps.setMenuOpenFor(null)
    }
    // green ring mirrors the grid token: blob peers ring once actually connected,
    // grid people ring when their mic is enabled (presence-synced).
    const ringOn = full ? connected : !!p.audioEnabled
    return html`<li class="cg-roster-item ${isBlocked ? 'cg-blocked' : ''}">
      <span class="cg-roster-avatar ${ringOn ? 'cg-ring' : ''}" aria-hidden="true">${p.avatar || '●'}</span>
      <span class="cg-roster-name">${p.name}</span>
      ${p.status ? statusCell(p, deps.onShowStatus) : ''}
      <span class="cg-visually-hidden">
        ${isBlocked
          ? 'blocked'
          : full
            ? connected
              ? 'connected'
              : 'connecting'
            : p.audioEnabled
              ? 'audio on'
              : 'audio off'}${isMuted ? ', muted' : ''}
      </span>
      ${full
        ? html`
            <button
              class="cg-btn cg-roster-menu-btn"
              aria-haspopup="menu"
              aria-expanded=${menuOpen}
              aria-label=${`Actions for ${p.name}`}
              @keydown=${(e: KeyboardEvent) => e.key === 'Escape' && deps.setMenuOpenFor(null)}
              @click=${() => deps.setMenuOpenFor(menuOpen ? null : p.id)}
            >
              ⋯
            </button>
            ${menuOpen
              ? html`<div class="cg-roster-menu" role="menu">
                  ${isBlocked
                    ? html`<button class="cg-btn" role="menuitem" @click=${act(() => deps.toggleBlockPeer(p.id))}>
                        Unblock
                      </button>`
                    : html`<button class="cg-btn" role="menuitem" @click=${act(() => deps.toggleMutePeer(p.id))}>
                          ${isMuted ? 'Unmute' : 'Mute'}
                        </button>
                        <button class="cg-btn" role="menuitem" @click=${act(() => deps.toggleBlockPeer(p.id))}>
                          Block
                        </button>`}
                </div>`
              : ''}
          `
        : ''}
    </li>`
  }
