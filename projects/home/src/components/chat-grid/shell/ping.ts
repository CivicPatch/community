// Synthesized notification chimes (Web Audio) — no asset to host, fits the free /
// no-backend constraint. One shared AudioContext, resumed on a user gesture (the Join
// click). Distinct short tones per kind so join / leave / status are tellable apart
// without looking.

export type PingKind = 'join' | 'leave' | 'status'

// each value is the note sequence (Hz) played in quick succession
const TONES: Record<PingKind, number[]> = {
  join: [660, 880], // two-note rise
  leave: [550, 350], // two-note fall
  status: [780], // single soft blip
}

export interface Pinger {
  /** Resume the AudioContext from a user gesture (browser autoplay unlock). */
  resume(): void
  play(kind: PingKind): void
  close(): void
}

export const createPinger = (): Pinger => {
  let ctx: AudioContext | null = null
  const ensure = (): AudioContext => {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }
  return {
    resume() {
      ensure()
    },
    play(kind) {
      const ac = ensure()
      const start = ac.currentTime
      TONES[kind].forEach((freq, i) => {
        const t = start + i * 0.09
        const osc = ac.createOscillator()
        const gain = ac.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        // quick attack, short exponential decay — a soft "blip", never a drone
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
        osc.connect(gain).connect(ac.destination)
        osc.start(t)
        osc.stop(t + 0.16)
      })
    },
    close() {
      void ctx?.close()
      ctx = null
    },
  }
}
