import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRadio } from './radio'

// Fake HTMLAudioElement: record the calls createRadio makes against it.
class FakeAudio {
  static last: FakeAudio | null = null
  volume = 1
  preload = ''
  src = ''
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  load = vi.fn()
  removeAttribute = vi.fn((attr: string) => { if (attr === 'src') this.src = '' })
  constructor() { FakeAudio.last = this }
}

const stubAudio = () => {
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio)
  return () => FakeAudio.last!
}

describe('createRadio', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('applies the configured volume and lazy preload', () => {
    const el = stubAudio()
    createRadio(0.3)
    expect(el().volume).toBe(0.3)
    expect(el().preload).toBe('none')
  })

  it('tune sets src and plays', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.tune('https://example.com/stream')
    expect(el().src).toBe('https://example.com/stream')
    expect(el().play).toHaveBeenCalledTimes(1)
  })

  it('re-tuning the same url is a no-op (does not restart the stream)', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.tune('https://example.com/a')
    radio.tune('https://example.com/a')
    expect(el().play).toHaveBeenCalledTimes(1)
  })

  it('tuning a different url retunes', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.tune('https://example.com/a')
    radio.tune('https://example.com/b')
    expect(el().src).toBe('https://example.com/b')
    expect(el().play).toHaveBeenCalledTimes(2)
  })

  it('stop pauses and releases the source', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.tune('https://example.com/a')
    radio.stop()
    expect(el().pause).toHaveBeenCalledTimes(1)
    expect(el().removeAttribute).toHaveBeenCalledWith('src')
    expect(el().load).toHaveBeenCalled()
  })

  it('stop while already silent is a no-op', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.stop()
    expect(el().pause).not.toHaveBeenCalled()
  })

  it('after stopping, the same url can be tuned again', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.tune('https://example.com/a')
    radio.stop()
    radio.tune('https://example.com/a')
    expect(el().play).toHaveBeenCalledTimes(2)
  })

  it('dispose stops playback', () => {
    const el = stubAudio()
    const radio = createRadio()
    radio.tune('https://example.com/a')
    radio.dispose()
    expect(el().pause).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected play() (blocked autoplay) without throwing', () => {
    vi.stubGlobal('Audio', class extends FakeAudio {
      play = vi.fn(() => Promise.reject(new Error('autoplay blocked')))
    } as unknown as typeof Audio)
    const radio = createRadio()
    expect(() => radio.tune('https://example.com/a')).not.toThrow()
  })
})
