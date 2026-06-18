// The connection lifecycle, run per ROOM: load the room config, build the room,
// create the realtime backend + WebRTC mesh + notification pinger (all scoped to
// that room's channel), wire their subscriptions into component state, and tear it
// down when the room changes or the component unmounts.
//
// Re-runs on every room switch (the door feature). What's room-scoped — backend,
// mesh, pinger, roster/streams/peers — resets each switch; what's YOU — mic, meter,
// identity, gate — persists and is carried into the new room (see use-audio-controls
// for the mic/meter release on unmount). join() is deferred to the pre-join gate on
// first load, then re-issued automatically on each subsequent room switch.

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

// One presence/audio channel per room, derived from its config URL so each room is
// its own isolated space: "/rooms/library.json" -> "chat-room:library".
const roomChannel = (url: string): string => {
  const base = url.split('/').pop()?.replace(/\.json$/, '') || 'home'
  return `chat-room:${base}`
}

export interface RoomConnectionDeps {
  meId: { current: string }
  meName: { current: string }
  me: { current: Player | null }
  backendRef: { current: RealtimeBackend | null }
  meshRef: { current: MeshAudio | null }
  pingerRef: { current: Pinger | null }
  meterRef: { current: Meter | null }
  micRef: { current: MediaStream | null }
  streamsRef: { current: Record<string, MediaStream | null> }
  /** Where to spawn on arrival when a door set a target; consumed (cleared) on use. */
  arrivalSpawnRef: { current: Coord | null }
  /** True once the player has picked a name and joined — gates auto-join on a switch. */
  joinedRef: { current: boolean }
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

export const useRoomConnection = (roomUrl: string, deps: RoomConnectionDeps) => {
  useEffect(() => {
    let cancelled = false
    const unsubs: Array<() => void> = []

    // Entering a room: clear the previous room's roster/streams/peers so nothing
    // bleeds across the threshold.
    deps.streamsRef.current = {}
    deps.setOthers([])
    deps.setStreams({})
    deps.setPeerStates({})

    const setup = async () => {
      try {
        const loaded = await loadConfig(roomUrl)
        if (cancelled) return
        const room = buildRoom(loaded)
        // Land on the door's target cell if it set one, else the room's own spawn.
        const arrival = deps.arrivalSpawnRef.current
        deps.arrivalSpawnRef.current = null
        const spawn = arrival && isWalkable(room, arrival) ? arrival : pickSpawn(room, loaded)

        // Reuse the player across rooms so name/avatar/audio/status carry over;
        // create it on first load. Same object identity (other code holds the ref).
        if (deps.me.current) deps.me.current.coord = spawn
        else deps.me.current = { id: deps.meId.current, name: deps.meName.current, coord: spawn }
        const player = deps.me.current

        deps.applyConfig(loaded)
        deps.setMyCoord(spawn)
        if (!deps.joinedRef.current) {
          const savedDraft = loadDraft()
          if (savedDraft && !cancelled) deps.setDraft(savedDraft) // offer to resume (first load only)
        }

        const backend = createBackend(roomChannel(roomUrl))
        deps.backendRef.current = backend
        deps.pingerRef.current = createPinger()
        unsubs.push(backend.onPlayers((o) => !cancelled && deps.setOthers(o)))
        unsubs.push(backend.onStatus((s) => !cancelled && deps.setStatus(s)))
        unsubs.push(backend.onVoice((from, state) => !cancelled && deps.updateVoice(from, state)))

        const mesh = createMeshAudio(player.id, backend)
        deps.meshRef.current = mesh
        // Carry an already-granted mic into the new room's mesh (no re-prompt).
        if (deps.micRef.current) mesh.setMic(deps.micRef.current)
        unsubs.push(
          mesh.onRemoteStream((id, s) => {
            if (cancelled) return
            if (s) deps.streamsRef.current = { ...deps.streamsRef.current, [id]: s }
            else {
              const next = { ...deps.streamsRef.current }
              delete next[id]
              deps.streamsRef.current = next
            }
            deps.setStreams(deps.streamsRef.current)
          }),
        )
        unsubs.push(mesh.onPeerStates((states) => !cancelled && deps.setPeerStates(states)))

        // Already named + joined? This is a room switch — announce presence in the
        // new channel now (first load waits for the pre-join gate's submitJoin).
        if (deps.joinedRef.current) backend.join(player)
      } catch (err) {
        if (!cancelled) deps.setErrors([String(err)])
      }
    }
    setup()
    return () => {
      cancelled = true
      for (const u of unsubs) u()
      deps.cancelTravel()
      deps.pingerRef.current?.close()
      deps.pingerRef.current = null
      deps.meshRef.current?.close()
      deps.meshRef.current = null
      deps.backendRef.current?.leave()
      deps.backendRef.current = null
      // mic + meter intentionally persist across room switches (carried into the
      // next room's mesh); they're released on unmount by use-audio-controls.
    }
  }, [roomUrl])
}
