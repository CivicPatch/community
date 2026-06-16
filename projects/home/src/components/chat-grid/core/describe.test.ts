import { describe, it, expect } from 'vitest'
import { describeCell } from './describe'
import type { Cell } from './types'

const at = (patch: Partial<Cell>): Cell => ({ coord: { col: 0, row: 0 }, ...patch })

describe('describeCell', () => {
  it('returns undefined for empty floor / missing cells', () => {
    expect(describeCell(undefined)).toBeUndefined()
    expect(describeCell(at({}))).toBeUndefined()
  })

  it('prefers an authored description over any default', () => {
    const authored = { title: 'Custom', body: 'hi' }
    expect(describeCell(at({ audio: true, description: authored }))).toBe(authored)
  })

  it('defaults audio tiles to the enable-audio hint', () => {
    const d = describeCell(at({ audio: true }))
    expect(d?.title).toContain('Audio')
    expect(d?.body).toMatch(/enable audio/i)
  })

  it('defaults a radio tile to its station name', () => {
    const d = describeCell(at({ radio: { url: 'http://x', label: 'Groove Salad' } }))
    expect(d?.title).toContain('Groove Salad')
  })

  it('falls back to a generic radio title when unlabelled', () => {
    const d = describeCell(at({ radio: { url: 'http://x' } }))
    expect(d?.title).toBe('📻 Radio')
  })

  it('defaults link tiles to an open-in-tab hint', () => {
    expect(describeCell(at({ link: { url: 'http://x' } }))?.body).toMatch(/new tab/i)
  })
})
