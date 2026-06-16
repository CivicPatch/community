// Audio-gate FSM. Gates entry into voice: the user must take an explicit action
// (which doubles as the browser autoplay gesture), then we request mic permission.
// `requestMic` is the effect the shell runs (getUserMedia); its result feeds back
// as `granted` / `denied`.

export type AudioGateState = 'off' | 'requesting' | 'on' | 'denied'

export type AudioGateEvent = 'enable' | 'granted' | 'denied'

export type AudioGateEffect = 'requestMic'

export const initialGate: AudioGateState = 'off'

export const gateTransition = (
  state: AudioGateState,
  event: AudioGateEvent,
): [AudioGateState, AudioGateEffect[]] => {
  switch (state) {
    case 'off':
      return event === 'enable' ? ['requesting', ['requestMic']] : ['off', []]
    case 'requesting':
      if (event === 'granted') return ['on', []]
      if (event === 'denied') return ['denied', []]
      return ['requesting', []]
    case 'denied':
      // allow retrying after a denial (user may fix the permission and click again)
      return event === 'enable' ? ['requesting', ['requestMic']] : ['denied', []]
    case 'on':
      return ['on', []]
  }
}
