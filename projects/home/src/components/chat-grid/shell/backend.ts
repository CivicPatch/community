// Picks the backend: real Supabase when configured, BroadcastChannel fake
// otherwise. The rest of the app depends only on RealtimeBackend, never on which.

import type { RealtimeBackend } from './realtime'
import { createFakeBackend } from './realtime-fake'
import { createSupabaseBackend } from './realtime-supabase'
import { SUPABASE_KEY, SUPABASE_URL } from './config'

export const createBackend = (): RealtimeBackend =>
  SUPABASE_URL && SUPABASE_KEY
    ? createSupabaseBackend(SUPABASE_URL, SUPABASE_KEY)
    : createFakeBackend()
