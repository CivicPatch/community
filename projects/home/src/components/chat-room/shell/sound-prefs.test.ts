import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadSoundPrefs, saveSoundPrefs } from './sound-prefs'

const DEFAULTS = { joinLeave: true, status: false }

const fakeStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  }
}
const throwingStorage = () => ({
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
  removeItem: () => { throw new Error('blocked') },
})

describe('sound preferences', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to defaults when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadSoundPrefs()).toEqual(DEFAULTS)
  })

  it('round-trips saved prefs', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveSoundPrefs({ joinLeave: false, status: true })
    expect(loadSoundPrefs()).toEqual({ joinLeave: false, status: true })
  })

  it('fills missing or wrong-typed fields from defaults', () => {
    const s = fakeStorage()
    vi.stubGlobal('localStorage', s)
    s._map.set('chat-room-sound-prefs', JSON.stringify({ status: true })) // joinLeave missing
    expect(loadSoundPrefs()).toEqual({ joinLeave: true, status: true })
    s._map.set('chat-room-sound-prefs', JSON.stringify({ joinLeave: 'yes', status: 1 })) // wrong types
    expect(loadSoundPrefs()).toEqual(DEFAULTS)
  })

  it('falls back to defaults on malformed JSON', () => {
    const s = fakeStorage()
    s._map.set('chat-room-sound-prefs', '{bad')
    vi.stubGlobal('localStorage', s)
    expect(loadSoundPrefs()).toEqual(DEFAULTS)
  })

  it('returns defaults / swallows on blocked storage', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(loadSoundPrefs()).toEqual(DEFAULTS)
    expect(() => saveSoundPrefs({ joinLeave: false, status: true })).not.toThrow()
  })
})
