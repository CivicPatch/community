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

export interface RealtimeBackend {
  /** Announce self and begin syncing presence. */
  join(me: Player): void
  /** Broadcast my new position. */
  updatePosition(coord: Coord): void
  /** Subscribe to the set of OTHER players. Returns an unsubscribe fn. */
  onPlayers(cb: (others: Player[]) => void): () => void
  /** Subscribe to connection status. Fires immediately with the current value. */
  onStatus(cb: (status: ConnStatus) => void): () => void
  /** Send a WebRTC signal to one specific peer. */
  sendSignal(to: PlayerId, signal: Signal): void
  /** Receive WebRTC signals addressed to me. Returns an unsubscribe fn. */
  onSignal(cb: (from: PlayerId, signal: Signal) => void): () => void
  /** Clean disconnect. */
  leave(): void
}
