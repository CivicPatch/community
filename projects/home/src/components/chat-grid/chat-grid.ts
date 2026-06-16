// Composition root (imperative shell): renders the grid, wires input to the pure
// core, and syncs presence through the swappable realtime backend.
// Phase 0: movement + collision + click-to-travel + room highlight. No audio yet.

import { html } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { ref } from 'lit/directives/ref.js'
import { component, useEffect, useRef, useState } from 'haunted'
import type { Cell, Coord, Grid, GridConfig, Player } from './core/types'
import { buildGrid, cellAt, coordKey, coordsEqual, isWalkable, nearestFreeCell } from './core/grid'
import { clearCell, setCell, serializeConfig, setGridMeta } from './core/edit'
import { clearDraft, loadDraft, saveDraft } from './shell/draft'
import type { Draft } from './shell/draft'
import { buildRooms, peersInRoom, roomOf } from './core/rooms'
import { applyDelta, canEnter, keyToDelta } from './core/movement'
import { findPath } from './core/pathfind'
import { validateGrid } from './core/validate'
import { readableInk } from './core/color'
import { renderCellGlyph } from './render/cell'
import { createBackend } from './shell/backend'
import { GITHUB_EDIT_URL } from './shell/config'
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

// stable ref callback (NOT inline, or lit would re-run it every render and steal
// focus on each keystroke) — focuses the modal on open so Escape works immediately
const focusEl = (el?: Element) => {
  if (el instanceof HTMLElement) el.focus()
}

const inputValue = (e: Event) => (e.target as HTMLInputElement).value

// labels for the mutually-exclusive pickers in the cell editor
const ROLE_LABELS = { floor: 'Floor', wall: 'Wall', audio: '🔊 Audio', link: '🔗 Link' } as const
const GLYPH_LABELS = { none: 'None', char: 'Character', svg: 'Inline SVG' } as const

// At most one modal is open at a time — one tagged value, not three booleans that
// could contradict each other. The cell editor carries the cell it's editing.
type Overlay =
  | { kind: 'none' }
  | { kind: 'cell'; cell: Cell }
  | { kind: 'json' }
  | { kind: 'settings' }

// "5 minutes ago" style label for the draft's last-edited time
const formatAgo = (ms: number): string => {
  const sec = Math.round((Date.now() - ms) / 1000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]
  for (const [unit, s] of units)
    if (Math.abs(sec) >= s || unit === 'second') return rtf.format(-Math.round(sec / s), unit)
  return 'just now'
}

