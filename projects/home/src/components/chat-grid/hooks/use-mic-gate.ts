// Mic transmits ONLY while standing in an audio room and not manually muted.
// Toggling track.enabled stops/starts audio without releasing the device, so it
// never re-prompts for permission when you step back onto an audio tile. The mic
// stream itself is acquired/owned elsewhere; this just gates it.

import { useEffect } from 'haunted'
import type { Coord } from '../core/types'
import type { AudioGateState } from '../core/fsm/audio-gate'
import { roomOf } from '../core/rooms'

export const useMicGate = (
  micRef: { current: MediaStream | null },
  args: { myCoord: Coord | null; rooms: Map<string, number>; gate: AudioGateState; muted: boolean },
) => {
  const { myCoord, rooms, gate, muted } = args
  useEffect(() => {
    const inRoom = !!myCoord && roomOf(rooms, myCoord) !== null
    const live = gate === 'on' && inRoom && !muted
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = live))
  }, [myCoord, rooms, gate, muted])
}
