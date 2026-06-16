// WebRTC mesh manager. One RTCPeerConnection per peer, each governed by the pure
// peer FSM (when to open/close). Uses the "perfect negotiation" pattern so two
// peers connecting at once don't deadlock on duelling offers. Signaling rides the
// RealtimeBackend; remote audio streams are emitted for the component to play.

import { getIceServers } from './ice'
import { initialPeer, peerTransition } from '../core/fsm/peer'
import type { PeerEvent, PeerState } from '../core/fsm/peer'
import type { PlayerId } from '../core/types'
import type { RealtimeBackend, Signal } from './realtime'

const UNWANT_DEBOUNCE_MS = 1000 // keep a peer briefly after leaving, to smooth churn

interface PeerRec {
  state: PeerState
  pc: RTCPeerConnection | null
  polite: boolean // perfect-negotiation: the polite peer yields on offer collision
  makingOffer: boolean
  ignoreOffer: boolean
}

export interface MeshAudio {
  /** Provide (or clear) the local mic stream; tracks are added to all peers. */
  setMic(stream: MediaStream | null): void
  /** The set of peers we should be connected to (driven by the room diff). */
  setWantedPeers(ids: PlayerId[]): void
  /** Peers to sever and refuse connections from (local block / moderation). */
  setBlockedPeers(ids: PlayerId[]): void
  /** Remote stream arrived (or cleared, with null) for a peer. */
  onRemoteStream(cb: (peerId: PlayerId, stream: MediaStream | null) => void): () => void
  /** Per-peer connection states, for UI. */
  onPeerStates(cb: (states: Record<PlayerId, PeerState>) => void): () => void
  /** Close all connections. Does not stop the mic (the caller owns it). */
  close(): void
}

