import { describe, it, expect } from 'vitest'
import { initialStatus, nextStatus } from './session'

describe('session status FSM', () => {
  it('starts connecting', () => {
    expect(initialStatus).toBe('connecting')
  })

  it('connects on subscribed', () => {
    expect(nextStatus('connecting', 'subscribed')).toBe('connected')
    expect(nextStatus('reconnecting', 'subscribed')).toBe('connected')
  })

  it('stays connecting on a drop before the first connect', () => {
    expect(nextStatus('connecting', 'dropped')).toBe('connecting')
  })

  it('reconnects on a drop after having connected', () => {
    expect(nextStatus('connected', 'dropped')).toBe('reconnecting')
    expect(nextStatus('reconnecting', 'dropped')).toBe('reconnecting')
  })

  it('goes offline only when we intentionally leave', () => {
    expect(nextStatus('connected', 'left')).toBe('offline')
    expect(nextStatus('reconnecting', 'left')).toBe('offline')
    expect(nextStatus('connecting', 'left')).toBe('offline')
  })
})
