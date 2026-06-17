// Drive the WebRTC mesh from room membership + blocks. Two effects:
//   • connect to everyone in my audio room (once I've enabled audio), disconnect
//     from everyone else;
//   • push blocked peers so the mesh severs and refuses them.
// The mesh itself is owned by the connection hook; this just routes it.

import { useEffect } from 'haunted'
import type { Coord, Player } from '../core/types'
import type { AudioGateState } from '../core/fsm/audio-gate'
import type { MeshAudio } from '../shell/webrtc'
import { peersInRoom } from '../core/rooms'

export const useMeshRouting = (
  meshRef: { current: MeshAudio | null },
  args: {
    gate: AudioGateState
    myCoord: Coord | null
    others: Player[]
    rooms: Map<string, number>
    blockedPeers: Set<string>
  },
) => {
  const { gate, myCoord, others, rooms, blockedPeers } = args
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const wanted =
      gate === 'on' && myCoord
        ? peersInRoom(rooms, myCoord, others).filter((id) => !blockedPeers.has(id))
        : []
    mesh.setWantedPeers(wanted)
  }, [gate, myCoord, others, rooms, blockedPeers])

  useEffect(() => {
    meshRef.current?.setBlockedPeers([...blockedPeers])
  }, [blockedPeers])
}
