import { describe, it, expect, vi, afterEach } from 'vitest'
import type { RoomConfig } from '../core/types'
import { saveDraft, loadDraft, clearDraft } from './draft'

// node test env has no localStorage. Stub a Map-backed one — and a throwing one
// to exercise the Firefox-Focus / private-mode path the try/catch exists for.
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

const config: RoomConfig = { columns: 2, rows: 2, cells: [{ coord: { col: 0, row: 0 }, audio: true }] }

describe('draft persistence', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips a saved config', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveDraft(config)
    expect(loadDraft()?.config).toEqual(config)
  })

  it('stamps savedAt with the current time', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-17T00:00:00Z'))
    saveDraft(config)
    expect(loadDraft()?.savedAt).toBe(Date.parse('2026-06-17T00:00:00Z'))
    vi.useRealTimers()
  })

  it('returns null when nothing is stored', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadDraft()).toBeNull()
  })

  it('returns null when the stored payload has no config', () => {
    const s = fakeStorage()
    s._map.set('chat-room-draft', JSON.stringify({ savedAt: 1 }))
    vi.stubGlobal('localStorage', s)
    expect(loadDraft()).toBeNull()
  })

  it('returns null on malformed JSON', () => {
    const s = fakeStorage()
    s._map.set('chat-room-draft', '{not json')
    vi.stubGlobal('localStorage', s)
    expect(loadDraft()).toBeNull()
  })

  it('clearDraft removes the stored draft', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveDraft(config)
    clearDraft()
    expect(loadDraft()).toBeNull()
  })

  it('swallows storage failures (blocked storage) without throwing', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(() => saveDraft(config)).not.toThrow()
    expect(loadDraft()).toBeNull()
    expect(() => clearDraft()).not.toThrow()
  })
})
