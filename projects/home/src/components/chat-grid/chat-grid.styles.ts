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
      /* radio (music) tiles: a warm amber tint, distinct from the cool audio blue */
      --cg-radio: color-mix(in srgb, var(--bg, #16171d), #e0a35a 18%);
      --cg-radio-hover: color-mix(in srgb, var(--bg, #16171d), #e0a35a 32%);
    }
    .cg-wrap {
      font-family: system-ui, sans-serif;
      color: var(--cg-text);
    }
    /* grid + detail panel: side by side when there's huddle, panel wraps below when not */
    .cg-stage {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 12px;
    }
    .cg-side {
      flex: 1 1 300px;
      min-width: 260px;
      max-width: 420px;
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
    .cg-cell.cg-audio.cg-active-huddle {
      background: var(--cg-audio-active);
      box-shadow: inset 0 0 0 2px var(--cg-accent);
    }
    .cg-cell.cg-wall {
      background: var(--cg-wall);
      cursor: default;
    }
    /* radio (music) tiles: warm tint + a ♪ corner mark hinting "walk on to listen" */
    .cg-cell.cg-radio {
      background: var(--cg-radio);
    }
    .cg-cell.cg-radio:hover {
      background: var(--cg-radio-hover);
    }
    .cg-cell.cg-radio::after {
      content: '♪';
      position: absolute;
      top: 0;
      right: 3px;
      font-size: 55%;
      opacity: 0.8;
      color: var(--cg-text);
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
    /* timer-driven open (status bubble, toasts) — same chrome, shown via state not hover */
    .cg-pop--open {
      display: block;
      z-index: 50;
    }
    /* extra clearance so a token's status bubble sits above its name label */
    .cg-pop-raise {
      margin-bottom: 18px;
    }
    .cg-pop-title {
      display: block;
      font-weight: 600;
    }
    .cg-pop-body {
      display: block;
      margin-top: 2px;
      color: var(--cg-dim);
      /* preserve the author's line breaks/spacing — on the inner body span only,
         so the popover template's own indentation isn't rendered as whitespace */
      white-space: pre-wrap;
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
    .cg-token.cg-me .cg-token-avatar {
      /* faint accent disc behind your own emoji — find yourself without a colour dot */
      background: color-mix(in srgb, var(--cg-accent), transparent 75%);
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
    .cg-roster-avatar {
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
    /* same green "audio active" ring as the grid token (var(--cg-enabled)) */
    .cg-roster-avatar.cg-ring {
      box-shadow: 0 0 0 2px var(--cg-enabled);
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
    .cg-you {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      margin-bottom: 8px;
      border-bottom: 1px solid var(--cg-border);
    }
    .cg-you-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cg-you-avatar {
      font-size: 20px;
      line-height: 1;
    }
    .cg-you-name {
      font-weight: 600;
      font-size: 13px;
    }
    .cg-you-status {
      width: 100%;
      box-sizing: border-box;
      resize: none;
      font: inherit;
      font-size: 13px;
      line-height: 1.3;
      padding: 4px 8px;
      border-radius: 8px;
      border: 1px solid var(--cg-border);
      background: transparent;
      color: var(--cg-text);
    }
    .cg-roster-head {
      margin: 8px 0 2px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--cg-dim);
    }
    .cg-roster-saying {
      flex: 1 1 60px;
      min-width: 0;
      font-size: 12px;
      opacity: 0.75;
      overflow-wrap: anywhere; /* wrap long statuses instead of clipping */
    }
    /* inline "more" badge → opens the full status in a modal */
    .cg-roster-more {
      border: 0;
      padding: 0;
      margin-left: 4px;
      background: none;
      font: inherit;
      color: var(--cg-accent);
      cursor: pointer;
      white-space: nowrap;
    }
    .cg-roster-more:hover {
      text-decoration: underline;
    }
    /* full status text in the modal — preserve author line breaks, wrap long words */
    .cg-status-full {
      margin: 0 0 14px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.5;
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
    /* mic muted: accent-tinted so "you're muted" is obvious at a glance */
    .cg-mic-muted {
      background: color-mix(in srgb, var(--cg-accent) 18%, var(--cg-cell));
      border-color: var(--cg-accent);
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
    .cg-sounds {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      color: var(--cg-dim);
    }
    .cg-sound-opt {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .cg-sound-opt input {
      cursor: pointer;
    }
    .cg-token.cg-enabled .cg-token-avatar {
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
    /* speaking ring (VAD): only for people in YOUR huddle — the "light" indicator */
    .cg-token.cg-speaking .cg-token-avatar {
      box-shadow:
        0 0 0 3px var(--cg-enabled),
        0 0 14px 5px color-mix(in srgb, var(--cg-enabled), transparent 25%);
    }
    /* wiggle (audio-reactive, amplitude = --shake): grid-wide, anyone talking */
    .cg-token.cg-wiggling .cg-token-avatar {
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
      .cg-token.cg-wiggling .cg-token-avatar {
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
    .cg-roster-name {
      flex: 1 1 auto;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
