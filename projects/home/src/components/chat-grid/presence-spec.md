# Presence features — spec

Status, identity, roster, and activity indications for the chat-grid. Everything
here rides the **existing** transport (Supabase Realtime presence + broadcast) and
the **existing** audio mesh — no new backend, no storage, no media server. It stays
inside the project's constraints: GitHub Pages, free, cannot-be-charged.

## Goals

1. Give people an identity (name + avatar) before they join.
2. Let people say something lightweight — **status doubles as chat**.
3. Make the roster grid-wide, with your audio blob promoted.
4. Surface activity (joins, status changes) as toasts, with an opt-out chime on joins.

## Guiding constraints (do not cross)

- **Free / cannot-be-charged.** No storage bucket, no SFU, no paid TURN.
  - Avatars are emoji / char / preset only — **never uploaded images** (that needs a
    bucket).
  - Audio stays mesh, STUN-only, capped at ~10 per blob (`maxRoomCells`, validate.ts).
    >~10 would need an SFU = a metered bill. Out of scope.
- **Status changes ride presence re-track** (like `setAudioEnabled`,
  `realtime-supabase.ts:150`), *not* the frequent move broadcast (`:73`). Status is a
  few-per-minute event; keep it off the hot path.
- **Functional core / imperative shell.** New logic lands as pure functions
  (bubble visibility, presence diff); the shell does the DOM/audio/timers.

---

## Data model

Extend `Player` (`core/types.ts:62`):

```ts
export interface Player {
  id: PlayerId
  name: string
  coord: Coord
  audioEnabled?: boolean
  avatar?: string    // emoji or preset key — NOT an image URL
  status?: string    // free text; empty/absent = no status
  statusAt?: number  // sender Date.now() when status was set; drives bubble fade
}
```

No change to `VoiceState` — voice-deafen is out of scope (see below). Avatar/status/
statusAt all sync via the presence object that's already tracked on join and re-tracked
on change (see "self-presence updates" below — done through one generalized path, not a
new method per field).

---

## Code organization — where each piece lands (and what NOT to write)

