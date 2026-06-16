import { describe, it, expect } from 'vitest'
import { readableInk } from './color'

describe('readableInk', () => {
  it('returns white on dark backgrounds', () => {
    expect(readableInk('#2e2e44')).toBe('#ffffff') // the check-in tile colour
    expect(readableInk('#000')).toBe('#ffffff')
    expect(readableInk('#16171d')).toBe('#ffffff')
  })

  it('returns black on light backgrounds', () => {
    expect(readableInk('#ffffff')).toBe('#000000')
    expect(readableInk('#ffeb3b')).toBe('#000000') // bright yellow
    expect(readableInk('#aed581')).toBe('#000000') // light green
  })

  it('accepts 3-digit hex and an optional leading #', () => {
    expect(readableInk('fff')).toBe('#000000')
    expect(readableInk('#000000')).toBe('#ffffff')
  })

  it('returns undefined for non-hex (caller falls back to the theme colour)', () => {
    expect(readableInk('rebeccapurple')).toBeUndefined()
    expect(readableInk('rgb(0,0,0)')).toBeUndefined()
    expect(readableInk('')).toBeUndefined()
  })
})
