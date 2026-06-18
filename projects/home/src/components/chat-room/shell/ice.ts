// ICE servers for WebRTC. STUN-only for now: free, no infra, and enough for most
// home networks. The one-line upgrade that rescues peers behind restrictive NAT
// is a TURN entry here — kept behind this single function so adding it never
// touches the rest of the code.
export const getIceServers = (): RTCIceServer[] => [
  { urls: 'stun:stun.l.google.com:19302' },
  // { urls: 'turn:…', username: '…', credential: '…' },  // add when needed
]
