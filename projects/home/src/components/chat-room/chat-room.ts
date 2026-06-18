// Composition root (imperative shell): renders the room, wires input to the pure
// core, and syncs presence through the swappable realtime backend.
// rooms linked by doors, proximity-voice huddles, click-to-travel, and a map editor.

import { html } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { ref } from 'lit/directives/ref.js'
import { component, useRef, useState } from 'haunted'
import type { Cell, Coord, Room, RoomConfig, Player } from './core/types'
import { buildRoom, cellAt } from './core/room'
import { serializeConfig } from './core/edit'
import { clearDraft, saveDraft } from './shell/draft'
import type { Draft } from './shell/draft'
import { loadIdentity, saveIdentity } from './shell/identity'
import { loadSoundPrefs, saveSoundPrefs } from './shell/sound-prefs'
import type { SoundPrefs } from './shell/sound-prefs'
import type { Pinger } from './shell/ping'
import { bubbleVisible, rankRoster } from './core/presence'
import { buildHuddles, peersInHuddle, huddleOf } from './core/huddles'
import { describeCell } from './core/describe'
import { validateRoom } from './core/validate'
import { readableInk } from './core/color'
import { renderCellGlyph } from './render/cell'
import { popover } from './render/popover'
import { makeRosterRow } from './render/roster'
import { makeRenderOverlay } from './render/modals'
import type { Overlay } from './render/modals'
import { makeCellEditor } from './render/cell-editor'
import { makeJoinGate, AVATARS } from './render/join-gate'
import { usePageHideLeave } from './hooks/use-page-hide-leave'
import { useEscToClose } from './hooks/use-esc-to-close'
import { useChimes } from './hooks/use-chimes'
import { useStatusBubbles } from './hooks/use-status-bubbles'
import { useRadio } from './hooks/use-radio'
import { useMeshRouting } from './hooks/use-mesh-routing'
import { useMicGate } from './hooks/use-mic-gate'
import { useRoomConnection } from './hooks/use-room-connection'
import { useDoor } from './hooks/use-door'
import { useViewport } from './hooks/use-viewport'
import { useMovement } from './hooks/use-movement'
import { useAudioControls } from './hooks/use-audio-controls'
import { STYLE } from './chat-room.styles'
import type { RealtimeBackend, VoiceState } from './shell/realtime'
import type { MeshAudio } from './shell/webrtc'
import type { Meter } from './shell/meter'
import type { Session } from './shell/session'
import type { ConnStatus } from './core/fsm/session'
import type { PeerState } from './core/fsm/peer'

const inputValue = (e: Event) => (e.target as HTMLInputElement).value


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


interface ChatRoomProps {
  'config-url'?: string
}

