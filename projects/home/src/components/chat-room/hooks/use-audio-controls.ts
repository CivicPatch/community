// Voice/mic controls: the audio-gate FSM (request → granted/denied), mic capture,
// self-metering, and room-wide speaking/muted broadcast. Owns the gate/voices/muted
// state and their mirror refs (read inside callbacks). micRef/meterRef are passed in
// and read by the mic gate + connection hook; they live for the COMPONENT's lifetime
// (carried across room switches) and are released here on unmount.

import { useState, useRef, useEffect } from 'haunted'
import type { VoiceState } from '../shell/realtime'
import type { Session } from '../shell/session'
import { createMeter } from '../shell/meter'
import { gateTransition, initialGate } from '../core/fsm/audio-gate'
import type { AudioGateEvent, AudioGateState } from '../core/fsm/audio-gate'

export const useAudioControls = (session: Session) => {
  const { me, meId, backendRef, meshRef, micRef, meterRef } = session
  const [gate, setGate] = useState<AudioGateState>(initialGate)
  const [muted, setMuted] = useState(false)
  const [voices, setVoices] = useState<Record<string, VoiceState>>({})
  const voicesRef = useRef<Record<string, VoiceState>>({})
  const mutedRef = useRef(false)
  const gateRef = useRef<AudioGateState>(initialGate)

  const updateVoice = (id: string, state: VoiceState) => {
    voicesRef.current = { ...voicesRef.current, [id]: state }
    setVoices(voicesRef.current)
  }

  const broadcastVoice = (v: VoiceState) => {
    updateVoice(meId.current, v) // reflect locally
    backendRef.current?.sendVoice(v) // and tell everyone
  }

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micRef.current = stream
      stream.getAudioTracks().forEach((t) => (t.enabled = false)) // the gate enables it when in a huddle
      meshRef.current?.setMic(stream)
      if (me.current) me.current.audioEnabled = true
      backendRef.current?.updateSelf({ audioEnabled: true }) // green ring = "enabled audio", synced to all
      // meter OUR OWN mic and broadcast the result (speaking + muted) so every
      // client can show us wiggling / muted room-wide
      if (!meterRef.current)
        meterRef.current = createMeter((samples) => {
          const mine = samples[meId.current] ?? { speaking: false, bucket: 0 }
          broadcastVoice({ ...mine, muted: mutedRef.current })
        })
      meterRef.current.add(meId.current, stream)
      dispatchGate('granted')
    } catch {
      dispatchGate('denied')
    }
  }

  const dispatchGate = (event: AudioGateEvent) => {
    const [next, effects] = gateTransition(gateRef.current, event)
    gateRef.current = next
    setGate(next)
    if (effects.includes('requestMic')) requestMic()
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    mutedRef.current = next
    broadcastVoice({ speaking: false, bucket: 0, muted: next }) // tell everyone immediately
  }

  // Release the mic + meter on unmount only — they persist across room switches
  // (the connection hook carries the mic into each new room's mesh).
  useEffect(
    () => () => {
      meterRef.current?.stop()
      meterRef.current = null
      micRef.current?.getTracks().forEach((t) => t.stop())
      micRef.current = null
    },
    [],
  )

  return { gate, voices, muted, updateVoice, dispatchGate, toggleMute }
}
