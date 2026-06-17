// Imperative-shell boundary: the pluggable realtime backend.
// Phase 0 = BroadcastChannel fake. Later: Supabase impl, extended with WebRTC
// signaling. Everything else in the app depends on THIS interface, not the impl,
// so the backend choice stays swappable.

import type { Coord, Player, PlayerId } from '../core/types'
import type { ConnStatus } from '../core/fsm/session'

/** WebRTC signaling payloads, relayed peer-to-peer over the realtime channel. */
export type Signal =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'bye' } // "I'm disconnecting" — lets the peer tear down immediately

/** Speaking state, broadcast to EVERYONE so avatars react grid-wide, not just to
 *  people you're connected to. */
export interface VoiceState {
  speaking: boolean
  bucket: number
  muted: boolean
}

export interface RealtimeBackend {
  /** Announce self and begin syncing presence. */
  join(me: Player): void
  /** Broadcast my new position (a single discrete move: keyboard step, settle, hop). */
  updatePosition(coord: Coord): void
  /** Announce a click-to-travel as one message: the ordered cells I'm about to walk
   *  (last = destination). Receivers replay it locally, so a whole trip costs one
   *  broadcast instead of one per cell. */
  travelTo(path: Coord[]): void
  /** Subscribe to the set of OTHER players. Returns an unsubscribe fn. */
  onPlayers(cb: (others: Player[]) => void): () => void
  /** Subscribe to connection status. Fires immediately with the current value. */
  onStatus(cb: (status: ConnStatus) => void): () => void
  /** Send a WebRTC signal to one specific peer. */
  sendSignal(to: PlayerId, signal: Signal): void
  /** Receive WebRTC signals addressed to me. Returns an unsubscribe fn. */
  onSignal(cb: (from: PlayerId, signal: Signal) => void): () => void
  /** Merge a patch into my own presence-synced fields (audioEnabled, status, …), so
   *  everyone sees the change. Sticky — survives for latecomers via presence. */
  updateSelf(patch: Partial<Player>): void
  /** Broadcast my speaking state to everyone (for grid-wide avatar reactions). */
  sendVoice(state: VoiceState): void
  /** Receive others' speaking state. Returns an unsubscribe fn. */
  onVoice(cb: (from: PlayerId, state: VoiceState) => void): () => void
  /** Clean disconnect. */
  leave(): void
}
