// Progressive enhancement for the prerendered homepage. The feed ships with absolute
// dates (so it reads fine with zero JS); when JS is available, upgrade the marked
// <time data-relative datetime="…"> elements to friendly relative times ("3 days ago").
// The machine-readable instant lives in the datetime attribute, so this just reformats.

const friendlyTime = (timestamp: string): string => {
  const diffMs = new Date(timestamp).getTime() - Date.now()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms || unit === 'second') return rtf.format(Math.round(diffMs / ms), unit)
  }
  return ''
}

const enhance = () => {
  for (const el of document.querySelectorAll<HTMLTimeElement>('time[data-relative][datetime]')) {
    const dt = el.getAttribute('datetime')
    if (dt) el.textContent = friendlyTime(dt)
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance)
else enhance()
