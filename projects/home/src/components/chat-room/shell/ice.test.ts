import { describe, it, expect } from 'vitest'
import { getIceServers } from './ice'

describe('getIceServers', () => {
  it('returns the free Google STUN server', () => {
    expect(getIceServers()).toEqual([{ urls: 'stun:stun.l.google.com:19302' }])
  })

  it('returns a fresh array each call (callers may mutate without leaking)', () => {
    expect(getIceServers()).not.toBe(getIceServers())
  })
})
