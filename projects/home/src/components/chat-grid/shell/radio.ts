// Walker-only music playback: one <audio> element, retuned as you step on/off
// radio tiles. Imperative shell around the browser's media element — the "what
// should be playing" decision is pure (core/grid.ts radioAt); this just obeys it.
//
// Streaming a remote URL (e.g. SomaFM) needs no hosting and can't be charged,
// matching the grid's free/cannot-be-charged constraint. We never route it
// through WebAudio, so cross-origin streams play without CORS headers.

export interface Radio {
  /** Play `url`. Re-tuning the SAME url is a no-op (won't restart the stream). */
  tune(url: string): void
  /** Stop and release the current stream (back to silence). */
  stop(): void
  /** Tear down for good (component unmount). */
  dispose(): void
}

export const createRadio = (volume = 0.6): Radio => {
  const el = new Audio()
  el.volume = volume
  el.preload = 'none'
  let current: string | null = null

  const stop = () => {
    if (current === null) return
    current = null
    el.pause()
    el.removeAttribute('src') // release the connection; '' would refetch the page URL
    el.load()
  }

  return {
    tune(url) {
      if (url === current) return
      current = url
      el.src = url
      // A blocked autoplay (no prior gesture) rejects here; by the time you've
      // walked onto a tile you've already interacted, so this normally resolves.
      el.play().catch(() => {})
    },
    stop,
    dispose() {
      stop()
    },
  }
}
