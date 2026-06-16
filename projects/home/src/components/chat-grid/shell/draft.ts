// Local draft persistence for Map Editor — survives reloads / lost connection.
// Stamps each save so the user can see when their draft was last edited.

import type { GridConfig } from '../core/types'

const KEY = 'chat-grid-draft'

export interface Draft {
  savedAt: number // epoch ms
  config: GridConfig
}

export const saveDraft = (config: GridConfig): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), config } satisfies Draft))
  } catch {
    // storage unavailable / full — editing still works in memory
  }
}

export const loadDraft = (): Draft | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    return draft?.config ? draft : null
  } catch {
    return null
  }
}

export const clearDraft = (): void => {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
