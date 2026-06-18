// In-memory multi-tab backend: BroadcastChannel relays presence/positions/signals
// between tabs on the same origin. No server, no network — enough to prove movement,
// huddles, and even WebRTC (loopback) offline. Swappable for Supabase behind the
// RealtimeBackend interface.

import type { Coord, Player, PlayerId } from '../core/types'
import type { RealtimeBackend, Signal, VoiceState } from './realtime'
import { createEmitter } from './emitter'
import { createTravelAnimator } from './travel'

type Msg =
  | { kind: 'join'; player: Player }
  | { kind: 'hello'; player: Player }
  | { kind: 'move'; id: PlayerId; coord: Coord }
  | { kind: 'travel'; id: PlayerId; path: Coord[] }
  | { kind: 'leave'; id: PlayerId }
  | { kind: 'signal'; to: PlayerId; from: PlayerId; signal: Signal }
  | { kind: 'voice'; from: PlayerId; state: VoiceState }
  | { kind: 'update'; id: PlayerId; patch: Partial<Player> }

export const createFakeBackend = (channelName = 'chat-room'): RealtimeBackend => {
  const channel = new BroadcastChannel(channelName)
  const others = new Map<PlayerId, Player>()
  let me: Player | null = null
  const players = createEmitter<Player[]>()
  const signals = createEmitter<{ from: PlayerId; signal: Signal }>()
  const voices = createEmitter<{ from: PlayerId; state: VoiceState }>()
  const walks = createTravelAnimator()

  const emit = () => players.emit([...others.values()])
  const setCoord = (id: PlayerId, coord: Coord) => {
    const p = others.get(id)
    if (p) {
      p.coord = coord
      emit()
    }
  }

  channel.onmessage = (e: MessageEvent<Msg>) => {
    const msg = e.data
    switch (msg.kind) {
      case 'join':
        if (msg.player.id === me?.id) return
        others.set(msg.player.id, msg.player)
        if (me) channel.postMessage({ kind: 'hello', player: me } satisfies Msg) // tell the newcomer we exist
        emit()
        break
      case 'hello':
        if (msg.player.id === me?.id) return
        others.set(msg.player.id, msg.player)
        emit()
        break
      case 'move': {
        // a discrete move supersedes an in-flight walk, unless it merely confirms
        // the destination that walk is already heading to (let it finish smoothly)
        if (walks.headedTo(msg.id, msg.coord)) break
        walks.cancel(msg.id)
        setCoord(msg.id, msg.coord)
        break
      }
      case 'travel':
        if (others.has(msg.id)) walks.travel(msg.id, msg.path, (coord) => setCoord(msg.id, coord))
        break
      case 'leave':
        walks.cancel(msg.id)
        if (others.delete(msg.id)) emit()
        break
      case 'signal':
        if (msg.to === me?.id) signals.emit({ from: msg.from, signal: msg.signal })
        break
      case 'voice':
        if (msg.from !== me?.id) voices.emit({ from: msg.from, state: msg.state })
        break
      case 'update': {
        const p = others.get(msg.id)
        if (p) {
          Object.assign(p, msg.patch)
          emit()
        }
        break
      }
    }
  }

  return {
    join(player) {
      me = player
      channel.postMessage({ kind: 'join', player } satisfies Msg)
    },
    updatePosition(coord) {
      if (!me) return
      me.coord = coord
      channel.postMessage({ kind: 'move', id: me.id, coord } satisfies Msg)
    },
    travelTo(path) {
      if (!me || !path.length) return
      channel.postMessage({ kind: 'travel', id: me.id, path } satisfies Msg)
    },
    onPlayers(cb) {
      cb([...others.values()])
      return players.on(cb)
    },
    onStatus(cb) {
      cb('connected') // the local fake is always "connected"
      return () => {}
    },
    sendSignal(to, signal) {
      if (!me) return
      channel.postMessage({ kind: 'signal', to, from: me.id, signal } satisfies Msg)
    },
    onSignal(cb) {
      return signals.on(({ from, signal }) => cb(from, signal))
    },
    updateSelf(patch) {
      if (!me) return
      Object.assign(me, patch)
      channel.postMessage({ kind: 'update', id: me.id, patch } satisfies Msg)
    },
    sendVoice(state) {
      if (!me) return
      channel.postMessage({ kind: 'voice', from: me.id, state } satisfies Msg)
    },
    onVoice(cb) {
      return voices.on(({ from, state }) => cb(from, state))
    },
    leave() {
      walks.cancelAll()
      if (me) channel.postMessage({ kind: 'leave', id: me.id } satisfies Msg)
      channel.close()
    },
  }
}
