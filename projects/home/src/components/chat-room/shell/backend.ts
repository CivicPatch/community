// Picks the backend: real Supabase when configured, BroadcastChannel fake
// otherwise. The rest of the app depends only on RealtimeBackend, never on which.

import type { RealtimeBackend } from './realtime'
import { createFakeBackend } from './realtime-fake'
import { createSupabaseBackend } from './realtime-supabase'
import { SUPABASE_KEY, SUPABASE_URL } from './config'

// channelName scopes presence + audio to one room, so each room is its own space.
export const createBackend = (channelName?: string): RealtimeBackend =>
  SUPABASE_URL && SUPABASE_KEY
    ? createSupabaseBackend(SUPABASE_URL, SUPABASE_KEY, channelName)
    : createFakeBackend(channelName)