// Preset avatars for the join gate — emoji only. No uploaded images: that would need a
// storage bucket, which the free / cannot-be-charged constraint rules out.
const AVATARS = ['🦊', '🐙', '🐳', '🦉', '🐝', '🦋', '🐢', '🦄', '🐸', '🐱', '🦝', '🐧']

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
  // pre-join identity gate: hold the chosen name + avatar until the user commits
  const [joined, setJoined] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [avatarDraft, setAvatarDraft] = useState(AVATARS[0])
  // map editor
  const [config, setConfig] = useState<GridConfig | null>(null)
  const [mapMode, setMapMode] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [draft, setDraft] = useState<Draft | null>(null)
  // the cell being edited, if any — read off the single overlay state
  const editCell = overlay.kind === 'cell' ? overlay.cell : null
  const closeOverlay = () => setOverlay({ kind: 'none' })
  const setEditCell = (cell: Cell | null) =>
    setOverlay(cell ? { kind: 'cell', cell } : { kind: 'none' })

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

  // Adopt a config and rebuild everything derived from it (used on load and on edits).
  const applyConfig = (c: GridConfig) => {
    const g = buildGrid(c)
    setConfig(c)
    setGrid(g)
    setRooms(buildRooms(g))
    setErrors(validateGrid(c))
  }

  // an edit: rebuild AND persist a timestamped draft to localStorage
  const editConfig = (c: GridConfig) => {
    applyConfig(c)
    saveDraft(c)
  }

  // Load config, build grid + rooms, join the backend. Runs once per config-url.
  useEffect(() => {
    let cancelled = false
    const setup = async () => {
      try {
        const loaded = await loadConfig(configUrl)
        if (cancelled) return
        const g = buildGrid(loaded)
        const spawn = pickSpawn(g, loaded)
        const player: Player = { id: meId.current, name: meName.current, coord: spawn }
        me.current = player
        applyConfig(loaded)
        setMyCoord(spawn)
        const savedDraft = loadDraft()
        if (savedDraft && !cancelled) setDraft(savedDraft) // offer to resume

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

        // NB: join() is deferred to the pre-join gate's submit (submitJoin) — we don't
        // announce presence or subscribe until the user has picked a name + avatar.
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

  // Esc closes whatever overlay is open, wherever focus happens to be. Attached
  // only while something is open, so it never interferes with normal play.
  useEffect(() => {
    if (overlay.kind === 'none' && !menuOpenFor) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeOverlay()
      setMenuOpenFor(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [overlay, menuOpenFor])

  const moveTo = (target: Coord) => {
    const g = gridRef.current
    if (!g) return
    if (!canEnter(g, target, occupiedSet(othersRef.current))) return
    if (me.current) me.current.coord = target
    setMyCoord(target)
    backendRef.current?.updatePosition(target)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (mapMode) return // editing, not playing
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
    if (!g) return
    if (mapMode) {
      // open the cell editor on a clone of the current cell (or a blank one)
      setEditCell(structuredClone(cellAt(g, target) ?? { coord: target }))
      return
    }
    if (!myCoord) return
    const path = findPath(g, myCoord, target, occupiedSet(othersRef.current))
    if (path && path.length) startTravel(path)
  }

  // --- map editor: edit the working cell, then commit/clear into the draft config ---
  const editPatch = (patch: Partial<Cell>) => editCell && setEditCell({ ...editCell, ...patch })
  // A tile is exactly ONE of these (mutually exclusive behavior). Derived from the
  // cell so the radio always reflects the real state — no separate UI flag to desync.
  const cellRole = (c: Cell): 'floor' | 'wall' | 'audio' | 'link' =>
    c.link ? 'link' : c.audio ? 'audio' : c.walkable === false ? 'wall' : 'floor'
  const setRole = (role: ReturnType<typeof cellRole>) => {
    if (role === 'link') editPatch({ link: editCell?.link ?? { url: '' }, audio: undefined, walkable: false })
    else if (role === 'audio') editPatch({ audio: true, link: undefined, walkable: undefined })
    else if (role === 'wall') editPatch({ walkable: false, audio: undefined, link: undefined })
    else editPatch({ walkable: undefined, audio: undefined, link: undefined })
  }
  // Foreground glyph: char and inline SVG are mutually exclusive (only one renders).
  const cellGlyph = (c: Cell): 'none' | 'char' | 'svg' =>
    c.char !== undefined ? 'char' : c.svg !== undefined ? 'svg' : 'none'
  const setGlyph = (g: ReturnType<typeof cellGlyph>) => {
    if (g === 'char') editPatch({ char: editCell?.char ?? '', svg: undefined })
    else if (g === 'svg') editPatch({ svg: editCell?.svg ?? '', char: undefined })
    else editPatch({ char: undefined, svg: undefined })
  }
  const applyEdit = () => {
    if (config && editCell) {
      // drop fields the user revealed but left blank, so they don't pollute the JSON
      const c: Cell = { ...editCell }
      if (c.char === '') delete c.char
      if (c.svg === '') delete c.svg
      if (c.link && !c.link.url.trim()) {
        delete c.link
        if (c.walkable === false) delete c.walkable // an unfinished link reverts to floor
      }
      editConfig(setCell(config, c))
    }
    setEditCell(null)
  }
  const clearEditedCell = () => {
    if (config && editCell) editConfig(clearCell(config, editCell.coord))
    setEditCell(null)
  }
  const resumeDraft = () => {
    if (draft) {
      applyConfig(draft.config)
      setMapMode(true)
    }
    setDraft(null)
  }
  const discardDraft = () => {
    clearDraft()
    setDraft(null)
  }
  const copyJson = () => {
    if (config) navigator.clipboard?.writeText(serializeConfig(config))
  }
  const editLink = (field: 'url' | 'label', value: string) => {
    const cur = editCell?.link
    const url = (field === 'url' ? value : (cur?.url ?? '')).trim()
    const label = (field === 'label' ? value : (cur?.label ?? '')).trim() || undefined
    // a link is a non-walkable kiosk: setting one forces walkable:false; clearing resets it
    editPatch(url ? { link: { url, label }, walkable: false } : { link: undefined, walkable: undefined })
  }
  const editDesc = (patch: Partial<NonNullable<Cell['description']>>) => {
    const d = { ...(editCell?.description ?? {}), ...patch }
    const empty = !d.title && !d.body && !d.links?.length
    editPatch({ description: empty ? undefined : d })
  }
  const editDescLink = (field: 'url' | 'label', value: string) => {
    const cur = editCell?.description?.links?.[0]
    const url = (field === 'url' ? value : (cur?.url ?? '')).trim()
    const label = (field === 'label' ? value : (cur?.label ?? '')).trim()
    editDesc({ links: url ? [{ url, label: label || url }] : undefined })
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
      backendRef.current?.updateSelf({ audioEnabled: true }) // green ring = "enabled audio", synced to all
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

  // Pre-join gate submit: commit the chosen name + avatar onto our player, then join.
  const submitJoin = () => {
    if (joined || !me.current) return
    const name = nameDraft.trim() || meName.current
    meName.current = name
    me.current.name = name
    me.current.avatar = avatarDraft
    backendRef.current?.join(me.current)
    setJoined(true)
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
      // compose the visual background: colour fill + image, both optional. A
      // user-set colour doesn't track the theme, so derive a legible glyph colour
      // from it (else fall back to the theme text colour).
      const ink = cell?.color ? readableInk(cell.color) : undefined
      const bg = [
        cell?.color ? `background-color:${cell.color}` : '',
        ink ? `color:${ink}` : '',
        cell?.image ? `background-image:url(${cell.image});background-size:cover;background-position:center` : '',
      ]
        .filter(Boolean)
        .join(';')
      // hover/focus preview popover (title + body), pure CSS — no JS state. The
      // FULL description (with links) shows in the side panel when you STAND here.
      const desc = cell?.description
      // edge-aware popover placement (we know col/row, so no measuring): flip below
      // on the top row, and align to the side near the left/right edges
      const popCls = ['cg-pop']
      if (row === 0) popCls.push('cg-pop-below')
      if (col < 3) popCls.push('cg-pop-left')
      else if (col >= grid.columns - 3) popCls.push('cg-pop-right')
      const pop = hasDesc
        ? html`<span class=${popCls.join(' ')} aria-hidden="true">
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
              @click=${(e: Event) => {
                if (mapMode) {
                  e.preventDefault() // edit the tile instead of following the link
                  onCellClick(coord)
                }
              }}
              >${renderCellGlyph(cell)}${pop}</a
            >`
          : html`<button
              class=${classes.join(' ')}
              style=${bg}
              ?disabled=${wall}
              tabindex="-1"
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
    avatar: string | undefined,
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
        ${avatar ? html`<span class="cg-token-avatar" aria-hidden="true">${avatar}</span>` : ''}
        <span class="cg-token-name">${name}</span>
        <span class="cg-token-dot"></span>
        ${isMuted ? html`<span class="cg-token-mute" aria-hidden="true">🔇</span>` : ''}
      </div>
    `
  }

  return html`
    ${STYLE}
    <div class="cg-wrap">
      ${draft
        ? html`<div class="cg-draft-banner" role="status">
            <span>📝 You have a map draft, last edited ${formatAgo(draft.savedAt)}.</span>
            <button class="cg-btn" @click=${resumeDraft}>Resume</button>
            <button class="cg-btn" @click=${discardDraft}>Discard</button>
          </div>`
        : ''}
      <div class="cg-controls">
        <button
          class="cg-btn ${mapMode ? 'cg-btn-primary' : ''}"
          aria-pressed=${mapMode}
          @click=${() => {
            setMapMode(!mapMode)
            setEditCell(null)
          }}
        >
          ${mapMode ? '✓ Done editing' : '🗺️ Map Editor'}
        </button>
        ${mapMode
          ? html`<button class="cg-btn" @click=${() => setOverlay({ kind: 'settings' })}>⚙ Grid settings</button>
              <button class="cg-btn" @click=${() => setOverlay({ kind: 'json' })}>📋 View / export JSON</button>`
          : ''}
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
      <div class="cg-stage">
        <div
          class="cg-grid"
          tabindex="0"
          role="application"
          aria-label="Movement grid. Use WASD or arrow keys to move; click a tile to travel."
          style="--cols:${grid.columns};--rows:${grid.rows}"
          @keydown=${onKeyDown}
        >
          <div class="cg-cells">${cells}</div>
          <div class="cg-tokens" aria-hidden="true">
            ${others.map((p) =>
              token(
                p.coord,
                p.name,
                p.avatar,
                false,
                p.audioEnabled ?? false,
                myRoom !== null && roomOf(rooms, p.coord) === myRoom,
                voices[p.id],
              ),
            )}
            ${myCoord
              ? token(myCoord, meName.current, me.current?.avatar, true, gate === 'on', myRoom !== null, voices[meId.current])
              : ''}
          </div>
        </div>
        <div class="cg-side">
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
                      ${p.avatar ? html`<span class="cg-roster-avatar" aria-hidden="true">${p.avatar}</span>` : ''}
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
        </div>
      </div>
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
      ${renderOverlay()}
      ${joined ? '' : joinGate()}
    </div>
  `

  // The single open modal, chosen by the overlay's tag. Each case owns its markup;
  // there's no way to render two at once.
  // The pre-join identity gate. Reuses the .cg-modal chrome but is intentionally NOT
  // dismissible (no backdrop click, no Esc) — you must pick a name + avatar to enter.
  function joinGate() {
    return html`<div class="cg-modal-backdrop cg-gate-backdrop">
      <div class="cg-modal" role="dialog" aria-modal="true" aria-label="Join the grid">
        <h3 class="cg-modal-title">Join the grid</h3>
        <form
          class="cg-gate-form"
          @submit=${(e: Event) => {
            e.preventDefault()
            submitJoin()
          }}
        >
          <div class="cg-field">
            <label for="cg-join-name">Name</label>
            <input
              id="cg-join-name"
              autofocus
              maxlength="24"
              .value=${nameDraft}
              placeholder=${meName.current}
              @input=${(e: Event) => setNameDraft(inputValue(e))}
            />
          </div>
          <div class="cg-field">
            <label>Avatar</label>
            <div class="cg-avatar-grid" role="radiogroup" aria-label="Choose an avatar">
              ${AVATARS.map(
                (a) => html`<button
                  type="button"
                  class="cg-avatar-opt ${avatarDraft === a ? 'cg-avatar-sel' : ''}"
                  role="radio"
                  aria-checked=${avatarDraft === a}
                  aria-label=${`Avatar ${a}`}
                  @click=${() => setAvatarDraft(a)}
                >
                  ${a}
                </button>`,
              )}
            </div>
          </div>
          <div class="cg-modal-actions">
            <button type="submit" class="cg-btn cg-btn-primary">Join the grid</button>
          </div>
        </form>
      </div>
    </div>`
  }

  function renderOverlay() {
    switch (overlay.kind) {
      case 'none':
        return ''
      case 'cell':
        return modal(
          `Edit cell ${overlay.cell.coord.col}, ${overlay.cell.coord.row}`,
          cellEditor(overlay.cell),
        )
      case 'json':
        return config ? modal('Map JSON', jsonModal(config), 'cg-modal-wide') : ''
      case 'settings':
        return config ? modal('Grid settings', settingsModal(config)) : ''
    }
  }

  // Shared modal chrome: backdrop (click to dismiss) + focusable dialog (Esc to
  // dismiss, handled globally). Only the inner body differs per modal.
  function modal(label: string, body: unknown, extra = '') {
    return html`<div class="cg-modal-backdrop" @click=${closeOverlay}>
      <div
        class="cg-modal ${extra}"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        aria-label=${label}
        ${ref(focusEl)}
        @click=${(e: Event) => e.stopPropagation()}
      >
        ${body}
      </div>
    </div>`
  }

  function jsonModal(c: GridConfig) {
    return html`
      <h3 class="cg-modal-title">Map JSON</h3>
      <p class="cg-modal-hint">
        Copy this, then <strong>Edit on GitHub</strong> → paste into
        <code>public/grid.json</code> → <em>Propose changes</em> (opens a PR).
      </p>
      <textarea class="cg-json" readonly .value=${serializeConfig(c)}></textarea>
      <div class="cg-modal-actions">
        <button class="cg-btn" @click=${closeOverlay}>Close</button>
        <a class="cg-btn" href=${GITHUB_EDIT_URL} target="_blank" rel="noopener noreferrer">
          Edit on GitHub ↗
        </a>
        <button class="cg-btn cg-btn-primary" @click=${copyJson}>Copy JSON</button>
      </div>
    `
  }

  function settingsModal(c: GridConfig) {
    const num = (e: Event) => Number(inputValue(e))
    const set = (patch: Parameters<typeof setGridMeta>[1]) => editConfig(setGridMeta(c, patch))
    return html`
      <h3 class="cg-modal-title">Grid settings</h3>
      <div class="cg-field">
        <label>Columns</label>
        <input type="number" min="1" .value=${String(c.columns)} @input=${(e: Event) => set({ columns: num(e) || 1 })} />
      </div>
      <div class="cg-field">
        <label>Rows</label>
        <input type="number" min="1" .value=${String(c.rows)} @input=${(e: Event) => set({ rows: num(e) || 1 })} />
      </div>
      <div class="cg-field">
        <label>Spawn col</label>
        <input
          type="number"
          min="0"
          .value=${String(c.spawn?.col ?? 0)}
          @input=${(e: Event) => set({ spawn: { col: num(e) || 0, row: c.spawn?.row ?? 0 } })}
        />
      </div>
      <div class="cg-field">
        <label>Spawn row</label>
        <input
          type="number"
          min="0"
          .value=${String(c.spawn?.row ?? 0)}
          @input=${(e: Event) => set({ spawn: { col: c.spawn?.col ?? 0, row: num(e) || 0 } })}
        />
      </div>
      <div class="cg-field">
        <label>Max room cells</label>
        <input
          type="number"
          min="1"
          .value=${String(c.maxRoomCells ?? 6)}
          @input=${(e: Event) => set({ maxRoomCells: num(e) || 1 })}
        />
      </div>
      <p class="cg-modal-hint">Shrinking the grid drops any cells outside the new bounds.</p>
      <div class="cg-modal-actions">
        <button class="cg-btn cg-btn-primary" @click=${closeOverlay}>Done</button>
      </div>
    `
  }

  function cellEditor(cell: Cell) {
    const val = (e: Event) => (e.target as HTMLInputElement).value
    const role = cellRole(cell)
    const glyph = cellGlyph(cell)
    return html`
        <h3 class="cg-modal-title">Cell ${cell.coord.col}, ${cell.coord.row}</h3>
        <div class="cg-field cg-field-col">
          <label>This tile is…</label>
          <div class="cg-seg" role="radiogroup" aria-label="Tile type">
            ${(['floor', 'wall', 'audio', 'link'] as const).map(
              (r) => html`<label class="cg-seg-opt ${role === r ? 'cg-seg-on' : ''}">
                <input type="radio" name="cg-role" .checked=${role === r} @change=${() => setRole(r)} />
                <span>${ROLE_LABELS[r]}</span>
              </label>`,
            )}
          </div>
          ${role === 'link'
            ? html`<div class="cg-subfields">
                <input
                  type="url"
                  placeholder="https://… (link URL)"
                  .value=${cell.link?.url ?? ''}
                  @input=${(e: Event) => editLink('url', val(e))}
                />
                <input
                  placeholder="label / icon (e.g. 📹)"
                  .value=${cell.link?.label ?? ''}
                  @input=${(e: Event) => editLink('label', val(e))}
                />
              </div>`
            : ''}
        </div>
        <div class="cg-field">
          <label>Color</label>
          <input
            type="color"
            .value=${cell.color ?? '#888888'}
            @input=${(e: Event) => editPatch({ color: val(e) })}
          />
          ${cell.color
            ? html`<button class="cg-btn" @click=${() => editPatch({ color: undefined })}>clear</button>`
            : ''}
        </div>
        <div class="cg-field">
          <label>Image URL</label>
          <input
            type="url"
            .value=${cell.image ?? ''}
            @input=${(e: Event) => editPatch({ image: val(e) || undefined })}
          />
        </div>
        <div class="cg-field cg-field-col">
          <label>Glyph</label>
          <div class="cg-seg" role="radiogroup" aria-label="Glyph">
            ${(['none', 'char', 'svg'] as const).map(
              (g) => html`<label class="cg-seg-opt ${glyph === g ? 'cg-seg-on' : ''}">
                <input type="radio" name="cg-glyph" .checked=${glyph === g} @change=${() => setGlyph(g)} />
                <span>${GLYPH_LABELS[g]}</span>
              </label>`,
            )}
          </div>
          ${glyph === 'char'
            ? html`<input
                class="cg-subfields"
                maxlength="2"
                placeholder="a character (e.g. ★)"
                .value=${cell.char ?? ''}
                @input=${(e: Event) => editPatch({ char: val(e) })}
              />`
            : ''}
          ${glyph === 'svg'
            ? html`<textarea
                class="cg-subfields"
                rows="3"
                placeholder="<svg …>…</svg>"
                .value=${cell.svg ?? ''}
                @input=${(e: Event) => editPatch({ svg: val(e) })}
              ></textarea>`
            : ''}
        </div>
        <fieldset class="cg-fieldset">
          <legend>Description — hover preview & side panel when standing</legend>
          <input
            placeholder="title"
            .value=${cell.description?.title ?? ''}
            @input=${(e: Event) => editDesc({ title: val(e) || undefined })}
          />
          <textarea
            placeholder="body"
            rows="2"
            .value=${cell.description?.body ?? ''}
            @input=${(e: Event) => editDesc({ body: val(e) || undefined })}
          ></textarea>
          <input
            type="url"
            placeholder="link url (e.g. a Meet link)"
            .value=${cell.description?.links?.[0]?.url ?? ''}
            @input=${(e: Event) => editDescLink('url', val(e))}
          />
          <input
            placeholder="link label"
            .value=${cell.description?.links?.[0]?.label ?? ''}
            @input=${(e: Event) => editDescLink('label', val(e))}
          />
        </fieldset>
        <div class="cg-modal-actions">
          <button class="cg-btn" @click=${() => setEditCell(null)}>Cancel</button>
          <button class="cg-btn" @click=${clearEditedCell}>Clear cell</button>
          <button class="cg-btn cg-btn-primary" @click=${applyEdit}>Apply</button>
        </div>
    `
  }
}

// Styles live in the template, scoped by the shadow root (Haunted's default).
// Scoping is what prevents the document-wide style recalc/flicker you'd get from
// a global <style> in light DOM. lit keeps this <style> stable across renders.
const STYLE = html`
  <style>
    :host {
      display: block; /* fill the container width so the container query has a real size */
      container-type: inline-size; /* makes 100cqw = this component's width */
      color-scheme: light dark;
      /* Theme: consume the site tokens from index.css (CSS vars inherit through the
         shadow boundary), with dark fallbacks for the standalone demo. color-mix
         derives surface shades that track light/dark automatically. */
      --cg-text: var(--ink, #e8e8e8);
      --cg-dim: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 72%);
      --cg-accent: var(--accent, #5aa0ff);
      --cg-enabled: #22c55e; /* "mic on" green — vivid, crisp in both light and dark */
      --cg-surface: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 7%);
      --cg-cell: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 13%);
      --cg-cell-hover: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 24%);
      --cg-wall: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 44%);
      --cg-line: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 18%);
      --cg-border: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 32%);
      --cg-pop: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 5%);
      --cg-audio: color-mix(in srgb, var(--bg, #16171d), var(--color-3, #88a6ff) 18%);
      --cg-audio-active: color-mix(in srgb, var(--bg, #16171d), var(--color-3, #88a6ff) 40%);
      --cg-link-bg: color-mix(in srgb, var(--bg, #16171d), var(--cg-accent) 14%);
      --cg-link-bg-hover: color-mix(in srgb, var(--bg, #16171d), var(--cg-accent) 26%);
    }
    .cg-wrap {
      font-family: system-ui, sans-serif;
      color: var(--cg-text);
    }
    /* grid + detail panel: side by side when there's room, panel wraps below when not */
    .cg-stage {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
    }
    .cg-side {
      flex: 1 1 220px;
      min-width: 200px;
      max-width: 340px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cg-panel {
      padding: 10px 12px;
      background: var(--cg-surface);
      border-radius: 6px;
      font-size: 13px;
    }
    .cg-panel-title {
      margin: 0 0 6px;
      font-size: 15px;
    }
    .cg-panel-body {
      margin: 0 0 8px;
      color: var(--cg-text);
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
      color: var(--cg-accent);
    }
    .cg-panel-empty {
      margin: 0;
      color: var(--cg-dim);
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
      background: var(--cg-surface);
      border: 1px solid var(--cg-line);
      border-radius: 6px;
      outline: none;
    }
    .cg-grid:focus-visible {
      box-shadow: 0 0 0 2px var(--cg-accent);
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
      background: var(--cg-cell);
      box-shadow: inset 0 0 0 1px var(--cg-line);
      color: var(--cg-text);
      text-decoration: none; /* the anchor (link tiles) shouldn't be underlined */
      font-size: calc(var(--cell) * 0.45); /* content (e.g. 🔊) scales with the cell */
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cg-cell:hover:not(:disabled) {
      background: var(--cg-cell-hover);
    }
    .cg-cell.cg-audio {
      background: var(--cg-audio);
    }
    .cg-cell.cg-audio.cg-active-room {
      background: var(--cg-audio-active);
      box-shadow: inset 0 0 0 2px var(--cg-accent);
    }
    .cg-cell.cg-wall {
      background: var(--cg-wall);
      cursor: default;
    }
    /* link kiosks: make them obviously clickable — tint, ring, and a ↗ corner mark */
    .cg-cell.cg-link {
      color: var(--cg-text);
      background: var(--cg-link-bg);
      box-shadow: inset 0 0 0 2px var(--cg-accent);
    }
    .cg-cell.cg-link:hover {
      background: var(--cg-link-bg-hover);
    }
    .cg-cell.cg-link::after {
      content: '↗';
      position: absolute;
      top: 0;
      right: 2px;
      font-size: 55%;
      opacity: 0.85;
      color: var(--cg-text);
    }
    .cg-cell-char {
      font-weight: 600;
    }
    /* describable cells: hover/focus lifts the tile and pops a preview (title + body) */
    .cg-cell.cg-has-desc:hover,
    .cg-cell.cg-has-desc:focus-visible {
      box-shadow: inset 0 0 0 2px var(--cg-accent);
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
      background: var(--cg-pop);
      border: 1px solid var(--cg-line);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
      color: var(--cg-text);
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
      color: var(--cg-dim);
    }
    /* edge-aware placement so the popover never spills off the grid */
    .cg-pop.cg-pop-below {
      bottom: auto;
      top: 100%;
      margin-bottom: 0;
      margin-top: 6px;
    }
    .cg-pop.cg-pop-left {
      left: 0;
      transform: none;
    }
    .cg-pop.cg-pop-right {
      left: auto;
      right: 0;
      transform: none;
    }
    .cg-cell:focus-visible {
      outline: 2px solid var(--cg-accent);
      outline-offset: -2px;
      z-index: 40;
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
      background: var(--cg-accent);
    }
    .cg-token-name {
      position: absolute;
      top: -13px;
      font-size: 10px;
      color: var(--cg-text);
      white-space: nowrap;
      /* outline against whatever tiles are behind it, in either theme */
      text-shadow: 0 0 3px var(--bg, #000), 0 1px 2px var(--bg, #000);
    }
    .cg-token-avatar {
      position: absolute;
      font-size: calc(var(--cell) * 0.55);
      line-height: 1;
      pointer-events: none;
      filter: drop-shadow(0 1px 1px #0008);
    }
    .cg-roster-avatar {
      font-size: 15px;
      line-height: 1;
    }
    /* pre-join gate: reuses .cg-modal chrome; these just lay out the form bits */
    .cg-gate-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .cg-avatar-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
    }
    .cg-avatar-opt {
      font-size: 20px;
      line-height: 1;
      padding: 6px;
      border: 1px solid var(--cg-border, #8888884d);
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
    }
    .cg-avatar-opt:hover {
      background: var(--cg-cell-hover);
    }
    .cg-avatar-sel {
      border-color: var(--cg-accent);
      box-shadow: 0 0 0 2px var(--cg-accent) inset;
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
    }
    .cg-hint {
      color: var(--cg-dim);
      font-size: 12px;
      margin-top: 2px;
    }
    .cg-controls {
      margin: 0 0 12px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .cg-btn {
      /* inline-flex so an <a class="cg-btn"> (Edit on GitHub) sizes/aligns exactly
         like a <button> — min-height doesn't apply to a plain inline anchor */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      font: inherit;
      font-size: 13px;
      min-height: 40px; /* comfortable touch target */
      padding: 6px 12px;
      border: 1px solid var(--cg-border);
      border-radius: 6px;
      background: var(--cg-cell);
      color: var(--cg-text);
      text-decoration: none;
      cursor: pointer;
    }
    .cg-btn:hover:not(:disabled) {
      background: var(--cg-cell-hover);
    }
    .cg-btn:focus-visible {
      outline: 2px solid var(--cg-accent);
      outline-offset: 2px;
    }
    .cg-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .cg-btn-primary {
      background: var(--cg-accent);
      color: var(--accent-ink, #fff);
      border-color: var(--cg-accent);
    }
    /* map editor modal */
    .cg-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .cg-modal {
      width: min(100%, 360px);
      max-height: 85vh;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      background: var(--bg, #16171d);
      color: var(--cg-text);
      border: 1px solid var(--cg-border);
      border-radius: 10px;
    }
    .cg-modal-title {
      margin: 0;
      font-size: 16px;
    }
    .cg-field {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cg-field label {
      flex: 0 0 90px;
      font-size: 13px;
    }
    .cg-field input {
      flex: 1 1 auto;
      min-width: 0;
    }
    /* stacked field: label on its own line above a full-width control or picker */
    .cg-field-col {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
    .cg-field-col > label {
      flex: none;
    }
    /* segmented radio group for mutually-exclusive choices (tile type, glyph) */
    .cg-seg {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .cg-seg-opt {
      flex: 1 1 0;
      min-width: 64px;
    }
    .cg-seg-opt input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .cg-seg-opt span {
      display: block;
      text-align: center;
      font-size: 13px;
      padding: 7px 8px;
      border: 1px solid var(--cg-border);
      border-radius: 6px;
      background: var(--cg-cell);
      color: var(--cg-text);
      cursor: pointer;
      white-space: nowrap;
    }
    .cg-seg-opt.cg-seg-on span {
      background: var(--cg-accent);
      color: var(--accent-ink, #fff);
      border-color: var(--cg-accent);
    }
    .cg-seg-opt input:focus-visible + span {
      outline: 2px solid var(--cg-accent);
      outline-offset: 2px;
    }
    /* the inputs a picker reveals (link url/label, char, svg) sit indented below it */
    .cg-subfields {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .cg-cell-svg {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80%;
      height: 80%;
    }
    .cg-cell-svg svg {
      width: 100%;
      height: 100%;
    }
    .cg-fieldset {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border: 1px solid var(--cg-line);
      border-radius: 6px;
      padding: 8px;
    }
    .cg-fieldset legend {
      font-size: 12px;
      color: var(--cg-dim);
      padding: 0 4px;
    }
    .cg-modal input,
    .cg-modal textarea {
      font: inherit;
      padding: 4px 6px;
      background: var(--cg-cell);
      color: var(--cg-text);
      border: 1px solid var(--cg-border);
      border-radius: 4px;
    }
    .cg-modal-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 4px;
    }
    .cg-modal-wide {
      width: min(100%, 560px);
    }
    .cg-modal-hint {
      margin: 0;
      font-size: 12px;
      color: var(--cg-dim);
    }
    .cg-json {
      width: 100%;
      min-height: 240px;
      font-family: var(--font-family-monospace, ui-monospace, monospace);
      font-size: 12px;
      resize: vertical;
    }
    .cg-draft-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--bg, #16171d), var(--cg-accent) 14%);
      border: 1px solid var(--cg-border);
      font-size: 13px;
    }
    .cg-controls-hint {
      color: var(--cg-dim);
      font-size: 12px;
    }
    .cg-token.cg-enabled .cg-token-dot {
      box-shadow: 0 0 0 2px var(--cg-enabled);
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
      box-shadow:
        0 0 0 3px var(--cg-enabled),
        0 0 14px 5px color-mix(in srgb, var(--cg-enabled), transparent 25%);
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
      .cg-token {
        transition: none;
      }
      .cg-token.cg-wiggling .cg-token-dot {
        animation: none;
      } /* keep the ring, drop the motion */
    }
    .cg-roster {
      margin-top: 0;
    }
    .cg-roster-empty {
      margin: 0;
      font-size: 12px;
      color: var(--cg-dim);
    }
    .cg-roster-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cg-roster-item {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 32px;
    }
    /* compact buttons inside the roster (the grid/keyboard are the primary targets) */
    .cg-roster .cg-btn {
      min-height: 30px;
      padding: 3px 8px;
      font-size: 12px;
    }
    .cg-roster-item.cg-blocked .cg-roster-name {
      color: var(--cg-dim);
      text-decoration: line-through;
    }
    .cg-roster-status {
      flex: 0 0 auto;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--cg-dim);
    }
    .cg-roster-status.cg-on {
      background: var(--cg-enabled);
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
      color: var(--cg-dim);
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
      color: color-mix(in srgb, var(--cg-text), #ff3b30 65%);
      font-size: 13px;
    }
  </style>
`

customElements.define(
  'chat-grid',
  // shadow DOM (Haunted's default) scopes the styles above and prevents flicker
  component(ChatGrid, { observedAttributes: ['config-url'], useShadowDOM: true }),
)
