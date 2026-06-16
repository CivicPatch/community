import { describe, it, expect } from 'vitest'
import { isSpeaking, levelBucket, loudness, rms } from './audio-level'

describe('rms', () => {
  it('is zero for silence and empty input', () => {
    expect(rms(new Float32Array([0, 0, 0]))).toBe(0)
    expect(rms(new Float32Array([]))).toBe(0)
  })
  it('is 1 for a full-scale square wave', () => {
    expect(rms(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(1)
  })
  it('reflects amplitude', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
  })
})

describe('loudness', () => {
  it('scales and clamps to [0,1]', () => {
    expect(loudness(0)).toBe(0)
    expect(loudness(0.1, 4)).toBeCloseTo(0.4)
    expect(loudness(0.5, 4)).toBe(1) // clamped
  })
})

describe('levelBucket', () => {
  it('quantizes 0..1 into 0..steps', () => {
    expect(levelBucket(0, 3)).toBe(0)
    expect(levelBucket(1, 3)).toBe(3)
    expect(levelBucket(0.5, 3)).toBe(2) // round(1.5)
    expect(levelBucket(2, 3)).toBe(3) // clamped
  })
})

describe('isSpeaking (hysteresis)', () => {
  it('turns on above the on-threshold', () => {
    expect(isSpeaking(0.05, false)).toBe(true)
    expect(isSpeaking(0.03, false)).toBe(false)
  })
  it('stays on until below the off-threshold', () => {
    expect(isSpeaking(0.03, true)).toBe(true) // between off and on: holds
    expect(isSpeaking(0.01, true)).toBe(false)
  })
})
