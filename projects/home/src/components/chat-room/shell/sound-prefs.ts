// Which notification sounds the user has subscribed to. Best-effort localStorage,
// mirroring identity.ts / draft.ts — a read/write failure just falls back to defaults.
// Default: chime on people coming & going; stay quiet on status posts (opt-in).

const KEY = 'chat-room-sound-prefs'

export interface SoundPrefs {
  joinLeave: boolean
  status: boolean
}

const DEFAULTS: SoundPrefs = { joinLeave: true, status: false }

export const loadSoundPrefs = (): SoundPrefs => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>
    return {
      joinLeave: typeof parsed.joinLeave === 'boolean' ? parsed.joinLeave : DEFAULTS.joinLeave,
      status: typeof parsed.status === 'boolean' ? parsed.status : DEFAULTS.status,
    }
  } catch {
    return DEFAULTS
  }
}

export const saveSoundPrefs = (prefs: SoundPrefs): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}
