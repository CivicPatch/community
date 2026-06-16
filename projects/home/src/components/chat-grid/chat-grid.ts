// Composition root (imperative shell): renders the grid, wires input to the pure
// core, and syncs presence through the swappable realtime backend.
// Phase 0: movement + collision + click-to-travel + room highlight. No audio yet.

import { html } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { component, useEffect, useRef, useState } from 'haunted'
import type { Coord, Grid, GridConfig, Player } from './core/types'
import { buildGrid, cellAt, coordKey, isWalkable } from './core/grid'
import { buildRooms, peersInRoom, roomOf } from './core/rooms'
import { applyDelta, canEnter, keyToDelta } from './core/movement'
import { findPath } from './core/pathfind'
import { validateGrid } from './core/validate'
import { renderCellContent } from './render/cell'
import { createBackend } from './shell/backend'
import type { RealtimeBackend } from './shell/realtime'
import { createMeshAudio } from './shell/webrtc'
import type { MeshAudio } from './shell/webrtc'
import type { ConnStatus } from './core/fsm/session'
import type { PeerState } from './core/fsm/peer'
import { gateTransition, initialGate } from './core/fsm/audio-gate'
import type { AudioGateEvent, AudioGateState } from './core/fsm/audio-gate'

const STEP_MS = 140 // pace of click-to-travel

const occupiedSet = (players: Player[]): Set<string> => {
  const s = new Set<string>()
  for (const p of players) s.add(coordKey(p.coord))
  return s
}