The component already splits **core/** (pure, unit-tested), **shell/** (imperative:
realtime, audio, storage), **render/** (pure Lit template helpers, e.g. `cell.ts`), and
the `chat-grid.ts` element that *wires* them. New code follows that split. `chat-grid.ts`
is already ~1500 lines — the discipline is to keep logic and markup OUT of it so it stays
wiring.

**core/ — pure + tested, like `rooms.ts` / `pathfind.ts`:**
- `diffPresence(prev, next) → { joined, left, statusChanged }[]` — new `core/presence.ts`.
- `bubbleVisible(statusAt, now) → boolean` — `core/presence.ts`. (Pure predicate; the
  *scheduling* of when to re-evaluate is shell — see perf.)
- `rankRoster(others, rooms, myCoord) → grouped/sorted rows` — the F3 filter→sort + blob
  promotion is pure ranking. **Extract it; do not inline it in the component.**

**shell/ — imperative:**
- **Self-presence updates: generalize, don't copy.** `setAudioEnabled` already spans
  `realtime.ts` (interface), `realtime-supabase.ts` (re-track), `realtime-fake.ts`
  (`kind:'enabled'` Msg + handler + method), and `roster.ts` (field merge). Adding a
  parallel `setStatus` doubles that plumbing per field. Replace with one
  `updateSelf(patch: Partial<Player>)`: Supabase re-tracks the merged `me`; the fake
  posts a single `kind:'update'` Msg carrying the patch; roster merges it.
  `setAudioEnabled(true)` becomes `updateSelf({ audioEnabled: true })`; status is
  `updateSelf({ status, statusAt })`; avatar (set at join) needs nothing extra. This
  *removes* interface surface and makes every future presence field free.
- **Chime** → `shell/ping.ts`, mirroring `shell/meter.ts`: one shared `AudioContext`, a
  short oscillator, gated by the mute flag.
- **Mute-pref persistence** → localStorage, mirroring `shell/draft.ts`.

**render/ — pure template helpers, like `cell.ts`:**
- One `bubbleSurface(...)` template (the shared chrome from `cg-pop`), a `toast(...)`, and
  the roster-row template. Markup lives here; the lifecycle (timers, stack) stays in the
  shell. Templates are dumb.

**chat-grid.ts** stays the wiring layer: state/effects, calls core functions, schedules
timers, renders via render/ helpers. No new business logic accreted here.

## Performance — placement-sensitive

- `rankRoster` runs on every `onPlayers`, which fires on **every move broadcast from
  anyone** (`:73` is the hot path). Make it pure and **memoize on its real inputs**
  (blob-set identity + status values), not recompute per render. Blob membership only
  changes at room boundaries. (This is *why* the F3 "memoize on blob-set change" note
  exists.)
- Fades = **one timeout per item** (fire at `statusAt + BUBBLE_MS`, or the toast TTL, to
  flip/remove that one), never a global 1s interval re-rendering every bubble.
- `diffPresence` is O(n) per snapshot — trivial at ~20.
- Status goes over **presence re-track (`updateSelf`)**, never the move broadcast.
- Chime reuses a single `AudioContext`; never construct one per ping.

---

## F1 — Pre-join gate (name + avatar)

Note: today join is automatic — `chat-grid.ts:130` defaults the name to `Guest XXXX` and
`:178/:213` join immediately in an effect. So this is a genuinely new pre-join screen that
gates `backend.join()`, not a tweak to an existing prompt.


Before `join()`, collect **name** and **avatar**. Avatar is an emoji or one of a small
preset set (renderer already handles `char`/`svg`, `render/cell.ts`). Pass both into the
`Player` handed to `backend.join()`. They then sync to everyone via presence for free.

- No image upload (storage = charge risk).
- This is the only piece that's a distinct screen; everything else is in-session.

---

## F2 — Status as chat

One field (`status` + `statusAt`), **one write surface, three read surfaces.**

**Write — the "You" row** (top of the roster panel): your editable status. It is
simultaneously the reminder (always shows your current status, even after the bubble
fades), the compose box, and the clear (empty it + commit → status gone everywhere).
- Commit on **Enter / blur**, not per-keystroke — otherwise every letter re-tracks
  presence and fires a fresh bubble.
- Placeholder `Set a status…` teaches that this is how you "chat".

**Read surfaces:**
1. **Bubble over the avatar** — visible while *fresh*. Visibility is a pure predicate:
   ```ts
   bubbleVisible(statusAt, now) => now - statusAt < BUBBLE_MS   // ~60_000
   ```
   Using the sender's `statusAt` (not local receive time) means a latecomer correctly
   sees an old status as settled, not as a fresh burst. Accepts mild clock skew; a 60s
   window is forgiving. (This is a pure function, not an FSM — it'd only become one if we
   add a `typing…` state.)
2. **Hover the avatar** — on demand, any age.
3. **Roster row** — persistent, everyone's current status (see F3).

**Model note:** one message per person at a time (a new status replaces the old). This
is a speech-bubble / presence model, not a transcript — correct here because **voice is
the primary channel** and text is for asides ("brb", "in the mtg room", 👋).

---

## F3 — Global roster, blob-promoted

Today the roster filters to your room (`chat-grid.ts:442`, `othersInRoom`). Change the
**filter into a sort**: show everyone online (~15–20), with your current audio blob
promoted directly under your own row.

```
[ You ]                 ← editable status (F2 write surface)
── In your audio room ──
[ blob person ]         ← status · connection dot · block menu  (real audio peers)
[ blob person ]
── Around the grid ──
[ someone ]             ← status · (locate/jump-to — see open question)
[ someone ]
```

- Sort key reuses the existing room computation: `roomOf(rooms, p.coord) === myRoom`.
  No new data — `others` already *is* everyone; the current code just throws most away.
- **Showing N in the roster ≠ connecting to N.** The mesh is gated separately by
  `peersInRoom` (`:229`) — making the roster global adds rows, **zero** connections.
- Tiers afford differently: blob rows keep connection state + block menu
  (`:658-678`); around-the-grid rows are presence-only.
- Bound the around-the-grid section (cap / scroll) so it can't push the cell
  description off-screen; sort by distance so adjacent folks rise naturally.
- Re-sort jitter: blob membership only changes at room boundaries, so memoize the sort
  on "blob set changed" rather than "any coord moved" if churn ever shows (fine at ~20).

**Open question (carry into impl):** do around-the-grid rows get a *locate/jump-to*
(pan/highlight their avatar), or status only? Lean: status + locate.

---

## F4 — Activity indications (toasts + enter ping)

Pure derivation over the **grace-smoothed** `onPlayers` stream (roster.ts already
debounces reconnect flaps via `PRESENCE_GRACE_MS`):

```ts
diffPresence(prev, next) => { joined, left, statusChanged }[]
//  joined        = id newly present
//  left          = id gone
//  statusChanged = same id, new statusAt
```

Two output channels, **decoupled per event type**:

| event                  | toast (visual) | chime (sound) |
|------------------------|:--------------:|:-------------:|
| someone enters grid    |      yes       |    **yes**    |
| status update          |      yes       |    **no**     |

Rationale: status updates are frequent and already loud (bubble + roster + toast); a
chime each would nag. Enters are rare and "look-up"-worthy, so the chime earns its place.

**Scope by proximity** (reuse the F3 tiers): blob events get the loud version
(toast + row pulse); around-the-grid events get a quieter row pulse only. Distinguish
"entered your *blob*" (salient) from "appeared on the *grid*" (quieter).

**Chime = synthesized, not an asset.** A short Web Audio `OscillatorNode` blip — no file
to host, no decode, fits free/no-backend. It rides the autoplay unlock the audio-gate
already establishes (the enable gesture, audio-gate.ts).

**Mute toggle.** A `🔔 / 🔕` control mutes the **chime channel only** — toasts keep
coming. Just a boolean gating `playPing()`. (This is what "mute room noise" meant —
*not* voice-deafen.) Persist the pref in `localStorage`.

**Noise traps to handle:**
- **Baseline is silent.** On *your* join you receive everyone already present — that
  first snapshot emits nothing (no toasts, no chimes). Only *subsequent* changes fire.
- **Debounce join bursts** — coalesce a flurry of enters (event kickoff) into one chime.

---

## Shared UI primitive — bubble surface

The hover popover (`cg-pop`, `chat-grid.ts:502` / styles `:1126`), the **avatar status
bubble** (F2), and the **toast** (F4) share the same *visual chrome* (small floating box,
title + body, `--cg-pop` bg). Extract that styling into one surface class and reuse it
across all three.

Do **not** try to reuse the popover's behavior/structure — it's pure-CSS `:hover`,
anchored inside a cell with grid-edge-flip math. They split on two axes:

|                     | anchored to element  | fixed corner |
|---------------------|----------------------|--------------|
| **pointer lifecycle** | hover popover        | —            |
| **timer lifecycle**   | avatar status bubble | toast        |

Shared surface; each owns its anchor + trigger. The avatar bubble and toast share the
**timer-dismiss** lifecycle (build it once, in the bubble first), and the toast adds
stacking + `role="status"` / `aria-live="polite"`.

**Hover-status reuses the whole popover, not just the chrome.** Hover is pointer-driven
and element-anchored — identical to `cg-pop`. Don't build a separate float popover for it:
**fold the occupant's status into the existing cell description popover** (when someone
stands on a tile, append "name — status" to that tile's `cg-pop`). This is mandatory, not
just tidy — tokens live in the `aria-hidden`, pointer-transparent `.cg-tokens` overlay, so
a hover handler on a token can't fire; the *cell* beneath is what's hoverable. (Requires
rendering `cg-pop` on occupied cells even when they have no description.) Only the
timer-driven bubble + toast are genuinely separate surfaces.

---

## Button refactor

Adding the chime toggle is light because `🎙️` (mic) vs `🔔` (chime) are obviously
distinct — no confusion to design around. While here, fix the existing icon ambiguity:
the mic mute currently uses `🔇` (`:599`), which reads as *output* off; give the mic its
own glyph and reserve bell glyphs for the chime.

(If voice-deafen is ever wanted, *that's* where the mic-vs-deafen FSM from the discussion
would come back — but it's out of scope now.)

---

## Out of scope / explicitly not doing

- **Voice-deafen** (muting incoming voice). "Mute room noise" turned out to mean the
  chime, not voice. Can be added later as an independent feature.
- **SFU / >10-per-blob rooms** — metered server = charge. Mesh + cap stays.
- **Paid TURN** — verify STUN-only; accept that a few hostile-NAT pairs won't connect.
- **Uploaded avatar images** — needs storage. Emoji/preset only.
- **Chat history / transcript** — status-as-chat is ephemeral by design.

---

## Suggested phasing

1. **Identity + data model + `updateSelf` refactor** — add `avatar`/`status`/`statusAt`
   to `Player`; replace `setAudioEnabled` with the generalized `updateSelf(patch)` across
   `realtime.ts` / `-supabase` / `-fake` / `roster.ts`; pre-join name+avatar gate (F1).
   Lands the generalized presence-update path everything else reuses.
2. **Status read surfaces** — `bubbleVisible` pure fn + shared bubble surface; avatar
   bubble + hover + roster status span; the editable "You" row (F2).
3. **Global roster** — filter→sort with blob promotion + tier affordances (F3).
4. **Indications** — `diffPresence` reducer → toasts (reusing the bubble surface +
   timer lifecycle); synthesized enter-chime + `🔕` toggle + baseline/debounce guards (F4).
5. **Polish** — button refactor / icon cleanup; locate-on-grid for around-the-grid rows
   (pending the open question).

## Decisions log (rationale captured)

- Status = chat (no separate chat system): zero new events, fits voice-primary model.
- `statusAt` from sender (not local receive): correct latecomer behavior, no join burst.
- Roster global with blob *sort* (not filter): global awareness, local emphasis, and it
  doesn't change connection count.
- Indications from diffing grace-smoothed `onPlayers`: reuses existing flap-debounce.
- Chime on enters only, never status: avoids nag; statuses are already visible.
- "Mute room noise" = chime mute, not voice-deafen: per user clarification.
- Reuse popover *surface* only, not its hover/anchor behavior.
- Generalize `setAudioEnabled` → `updateSelf(patch)` rather than adding `setStatus`: one
  presence-update path instead of per-field plumbing across 4 files. Removes surface.
- Pure ranking (`rankRoster`) and presence diff live in `core/` with tests; markup in
  `render/`; `chat-grid.ts` stays wiring — keeps the monolith from growing.
```
