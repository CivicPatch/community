import { describe, it, expect, vi } from 'vitest'
import { createEmitter } from './emitter'

describe('createEmitter', () => {
  it('delivers the emitted value to every listener', () => {
    const e = createEmitter<number>()
    const a = vi.fn()
    const b = vi.fn()
    e.on(a)
    e.on(b)
    e.emit(7)
    expect(a).toHaveBeenCalledWith(7)
    expect(b).toHaveBeenCalledWith(7)
  })

  it('emitting with no listeners is a no-op', () => {
    const e = createEmitter<string>()
    expect(() => e.emit('hi')).not.toThrow()
  })

  it('on() returns an unsubscribe that stops future deliveries', () => {
    const e = createEmitter<number>()
    const cb = vi.fn()
    const off = e.on(cb)
    e.emit(1)
    off()
    e.emit(2)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(1)
  })

  // The emit loop iterates a COPY of the listener list, so a listener that
  // unsubscribes another mid-emit does not skip it for the in-flight emit;
  // the removal takes effect on the next emit.
  it('a listener unsubscribed mid-emit still runs for the in-flight emit, not the next', () => {
    const e = createEmitter<number>()
    let off = () => {}
    const b = vi.fn()
    e.on(() => off()) // unsubscribes b while we are emitting
    off = e.on(b)
    e.emit(1)
    expect(b).toHaveBeenCalledTimes(1) // still ran this round (snapshot)
    e.emit(2)
    expect(b).toHaveBeenCalledTimes(1) // gone on the next round
  })
})
