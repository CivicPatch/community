import { html } from 'lit'

// Styles live in the template, scoped by the shadow root (Haunted's default).
// Scoping is what prevents the document-wide style recalc/flicker you'd get from
// a global <style> in light DOM. lit keeps this <style> stable across renders.
export const STYLE = html`
  <style>
    :host {
      display: block; /* fill the container width so the container query has a real size */
      container-type: inline-size; /* makes 100cqw = this component's width */
      color-scheme: light dark;
      /* Theme: consume the site tokens from index.css (CSS vars inherit through the
         shadow boundary), with dark fallbacks for the standalone demo. color-mix
         derives surface shades that track light/dark automatically. */
      --cr-text: var(--ink, #e8e8e8);
      --cr-dim: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 72%);
      --cr-accent: var(--accent, #5aa0ff);
      --cr-enabled: #22c55e; /* "mic on" green — vivid, crisp in both light and dark */
      --cr-surface: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 7%);
      --cr-cell: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 13%);
      --cr-cell-hover: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 24%);
      --cr-wall: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 44%);
      --cr-line: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 18%);
      --cr-border: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 32%);
      --cr-pop: color-mix(in srgb, var(--bg, #16171d), var(--ink, #ffffff) 5%);
      --cr-audio: color-mix(in srgb, var(--bg, #16171d), var(--color-3, #88a6ff) 18%);
      --cr-audio-active: color-mix(in srgb, var(--bg, #16171d), var(--color-3, #88a6ff) 40%);
      --cr-link-bg: color-mix(in srgb, var(--bg, #16171d), var(--cr-accent) 14%);
      --cr-link-bg-hover: color-mix(in srgb, var(--bg, #16171d), var(--cr-accent) 26%);
      /* radio (music) tiles: a warm amber tint, distinct from the cool audio blue */
      --cr-radio: color-mix(in srgb, var(--bg, #16171d), #e0a35a 18%);
      --cr-radio-hover: color-mix(in srgb, var(--bg, #16171d), #e0a35a 32%);
    }
    .cr-wrap {
      font-family: system-ui, sans-serif;
      color: var(--cr-text);
    }
    /* grid + detail panel: side by side when there's huddle, panel wraps below when not */
    .cr-stage {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
    }
    .cr-side {
      flex: 1 1 300px;
      min-width: 260px;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .cr-panel {
      padding: 10px 12px;
      background: var(--cr-surface);
      border-radius: 6px;
      font-size: 13px;
    }
    .cr-panel-title {
      margin: 0 0 6px;
      font-size: 15px;
    }
    .cr-panel-body {
      margin: 0 0 8px;
      color: var(--cr-text);
    }
    .cr-panel-links {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .cr-panel-links a {
      color: var(--cr-accent);
    }
    .cr-panel-empty {
      margin: 0;
      color: var(--cr-dim);
    }
    .cr-grid {
      /* cells shrink to fit the component width on small screens, capped at 40px.
         tokens position via --cell too, so the avatar overlay scales in lockstep —
         no scrolling, no overlay misalignment. */
      --cell: min(40px, calc((100cqw - 8px) / var(--cols)));
      position: relative;
      display: inline-block;
      max-width: 100%;
      padding: 2px;
      background: var(--cr-surface);
      border: 1px solid var(--cr-line);
      border-radius: 6px;
      outline: none;
    }
    .cr-grid:focus-visible {
      box-shadow: 0 0 0 2px var(--cr-accent);
    }
    .cr-cells {
      display: grid;
      grid-template-columns: repeat(var(--cols), var(--cell));
      grid-template-rows: repeat(var(--rows), var(--cell));
    }
    .cr-cell {
      position: relative; /* anchor for the hover popover */
      width: var(--cell);
      height: var(--cell);
      margin: 0;
      padding: 0;
      border: none;
      background: var(--cr-cell);
      box-shadow: inset 0 0 0 1px var(--cr-line);
      color: var(--cr-text);
      text-decoration: none; /* the anchor (link tiles) shouldn't be underlined */
      font-size: calc(var(--cell) * 0.45); /* content (e.g. 🔊) scales with the cell */
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cr-cell:hover:not(:disabled) {
      background: var(--cr-cell-hover);
    }
    .cr-cell.cr-audio {
      background: var(--cr-audio);
    }
    .cr-cell.cr-audio.cr-active-huddle {
      background: var(--cr-audio-active);
      box-shadow: inset 0 0 0 2px var(--cr-accent);
    }
    .cr-cell.cr-wall {
      background: var(--cr-wall);
      cursor: default;
    }
    /* radio (music) tiles: warm tint + a ♪ corner mark hinting "walk on to listen" */
    .cr-cell.cr-radio {
      background: var(--cr-radio);
    }
    .cr-cell.cr-radio:hover {
      background: var(--cr-radio-hover);
    }
    .cr-cell.cr-radio::after {
      content: '♪';
      position: absolute;
      top: 0;
      right: 3px;
      font-size: 55%;
      opacity: 0.8;
      color: var(--cr-text);
    }
    /* link kiosks: make them obviously clickable — tint, ring, and a ↗ corner mark */
    .cr-cell.cr-link {
      color: var(--cr-text);
      background: var(--cr-link-bg);
      box-shadow: inset 0 0 0 2px var(--cr-accent);
    }
    .cr-cell.cr-link:hover {
      background: var(--cr-link-bg-hover);
    }
    .cr-cell.cr-link::after {
      content: '↗';
      position: absolute;
      top: 0;
      right: 2px;
      font-size: 55%;
      opacity: 0.85;
      color: var(--cr-text);
    }
    .cr-cell-char {
      font-weight: 600;
    }
    /* describable cells: hover/focus lifts the tile and pops a preview (title + body) */
    .cr-cell.cr-has-desc:hover,
    .cr-cell.cr-has-desc:focus-visible {
      box-shadow: inset 0 0 0 2px var(--cr-accent);
      z-index: 40; /* lift this tile + its popover above neighbours */
    }
    .cr-pop {
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
      background: var(--cr-pop);
      border: 1px solid var(--cr-line);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
      color: var(--cr-text);
      font-size: 12px;
      font-weight: 400;
      text-align: left;
      white-space: normal;
      pointer-events: none;
    }
    .cr-cell.cr-has-desc:hover .cr-pop,
    .cr-cell.cr-has-desc:focus-visible .cr-pop {
      display: block;
    }
    /* timer-driven open (status bubble, toasts) — same chrome, shown via state not hover */
    .cr-pop--open {
      display: block;
      z-index: 50;
    }
    /* extra clearance so a token's status bubble sits above its name label */
    .cr-pop-raise {
      margin-bottom: 18px;
    }
    .cr-pop-title {
      display: block;
      font-weight: 600;
    }
    .cr-pop-body {
      display: block;
      margin-top: 2px;
      color: var(--cr-dim);
      /* preserve the author's line breaks/spacing — on the inner body span only,
         so the popover template's own indentation isn't rendered as whitespace */
      white-space: pre-wrap;
    }
    /* edge-aware placement so the popover never spills off the grid */
    .cr-pop.cr-pop-below {
      bottom: auto;
      top: 100%;
      margin-bottom: 0;
      margin-top: 6px;
    }
    .cr-pop.cr-pop-left {
      left: 0;
      transform: none;
    }
    .cr-pop.cr-pop-right {
      left: auto;
      right: 0;
      transform: none;
    }
    .cr-cell:focus-visible {
      outline: 2px solid var(--cr-accent);
      outline-offset: -2px;
      z-index: 40;
    }
    .cr-tokens {
      position: absolute;
      inset: 2px;
      pointer-events: none;
    }
    .cr-token {
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
    .cr-token.cr-me .cr-token-avatar {
      /* faint accent disc behind your own emoji — find yourself without a colour dot */
      background: color-mix(in srgb, var(--cr-accent), transparent 75%);
    }
    .cr-token-name {
      position: absolute;
      top: -13px;
      font-size: 10px;
      color: var(--cr-text);
      white-space: nowrap;
      /* outline against whatever tiles are behind it, in either theme */
      text-shadow: 0 0 3px var(--bg, #000), 0 1px 2px var(--bg, #000);
    }
    .cr-token-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 64%;
      height: 64%;
      border-radius: 50%;
      font-size: calc(var(--cell) * 0.5);
      line-height: 1;
      pointer-events: none;
    }
    .cr-roster-avatar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 14px;
      line-height: 1;
    }
    /* same green "audio active" ring as the grid token (var(--cr-enabled)) */
    .cr-roster-avatar.cr-ring {
      box-shadow: 0 0 0 2px var(--cr-enabled);
    }
    /* pre-join gate: reuses .cr-modal chrome; these just lay out the form bits */
    .cr-gate-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .cr-avatar-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
    }
    .cr-avatar-opt {
      font-size: 20px;
      line-height: 1;
      padding: 6px;
      border: 1px solid var(--cr-border, #8888884d);
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
    }
    .cr-avatar-opt:hover {
      background: var(--cr-cell-hover);
    }
    .cr-avatar-sel {
      border-color: var(--cr-accent);
      box-shadow: 0 0 0 2px var(--cr-accent) inset;
    }
    .cr-you {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--cr-border);
    }
    .cr-you-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cr-you-avatar {
      font-size: 20px;
      line-height: 1;
    }
    .cr-you-name {
      font-weight: 600;
      font-size: 13px;
    }
    .cr-you-status {
      width: 100%;
      box-sizing: border-box;
      resize: none;
      font: inherit;
      font-size: 13px;
      line-height: 1.3;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid var(--cr-border);
      background: transparent;
      color: var(--cr-text);
    }
    .cr-roster-head {
      margin: 8px 0 2px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--cr-dim);
    }
    .cr-roster-saying {
      flex: 1 1 60px;
      min-width: 0;
      font-size: 12px;
      opacity: 0.75;
      overflow-wrap: anywhere; /* wrap long statuses instead of clipping */
    }
    /* inline "more" badge → opens the full status in a modal */
    .cr-roster-more {
      border: 0;
      padding: 0;
      margin-left: 4px;
      background: none;
      font: inherit;
      color: var(--cr-accent);
      cursor: pointer;
      white-space: nowrap;
    }
    .cr-roster-more:hover {
      text-decoration: underline;
    }
    /* full status text in the modal — preserve author line breaks, wrap long words */
    .cr-status-full {
      margin: 0 0 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.5;
    }
    .cr-status {
      margin-top: 8px;
      font-size: 13px;
    }
    .cr-badge {
      display: inline-block;
      padding: 1px 7px;
      margin-right: 6px;
      border-radius: 10px;
      font-size: 11px;
      color: #111;
      background: #888;
    }
    .cr-badge[data-status='connected'] {
      background: #5c6;
    }
    .cr-badge[data-status='connecting'],
    .cr-badge[data-status='reconnecting'] {
      background: #db4;
    }
    .cr-badge[data-status='offline'] {
      background: #e55;
    }
    .cr-hint {
      color: var(--cr-dim);
      font-size: 12px;
      margin-top: 2px;
    }
    .cr-controls {
      margin: 0 0 12px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .cr-btn {
      /* inline-flex so an <a class="cr-btn"> (Edit on GitHub) sizes/aligns exactly
         like a <button> — min-height doesn't apply to a plain inline anchor */
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      font: inherit;
      font-size: 13px;
      min-height: 40px; /* comfortable touch target */
      padding: 6px 12px;
      border: 1px solid var(--cr-border);
      border-radius: 6px;
      background: var(--cr-cell);
      color: var(--cr-text);
      text-decoration: none;
      cursor: pointer;
    }
    /* mic muted: accent-tinted so "you're muted" is obvious at a glance */
    .cr-mic-muted {
      background: color-mix(in srgb, var(--cr-accent) 18%, var(--cr-cell));
      border-color: var(--cr-accent);
    }
    .cr-btn:hover:not(:disabled) {
      background: var(--cr-cell-hover);
    }
    .cr-btn:focus-visible {
      outline: 2px solid var(--cr-accent);
      outline-offset: 2px;
    }
    .cr-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .cr-btn-primary {
      background: var(--cr-accent);
      color: var(--accent-ink, #fff);
      border-color: var(--cr-accent);
    }
    /* map editor modal */
    .cr-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .cr-modal {
      width: min(100%, 360px);
      max-height: 85vh;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      background: var(--bg, #16171d);
      color: var(--cr-text);
      border: 1px solid var(--cr-border);
      border-radius: 10px;
    }
    .cr-modal-title {
      margin: 0;
      font-size: 16px;
    }
    .cr-field {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cr-field label {
      flex: 0 0 90px;
      font-size: 13px;
    }
    .cr-field input {
      flex: 1 1 auto;
      min-width: 0;
    }
    /* stacked field: label on its own line above a full-width control or picker */
    .cr-field-col {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
    .cr-field-col > label {
      flex: none;
    }
    /* segmented radio group for mutually-exclusive choices (tile type, glyph) */
    .cr-seg {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .cr-seg-opt {
      flex: 1 1 0;
      min-width: 64px;
    }
    .cr-seg-opt input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }
    .cr-seg-opt span {
      display: block;
      text-align: center;
      font-size: 13px;
      padding: 7px 8px;
      border: 1px solid var(--cr-border);
      border-radius: 6px;
      background: var(--cr-cell);
      color: var(--cr-text);
      cursor: pointer;
      white-space: nowrap;
    }
    .cr-seg-opt.cr-seg-on span {
      background: var(--cr-accent);
      color: var(--accent-ink, #fff);
      border-color: var(--cr-accent);
    }
    .cr-seg-opt input:focus-visible + span {
      outline: 2px solid var(--cr-accent);
      outline-offset: 2px;
    }
    /* the inputs a picker reveals (link url/label, char, svg) sit indented below it */
    .cr-subfields {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .cr-cell-svg {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80%;
      height: 80%;
    }
    .cr-cell-svg svg {
      width: 100%;
      height: 100%;
    }
    .cr-fieldset {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border: 1px solid var(--cr-line);
      border-radius: 6px;
      padding: 8px;
    }
    .cr-fieldset legend {
      font-size: 12px;
      color: var(--cr-dim);
      padding: 0 4px;
    }
    .cr-modal input,
    .cr-modal textarea {
      font: inherit;
      padding: 4px 6px;
      background: var(--cr-cell);
      color: var(--cr-text);
      border: 1px solid var(--cr-border);
      border-radius: 4px;
    }
    .cr-modal-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 4px;
    }
    .cr-modal-wide {
      width: min(100%, 560px);
    }
    .cr-modal-hint {
      margin: 0;
      font-size: 12px;
      color: var(--cr-dim);
    }
    .cr-json {
      width: 100%;
      min-height: 240px;
      font-family: var(--font-family-monospace, ui-monospace, monospace);
      font-size: 12px;
      resize: vertical;
    }
    .cr-draft-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 6px;
      background: color-mix(in srgb, var(--bg, #16171d), var(--cr-accent) 14%);
      border: 1px solid var(--cr-border);
      font-size: 13px;
    }
    .cr-sounds {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--cr-dim);
    }
    .cr-sound-opt {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .cr-sound-opt input {
      cursor: pointer;
    }
    .cr-token.cr-enabled .cr-token-avatar {
      box-shadow: 0 0 0 2px var(--cr-enabled);
    }
    .cr-token-mute {
      position: absolute;
      right: -2px;
      bottom: -2px;
      font-size: calc(var(--cell) * 0.34);
      line-height: 1;
      filter: drop-shadow(0 1px 1px #000);
    }
    /* speaking ring (VAD): only for people in YOUR huddle — the "light" indicator */
    .cr-token.cr-speaking .cr-token-avatar {
      box-shadow:
        0 0 0 3px var(--cr-enabled),
        0 0 14px 5px color-mix(in srgb, var(--cr-enabled), transparent 25%);
    }
    /* wiggle (audio-reactive, amplitude = --shake 0..3): room-wide "who's talking"
       signal. A peppy bounce off the feet (bottom pivot) with squash/stretch — hop
       height tracks the voice bucket, and a baseline hop keeps quiet talkers legible.
       Reads "talking" across the grid; reads cute up close. */
    .cr-token.cr-wiggling .cr-token-avatar {
      transform-origin: bottom center;
      animation: cr-bobble 0.3s ease-in-out infinite;
    }
    @keyframes cr-bobble {
      /* grounded: slight lean (no scale — keeps the icon undistorted) */
      0%,
      100% {
        transform: translateY(0) rotate(calc(var(--shake, 0) * 1.5deg));
      }
      /* peak: small hop, ~1px baseline + a bit more with volume */
      45% {
        transform: translateY(calc(-1px - var(--shake, 0) * 1px))
          rotate(calc(var(--shake, 0) * -1.5deg));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .cr-token {
        transition: none;
      }
      .cr-token.cr-wiggling .cr-token-avatar {
        animation: none;
      } /* keep the ring, drop the motion */
    }
    .cr-roster {
      margin-top: 0;
    }
    .cr-roster-empty {
      margin: 0;
      font-size: 12px;
      color: var(--cr-dim);
    }
    .cr-roster-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .cr-roster-item {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 32px;
    }
    /* compact buttons inside the roster (the grid/keyboard are the primary targets) */
    .cr-roster .cr-btn {
      min-height: 30px;
      padding: 3px 8px;
      font-size: 12px;
    }
    .cr-roster-item.cr-blocked .cr-roster-name {
      color: var(--cr-dim);
      text-decoration: line-through;
    }
    .cr-roster-name {
      flex: 1 1 auto;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cr-roster-btn {
      flex: 0 0 auto;
    }
    .cr-roster-menu-btn {
      flex: 0 0 auto;
      min-width: 44px;
      font-size: 18px;
      line-height: 1;
    }
    .cr-roster-menu {
      flex-basis: 100%;
      display: flex;
      gap: 6px;
      padding-left: 17px; /* line up under the name, past the status dot */
    }
    .cr-visually-hidden {
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
    .cr-errors {
      margin-top: 8px;
      color: color-mix(in srgb, var(--cr-text), #ff3b30 65%);
      font-size: 13px;
    }
  </style>
`
