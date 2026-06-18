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
import { renderCells } from './render/cells'
import { makeToken } from './render/token'
import { statusBar } from './render/status'
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
import { usePip } from './hooks/use-pip'
import { useOnChange } from './hooks/use-reconnect'
import { useViewport } from './hooks/use-viewport'
import { useMovement } from './hooks/use-movement'
import { useAudioControls } from './hooks/use-audio-controls'
import { STYLE } from './chat-room.styles'
import type { RealtimeBackend } from './shell/realtime'
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
  // Bumped on each PiP pop-out/in. Moving the host across documents runs every effect's
  // cleanup without re-running the effect, so the teardown-on-disconnect hooks (connection,
  // mic, viewport, page-hide) take this as a dep and reconnect when it changes.
  const [reconnectNonce, setReconnectNonce] = useState(0)
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
  const myCoordRef = useRef<Coord | null>(null) // current tile, read when re-anchoring on a pop

  // Bundle the shared per-tab handles once (see shell/session.ts) — passed to the
  // hooks that need several of them, instead of threading each ref separately.
  const session: Session = { meId, meName, me, backendRef, meshRef, meterRef, pingerRef, micRef, streamsRef }

  roomRef.current = room
  othersRef.current = others
  myCoordRef.current = myCoord

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
  const { gate, voices, muted, updateVoice, dispatchGate, toggleMute } = useAudioControls(
    session,
    reconnectNonce,
  )

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
  const { setBoard, pan } = useViewport(room, myCoord, reconnectNonce)

  // Pop the grid into a small, always-on-top window (Chromium only, see hooks/use-pip.ts).
  const pip = usePip()

  // Each pop-out/in moves the host across documents, tearing down the connection/mic/
  // viewport effects (haunted runs their cleanups on disconnect but doesn't re-run them).
  // Re-anchor to the current tile, then bump the nonce so those hooks reconnect — landing
  // you back where you stood. useOnChange skips the initial mount (the first connect ran).
  useOnChange(() => {
    if (myCoordRef.current) arrivalSpawnRef.current = myCoordRef.current
    setReconnectNonce((n) => n + 1)
  }, [pip.popped])

  // Proactively leave on tab/window close — effect cleanup doesn't run then.
  usePageHideLeave(backendRef, reconnectNonce)

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
  }, reconnectNonce)

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

  const cells = renderCells({ room, huddles, myHuddle, mapMode, popAlign, onCellClick })

  const token = makeToken({ popAlign })

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
    roomPath: roomUrl,
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
    <div class="cr-wrap" ${ref(pip.setWrap)}>
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
        ${pip.supported
          ? html`<button
              class="cr-btn"
              title=${pip.popped
                ? 'Return the hangout to this page'
                : 'Open the hangout in a small, always-on-top window'}
              @click=${pip.popped ? pip.popIn : pip.popOut}
            >
              ${pip.popped ? '⤡ Dock back' : '⤢ Pop out'}
            </button>`
          : ''}
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
      ${statusBar({
        status,
        name: meName.current,
        myCoord,
        audioOn: gate === 'on',
        myHuddle,
        huddleCount: huddlePeers.length,
        connectedCount,
        othersCount: others.length,
      })}
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
