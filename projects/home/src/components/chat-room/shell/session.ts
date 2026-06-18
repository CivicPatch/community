// The live per-tab session: your identity plus the connection/audio handles that
// many hooks share. Bundling them into one object keeps hook signatures small and
// lets a new shared handle be added in one place instead of threaded through every
// call site. (Single-ref hooks still take just the ref they need — clearer than a
// whole session for one field.)

import type { Player } from '../core/types'
import type { RealtimeBackend } from './realtime'
import type { MeshAudio } from './webrtc'
import type { Meter } from './meter'
import type { Pinger } from './ping'

export interface Session {
  meId: { current: string }
  meName: { current: string }
  me: { current: Player | null }
  backendRef: { current: RealtimeBackend | null }
  meshRef: { current: MeshAudio | null }
  meterRef: { current: Meter | null }
  pingerRef: { current: Pinger | null }
  micRef: { current: MediaStream | null }
  streamsRef: { current: Record<string, MediaStream | null> }
}
