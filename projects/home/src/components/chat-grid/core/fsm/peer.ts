// One machine per remote peer. Models the high-level connection lifecycle so the
// shell can connect and tear down cleanly under rapid room churn (walking in and
// out of audio rooms). The shell owns the actual RTCPeerConnection; this just
// decides WHEN to open or close one, and emits those as effects.

export type PeerState = 'idle' | 'connecting' | 'connected' | 'closing'

export type PeerEvent =
  | 'wanted' // peer is in my audio room — we should be connected
  | 'unwanted' // peer left my room (or I left) — we should not be
  | 'established' // the RTCPeerConnection reached "connected"
  | 'closed' // the RTCPeerConnection fully closed or failed

export type PeerEffect = 'open' | 'close'

export const initialPeer: PeerState = 'idle'

export const peerTransition = (
  state: PeerState,
  event: PeerEvent,
): [PeerState, PeerEffect[]] => {
  switch (state) {
    case 'idle':
      return event === 'wanted' ? ['connecting', ['open']] : ['idle', []]

    case 'connecting':
      if (event === 'established') return ['connected', []]
      if (event === 'unwanted') return ['closing', ['close']]
      if (event === 'closed') return ['idle', []] // failed before connecting
      return ['connecting', []]

    case 'connected':
      if (event === 'unwanted') return ['closing', ['close']]
      if (event === 'closed') return ['idle', []] // lost
      return ['connected', []]

    case 'closing':
      if (event === 'closed') return ['idle', []]
      // wanted again before teardown finished — reopen (shell's `open` is
      // responsible for discarding any half-closed connection first)
      if (event === 'wanted') return ['connecting', ['open']]
      return ['closing', []]
  }
}
