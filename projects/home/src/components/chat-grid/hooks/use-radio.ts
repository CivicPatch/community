// Music tiles: standing on a radio cell streams it for ME only; stepping off (or
// onto a different station) retunes/stops. Position-driven and idempotent in the
// shell, so re-renders never restart a stream. Mirrors the mic-huddle effect. Owns
// the <audio> element and releases it on unmount.

import { useEffect, useRef } from 'haunted'
import type { Coord, Grid } from '../core/types'
import { radioAt } from '../core/grid'
import { createRadio } from '../shell/radio'
import type { Radio } from '../shell/radio'

export const useRadio = (grid: Grid | null, myCoord: Coord | null) => {
  const radioRef = useRef<Radio | null>(null)
  useEffect(() => {
    const station = grid && myCoord ? radioAt(grid, myCoord) : null
    if (!station) return radioRef.current?.stop()
    if (!radioRef.current) radioRef.current = createRadio()
    radioRef.current.tune(station.url)
  }, [myCoord, grid])
  // release the audio element when the component goes away
  useEffect(() => () => radioRef.current?.dispose(), [])
}