const loadConfig = async (url: string): Promise<GridConfig> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load grid config: ${res.status}`)
  return res.json()
}

const pickSpawn = (grid: Grid, config: GridConfig): Coord => {
  if (config.spawn && isWalkable(grid, config.spawn)) return config.spawn
  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.columns; col++)
      if (isWalkable(grid, { col, row })) return { col, row }
  return { col: 0, row: 0 }
}

interface ChatGridProps {
  'config-url'?: string
}

const ChatGrid = ({ 'config-url': configUrl = 'grid.json' }: ChatGridProps) => {
  const [grid, setGrid] = useState<Grid | null>(null)
  const [rooms, setRooms] = useState<Map<string, number>>(new Map())
  const [errors, setErrors] = useState<string[]>([])
  const [others, setOthers] = useState<Player[]>([])
  const [myCoord, setMyCoord] = useState<Coord | null>(null)
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const [gate, setGate] = useState<AudioGateState>(initialGate)
  const [muted, setMuted] = useState(false)
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({})
  const [streams, setStreams] = useState<Record<string, MediaStream | null>>({})

  // Mutable mirrors for use inside timers / the mount effect (avoid stale closures).
  const meId = useRef<string>('')
  if (!meId.current) meId.current = crypto.randomUUID()
  const meName = useRef<string>('')
  if (!meName.current) meName.current = `Guest ${meId.current.slice(0, 4)}`
  const me = useRef<Player | null>(null)
  const backendRef = useRef<RealtimeBackend | null>(null)
  const meshRef = useRef<MeshAudio | null>(null)
  const gateRef = useRef<AudioGateState>(initialGate)
  const micRef = useRef<MediaStream | null>(null)
  const streamsRef = useRef<Record<string, MediaStream | null>>({})
  const gridRef = useRef<Grid | null>(null)
  const othersRef = useRef<Player[]>([])
  const travelRef = useRef<{ timer: number | null }>({ timer: null })

  gridRef.current = grid
  othersRef.current = others

  const cancelTravel = () => {
    if (travelRef.current.timer !== null) {
      clearInterval(travelRef.current.timer)
      travelRef.current.timer = null
    }
  }

  // Load config, build grid + rooms, join the backend. Runs once per config-url.
  useEffect(() => {
    let cancelled = false
    const setup = async () => {
      try {
        const config = await loadConfig(configUrl)
        if (cancelled) return
        const g = buildGrid(config)
        const spawn = pickSpawn(g, config)
        const player: Player = { id: meId.current, name: meName.current, coord: spawn }
        me.current = player
        setGrid(g)
        setRooms(buildRooms(g))
        setErrors(validateGrid(config))
        setMyCoord(spawn)

        const backend = createBackend()
        backendRef.current = backend
        backend.onPlayers((o) => {
          if (!cancelled) setOthers(o)
        })
        backend.onStatus((s) => {
          if (!cancelled) setStatus(s)
        })

        const mesh = createMeshAudio(player.id, backend)
        meshRef.current = mesh
        mesh.onRemoteStream((id, s) => {
          if (cancelled) return
          if (s) streamsRef.current = { ...streamsRef.current, [id]: s }
          else {
            const next = { ...streamsRef.current }
            delete next[id]
            streamsRef.current = next
          }
          setStreams(streamsRef.current)
        })
        mesh.onPeerStates((states) => {
          if (!cancelled) setPeerStates(states)
        })

        backend.join(player)
      } catch (err) {
        if (!cancelled) setErrors([String(err)])
      }
    }
    setup()
    return () => {
      cancelled = true
      cancelTravel()
      meshRef.current?.close()
      meshRef.current = null
      micRef.current?.getTracks().forEach((t) => t.stop())
      micRef.current = null
      backendRef.current?.leave()
      backendRef.current = null
    }
  }, [configUrl])

  // Drive audio peers from room membership: connect to everyone in my audio room
  // (once I've enabled audio), disconnect from everyone else.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const wanted = gate === 'on' && myCoord ? peersInRoom(rooms, myCoord, others) : []
    mesh.setWantedPeers(wanted)
  }, [gate, myCoord, others, rooms])

  // Mic transmits ONLY while standing in an audio room and not manually muted.
  // Toggling track.enabled stops/starts audio without releasing the device, so
  // it never re-prompts for permission when you step back onto an audio tile.
  useEffect(() => {
    const inRoom = !!myCoord && roomOf(rooms, myCoord) !== null
    const live = gate === 'on' && inRoom && !muted
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = live))
  }, [myCoord, rooms, gate, muted])

  const moveTo = (target: Coord) => {
    const g = gridRef.current
    if (!g) return
    if (!canEnter(g, target, occupiedSet(othersRef.current))) return
    if (me.current) me.current.coord = target
    setMyCoord(target)
    backendRef.current?.updatePosition(target)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = keyToDelta(e.key)
    if (!delta || !myCoord) return
    e.preventDefault()
    cancelTravel()
    moveTo(applyDelta(myCoord, delta))
  }

  const startTravel = (path: Coord[]) => {
    cancelTravel()
    let i = 0
    const tick = () => {
      const g = gridRef.current
      if (i >= path.length || !g) return cancelTravel()
      const step = path[i]
      if (!canEnter(g, step, occupiedSet(othersRef.current))) return cancelTravel() // blocked mid-walk
      moveTo(step)
      i++
    }
    // establish the interval BEFORE the first step, so a throw in step 0 can't
    // prevent the rest of the path from running
    travelRef.current.timer = window.setInterval(tick, STEP_MS)
    tick()
  }

  const onCellClick = (target: Coord) => {
    const g = gridRef.current
    if (!g || !myCoord) return
    const path = findPath(g, myCoord, target, occupiedSet(othersRef.current))
    if (path && path.length) startTravel(path)
  }

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micRef.current = stream
      stream.getAudioTracks().forEach((t) => (t.enabled = false)) // the effect enables it when in a room
      meshRef.current?.setMic(stream)
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

  const toggleMute = () => setMuted(!muted) // the mic-live effect applies it to the tracks

  if (!grid) return html`${STYLE}<div class="cg-wrap">Loading grid…</div>`

  const myRoom = myCoord ? roomOf(rooms, myCoord) : null
  const roomPeers = myCoord ? peersInRoom(rooms, myCoord, others) : []

  const cells = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const coord = { col, row }
      const cell = cellAt(grid, coord)
      const isAudioCell = cell?.content?.type === 'audio'
      const wall = cell?.walkable === false
      const activeRoom = isAudioCell && myRoom !== null && roomOf(rooms, coord) === myRoom
      const classes = ['cg-cell']
      if (isAudioCell) classes.push('cg-audio')
      if (activeRoom) classes.push('cg-active-room')
      if (wall) classes.push('cg-wall')
      cells.push(html`
        <button
          class=${classes.join(' ')}
          style=${cell?.style?.color ? `background:${cell.style.color}` : ''}
          ?disabled=${wall}
          title=${`${col},${row}`}
          @click=${() => onCellClick(coord)}
        >
          ${renderCellContent(cell)}
        </button>
      `)
    }
  }

  const token = (c: Coord, name: string, isMe: boolean, connected = false) => html`
    <div
      class="cg-token ${isMe ? 'cg-me' : ''} ${connected ? 'cg-connected' : ''}"
      style="--col:${c.col};--row:${c.row}"
    >
      <span class="cg-token-name">${name}</span>
      <span class="cg-token-dot"></span>
    </div>
  `

  return html`
    ${STYLE}
    <div class="cg-wrap">
      <div
        class="cg-grid"
        tabindex="0"
        style="--cols:${grid.columns};--rows:${grid.rows}"
        @keydown=${onKeyDown}
      >
        <div class="cg-cells">${cells}</div>
        <div class="cg-tokens">
          ${others.map((p) => token(p.coord, p.name, false, peerStates[p.id] === 'connected'))}
          ${myCoord ? token(myCoord, meName.current, true) : ''}
        </div>
      </div>
      <div class="cg-controls">
        ${gate === 'on'
          ? html`<button class="cg-btn" @click=${toggleMute}>
              ${muted ? '🔇 Unmute' : '🎙️ Mute'}
            </button>`
          : html`<button
              class="cg-btn"
              ?disabled=${gate === 'requesting'}
              @click=${() => dispatchGate('enable')}
            >
              ${gate === 'requesting'
                ? 'Requesting mic…'
                : gate === 'denied'
                  ? 'Mic blocked — retry'
                  : '🔊 Enable audio'}
            </button>`}
        ${gate === 'on'
          ? html`<span class="cg-controls-hint">
              ${myRoom === null
                ? 'step onto an audio tile to talk'
                : roomPeers.length === 0
                  ? 'no one else in this room yet'
                  : `talking with ${roomPeers.length}`}
            </span>`
          : ''}
      </div>
      <!-- hidden audio sinks; keyed by peer id so playback isn't interrupted on re-render -->
      <div class="cg-audio-sinks" hidden>
        ${repeat(
          Object.entries(streams).filter(([, s]) => s),
          ([id]) => id,
          ([id, s]) => html`<audio autoplay data-peer=${id} .srcObject=${s}></audio>`,
        )}
      </div>
      <div class="cg-status">
        <span class="cg-badge" data-status=${status}>${status}</span>
        <strong>${meName.current}</strong>
        ${myCoord ? html` @ ${myCoord.col},${myCoord.row}` : ''} ·
        ${myRoom === null
          ? 'not in an audio room'
          : `audio room #${myRoom} — ${roomPeers.length + 1} here`}
        · ${others.length} other${others.length === 1 ? '' : 's'} online
        <div class="cg-hint">click the grid, then move with WASD / arrows or click a cell</div>
      </div>
      ${errors.length
        ? html`<ul class="cg-errors">
            ${errors.map((e) => html`<li>${e}</li>`)}
          </ul>`
        : ''}
    </div>
  `
}

// Styles live in the template, scoped by the shadow root (Haunted's default).
// Scoping is what prevents the document-wide style recalc/flicker you'd get from
// a global <style> in light DOM. lit keeps this <style> stable across renders.
const STYLE = html`
  <style>
    .cg-wrap {
      font-family: system-ui, sans-serif;
      color: #ddd;
    }
    .cg-grid {
      --cell: 40px;
      position: relative;
      display: inline-block;
      padding: 2px;
      background: #1a1a1a;
      border-radius: 6px;
      outline: none;
    }
    .cg-grid:focus-visible {
      box-shadow: 0 0 0 2px #6cf;
    }
    .cg-cells {
      display: grid;
      grid-template-columns: repeat(var(--cols), var(--cell));
      grid-template-rows: repeat(var(--rows), var(--cell));
    }
    .cg-cell {
      width: var(--cell);
      height: var(--cell);
      margin: 0;
      padding: 0;
      border: none;
      background: #2b2b2b;
      box-shadow: inset 0 0 0 1px #1a1a1a;
      color: #ddd;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cg-cell:hover:not(:disabled) {
      background: #3a3a3a;
    }
    .cg-cell.cg-audio {
      background: #24323a;
    }
    .cg-cell.cg-audio.cg-active-room {
      background: #2f5d6b;
      box-shadow: inset 0 0 0 2px #6cf;
    }
    .cg-cell.cg-wall {
      background: #111;
      cursor: default;
    }
    .cg-tokens {
      position: absolute;
      inset: 2px;
      pointer-events: none;
    }
    .cg-token {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--cell);
      height: var(--cell);
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(calc(var(--col) * var(--cell)), calc(var(--row) * var(--cell)));
      transition: transform 0.12s linear;
    }
    .cg-token-dot {
      width: 58%;
      height: 58%;
      border-radius: 50%;
      background: #f0a;
      box-shadow: 0 0 0 2px #0008;
    }
    .cg-token.cg-me .cg-token-dot {
      background: #6cf;
    }
    .cg-token-name {
      position: absolute;
      top: -13px;
      font-size: 10px;
      color: #fff;
      white-space: nowrap;
      text-shadow: 0 1px 2px #000;
    }
    .cg-status {
      margin-top: 8px;
      font-size: 13px;
    }
    .cg-badge {
      display: inline-block;
      padding: 1px 7px;
      margin-right: 6px;
      border-radius: 10px;
      font-size: 11px;
      color: #111;
      background: #888;
    }
    .cg-badge[data-status='connected'] {
      background: #5c6;
    }
    .cg-badge[data-status='connecting'],
    .cg-badge[data-status='reconnecting'] {
      background: #db4;
    }
    .cg-badge[data-status='offline'] {
      background: #e55;
      color: #fff;
    }
    .cg-hint {
      color: #888;
      font-size: 12px;
      margin-top: 2px;
    }
    .cg-controls {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cg-btn {
      font: inherit;
      font-size: 13px;
      padding: 4px 10px;
      border: 1px solid #444;
      border-radius: 6px;
      background: #2b2b2b;
      color: #ddd;
      cursor: pointer;
    }
    .cg-btn:hover:not(:disabled) {
      background: #3a3a3a;
    }
    .cg-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .cg-controls-hint {
      color: #888;
      font-size: 12px;
    }
    .cg-token.cg-connected .cg-token-dot {
      box-shadow: 0 0 0 2px #5c6, 0 0 6px #5c6;
    }
    .cg-errors {
      margin-top: 8px;
      color: #f88;
      font-size: 13px;
    }
  </style>
`

customElements.define(
  'chat-grid',
  // shadow DOM (Haunted's default) scopes the styles above and prevents flicker
  component(ChatGrid, { observedAttributes: ['config-url'], useShadowDOM: true }),
)