export const createMeshAudio = (selfId: PlayerId, backend: RealtimeBackend): MeshAudio => {
  const peers = new Map<PlayerId, PeerRec>()
  const pendingUnwant = new Map<PlayerId, ReturnType<typeof setTimeout>>()
  let blocked = new Set<PlayerId>()
  let localStream: MediaStream | null = null
  let streamListeners: ((id: PlayerId, s: MediaStream | null) => void)[] = []
  let stateListeners: ((states: Record<PlayerId, PeerState>) => void)[] = []

  const emitStates = () => {
    const snap: Record<PlayerId, PeerState> = {}
    peers.forEach((rec, id) => (snap[id] = rec.state))
    for (const cb of stateListeners) cb(snap)
  }
  const emitStream = (id: PlayerId, stream: MediaStream | null) => {
    for (const cb of streamListeners) cb(id, stream)
  }

  const recFor = (id: PlayerId): PeerRec => {
    let rec = peers.get(id)
    if (!rec) {
      rec = { state: initialPeer, pc: null, polite: selfId > id, makingOffer: false, ignoreOffer: false }
      peers.set(id, rec)
    }
    return rec
  }

  const cancelUnwant = (id: PlayerId) => {
    const t = pendingUnwant.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      pendingUnwant.delete(id)
    }
  }

  const dispatch = (id: PlayerId, event: PeerEvent) => {
    const rec = recFor(id)
    const [next, effects] = peerTransition(rec.state, event)
    rec.state = next
    for (const eff of effects) {
      if (eff === 'open') openPeer(id)
      else closePeer(id)
    }
    if (next === 'idle') {
      peers.delete(id) // fully done — forget it
      cancelUnwant(id)
    }
    emitStates()
  }

  const sendDescription = (id: PlayerId, desc: RTCSessionDescription) => {
    backend.sendSignal(
      id,
      desc.type === 'offer'
        ? { kind: 'offer', sdp: desc.sdp }
        : { kind: 'answer', sdp: desc.sdp },
    )
  }

  const openPeer = (id: PlayerId) => {
    const rec = recFor(id)
    if (rec.pc) rec.pc.close() // discard any half-open connection before reopening
    const pc = new RTCPeerConnection({ iceServers: getIceServers() })
    rec.pc = pc
    rec.makingOffer = false
    rec.ignoreOffer = false

    if (localStream) for (const t of localStream.getTracks()) pc.addTrack(t, localStream)

    pc.onnegotiationneeded = async () => {
      try {
        rec.makingOffer = true
        await pc.setLocalDescription()
        if (pc.localDescription) sendDescription(id, pc.localDescription)
      } catch {
        // negotiation will be retried on the next track/ICE change
      } finally {
        rec.makingOffer = false
      }
    }
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) backend.sendSignal(id, { kind: 'ice', candidate: candidate.toJSON() })
    }
    pc.ontrack = ({ streams }) => emitStream(id, streams[0] ?? null)
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState
      if (s === 'connected') dispatch(id, 'established')
      else if (s === 'failed' || s === 'closed') dispatch(id, 'closed')
      // 'disconnected' is often transient — let it try to recover on its own
    }
  }

  const closePeer = (id: PlayerId) => {
    const rec = peers.get(id)
    if (rec?.pc) {
      rec.pc.close()
      rec.pc = null
    }
    backend.sendSignal(id, { kind: 'bye' }) // let the peer tear down immediately too
    emitStream(id, null)
    // confirm the teardown asynchronously to avoid re-entering dispatch()
    queueMicrotask(() => dispatch(id, 'closed'))
  }

  const onSignal = async (from: PlayerId, signal: Signal) => {
    if (blocked.has(from)) {
      backend.sendSignal(from, { kind: 'bye' }) // refuse — we've blocked them
      return
    }
    if (signal.kind === 'bye') {
      dispatch(from, 'unwanted') // peer left — tear down our side now
      return
    }
    if (!peers.get(from)?.pc) {
      // only spin up a connection in response to an offer, and only once we have a
      // mic to contribute — you must enable audio to join the voice chat
      if (localStream && signal.kind === 'offer') dispatch(from, 'wanted')
      else return
    }
    const rec = peers.get(from)
    const pc = rec?.pc
    if (!rec || !pc) return

    try {
      if (signal.kind === 'offer' || signal.kind === 'answer') {
        const desc: RTCSessionDescriptionInit = { type: signal.kind, sdp: signal.sdp }
        const collision =
          signal.kind === 'offer' && (rec.makingOffer || pc.signalingState !== 'stable')
        rec.ignoreOffer = !rec.polite && collision
        if (rec.ignoreOffer) return
        await pc.setRemoteDescription(desc)
        if (signal.kind === 'offer') {
          await pc.setLocalDescription()
          if (pc.localDescription) sendDescription(from, pc.localDescription)
        }
      } else {
        try {
          await pc.addIceCandidate(signal.candidate)
        } catch (err) {
          if (!rec.ignoreOffer) throw err // ignore candidate errors for a discarded offer
        }
      }
    } catch (err) {
      console.debug('[chat-grid] signal error', err)
    }
  }

  const unsubSignal = backend.onSignal(onSignal)

  return {
    setMic(stream) {
      localStream = stream
      if (!stream) return
      peers.forEach((rec) => {
        if (!rec.pc) return
        const senders = rec.pc.getSenders()
        for (const t of stream.getTracks())
          if (!senders.some((s) => s.track === t)) rec.pc!.addTrack(t, stream)
      })
    },
    setWantedPeers(ids) {
      const wanted = new Set(ids)
      for (const id of wanted) {
        cancelUnwant(id) // back (or still here) — don't tear down
        dispatch(id, 'wanted')
      }
      // debounce removals: a peer you briefly leave (walking along a room edge)
      // lingers a moment, so fast movement doesn't thrash connect/disconnect
      for (const id of [...peers.keys()]) {
        if (wanted.has(id) || pendingUnwant.has(id)) continue
        pendingUnwant.set(
          id,
          setTimeout(() => {
            pendingUnwant.delete(id)
            dispatch(id, 'unwanted')
          }, UNWANT_DEBOUNCE_MS),
        )
      }
    },
    setBlockedPeers(ids) {
      blocked = new Set(ids)
      for (const id of blocked) if (peers.has(id)) dispatch(id, 'unwanted') // sever now
    },
    onRemoteStream(cb) {
      streamListeners.push(cb)
      return () => {
        streamListeners = streamListeners.filter((l) => l !== cb)
      }
    },
    onPeerStates(cb) {
      stateListeners.push(cb)
      return () => {
        stateListeners = stateListeners.filter((l) => l !== cb)
      }
    },
    close() {
      unsubSignal()
      for (const t of pendingUnwant.values()) clearTimeout(t)
      pendingUnwant.clear()
      peers.forEach((rec) => rec.pc?.close())
      peers.clear()
      localStream = null
    },
  }
}
