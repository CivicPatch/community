// Remembers the player's chosen name + avatar across reloads, so the pre-join gate can
// prefill them. Best-effort localStorage, mirroring draft.ts — a read/write failure
// (private mode, quota) just means we fall back to defaults, never throws.

const KEY = 'chat-room-identity'

export interface Identity {
  name: string
  avatar: string
}

export const loadIdentity = (): Identity | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Identity>
    if (typeof parsed.name !== 'string' || typeof parsed.avatar !== 'string') return null
    return { name: parsed.name, avatar: parsed.avatar }
  } catch {
    return null
  }
}

export const saveIdentity = (identity: Identity): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity))
  } catch {
    /* ignore */
  }
}
