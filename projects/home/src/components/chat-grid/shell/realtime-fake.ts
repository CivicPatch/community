// In-memory multi-tab backend: BroadcastChannel relays presence between tabs on
// the same origin. No server, no network — just enough to prove movement & rooms.
// Swappable for the real Supabase backend behind the RealtimeBackend interface.

import type { Coord, Player, PlayerId } from '../core/types'
import type { RealtimeBackend } from './realtime'

type Msg =
  | { kind: 'join'; player: Player }
  | { kind: 'hello'; player: Player }
  | { kind: 'move'; id: PlayerId; coord: Coord }
  | { kind: 'leave'; id: PlayerId }

export const createFakeBackend = (channelName = 'chat-grid'): RealtimeBackend => {
  const channel = new BroadcastChannel(channelName)
  const others = new Map<PlayerId, Player>()
  let me: Player | null = null
  let listeners: ((others: Player[]) => void)[] = []

  const emit = () => {
    const snapshot = [...others.values()]
    for (const cb of listeners) cb(snapshot)
  }

  channel.onmessage = (e: MessageEvent<Msg>) => {
    const msg = e.data
    switch (msg.kind) {
      case 'join':
        if (msg.player.id === me?.id) return
        others.set(msg.player.id, msg.player)
        // tell the newcomer we already exist
        if (me) channel.postMessage({ kind: 'hello', player: me } satisfies Msg)
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
      listeners.push(cb)
      cb([...others.values()])
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    },
    onStatus(cb) {
      cb('connected') // the local fake is always "connected"
      return () => {}
    },
    leave() {
      if (me) channel.postMessage({ kind: 'leave', id: me.id } satisfies Msg)
      channel.close()
    },
  }
}
