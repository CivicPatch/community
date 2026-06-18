// Drive the WebRTC mesh from huddle membership + blocks. Two effects:
//   • connect to everyone in my huddle (once I've enabled audio), disconnect
//     from everyone else;
//   • push blocked peers so the mesh severs and refuses them.
// The mesh itself is owned by the connection hook; this just routes it.

import { useEffect } from 'haunted'
import type { Coord, Player } from '../core/types'
import type { AudioGateState } from '../core/fsm/audio-gate'
import type { MeshAudio } from '../shell/webrtc'
import { peersInHuddle } from '../core/huddles'

export const useMeshRouting = (
  meshRef: { current: MeshAudio | null },
  args: {
    gate: AudioGateState
    myCoord: Coord | null
    others: Player[]
    huddles: Map<string, number>
    blockedPeers: Set<string>
  },
) => {
  const { gate, myCoord, others, huddles, blockedPeers } = args
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const wanted =
      gate === 'on' && myCoord
        ? peersInHuddle(huddles, myCoord, others).filter((id) => !blockedPeers.has(id))
        : []
    mesh.setWantedPeers(wanted)
  }, [gate, myCoord, others, huddles, blockedPeers])

  useEffect(() => {
    meshRef.current?.setBlockedPeers([...blockedPeers])
  }, [blockedPeers])
}
