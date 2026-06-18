import { useRef, useState } from 'haunted'

// Document Picture-in-Picture (Chromium only — Chrome/Edge/Brave/Opera): pop the room into
// a small, always-on-top window. We move the whole <chat-room> HOST element into the PiP
// window, so its shadow styles and live lit render-root travel with it — the full UI
// (grid, controls, roster, status) renders there, just in a smaller window.
//
// Moving the host across documents fires the custom element's disconnect/reconnect. Haunted
// preserves useState (you stay joined) but runs every effect's CLEANUP on disconnect WITHOUT
// re-running the effect — so the connection/mic/viewport subscriptions drop. chat-room.ts
// watches `popped` and bumps a reconnectNonce to re-run those hooks (see useRoomConnection,
// useAudioControls, useViewport, usePageHideLeave), hence a brief reconnect on each pop.
//
// Closing the PiP window (its native close button) fires pagehide → popIn restores the host
// to exactly where it was in the page.

interface DocumentPiP {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
}
const getDocPiP = (): DocumentPiP | null =>
  (window as unknown as { documentPictureInPicture?: DocumentPiP }).documentPictureInPicture ?? null

export function usePip() {
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window
  const [popped, setPopped] = useState(false)
  const wrapRef = useRef<HTMLElement | null>(null) // the .cr-wrap node (lives in the shadow root)
  const placeholder = useRef<Comment | null>(null) // marks where the host sat in the page
  const pipWin = useRef<Window | null>(null)

  // ref callback for .cr-wrap — its shadow root's host IS the <chat-room> element we move.
  const setWrap = (el?: Element) => {
    wrapRef.current = (el as HTMLElement) ?? null
  }
  const hostEl = (): HTMLElement | null => {
    const root = wrapRef.current?.getRootNode()
    return root instanceof ShadowRoot ? (root.host as HTMLElement) : null
  }

  const popIn = () => {
    const host = hostEl()
    const ph = placeholder.current
    if (host && ph?.parentNode) {
      ph.parentNode.replaceChild(host, ph)
    }
    placeholder.current = null
    try {
      pipWin.current?.close()
    } catch {
      /* already gone */
    }
    pipWin.current = null
    setPopped(false)
  }

  const popOut = async () => {
    const host = hostEl()
    const docPiP = getDocPiP()
    if (!host || !docPiP || pipWin.current) return
    let win: Window
    try {
      win = await docPiP.requestWindow({ width: 380, height: 480 })
    } catch {
      return // user dismissed, or no user-activation — nothing opened, nothing to undo
    }
    pipWin.current = win
    // Carry the page styles over — the shadow styles travel with the host, but the
    // --ink/--bg theme tokens it reads through the shadow boundary come from index.css.
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style'))
      win.document.head.appendChild(node.cloneNode(true))
    win.document.body.style.cssText = 'margin:0;display:block;'
    const ph = document.createComment('chat-room')
    host.before(ph) // remember the spot for popIn
    placeholder.current = ph
    win.document.body.append(host) // adopts the host into the PiP document
    win.addEventListener('pagehide', popIn, { once: true })
    setPopped(true)
  }

  return { supported, popped, setWrap, popOut, popIn }
}
