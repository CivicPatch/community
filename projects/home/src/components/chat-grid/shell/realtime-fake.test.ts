// Integration test: drive the REAL realtime-fake protocol with two/three clients
// through an in-memory transport — no network, no Supabase, no ghost players in
// prod presence. Proves the multi-client contract (RealtimeBackend) that both the
// fake AND the Supabase impl must honor: presence handshake, movement, leave,
// addressed signals, grid-wide voice, sticky self-patches.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Player, PlayerId } from '../core/types'
import type { Signal, VoiceState } from './realtime'
import { createFakeBackend } from './realtime-fake'

// Synchronous in-memory BroadcastChannel: delivers each message to every OTHER
// channel of the same name. Real BC semantics — the sender never hears itself.
class FakeBC {
  static buses = new Map<string, Set<FakeBC>>()
  onmessage: ((e: { data: unknown }) => void) | null = null
  name: string
  private peers: Set<FakeBC>
  constructor(name: string) {
    this.name = name
    this.peers = FakeBC.buses.get(name) ?? new Set<FakeBC>()
    FakeBC.buses.set(name, this.peers)
    this.peers.add(this)
  }
  postMessage(data: unknown) {
    for (const ch of [...this.peers]) if (ch !== this) ch.onmessage?.({ data })
  }
  close() {
    this.peers.delete(this)
  }
}

const player = (id: string, col = 0, row = 0): Player => ({ id, name: id, coord: { col, row } })

// A client = a backend plus captured views of what it has observed.
const client = (id: string, col = 0, row = 0) => {
  const backend = createFakeBackend()
  let others: Player[] = []
  const signals: { from: PlayerId; signal: Signal }[] = []
  const voices: { from: PlayerId; state: VoiceState }[] = []
  backend.onPlayers((o) => (others = o))
  backend.onSignal((from, signal) => signals.push({ from, signal }))
  backend.onVoice((from, state) => voices.push({ from, state }))
  backend.join(player(id, col, row))
  return {
    backend,
    ids: () => others.map((p) => p.id).sort(),
    see: (peerId: string) => others.find((p) => p.id === peerId),
    signals,
    voices,
  }
}

describe('realtime-fake multi-client protocol', () => {
  beforeEach(() => vi.stubGlobal('BroadcastChannel', FakeBC))
  afterEach(() => {
    FakeBC.buses.clear()
    vi.unstubAllGlobals()
  })

  it('an existing peer and a newcomer discover each other (hello handshake)', () => {
    const a = client('a')
    const b = client('b') // b joins after a; the hello reply makes the link mutual
    expect(a.ids()).toEqual(['b'])
    expect(b.ids()).toEqual(['a'])
  })

  it('three clients all see each other', () => {
    const a = client('a')
    const b = client('b')
    const c = client('c')
    expect(a.ids()).toEqual(['b', 'c'])
    expect(b.ids()).toEqual(['a', 'c'])
    expect(c.ids()).toEqual(['a', 'b'])
  })

  it('a position update propagates to peers', () => {
    const a = client('a')
    const b = client('b')
    a.backend.updatePosition({ col: 5, row: 7 })
    expect(b.see('a')?.coord).toEqual({ col: 5, row: 7 })
  })

  it('leave removes the player from peers', () => {
    const a = client('a')
    const b = client('b')
    a.backend.leave()
    expect(b.ids()).toEqual([])
  })

  it('a signal reaches only the addressed peer', () => {
    const a = client('a')
    const b = client('b')
    const c = client('c')
    const offer: Signal = { kind: 'offer', sdp: 'v=0...' }
    a.backend.sendSignal('b', offer)
    expect(b.signals).toEqual([{ from: 'a', signal: offer }])
    expect(c.signals).toEqual([]) // not addressed to c
    expect(a.signals).toEqual([]) // sender never hears itself
  })

  it('voice broadcasts to everyone except the sender', () => {
    const a = client('a')
    const b = client('b')
    const c = client('c')
    const state: VoiceState = { speaking: true, bucket: 3, muted: false }
    a.backend.sendVoice(state)
    expect(b.voices).toEqual([{ from: 'a', state }])
    expect(c.voices).toEqual([{ from: 'a', state }])
    expect(a.voices).toEqual([]) // grid-wide, but not back to self
  })

  it('updateSelf patches propagate to peers as sticky presence fields', () => {
    const a = client('a')
    const b = client('b')
    a.backend.updateSelf({ status: 'brb', audioEnabled: true })
    expect(b.see('a')?.status).toBe('brb')
    expect(b.see('a')?.audioEnabled).toBe(true)
  })

  it('reports connected status immediately', () => {
    const backend = createFakeBackend()
    const seen: string[] = []
    backend.onStatus((s) => seen.push(s))
    expect(seen).toEqual(['connected'])
  })
})
