// Pick a legible glyph colour (black or white) for a user-set tile background.
// User colours are fixed hex and don't track the theme, so the themed text colour
// can clash; deriving black/white from the background's luminance keeps the
// author's colour but guarantees readable content on it, in light OR dark mode.
// Uses WCAG relative luminance with the standard ~0.179 black/white crossover.

export const readableInk = (color: string): string | undefined => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return undefined // only hex is supported; caller falls back to theme text
  let hex = m[1]
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c)
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.179 ? '#000000' : '#ffffff'
}
