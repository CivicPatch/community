// Real backend: Supabase Realtime, entirely client-side (no server we run).
//
// Two channels of one Supabase channel, used for what each is good at:
//   • Presence  -> the ROSTER (who's here). Tracked ONCE on join, so it stays
//     quiet and stable; also gives free zombie cleanup on disconnect.
//   • Broadcast -> POSITIONS. Frequent, ephemeral per-move messages — exactly
//     what broadcast is for. (Re-tracking presence per move overwhelmed it and
//     made avatars flap in/out.)
// Implements the same RealtimeBackend interface as the fake, so swapping is
// transparent to the rest of the app.

import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Coord, Player } from '../core/types'
import type { RealtimeBackend } from './realtime'
import { initialStatus, nextStatus } from '../core/fsm/session'
import type { ConnStatus, SessionEvent } from '../core/fsm/session'

const REJOIN_DELAY_MS = 1500

type MovePayload = { id: string; coord: Coord }

export const createSupabaseBackend = (
  url: string,
  key: string,
  channelName = 'chat-grid',
): RealtimeBackend => {
  const client = createClient(url, key)
  let channel: RealtimeChannel | null = null
  let me: Player | null = null
  let leaving = false // set only by leave(); distinguishes intentional close

  // OTHER players. Presence decides membership; broadcast updates coords.
  const roster = new Map<string, Player>()
  let listeners: ((others: Player[]) => void)[] = []

  let status: ConnStatus = initialStatus
  let statusListeners: ((s: ConnStatus) => void)[] = []
  const dispatch = (event: SessionEvent) => {
    status = nextStatus(status, event)
    for (const cb of statusListeners) cb(status)
  }

  const emit = () => {
    const others = [...roster.values()]
    for (const cb of listeners) cb(others)
  }

  // Presence drives roster MEMBERSHIP only. Seed new players with their presence
  // coord; keep existing players' coords (broadcast owns those) so a late sync
  // doesn't snap someone back to where they spawned.
  const syncRoster = () => {
    if (!channel) return
    const state = channel.presenceState<{ player: Player }>()
    const present = new Set<string>()
    for (const presenceKey of Object.keys(state))
      for (const entry of state[presenceKey]) {
        const p = entry.player
        if (p.id === me?.id) continue
        present.add(p.id)
        if (!roster.has(p.id)) roster.set(p.id, { ...p })
      }
    for (const id of [...roster.keys()]) if (!present.has(id)) roster.delete(id)
    emit()
  }

  const onMove = ({ id, coord }: MovePayload) => {
    if (id === me?.id) return
    const existing = roster.get(id)
    if (existing) {
      existing.coord = coord
      emit()
    }
    // if not in the roster yet, the next presence sync adds them
  }

  const broadcastMove = () => {
    if (!me || !channel) return
    // fire-and-forget; positions are idempotent so an occasional drop self-heals
    try {
      const payload: MovePayload = { id: me.id, coord: me.coord }
      Promise.resolve(
        channel.send({ type: 'broadcast', event: 'move', payload }),
      ).catch(() => {})
    } catch {
      // ignore — local movement must not depend on the network succeeding
    }
  }

  // (Re)subscribe the channel. Supabase auto-retries CHANNEL_ERROR/TIMED_OUT, but
  // a CLOSED channel does NOT rejoin itself — so we rebuild it on an unexpected
  // close, which keeps the status badge from sticking on "offline".
  const connect = () => {
    const player = me
    if (!player) return
    const ch = client.channel(channelName, {
      config: { presence: { key: player.id }, broadcast: { self: false } },
    })
    channel = ch
    ch.on('presence', { event: 'sync' }, syncRoster)
      .on('presence', { event: 'join' }, () => {
        // a newcomer can't know where we already moved to — re-announce our spot
        syncRoster()
        broadcastMove()
      })
      .on('presence', { event: 'leave' }, syncRoster)
      .on('broadcast', { event: 'move' }, ({ payload }) => onMove(payload as MovePayload))
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') {
          dispatch('subscribed')
          ch.track({ player }) // presence: ONCE, just to appear in the roster
        } else if (channelStatus === 'CLOSED') {
          if (leaving) return dispatch('left')
          dispatch('dropped')
          rejoin(ch)
        } else {
          // CHANNEL_ERROR / TIMED_OUT — transient; let Supabase auto-retry
          dispatch('dropped')
        }
      })
  }

  const rejoin = (stale: RealtimeChannel) => {
    setTimeout(async () => {
      if (leaving) return
      // removeChannel is async; the topic ('chat-grid') is shared across clients
      // so we can't rename it — fully remove the closed channel BEFORE recreating,
      // or client.channel() returns the old (subscribed) one and .on() throws.
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
    onPlayers(cb) {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    },
    onStatus(cb) {
      statusListeners.push(cb)
      cb(status)
      return () => {
        statusListeners = statusListeners.filter((l) => l !== cb)
      }
    },
    leave() {
      leaving = true
      if (!channel) return
      channel.untrack()
      client.removeChannel(channel)
      channel = null
    },
  }
}
