// Minimal typed pub/sub. Replaces the repeated listeners-array boilerplate that
// every backend grew for onPlayers / onStatus / onSignal.

export interface Emitter<T> {
  emit(value: T): void
  /** subscribe; returns an unsubscribe fn */
  on(cb: (value: T) => void): () => void
}

export const createEmitter = <T>(): Emitter<T> => {
  let listeners: ((value: T) => void)[] = []
  return {
    emit(value) {
      for (const l of [...listeners]) l(value) // copy: a listener may unsubscribe mid-emit
    },
    on(cb) {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    },
  }
}
