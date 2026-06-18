// The connection lifecycle, run once per config-url: load the room config, build
// the room, create the realtime backend + WebRTC mesh + notification pinger, wire
// their subscriptions into component state, and tear it all down on unmount.
//
// Backend and mesh are created together (the mesh needs the backend) under one
// `cancelled` guard and one cleanup — kept atomic on purpose. join() is deferred to
// the pre-join gate's submit, so we don't announce presence until a name is picked.

import { useEffect } from 'haunted'
import type { Coord, RoomConfig, Room, Player } from '../core/types'
import type { ConnStatus } from '../core/fsm/session'
import type { PeerState } from '../core/fsm/peer'
import type { RealtimeBackend, VoiceState } from '../shell/realtime'
import type { MeshAudio } from '../shell/webrtc'
import type { Pinger } from '../shell/ping'
import type { Meter } from '../shell/meter'
import type { Draft } from '../shell/draft'
import { buildRoom, isWalkable } from '../core/room'
import { createBackend } from '../shell/backend'
import { createPinger } from '../shell/ping'
import { createMeshAudio } from '../shell/webrtc'
import { loadDraft } from '../shell/draft'

const loadConfig = async (url: string): Promise<RoomConfig> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load room config: ${res.status}`)
  return res.json()
}

const pickSpawn = (room: Room, config: RoomConfig): Coord => {
  if (config.spawn && isWalkable(room, config.spawn)) return config.spawn
  for (let row = 0; row < room.rows; row++)
    for (let col = 0; col < room.columns; col++)
      if (isWalkable(room, { col, row })) return { col, row }
  return { col: 0, row: 0 }
}

export interface GridConnectionDeps {
  meId: { current: string }
  meName: { current: string }
  me: { current: Player | null }
  backendRef: { current: RealtimeBackend | null }
  meshRef: { current: MeshAudio | null }
  pingerRef: { current: Pinger | null }
  meterRef: { current: Meter | null }
  micRef: { current: MediaStream | null }
  streamsRef: { current: Record<string, MediaStream | null> }
  applyConfig: (c: RoomConfig) => void
  cancelTravel: () => void
  updateVoice: (id: string, state: VoiceState) => void
  setMyCoord: (c: Coord) => void
  setDraft: (d: Draft | null) => void
  setOthers: (o: Player[]) => void
  setStatus: (s: ConnStatus) => void
  setStreams: (s: Record<string, MediaStream | null>) => void
  setPeerStates: (s: Record<string, PeerState>) => void
  setErrors: (e: string[]) => void
}

export const useRoomConnection = (configUrl: string, deps: GridConnectionDeps) => {
  useEffect(() => {
    let cancelled = false
    const setup = async () => {
      try {
        const loaded = await loadConfig(configUrl)
        if (cancelled) return
        const g = buildRoom(loaded)
        const spawn = pickSpawn(g, loaded)
        const player: Player = { id: deps.meId.current, name: deps.meName.current, coord: spawn }
        deps.me.current = player
        deps.applyConfig(loaded)
        deps.setMyCoord(spawn)
        const savedDraft = loadDraft()
        if (savedDraft && !cancelled) deps.setDraft(savedDraft) // offer to resume

        const backend = createBackend()
        deps.backendRef.current = backend
        deps.pingerRef.current = createPinger()
        backend.onPlayers((o) => {
          if (!cancelled) deps.setOthers(o)
        })
        backend.onStatus((s) => {
          if (!cancelled) deps.setStatus(s)
        })
        backend.onVoice((from, state) => {
          if (!cancelled) deps.updateVoice(from, state)
        })

        const mesh = createMeshAudio(player.id, backend)
        deps.meshRef.current = mesh
        mesh.onRemoteStream((id, s) => {
          if (cancelled) return
          if (s) deps.streamsRef.current = { ...deps.streamsRef.current, [id]: s }
          else {
            const next = { ...deps.streamsRef.current }
            delete next[id]
            deps.streamsRef.current = next
          }
          deps.setStreams(deps.streamsRef.current)
        })
        mesh.onPeerStates((states) => {
          if (!cancelled) deps.setPeerStates(states)
        })
      } catch (err) {
        if (!cancelled) deps.setErrors([String(err)])
      }
    }
    setup()
    return () => {
      cancelled = true
      deps.cancelTravel()
      deps.meterRef.current?.stop()
      deps.meterRef.current = null
      deps.pingerRef.current?.close()
      deps.pingerRef.current = null
      deps.meshRef.current?.close()
      deps.meshRef.current = null
      deps.micRef.current?.getTracks().forEach((t) => t.stop())
      deps.micRef.current = null
      deps.backendRef.current?.leave()
      deps.backendRef.current = null
    }
  }, [configUrl])
}
