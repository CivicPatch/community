// Real backend: Supabase Realtime, entirely client-side (no server we run).
//
//   • Presence  -> roster membership (tracked once on join; quiet & stable)
//   • Broadcast -> positions + WebRTC signaling (frequent, ephemeral)
//
// The fiddly bits live elsewhere: roster membership + presence grace in roster.ts,
// listener plumbing in emitter.ts, connection status in the session FSM. This file
// is just the wiring between Supabase and those.

import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Coord, Player, PlayerId } from '../core/types'
import type { RealtimeBackend, Signal } from './realtime'
import { initialStatus, nextStatus } from '../core/fsm/session'
import type { ConnStatus, SessionEvent } from '../core/fsm/session'
import { createEmitter } from './emitter'
import { createRoster } from './roster'

const REJOIN_DELAY_MS = 1500
const PRESENCE_GRACE_MS = 6000

type MovePayload = { id: PlayerId; coord: Coord }
type SignalPayload = { to: PlayerId; from: PlayerId; signal: Signal }

export const createSupabaseBackend = (
  url: string,
  key: string,
  channelName = 'chat-grid',
): RealtimeBackend => {
  const client = createClient(url, key)
  let channel: RealtimeChannel | null = null
  let me: Player | null = null
  let leaving = false // set only by leave(); distinguishes intentional close

  const players = createEmitter<Player[]>()
  const signals = createEmitter<{ from: PlayerId; signal: Signal }>()
  const statuses = createEmitter<ConnStatus>()
  const roster = createRoster({ graceMs: PRESENCE_GRACE_MS, onChange: players.emit })

  let status: ConnStatus = initialStatus
  const dispatch = (event: SessionEvent) => {
    status = nextStatus(status, event)
    statuses.emit(status)
  }

  // Flatten presence into the OTHER players, deduped by id (a reconnecting peer
  // can momentarily appear under two presence refs).
  const presentOthers = (): Player[] => {
    if (!channel) return []
    const state = channel.presenceState<{ player: Player }>()
    const byId = new Map<PlayerId, Player>()
    for (const presenceKey of Object.keys(state))
      for (const entry of state[presenceKey])
        if (entry.player.id !== me?.id) byId.set(entry.player.id, entry.player)
    return [...byId.values()]
  }

  // fire-and-forget; positions/signals are idempotent or naturally re-sent, so a
  // transient send failure must never throw into the caller
  const send = (event: 'move' | 'signal', payload: MovePayload | SignalPayload) => {
    if (!channel) return
    try {
      Promise.resolve(channel.send({ type: 'broadcast', event, payload })).catch(() => {})
    } catch {
      /* ignore */
    }
  }
  const broadcastMove = () => me && send('move', { id: me.id, coord: me.coord })

  // Supabase auto-retries CHANNEL_ERROR/TIMED_OUT, but a CLOSED channel does not
  // rejoin itself — so we rebuild it on an unexpected close.
  const connect = () => {
    const player = me
    if (!player) return
    const ch = client.channel(channelName, {
      config: { presence: { key: player.id }, broadcast: { self: false } },
    })
    channel = ch
    ch.on('presence', { event: 'sync' }, () => roster.applyPresence(presentOthers()))
      .on('presence', { event: 'join' }, () => {
        roster.applyPresence(presentOthers())
        broadcastMove() // a newcomer doesn't know where we've moved to — re-announce
      })
      .on('presence', { event: 'leave' }, () => roster.applyPresence(presentOthers()))
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        const { id, coord } = payload as MovePayload
        if (id !== me?.id) roster.updateCoord(id, coord)
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const { to, from, signal } = payload as SignalPayload
        if (to === me?.id) signals.emit({ from, signal })
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') {
          dispatch('subscribed')
          ch.track({ player }) // presence: ONCE, just to appear in the roster
        } else if (channelStatus === 'CLOSED') {
          if (leaving) return dispatch('left')
          dispatch('dropped')
          rejoin(ch)
        } else {
          dispatch('dropped') // CHANNEL_ERROR / TIMED_OUT — transient
        }
      })
  }

  const rejoin = (stale: RealtimeChannel) => {
    setTimeout(async () => {
      if (leaving) return
      // fully remove the closed channel before recreating — the topic is shared,
      // so client.channel() would otherwise hand back the old (subscribed) one
      await client.removeChannel(stale)
      if (!leaving) connect()
    }, REJOIN_DELAY_MS)
  }

  return {
    join(player) {
      me = player
      leaving = false
      roster.clear()
      connect()
    },
    updatePosition(coord) {
      if (!me) return
      me.coord = coord
      broadcastMove()
    },
    onPlayers: players.on,
    onStatus(cb) {
      cb(status) // fire immediately with the current value
      return statuses.on(cb)
    },
    sendSignal(to, signal) {
      if (!me) return
      send('signal', { to, from: me.id, signal })
    },
    onSignal(cb) {
      return signals.on(({ from, signal }) => cb(from, signal))
    },
    leave() {
      leaving = true
      roster.dispose()
      if (!channel) return
      channel.untrack()
      client.removeChannel(channel)
      channel = null
    },
  }
}
