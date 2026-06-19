// One avatar token, positioned by --col/--row. isMe/enabled/inHuddle/voice drive the
// rings + wiggle; `bubble` is an always-open status popover above the avatar.

import { html } from 'lit'
import type { Coord } from '../core/types'
import type { VoiceState } from '../shell/realtime'
import { popover } from './popover'

export interface TokenDeps {
  /** edge-aware popover alignment, shared with the cells */
  popAlign: (col: number) => 'left' | 'right' | undefined
}

export const makeToken =
  ({ popAlign }: TokenDeps) =>
  (
    c: Coord,
    name: string,
    avatar: string | undefined,
    isMe: boolean,
    enabled: boolean,
    inHuddle: boolean,
    voice?: VoiceState,
    bubble?: { text: string; leaving: boolean },
  ) => {
    const speaking = voice?.speaking ?? false
    const shake = voice?.bucket ?? 0
    const isMuted = voice?.muted ?? false
    const classes = ['cr-token']
    if (isMe) classes.push('cr-me')
    if (enabled) classes.push('cr-enabled') // green ring — has enabled audio (everyone sees it)
    if (speaking && inHuddle) classes.push('cr-speaking') // white ring — talking in your huddle
    if (speaking) classes.push('cr-wiggling') // shake — anyone talking, room-wide
    return html`
      <div class=${classes.join(' ')} style="--col:${c.col};--row:${c.row};--shake:${shake}">
        ${bubble
          ? popover({
              body: bubble.text,
              open: true,
              leaving: bubble.leaving,
              below: c.row === 0,
              align: popAlign(c.col),
              extra: ['cr-pop-raise'],
            })
          : ''}
        <span class="cr-token-avatar" aria-hidden="true">${avatar || '●'}</span>
        <span class="cr-token-name">${name}</span>
        ${isMuted ? html`<span class="cr-token-mute" aria-hidden="true">🔇</span>` : ''}
      </div>
    `
  }
