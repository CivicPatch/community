// Real backend: Supabase Realtime, entirely client-side (no server we run).
// Phase 1 uses Presence only — it carries the player roster AND positions, and
// auto-drops players on disconnect (zombie cleanup for free). Broadcast joins in
// Phase 2 for WebRTC signaling. Implements the same RealtimeBackend interface as
// the fake, so swapping is transparent to the rest of the app.

import { createClient } from '@supabase/supabase-js'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Player } from '../core/types'
import type { RealtimeBackend } from './realtime'
import { initialStatus, nextStatus } from '../core/fsm/session'
import type { ConnStatus, SessionEvent } from '../core/fsm/session'

const REJOIN_DELAY_MS = 1500

export const createSupabaseBackend = (
  url: string,
  key: string,
  channelName = 'chat-grid',
): RealtimeBackend => {
  const client = createClient(url, key)
  let channel: RealtimeChannel | null = null
  let me: Player | null = null
  let leaving = false // set only by leave(); distinguishes intentional close
  let listeners: ((others: Player[]) => void)[] = []

  let status: ConnStatus = initialStatus
  let statusListeners: ((s: ConnStatus) => void)[] = []
  const dispatch = (event: SessionEvent) => {
    status = nextStatus(status, event)
    for (const cb of statusListeners) cb(status)
  }

  // Flatten Supabase presence state into the set of OTHER players.
  const emit = () => {
    if (!channel) return
    const state = channel.presenceState<{ player: Player }>()
    const others: Player[] = []
    for (const presenceKey of Object.keys(state))
      for (const entry of state[presenceKey])
        if (entry.player.id !== me?.id) others.push(entry.player)
    for (const cb of listeners) cb(others)
  }

  // (Re)subscribe the channel. Supabase auto-retries CHANNEL_ERROR/TIMED_OUT, but
  // a CLOSED channel does NOT rejoin itself — so we rebuild it here on an
  // unexpected close, which is what stops the badge from sticking on "offline".
  const connect = () => {
    const player = me
    if (!player) return
    const ch = client.channel(channelName, { config: { presence: { key: player.id } } })
    channel = ch
    ch.on('presence', { event: 'sync' }, emit)
      .on('presence', { event: 'join' }, emit)
      .on('presence', { event: 'leave' }, emit)
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') {
          dispatch('subscribed')
          ch.track({ player })
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
    setTimeout(() => {
      if (leaving) return
      client.removeChannel(stale)
      connect()
    }, REJOIN_DELAY_MS)
  }

  return {
    join(player) {
      me = player
      leaving = false
      connect()
    },
    updatePosition(coord) {
      if (!me || !channel) return
      me.coord = coord
      // re-tracking presence re-broadcasts our state, triggering sync on others
      channel.track({ player: me })
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
