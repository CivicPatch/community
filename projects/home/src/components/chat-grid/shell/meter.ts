// Audio level meter: runs an AnalyserNode per stream and samples RMS on a rAF
// loop, emitting per-peer { speaking, bucket }. The math is in core/audio-level.ts;
// this is the Web Audio plumbing. It change-gates its own output (only notifies
// when a speaking flag or bucket actually changes) so the UI re-renders sparsely.

import { isSpeaking, levelBucket, loudness, rms } from '../core/audio-level'
import type { PlayerId } from '../core/types'

export interface MeterSample {
  speaking: boolean
  bucket: number
}

export interface Meter {
  add(id: PlayerId, stream: MediaStream): void
  remove(id: PlayerId): void
  stop(): void
}

const SAMPLE_INTERVAL_MS = 40 // ~25 Hz

interface Source {
  node: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  data: Float32Array<ArrayBuffer>
  speaking: boolean
}

export const createMeter = (
  onChange: (samples: Record<PlayerId, MeterSample>) => void,
): Meter => {
  const ctx = new AudioContext()
  const sources = new Map<PlayerId, Source>()
  let raf = 0
  let last = 0
  let prevKey = ''

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    if (now - last < SAMPLE_INTERVAL_MS) return
    last = now

    const out: Record<PlayerId, MeterSample> = {}
    for (const [id, s] of sources) {
      s.analyser.getFloatTimeDomainData(s.data)
      const r = rms(s.data)
      s.speaking = isSpeaking(r, s.speaking)
      out[id] = { speaking: s.speaking, bucket: s.speaking ? levelBucket(loudness(r)) : 0 }
    }

    const key = JSON.stringify(out)
    if (key !== prevKey) {
      prevKey = key
      onChange(out)
    }
  }
  raf = requestAnimationFrame(tick)

  return {
    add(id, stream) {
      if (sources.has(id)) return
      void ctx.resume() // a context can start suspended until a user gesture
      const node = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      node.connect(analyser)
      sources.set(id, {
        node,
        analyser,
        data: new Float32Array(analyser.fftSize),
        speaking: false,
      })
    },
    remove(id) {
      const s = sources.get(id)
      if (!s) return
      s.node.disconnect()
      sources.delete(id)
    },
    stop() {
      cancelAnimationFrame(raf)
      for (const s of sources.values()) s.node.disconnect()
      sources.clear()
      void ctx.close()
    },
  }
}
