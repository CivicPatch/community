// Pre-join gate: the name + avatar screen shown until the player joins. join() is
// deferred to this form's submit (see submitJoin in the component), so people pick
// an identity before appearing on the room. `makeJoinGate` closes over the draft
// state + submit callback and returns the renderer the template shows when not joined.

import { html } from 'lit'

// Preset avatars for the join gate — emoji only. No uploaded images: that would need a
// storage bucket, which the free / cannot-be-charged constraint rules out.
export const AVATARS = ['🦊', '🐙', '🐳', '🦉', '🐝', '🦋', '🐢', '🦄', '🐸', '🐱', '🦝', '🐧']

const inputValue = (e: Event) => (e.target as HTMLInputElement).value

export interface JoinGateDeps {
  nameDraft: string
  setNameDraft: (v: string) => void
  avatarDraft: string
  setAvatarDraft: (a: string) => void
  /** shown as the name placeholder (the auto-assigned "Guest ####" fallback). */
  namePlaceholder: string
  submitJoin: () => void
}

export const makeJoinGate = (deps: JoinGateDeps) => () =>
  html`<div class="cr-modal-backdrop cr-gate-backdrop">
    <div class="cr-modal" role="dialog" aria-modal="true" aria-label="Join the room">
      <h3 class="cr-modal-title">Join the room</h3>
      <form
        class="cr-gate-form"
        @submit=${(e: Event) => {
          e.preventDefault()
          deps.submitJoin()
        }}
      >
        <div class="cr-field">
          <label for="cr-join-name">Name</label>
          <input
            id="cr-join-name"
            autofocus
            maxlength="24"
            .value=${deps.nameDraft}
            placeholder=${deps.namePlaceholder}
            @input=${(e: Event) => deps.setNameDraft(inputValue(e))}
          />
        </div>
        <div class="cr-field">
          <label>Avatar</label>
          <div class="cr-avatar-grid" role="radiogroup" aria-label="Choose an avatar">
            ${AVATARS.map(
              (a) => html`<button
                type="button"
                class="cr-avatar-opt ${deps.avatarDraft === a ? 'cr-avatar-sel' : ''}"
                role="radio"
                aria-checked=${deps.avatarDraft === a}
                aria-label=${`Avatar ${a}`}
                @click=${() => deps.setAvatarDraft(a)}
              >
                ${a}
              </button>`,
            )}
          </div>
        </div>
        <div class="cr-modal-actions">
          <button type="submit" class="cr-btn cr-btn-primary">Join the room</button>
        </div>
      </form>
    </div>
  </div>`
