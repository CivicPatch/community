import { describe, it, expect } from 'vitest'
import { gateTransition, initialGate } from './audio-gate'

describe('audio-gate FSM', () => {
  it('starts off', () => {
    expect(initialGate).toBe('off')
  })

  it('requests the mic when enabled', () => {
    expect(gateTransition('off', 'enable')).toEqual(['requesting', ['requestMic']])
  })

  it('turns on when permission is granted', () => {
    expect(gateTransition('requesting', 'granted')).toEqual(['on', []])
  })

  it('goes to denied when permission is refused', () => {
    expect(gateTransition('requesting', 'denied')).toEqual(['denied', []])
  })

  it('allows retrying after a denial', () => {
    expect(gateTransition('denied', 'enable')).toEqual(['requesting', ['requestMic']])
  })

  it('stays on once enabled', () => {
    expect(gateTransition('on', 'enable')).toEqual(['on', []])
    expect(gateTransition('on', 'granted')).toEqual(['on', []])
  })

  it('ignores stray events while off', () => {
    expect(gateTransition('off', 'granted')).toEqual(['off', []])
  })
})
