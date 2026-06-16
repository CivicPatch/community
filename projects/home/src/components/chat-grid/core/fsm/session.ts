// Status-only session FSM. Supabase auto-retries transient drops, so this does
// NOT schedule retries — it maps SEMANTIC connection events to a UI status.
//
// `offline` means ONLY that we intentionally left. An unexpected close is a
// `dropped` (-> reconnecting) and the adapter actively rejoins; this is the bit
// that was missing, which left the badge stuck on "offline" after a CLOSED.

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export type SessionEvent =
  | 'subscribed' // channel is live
  | 'dropped' // unexpected error/timeout/close — recoverable
  | 'left' // we deliberately disconnected — terminal

export const initialStatus: ConnStatus = 'connecting'

export const nextStatus = (current: ConnStatus, event: SessionEvent): ConnStatus => {
  switch (event) {
    case 'subscribed':
      return 'connected'
    case 'dropped':
      // before the first successful connect we're still just "connecting"
      return current === 'connecting' ? 'connecting' : 'reconnecting'
    case 'left':
      return 'offline'
  }
}
