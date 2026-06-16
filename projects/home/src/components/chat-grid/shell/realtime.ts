// Imperative-shell boundary: the pluggable realtime backend.
// Phase 0 = BroadcastChannel fake. Later: Supabase impl, extended with WebRTC
// signaling. Everything else in the app depends on THIS interface, not the impl,
// so the backend choice stays swappable.

import type { Coord, Player } from '../core/types'
import type { ConnStatus } from '../core/fsm/session'

export interface RealtimeBackend {
  /** Announce self and begin syncing presence. */
  join(me: Player): void
  /** Broadcast my new position. */
  updatePosition(coord: Coord): void
  /** Subscribe to the set of OTHER players. Returns an unsubscribe fn. */
  onPlayers(cb: (others: Player[]) => void): () => void
  /** Subscribe to connection status. Fires immediately with the current value. */
  onStatus(cb: (status: ConnStatus) => void): () => void
  /** Clean disconnect. */
  leave(): void
}
