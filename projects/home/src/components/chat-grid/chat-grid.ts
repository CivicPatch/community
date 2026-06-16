// Composition root (imperative shell): renders the grid, wires input to the pure
// core, and syncs presence through the swappable realtime backend.
// Phase 0: movement + collision + click-to-travel + room highlight. No audio yet.

import { html } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { component, useEffect, useRef, useState } from 'haunted'
import type { Coord, Grid, GridConfig, Player } from './core/types'
import { buildGrid, cellAt, coordKey, coordsEqual, isWalkable, nearestFreeCell } from './core/grid'
import { buildRooms, peersInRoom, roomOf } from './core/rooms'
import { applyDelta, canEnter, keyToDelta } from './core/movement'
import { findPath } from './core/pathfind'
import { validateGrid } from './core/validate'
import { renderCellGlyph } from './render/cell'
import { createBackend } from './shell/backend'
import type { RealtimeBackend, VoiceState } from './shell/realtime'
import { createMeshAudio } from './shell/webrtc'
import type { MeshAudio } from './shell/webrtc'
import { createMeter } from './shell/meter'
import type { Meter } from './shell/meter'
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
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set())
  const [blockedPeers, setBlocked] = useState<Set<string>>(new Set())
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [voices, setVoices] = useState<Record<string, VoiceState>>({})

  // Mutable mirrors for use inside timers / the mount effect (avoid stale closures).
  // Stable per-TAB id: survives a refresh (so a reload reuses the same presence
  // key and replaces the old entry instead of leaving a ghost duplicate), but is
  // unique per tab (sessionStorage isn't shared across tabs) so multi-tab works.
  const meId = useRef<string>('')
  if (!meId.current) {
    const stored = sessionStorage.getItem('chat-grid-id')
    meId.current = stored ?? crypto.randomUUID()
    if (!stored) sessionStorage.setItem('chat-grid-id', meId.current)
  }
  const meName = useRef<string>('')
  if (!meName.current) meName.current = `Guest ${meId.current.slice(0, 4)}`
  const me = useRef<Player | null>(null)
  const backendRef = useRef<RealtimeBackend | null>(null)
  const meshRef = useRef<MeshAudio | null>(null)
  const meterRef = useRef<Meter | null>(null)
  const voicesRef = useRef<Record<string, VoiceState>>({})
  const mutedRef = useRef(false)
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
        backend.onVoice((from, state) => {
          if (!cancelled) updateVoice(from, state)
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
      meterRef.current?.stop()
      meterRef.current = null
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
    const wanted =
      gate === 'on' && myCoord
        ? peersInRoom(rooms, myCoord, others).filter((id) => !blockedPeers.has(id))
        : []
    mesh.setWantedPeers(wanted)
  }, [gate, myCoord, others, rooms, blockedPeers])

  // Push blocks to the mesh so it severs and refuses those peers.
  useEffect(() => {
    meshRef.current?.setBlockedPeers([...blockedPeers])
  }, [blockedPeers])

  // Mic transmits ONLY while standing in an audio room and not manually muted.
  // Toggling track.enabled stops/starts audio without releasing the device, so
  // it never re-prompts for permission when you step back onto an audio tile.
  useEffect(() => {
    const inRoom = !!myCoord && roomOf(rooms, myCoord) !== null
    const live = gate === 'on' && inRoom && !muted
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = live))
  }, [myCoord, rooms, gate, muted])

  // Cells are exclusive, but two clients can land on the same one (e.g. both spawn
  // there before presence syncs). Deterministic tiebreak: the lowest id keeps the
  // cell; anyone else hops to the nearest free cell.
  useEffect(() => {
    const g = gridRef.current
    if (!g || !myCoord) return
    const sharing = others.some((p) => coordsEqual(p.coord, myCoord) && p.id < meId.current)
    if (sharing) moveTo(nearestFreeCell(g, myCoord, occupiedSet(others)))
  }, [others, myCoord])

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
      stream.getAudioTracks().forEach((t) => (t.enabled = false)) // the effect enables it when in a room
      meshRef.current?.setMic(stream)
      if (me.current) me.current.audioEnabled = true
      backendRef.current?.setAudioEnabled(true) // green ring = "enabled audio", synced to all
      // meter OUR OWN mic and broadcast the result (speaking + muted) so every
      // client can show us wiggling / muted grid-wide
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

  // Per-person mute: silence one peer's incoming audio while staying connected.
  const toggleMutePeer = (id: string) => {
    const next = new Set(mutedPeers)
    next.has(id) ? next.delete(id) : next.add(id)
    setMutedPeers(next)
  }

  // Block: sever and refuse a peer entirely (stronger than mute).
  const toggleBlockPeer = (id: string) => {
    const next = new Set(blockedPeers)
    next.has(id) ? next.delete(id) : next.add(id)
    setBlocked(next)
  }

  if (!grid) return html`${STYLE}<div class="cg-wrap">Loading grid…</div>`

  const myRoom = myCoord ? roomOf(rooms, myCoord) : null
  const roomPeers = myCoord ? peersInRoom(rooms, myCoord, others) : []
  const roomPeerPlayers =
    myRoom === null ? [] : others.filter((p) => roomOf(rooms, p.coord) === myRoom)
  const connectedCount = roomPeerPlayers.filter((p) => peerStates[p.id] === 'connected').length
  // side panel = the description of the tile you're STANDING on (hover uses the popover)
  const description = myCoord ? cellAt(grid, myCoord)?.description : undefined

  const cells = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const coord = { col, row }
      const cell = cellAt(grid, coord)
      const isAudioCell = cell?.audio === true
      const link = cell?.link ?? null
      const wall = cell?.walkable === false
      const hasDesc = !!cell?.description
      const activeRoom = isAudioCell && myRoom !== null && roomOf(rooms, coord) === myRoom
      const classes = ['cg-cell']
      if (isAudioCell) classes.push('cg-audio')
      if (activeRoom) classes.push('cg-active-room')
      if (link) classes.push('cg-link')
      if (hasDesc) classes.push('cg-has-desc')
      if (wall) classes.push('cg-wall')
      // compose the visual background: colour fill + image, both optional
      const bg = [
        cell?.color ? `background-color:${cell.color}` : '',
        cell?.image ? `background-image:url(${cell.image});background-size:cover;background-position:center` : '',
      ]
        .filter(Boolean)
        .join(';')
      // hover/focus preview popover (title + body), pure CSS — no JS state. The
      // FULL description (with links) shows in the side panel when you STAND here.
      const desc = cell?.description
      const pop = hasDesc
        ? html`<span class="cg-pop" aria-hidden="true">
            ${desc?.title ? html`<span class="cg-pop-title">${desc.title}</span>` : ''}
            ${desc?.body ? html`<span class="cg-pop-body">${desc.body}</span>` : ''}
          </span>`
        : ''
      cells.push(
        link
          ? // a real anchor: native new-tab, middle-click, screen-reader "link", no popup-blocker
            html`<a
              class=${classes.join(' ')}
              style=${bg}
              href=${link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label=${`Open link: ${link.label ?? link.url}`}
              >${renderCellGlyph(cell)}${pop}</a
            >`
          : html`<button
              class=${classes.join(' ')}
              style=${bg}
              ?disabled=${wall}
              title=${`${col},${row}`}
              @click=${() => onCellClick(coord)}
            >
              ${renderCellGlyph(cell)}${pop}
            </button>`,
      )
    }
  }

  const token = (
    c: Coord,
    name: string,
    isMe: boolean,
    enabled: boolean,
    inBlob: boolean,
    voice?: VoiceState,
  ) => {
    const speaking = voice?.speaking ?? false
    const shake = voice?.bucket ?? 0
    const isMuted = voice?.muted ?? false
    const classes = ['cg-token']
    if (isMe) classes.push('cg-me')
    if (enabled) classes.push('cg-enabled') // green ring — has enabled audio (everyone sees it)
    if (speaking && inBlob) classes.push('cg-speaking') // white ring — talking in your blob
    if (speaking) classes.push('cg-wiggling') // shake — anyone talking, grid-wide
    return html`
      <div class=${classes.join(' ')} style="--col:${c.col};--row:${c.row};--shake:${shake}">
        <span class="cg-token-name">${name}</span>
        <span class="cg-token-dot"></span>
        ${isMuted ? html`<span class="cg-token-mute" aria-hidden="true">🔇</span>` : ''}
      </div>
    `
  }

  return html`
    ${STYLE}
    <div class="cg-wrap">
      <div class="cg-stage">
        <div
          class="cg-grid"
          tabindex="0"
          style="--cols:${grid.columns};--rows:${grid.rows}"
          @keydown=${onKeyDown}
        >
          <div class="cg-cells">${cells}</div>
          <div class="cg-tokens">
            ${others.map((p) =>
              token(
                p.coord,
                p.name,
                false,
                p.audioEnabled ?? false,
                myRoom !== null && roomOf(rooms, p.coord) === myRoom,
                voices[p.id],
              ),
            )}
            ${myCoord
              ? token(myCoord, meName.current, true, gate === 'on', myRoom !== null, voices[meId.current])
              : ''}
          </div>
        </div>
        <aside class="cg-panel" aria-live="polite" aria-label="Tile details">
          ${description
            ? html`
                ${description.title
                  ? html`<h3 class="cg-panel-title">${description.title}</h3>`
                  : ''}
                ${description.body ? html`<p class="cg-panel-body">${description.body}</p>` : ''}
                ${description.links?.length
                  ? html`<ul class="cg-panel-links">
                      ${description.links.map(
                        (l) => html`<li>
                          <a href=${l.url} target="_blank" rel="noopener noreferrer">${l.label}</a>
                        </li>`,
                      )}
                    </ul>`
                  : ''}
              `
            : html`<p class="cg-panel-empty">Step onto a tile with details to see them here.</p>`}
        </aside>
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
                  : connectedCount === 0
                    ? 'connecting… (others must enable audio too)'
                    : `talking with ${connectedCount}`}
            </span>`
          : ''}
      </div>
      ${myRoom !== null
        ? html`<section class="cg-roster" aria-label="People in your audio room">
            ${roomPeerPlayers.length === 0
              ? html`<p class="cg-roster-empty">No one else in this room yet.</p>`
              : html`<ul class="cg-roster-list">
                  ${roomPeerPlayers.map((p) => {
                    const connected = peerStates[p.id] === 'connected'
                    const isMuted = mutedPeers.has(p.id)
                    const isBlocked = blockedPeers.has(p.id)
                    const menuOpen = menuOpenFor === p.id
                    const act = (fn: () => void) => () => {
                      fn()
                      setMenuOpenFor(null)
                    }
                    return html`<li class="cg-roster-item ${isBlocked ? 'cg-blocked' : ''}">
                      <span class="cg-roster-status ${connected ? 'cg-on' : ''}" aria-hidden="true"></span>
                      <span class="cg-roster-name">${p.name}</span>
                      ${gate === 'on' && !connected && !isBlocked
                        ? html`<span class="cg-roster-state">connecting…</span>`
                        : ''}
                      <span class="cg-visually-hidden">
                        ${isBlocked ? 'blocked' : connected ? 'connected' : 'connecting'}${isMuted ? ', muted' : ''}
                      </span>
                      <button
                        class="cg-btn cg-roster-menu-btn"
                        aria-haspopup="menu"
                        aria-expanded=${menuOpen}
                        aria-label=${`Actions for ${p.name}`}
                        @keydown=${(e: KeyboardEvent) => e.key === 'Escape' && setMenuOpenFor(null)}
                        @click=${() => setMenuOpenFor(menuOpen ? null : p.id)}
                      >
                        ⋯
                      </button>
                      ${menuOpen
                        ? html`<div class="cg-roster-menu" role="menu">
                            ${isBlocked
                              ? html`<button class="cg-btn" role="menuitem" @click=${act(() => toggleBlockPeer(p.id))}>
                                  Unblock
                                </button>`
                              : html`<button class="cg-btn" role="menuitem" @click=${act(() => toggleMutePeer(p.id))}>
                                    ${isMuted ? 'Unmute' : 'Mute'}
                                  </button>
                                  <button class="cg-btn" role="menuitem" @click=${act(() => toggleBlockPeer(p.id))}>
                                    Block
                                  </button>`}
                          </div>`
                        : ''}
                    </li>`
                  })}
                </ul>`}
          </section>`
        : ''}
      <!-- hidden audio sinks; keyed by peer id so playback isn't interrupted on re-render -->
      <div class="cg-audio-sinks" hidden>
        ${repeat(
          Object.entries(streams).filter(([, s]) => s),
          ([id]) => id,
          ([id, s]) =>
            html`<audio
              autoplay
              data-peer=${id}
              .srcObject=${s}
              .muted=${mutedPeers.has(id)}
            ></audio>`,
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
    :host {
      container-type: inline-size; /* makes 100cqw = this component's width */
    }
    .cg-wrap {
      font-family: system-ui, sans-serif;
      color: #ddd;
    }
    /* grid + detail panel: side by side when there's room, panel wraps below when not */
    .cg-stage {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
    }
    .cg-panel {
      flex: 1 1 180px;
      min-width: 180px;
      max-width: 320px;
      padding: 10px 12px;
      background: #1a1a1a;
      border-radius: 6px;
      font-size: 13px;
    }
    .cg-panel-title {
      margin: 0 0 6px;
      font-size: 15px;
    }
    .cg-panel-body {
      margin: 0 0 8px;
      color: #ccc;
    }
    .cg-panel-links {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .cg-panel-links a {
      color: #9cf;
    }
    .cg-panel-empty {
      margin: 0;
      color: #777;
    }
    .cg-grid {
      /* cells shrink to fit the component width on small screens, capped at 40px.
         tokens position via --cell too, so the avatar overlay scales in lockstep —
         no scrolling, no overlay misalignment. */
      --cell: min(40px, calc((100cqw - 8px) / var(--cols)));
      position: relative;
      display: inline-block;
      max-width: 100%;
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
      position: relative; /* anchor for the hover popover */
      width: var(--cell);
      height: var(--cell);
      margin: 0;
      padding: 0;
      border: none;
      background: #2b2b2b;
      box-shadow: inset 0 0 0 1px #1a1a1a;
      color: #ddd;
      text-decoration: none; /* the anchor (link tiles) shouldn't be underlined */
      font-size: calc(var(--cell) * 0.45); /* content (e.g. 🔊) scales with the cell */
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
    .cg-cell.cg-link {
      color: #9cf;
    }
    .cg-cell.cg-link:hover {
      background: #2a3a4a;
    }
    .cg-cell-char {
      font-weight: 600;
    }
    /* describable cells: hover/focus lifts the tile and pops a preview (title + body) */
    .cg-cell.cg-has-desc:hover,
    .cg-cell.cg-has-desc:focus-visible {
      box-shadow: inset 0 0 0 2px #6cf;
      z-index: 40; /* lift this tile + its popover above neighbours */
    }
    .cg-pop {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 6px;
      display: none;
      width: max-content;
      max-width: 200px;
      padding: 6px 8px;
      border-radius: 6px;
      background: #0f0f0f;
      box-shadow: 0 2px 10px #000a;
      color: #ddd;
      font-size: 12px;
      font-weight: 400;
      text-align: left;
      white-space: normal;
      pointer-events: none;
    }
    .cg-cell.cg-has-desc:hover .cg-pop,
    .cg-cell.cg-has-desc:focus-visible .cg-pop {
      display: block;
    }
    .cg-pop-title {
      display: block;
      font-weight: 600;
    }
    .cg-pop-body {
      display: block;
      margin-top: 2px;
      color: #bbb;
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
      min-height: 40px; /* comfortable touch target */
      padding: 6px 12px;
      border: 1px solid #444;
      border-radius: 6px;
      background: #2b2b2b;
      color: #ddd;
      cursor: pointer;
    }
    .cg-btn:hover:not(:disabled) {
      background: #3a3a3a;
    }
    .cg-btn:focus-visible {
      outline: 2px solid #6cf;
      outline-offset: 2px;
    }
    .cg-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .cg-controls-hint {
      color: #888;
      font-size: 12px;
    }
    .cg-token.cg-enabled .cg-token-dot {
      box-shadow: 0 0 0 3px #4ade4a, 0 0 9px 3px rgba(74, 222, 74, 0.75);
    }
    .cg-token-mute {
      position: absolute;
      right: -2px;
      bottom: -2px;
      font-size: calc(var(--cell) * 0.34);
      line-height: 1;
      filter: drop-shadow(0 1px 1px #000);
    }
    /* speaking ring (VAD): only for people in YOUR blob — the "light" indicator */
    .cg-token.cg-speaking .cg-token-dot {
      box-shadow: 0 0 0 3px #fff, 0 0 12px 3px rgba(255, 255, 255, 0.8);
    }
    /* wiggle (audio-reactive, amplitude = --shake): grid-wide, anyone talking */
    .cg-token.cg-wiggling .cg-token-dot {
      animation: cg-shake 0.16s linear infinite;
    }
    @keyframes cg-shake {
      0%,
      100% {
        transform: translateX(calc(var(--shake, 0) * -1px));
      }
      50% {
        transform: translateX(calc(var(--shake, 0) * 1px));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .cg-token.cg-wiggling .cg-token-dot {
        animation: none;
      } /* keep the ring, drop the motion */
    }
    .cg-roster {
      margin-top: 8px;
    }
    .cg-roster-empty {
      margin: 0;
      font-size: 12px;
      color: #888;
    }
    .cg-roster-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 320px;
    }
    .cg-roster-item {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 44px;
    }
    .cg-roster-item.cg-blocked .cg-roster-name {
      color: #777;
      text-decoration: line-through;
    }
    .cg-roster-status {
      flex: 0 0 auto;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #666;
    }
    .cg-roster-status.cg-on {
      background: #5c6;
    }
    .cg-roster-name {
      flex: 1 1 auto;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cg-roster-state {
      flex: 0 0 auto;
      color: #888;
      font-size: 11px;
    }
    .cg-roster-btn {
      flex: 0 0 auto;
    }
    .cg-roster-menu-btn {
      flex: 0 0 auto;
      min-width: 44px;
      font-size: 18px;
      line-height: 1;
    }
    .cg-roster-menu {
      flex-basis: 100%;
      display: flex;
      gap: 6px;
      padding-left: 17px; /* line up under the name, past the status dot */
    }
    .cg-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      overflow: hidden;
      white-space: nowrap;
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
