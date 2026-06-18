// Mic transmits ONLY while standing in an huddle and not manually muted.
// Toggling track.enabled stops/starts audio without releasing the device, so it
// never re-prompts for permission when you step back onto an audio tile. The mic
// stream itself is acquired/owned elsewhere; this just gates it.

import { useEffect } from 'haunted'
import type { Coord } from '../core/types'
import type { AudioGateState } from '../core/fsm/audio-gate'
import { huddleOf } from '../core/huddles'

export const useMicGate = (args: {
  micStream: MediaStream | null
  myCoord: Coord | null
  huddles: Map<string, number>
  gate: AudioGateState
  muted: boolean
}) => {
  const { micStream, myCoord, huddles, gate, muted } = args
  useEffect(() => {
    const inHuddle = !!myCoord && huddleOf(huddles, myCoord) !== null
    const live = gate === 'on' && inHuddle && !muted
    micStream?.getAudioTracks().forEach((t) => (t.enabled = live))
    // micStream is a dep: a re-acquire (e.g. after a PiP pop) swaps in a new stream object,
    // so the gate re-applies to the fresh track instead of leaving it disabled.
  }, [micStream, myCoord, huddles, gate, muted])
}
