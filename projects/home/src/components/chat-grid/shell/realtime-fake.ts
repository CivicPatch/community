// In-memory multi-tab backend: BroadcastChannel relays presence/positions/signals
// between tabs on the same origin. No server, no network — enough to prove movement,
// rooms, and even WebRTC (loopback) offline. Swappable for Supabase behind the
// RealtimeBackend interface.

import type { Coord, Player, PlayerId } from '../core/types'
import type { RealtimeBackend, Signal, VoiceState } from './realtime'
import { createEmitter } from './emitter'

type Msg =
  | { kind: 'join'; player: Player }
  | { kind: 'hello'; player: Player }
  | { kind: 'move'; id: PlayerId; coord: Coord }
  | { kind: 'leave'; id: PlayerId }
  | { kind: 'signal'; to: PlayerId; from: PlayerId; signal: Signal }
  | { kind: 'voice'; from: PlayerId; state: VoiceState }
  | { kind: 'enabled'; id: PlayerId; enabled: boolean }

export const createFakeBackend = (channelName = 'chat-grid'): RealtimeBackend => {
  const channel = new BroadcastChannel(channelName)
  const others = new Map<PlayerId, Player>()
  let me: Player | null = null
  const players = createEmitter<Player[]>()
  const signals = createEmitter<{ from: PlayerId; signal: Signal }>()
  const voices = createEmitter<{ from: PlayerId; state: VoiceState }>()

  const emit = () => players.emit([...others.values()])

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
        const p = others.get(msg.id)
        if (p) {
          p.coord = msg.coord
          emit()
        }
        break
      }
      case 'leave':
        if (others.delete(msg.id)) emit()
        break
      case 'signal':
        if (msg.to === me?.id) signals.emit({ from: msg.from, signal: msg.signal })
        break
      case 'voice':
        if (msg.from !== me?.id) voices.emit({ from: msg.from, state: msg.state })
        break
      case 'enabled': {
        const p = others.get(msg.id)
        if (p) {
          p.audioEnabled = msg.enabled
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
    setAudioEnabled(enabled) {
      if (!me) return
      me.audioEnabled = enabled
      channel.postMessage({ kind: 'enabled', id: me.id, enabled } satisfies Msg)
    },
    sendVoice(state) {
      if (!me) return
      channel.postMessage({ kind: 'voice', from: me.id, state } satisfies Msg)
    },
    onVoice(cb) {
      return voices.on(({ from, state }) => cb(from, state))
    },
    leave() {
      if (me) channel.postMessage({ kind: 'leave', id: me.id } satisfies Msg)
      channel.close()
    },
  }
}