const ChatRoom = ({ 'config-url': configUrl = '/rooms/home.json' }: ChatRoomProps) => {
  const [room, setRoom] = useState<Room | null>(null)
  // the active room's config URL — door entry swaps this, re-running the connection
  const [roomUrl, setRoomUrl] = useState(configUrl)
  const [huddles, setHuddles] = useState<Map<string, number>>(new Map())
  const [errors, setErrors] = useState<string[]>([])
  const [others, setOthers] = useState<Player[]>([])
  const [myCoord, setMyCoord] = useState<Coord | null>(null)
  const [status, setStatus] = useState<ConnStatus>('connecting')
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({})
  const [streams, setStreams] = useState<Record<string, MediaStream | null>>({})
  const [mutedPeers, setMutedPeers] = useState<Set<string>>(new Set())
  const [blockedPeers, setBlocked] = useState<Set<string>>(new Set())
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  // pre-join identity gate: prefill name + avatar from the last session (localStorage),
  // hold them until the user commits
  const [joined, setJoined] = useState(false)
  const [nameDraft, setNameDraft] = useState(() => loadIdentity()?.name ?? '')
  const [avatarDraft, setAvatarDraft] = useState(() => loadIdentity()?.avatar ?? AVATARS[0])
  // status (== chat): the editable "You" field, and a tick that re-renders bubbles on fade
  const [statusDraft, setStatusDraft] = useState('')
  const [nowMs, setNowMs] = useState(() => Date.now())
  // notification sounds the user has subscribed to (persisted)
  const [soundPrefs, setSoundPrefs] = useState<SoundPrefs>(() => loadSoundPrefs())
  // map editor
  const [config, setConfig] = useState<RoomConfig | null>(null)
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
    // Best-effort per-tab id: a storage failure (private mode, blocked cookies,
    // privacy browsers like Firefox Focus) must NOT throw and blank the whole
    // room — fall back to an ephemeral id. Mirrors the guarded storage in
    // shell/identity.ts, shell/draft.ts, shell/sound-prefs.ts.
    let stored: string | null = null
    try {
      stored = sessionStorage.getItem('chat-room-id')
    } catch {
      /* storage blocked — use an ephemeral id this session */
    }
    meId.current = stored ?? crypto.randomUUID()
    if (!stored) {
      try {
        sessionStorage.setItem('chat-room-id', meId.current)
      } catch {
        /* ignore — id stays ephemeral */
      }
    }
  }
  const meName = useRef<string>('')
  if (!meName.current) meName.current = loadIdentity()?.name || `Guest ${meId.current.slice(0, 4)}`
  const me = useRef<Player | null>(null)
  const backendRef = useRef<RealtimeBackend | null>(null)
  const meshRef = useRef<MeshAudio | null>(null)
  const meterRef = useRef<Meter | null>(null)
  const pingerRef = useRef<Pinger | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const streamsRef = useRef<Record<string, MediaStream | null>>({})
  const arrivalSpawnRef = useRef<Coord | null>(null)
  const joinedRef = useRef(false)
  const roomRef = useRef<Room | null>(null)
  const othersRef = useRef<Player[]>([])

  // Bundle the shared per-tab handles once (see shell/session.ts) — passed to the
  // hooks that need several of them, instead of threading each ref separately.
  const session: Session = { meId, meName, me, backendRef, meshRef, meterRef, pingerRef, micRef, streamsRef }

  roomRef.current = room
  othersRef.current = others

  // Movement: keyboard, click-to-travel, collision tiebreak (see hooks/use-movement.ts).
  const { onKeyDown, onCellClick, cancelTravel } = useMovement({
    myCoord,
    others,
    mapMode,
    roomRef,
    othersRef,
    session,
    setMyCoord,
    setEditCell,
  })

  // Voice/mic + audio-gate FSM (see hooks/use-audio-controls.ts).
  const { gate, voices, muted, updateVoice, dispatchGate, toggleMute } = useAudioControls(session)

  // Adopt a config and rebuild everything derived from it (used on load and on edits).
  const applyConfig = (c: RoomConfig) => {
    const g = buildRoom(c)
    setConfig(c)
    setRoom(g)
    setHuddles(buildHuddles(g))
    setErrors(validateRoom(c))
  }

  // an edit: rebuild AND persist a timestamped draft to localStorage
  const editConfig = (c: RoomConfig) => {
    applyConfig(c)
    saveDraft(c)
  }

  // Route the mesh from huddle membership + blocks (see hooks/use-mesh-routing.ts).
  useMeshRouting(meshRef, { gate, myCoord, others, huddles, blockedPeers })

  // Transmit the mic only while in an huddle and unmuted (see hooks/use-mic-gate.ts).
  useMicGate(micRef, { myCoord, huddles, gate, muted })

  // Walker-only music, tuned by your tile (see hooks/use-radio.ts).
  useRadio(room, myCoord)

  // The single room-change entry point. Records where to arrive, then swaps the room
  // URL (which re-runs the connection effect). Keeping BOTH writes here is the whole
  // switch contract in one spot — callers (doors) don't touch arrivalSpawnRef.
  const switchRoom = (url: string, spawn?: Coord) => {
    arrivalSpawnRef.current = spawn ?? null
    setRoomUrl(url)
  }

  // Doors: landing on a door cell switches rooms (see hooks/use-door.ts).
  useDoor({ room, myCoord, mapMode, roomUrl, switchRoom })

  // The grid's scroll viewport — edge arrows, camera-follow, click-to-pan — all from
  // pure geometry in core/camera (see hooks/use-viewport.ts). setBoard is the element
  // ref; pan(dx,dy) is wired to the arrow buttons.
  const { setBoard, pan } = useViewport(room, myCoord)

  // Proactively leave on tab/window close — effect cleanup doesn't run then.
  usePageHideLeave(backendRef)

  // Esc closes whatever overlay/menu is open.
  useEscToClose(overlay.kind !== 'none' || !!menuOpenFor, () => {
    closeOverlay()
    setMenuOpenFor(null)
  })

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

  // Backend + mesh + pinger lifecycle, re-run per room (see hooks/use-room-connection.ts).
  // `session` carries the shared handles; the rest is connection-specific state + setters.
  useRoomConnection(roomUrl, session, {
    arrivalSpawnRef,
    joinedRef,
    applyConfig,
    cancelTravel,
    updateVoice,
    setMyCoord,
    setDraft,
    setOthers,
    setStatus,
    setStreams,
    setPeerStates,
    setErrors,
  })

  // Pre-join gate submit: commit the chosen name + avatar onto our player, remember them
  // for next time, then join.
  const submitJoin = () => {
    if (joined || !me.current) return
    const name = nameDraft.trim() || meName.current
    meName.current = name
    me.current.name = name
    me.current.avatar = avatarDraft
    saveIdentity({ name, avatar: avatarDraft })
    pingerRef.current?.resume() // the Join click is our autoplay-unlock gesture
    backendRef.current?.join(me.current)
    joinedRef.current = true // subsequent room switches auto-join the new channel
    setJoined(true)
  }

  const toggleSound = (key: keyof SoundPrefs) => {
    setSoundPrefs((p) => {
      const next = { ...p, [key]: !p[key] }
      saveSoundPrefs(next)
      return next
    })
  }

  // Join/leave/status chimes (see hooks/use-chimes.ts).
  useChimes(others, soundPrefs, pingerRef)

  // Commit the "You" status (== chat). Empty clears it. No-op if unchanged, so a blur
  // with no edit doesn't re-track presence. Stamps statusAt so the bubble can fade.
  const commitStatus = () => {
    if (!me.current) return
    const text = statusDraft.trim()
    if ((me.current.status ?? '') === text) return
    const at = Date.now()
    me.current.status = text
    me.current.statusAt = at
    backendRef.current?.updateSelf({ status: text, statusAt: at })
    setNowMs(Date.now()) // re-render so my own bubble shows immediately
  }

  // Re-render to fade expired status bubbles (see hooks/use-status-bubbles.ts).
  useStatusBubbles(others, nowMs, setNowMs, me)

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

  if (!room) return html`${STYLE}<div class="cr-wrap">Loading room…</div>`

  const columns = room.columns // captured non-null (we returned early above) for closures
  // edge-aware popover alignment shared by cells + token bubbles (no measuring needed)
  const popAlign = (col: number): 'left' | 'right' | undefined =>
    col < 3 ? 'left' : col >= columns - 3 ? 'right' : undefined
  const myHuddle = myCoord ? huddleOf(huddles, myCoord) : null
  const huddlePeers = myCoord ? peersInHuddle(huddles, myCoord, others) : []
  // whole-grid roster, with my huddle promoted; huddle === others in my huddle
  const ranked = rankRoster(others, huddles, myCoord)
  const huddlePeerPlayers = ranked.huddle
  const connectedCount = huddlePeerPlayers.filter((p) => peerStates[p.id] === 'connected').length
  // side panel = the description of the tile you're STANDING on (hover uses the popover).
  // describeCell supplies a role-based default when the tile has no authored text.
  const description = myCoord ? describeCell(cellAt(room, myCoord)) : undefined

  const cells = []
  for (let row = 0; row < room.rows; row++) {
    for (let col = 0; col < room.columns; col++) {
      const coord = { col, row }
      const cell = cellAt(room, coord)
      const isAudioCell = cell?.audio === true
      const isRadioCell = !!cell?.radio
      const link = cell?.link ?? null
      const wall = cell?.walkable === false
      const hasDesc = !!cell?.description
      const activeHuddle = isAudioCell && myHuddle !== null && huddleOf(huddles, coord) === myHuddle
      const classes = ['cr-cell']
      if (isAudioCell) classes.push('cr-audio')
      if (isRadioCell) classes.push('cr-radio')
      if (activeHuddle) classes.push('cr-active-huddle')
      if (link) classes.push('cr-link')
      if (hasDesc) classes.push('cr-has-desc')
      if (wall) classes.push('cr-wall')
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
      // shown via the cell's CSS :hover (no `open`); edge-aware placement from col/row
      const pop = hasDesc
        ? popover({
            title: desc?.title,
            body: desc?.body,
            below: row === 0,
            align: popAlign(col),
          })
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
    inHuddle: boolean,
    voice?: VoiceState,
    bubble?: string,
  ) => {
    const speaking = voice?.speaking ?? false
    const shake = voice?.bucket ?? 0
    const isMuted = voice?.muted ?? false
    const classes = ['cr-token']
    if (isMe) classes.push('cr-me')
    if (enabled) classes.push('cr-enabled') // green ring — has enabled audio (everyone sees it)
    if (speaking && inHuddle) classes.push('cr-speaking') // white ring — talking in your huddle
    if (speaking) classes.push('cr-wiggling') // shake — anyone talking, room-wide
    return html`
      <div class=${classes.join(' ')} style="--col:${c.col};--row:${c.row};--shake:${shake}">
        ${bubble
          ? popover({ body: bubble, open: true, below: c.row === 0, align: popAlign(c.col), extra: ['cr-pop-raise'] })
          : ''}
        <span class="cr-token-avatar" aria-hidden="true">${avatar || '●'}</span>
        <span class="cr-token-name">${name}</span>
        ${isMuted ? html`<span class="cr-token-mute" aria-hidden="true">🔇</span>` : ''}
      </div>
    `
  }

  // Roster row renderer — closes over current peer/menu state (see render/roster.ts).
  const rosterRow = makeRosterRow({
    peerStates,
    mutedPeers,
    blockedPeers,
    menuOpenFor,
    setMenuOpenFor,
    toggleMutePeer,
    toggleBlockPeer,
    onShowStatus: (name, text) => setOverlay({ kind: 'status', name, text }),
  })

  // Map-editor cell panel (logic + view, see render/cell-editor.ts).
  const renderCellEditor = makeCellEditor({ editCell, setEditCell, config, editConfig })

  // Overlay/modal renderer — closes over current overlay + editor callbacks
  // (see render/modals.ts).
  const renderOverlay = makeRenderOverlay({
    overlay,
    config,
    closeOverlay,
    copyJson,
    editConfig,
    renderCellEditor,
  })

  // Pre-join name/avatar gate (see render/join-gate.ts).
  const joinGate = makeJoinGate({
    nameDraft,
    setNameDraft,
    avatarDraft,
    setAvatarDraft,
    namePlaceholder: meName.current,
    submitJoin,
  })

  return html`
    ${STYLE}
    <div class="cr-wrap">
      ${draft
        ? html`<div class="cr-draft-banner" role="status">
            <span>📝 You have a map draft, last edited ${formatAgo(draft.savedAt)}.</span>
            <button class="cr-btn" @click=${resumeDraft}>Resume</button>
            <button class="cr-btn" @click=${discardDraft}>Discard</button>
          </div>`
        : ''}
      <div class="cr-controls">
        <button
          class="cr-btn ${mapMode ? 'cr-btn-primary' : ''}"
          aria-pressed=${mapMode}
          @click=${() => {
            setMapMode(!mapMode)
            setEditCell(null)
          }}
        >
          ${mapMode ? '✓ Done editing' : '🗺️ Map Editor'}
        </button>
        ${mapMode
          ? html`<button class="cr-btn" @click=${() => setOverlay({ kind: 'settings' })}>⚙ Room settings</button>
              <button class="cr-btn" @click=${() => setOverlay({ kind: 'json' })}>📋 View / export JSON</button>`
          : ''}
        ${gate === 'on'
          ? html`<button
              class="cr-btn cr-mic ${muted ? 'cr-mic-muted' : ''}"
              aria-pressed=${muted}
              @click=${toggleMute}
            >
              🎙️ ${muted ? 'Unmute' : 'Mute'}
            </button>`
          : html`<button
              class="cr-btn"
              ?disabled=${gate === 'requesting'}
              @click=${() => dispatchGate('enable')}
            >
              ${gate === 'requesting'
                ? 'Requesting mic…'
                : gate === 'denied'
                  ? 'Mic blocked — retry'
                  : '🔊 Enable audio'}
            </button>`}
      </div>
      <div class="cr-stage">
        <div class="cr-board-wrap">
        <div class="cr-board" ${ref(setBoard)}>
        <div
          class="cr-grid"
          tabindex="0"
          role="application"
          aria-label="Movement room. Use WASD or arrow keys to move; click a tile to travel."
          style="--cols:${room.columns};--rows:${room.rows}"
          @keydown=${onKeyDown}
        >
          <div class="cr-cells">${cells}</div>
          <div class="cr-tokens" aria-hidden="true">
            ${repeat(
              others,
              (p) => p.id, // key by player id so lit reuses each avatar's node — the
              // CSS transform transition then glides on a move instead of an avatar
              // inheriting a neighbour's node (and position) when the array reorders
              (p) =>
                token(
                  p.coord,
                  p.name,
                  p.avatar,
                  false,
                  p.audioEnabled ?? false,
                  myHuddle !== null && huddleOf(huddles, p.coord) === myHuddle,
                  voices[p.id],
                  p.status && bubbleVisible(p.statusAt, nowMs) ? p.status : undefined,
                ),
            )}
            ${myCoord
              ? token(
                  myCoord,
                  meName.current,
                  me.current?.avatar,
                  true,
                  gate === 'on',
                  myHuddle !== null,
                  voices[meId.current],
                  me.current?.status && bubbleVisible(me.current?.statusAt, nowMs)
                    ? me.current.status
                    : undefined,
                )
              : ''}
          </div>
        </div>
        </div>
        <button class="cr-arrow cr-arrow-up" aria-label="Pan up" @click=${() => pan(0, -1)}>▲</button>
        <button class="cr-arrow cr-arrow-down" aria-label="Pan down" @click=${() => pan(0, 1)}>▼</button>
        <button class="cr-arrow cr-arrow-left" aria-label="Pan left" @click=${() => pan(-1, 0)}>◀</button>
        <button class="cr-arrow cr-arrow-right" aria-label="Pan right" @click=${() => pan(1, 0)}>▶</button>
        </div>
        <div class="cr-side">
        ${joined
          ? html`<section class="cr-you" aria-label="Your status">
              <div class="cr-you-head">
                <span class="cr-you-avatar" aria-hidden="true">${me.current?.avatar ?? ''}</span>
                <span class="cr-you-name">${meName.current}</span>
              </div>
              <textarea
                class="cr-you-status"
                rows="2"
                maxlength="280"
                aria-label="Set your status"
                placeholder="Set a status… (Enter to post, Shift+Enter for a new line)"
                .value=${statusDraft}
                @input=${(e: Event) => setStatusDraft(inputValue(e))}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ;(e.target as HTMLTextAreaElement).blur()
                  }
                }}
                @blur=${commitStatus}
              ></textarea>
            </section>`
          : ''}
        <aside class="cr-panel" aria-live="polite" aria-label="Tile details">
          ${description
            ? html`
                ${description.title
                  ? html`<h3 class="cr-panel-title">${description.title}</h3>`
                  : ''}
                ${description.body ? html`<p class="cr-panel-body">${description.body}</p>` : ''}
                ${description.links?.length
                  ? html`<ul class="cr-panel-links">
                      ${description.links.map(
                        (l) => html`<li>
                          <a href=${l.url} target="_blank" rel="noopener noreferrer">${l.label}</a>
                        </li>`,
                      )}
                    </ul>`
                  : ''}
              `
            : html`<p class="cr-panel-empty">Step onto a tile with details to see them here.</p>`}
        </aside>
      ${joined
        ? html`<section class="cr-roster" aria-label="People online">
            ${others.length === 0
              ? html`<p class="cr-roster-empty">No one else here yet.</p>`
              : html`
                  ${ranked.huddle.length
                    ? html`<h4 class="cr-roster-head">In your huddle</h4>
                        <ul class="cr-roster-list">${ranked.huddle.map((p) => rosterRow(p, true))}</ul>`
                    : ''}
                  ${ranked.room.length
                    ? html`<h4 class="cr-roster-head">Around the room</h4>
                        <ul class="cr-roster-list">${ranked.room.map((p) => rosterRow(p, false))}</ul>`
                    : ''}
                `}
          </section>`
        : ''}
        ${joined
          ? html`<section class="cr-sounds" aria-label="Notification sounds">
              <h4 class="cr-roster-head">Sounds</h4>
              <label class="cr-sound-opt">
                <input
                  type="checkbox"
                  .checked=${soundPrefs.joinLeave}
                  @change=${() => toggleSound('joinLeave')}
                />
                Sound when someone joins or leaves
              </label>
              <label class="cr-sound-opt">
                <input
                  type="checkbox"
                  .checked=${soundPrefs.status}
                  @change=${() => toggleSound('status')}
                />
                Sound when someone posts a status
              </label>
            </section>`
          : ''}
        </div>
      </div>
      <!-- hidden audio sinks; keyed by peer id so playback isn't interrupted on re-render -->
      <div class="cr-audio-sinks" hidden>
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
      <div class="cr-status">
        <span class="cr-badge" data-status=${status}>${status}</span>
        <strong>${meName.current}</strong>
        ${myCoord ? html` @ ${myCoord.col},${myCoord.row}` : ''} ·
        ${gate === 'on'
          ? myHuddle === null
            ? 'step onto an audio tile to talk'
            : huddlePeers.length === 0
              ? 'no one else in this huddle yet'
              : `talking with ${connectedCount}`
          : myHuddle === null
            ? 'not in a huddle'
            : `huddle #${myHuddle} — ${huddlePeers.length + 1} here`}
        · ${others.length} other${others.length === 1 ? '' : 's'} online
        <div class="cr-hint">click the room, then move with WASD / arrows or click a cell</div>
      </div>
      ${errors.length
        ? html`<ul class="cr-errors">
            ${errors.map((e) => html`<li>${e}</li>`)}
          </ul>`
        : ''}
      ${renderOverlay()}
      ${joined ? '' : joinGate()}
    </div>
  `
}

customElements.define(
  'chat-room',
  // shadow DOM (Haunted's default) scopes the styles above and prevents flicker
  component(ChatRoom, { observedAttributes: ['config-url'], useShadowDOM: true }),
)
