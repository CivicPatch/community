// Shared floating popover — the `cr-pop` chrome. One component for the cell description
// hover, the status bubble, and (soon) toasts. They differ only in TRIGGER and PLACEMENT:
//   • trigger  — pointer vs. timer. `open: true` force-shows it (timer-driven); omit it
//                to leave visibility to the anchor's CSS `:hover` (the description case).
//   • placement — passed in (below/align/extra); the box itself is identical.

import { html } from 'lit'
import type { TemplateResult } from 'lit'

export interface PopoverOpts {
  title?: string
  body?: string
  /** force it shown (timer-driven). Omit to leave visibility to the anchor's CSS :hover. */
  open?: boolean
  /** flip below the anchor (e.g. top row) instead of above */
  below?: boolean
  /** align to an edge instead of centering (near room edges) */
  align?: 'left' | 'right'
  /** extra modifier classes (e.g. 'cr-pop-raise' to clear a token's name) */
  extra?: string[]
}

export const popover = (opts: PopoverOpts): TemplateResult => {
  const cls = ['cr-pop']
  if (opts.open) cls.push('cr-pop--open')
  if (opts.below) cls.push('cr-pop-below')
  if (opts.align === 'left') cls.push('cr-pop-left')
  else if (opts.align === 'right') cls.push('cr-pop-right')
  if (opts.extra) cls.push(...opts.extra)
  return html`<span class=${cls.join(' ')} aria-hidden="true">
    ${opts.title ? html`<span class="cr-pop-title">${opts.title}</span>` : ''}
    ${opts.body ? html`<span class="cr-pop-body">${opts.body}</span>` : ''}
  </span>`
}
