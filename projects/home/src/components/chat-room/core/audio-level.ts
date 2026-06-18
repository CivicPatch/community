// Pure audio-level math for the speaking indicators. The Web Audio plumbing lives
// in shell/meter.ts; keeping the math here makes it unit-testable.

/** Root-mean-square of time-domain samples in [-1, 1] -> ~[0, 1]. */
export const rms = (samples: Float32Array): number => {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) sum += s * s
  return Math.sqrt(sum / samples.length)
}

/** Map raw RMS (speech sits low, ~0.01–0.2) to a 0..1 "loudness" for visuals. */
export const loudness = (rmsValue: number, gain = 4): number =>
  Math.max(0, Math.min(1, rmsValue * gain))

/** Quantize a 0..1 level into 0..steps, so visuals only change at discrete jumps. */
export const levelBucket = (level: number, steps = 3): number =>
  Math.max(0, Math.min(steps, Math.round(level * steps)))

/**
 * Voice-activity detection with hysteresis: start "speaking" above `on`, keep it
 * until the level drops below `off` (off < on) so it doesn't chatter at the edge.
 * Operates on raw RMS; thresholds are tunable.
 */
export const isSpeaking = (
  rmsValue: number,
  wasSpeaking: boolean,
  { on = 0.04, off = 0.02 }: { on?: number; off?: number } = {},
): boolean => (wasSpeaking ? rmsValue > off : rmsValue > on)
