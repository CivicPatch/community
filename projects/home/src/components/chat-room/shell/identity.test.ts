import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadIdentity, saveIdentity } from './identity'

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

describe('identity persistence', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips name + avatar', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveIdentity({ name: 'Ada', avatar: '🦊' })
    expect(loadIdentity()).toEqual({ name: 'Ada', avatar: '🦊' })
  })

  it('returns null when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadIdentity()).toBeNull()
  })

  it('returns null when a field is missing or not a string', () => {
    const s = fakeStorage()
    vi.stubGlobal('localStorage', s)
    s._map.set('chat-room-identity', JSON.stringify({ name: 'Ada' }))
    expect(loadIdentity()).toBeNull()
    s._map.set('chat-room-identity', JSON.stringify({ name: 1, avatar: '🦊' }))
    expect(loadIdentity()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    const s = fakeStorage()
    s._map.set('chat-room-identity', 'nope')
    vi.stubGlobal('localStorage', s)
    expect(loadIdentity()).toBeNull()
  })

  it('swallows storage failures without throwing', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(() => saveIdentity({ name: 'Ada', avatar: '🦊' })).not.toThrow()
    expect(loadIdentity()).toBeNull()
  })
})
