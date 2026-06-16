import { describe, it, expect } from 'vitest'
import { initialPeer, peerTransition } from './peer'
import type { PeerEvent } from './peer'

describe('peer FSM', () => {
  it('starts idle', () => {
    expect(initialPeer).toBe('idle')
  })

  it('opens a connection when a peer becomes wanted', () => {
    expect(peerTransition('idle', 'wanted')).toEqual(['connecting', ['open']])
  })

  it('ignores irrelevant events while idle', () => {
    expect(peerTransition('idle', 'unwanted')).toEqual(['idle', []])
    expect(peerTransition('idle', 'closed')).toEqual(['idle', []])
  })

  it('reaches connected once established', () => {
    expect(peerTransition('connecting', 'established')).toEqual(['connected', []])
  })

  it('tears down if unwanted mid-negotiation', () => {
    expect(peerTransition('connecting', 'unwanted')).toEqual(['closing', ['close']])
  })

  it('returns to idle if it fails before connecting', () => {
    expect(peerTransition('connecting', 'closed')).toEqual(['idle', []])
  })

  it('closes a connected peer when it becomes unwanted', () => {
    expect(peerTransition('connected', 'unwanted')).toEqual(['closing', ['close']])
  })

  it('returns to idle if a connected peer is lost', () => {
    expect(peerTransition('connected', 'closed')).toEqual(['idle', []])
  })

  it('settles to idle once closing completes', () => {
    expect(peerTransition('closing', 'closed')).toEqual(['idle', []])
  })

  it('reopens if wanted again mid-teardown', () => {
    expect(peerTransition('closing', 'wanted')).toEqual(['connecting', ['open']])
  })

  it('does not emit duplicate opens while already connecting/connected', () => {
    expect(peerTransition('connecting', 'wanted')).toEqual(['connecting', []])
    expect(peerTransition('connected', 'wanted' as PeerEvent)).toEqual(['connected', []])
  })
})
