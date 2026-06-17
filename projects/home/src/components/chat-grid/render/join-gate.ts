// Pre-join gate: the name + avatar screen shown until the player joins. join() is
// deferred to this form's submit (see submitJoin in the component), so people pick
// an identity before appearing on the grid. `makeJoinGate` closes over the draft
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
  html`<div class="cg-modal-backdrop cg-gate-backdrop">
    <div class="cg-modal" role="dialog" aria-modal="true" aria-label="Join the grid">
      <h3 class="cg-modal-title">Join the grid</h3>
      <form
        class="cg-gate-form"
        @submit=${(e: Event) => {
          e.preventDefault()
          deps.submitJoin()
        }}
      >
        <div class="cg-field">
          <label for="cg-join-name">Name</label>
          <input
            id="cg-join-name"
            autofocus
            maxlength="24"
            .value=${deps.nameDraft}
            placeholder=${deps.namePlaceholder}
            @input=${(e: Event) => deps.setNameDraft(inputValue(e))}
          />
        </div>
        <div class="cg-field">
          <label>Avatar</label>
          <div class="cg-avatar-grid" role="radiogroup" aria-label="Choose an avatar">
            ${AVATARS.map(
              (a) => html`<button
                type="button"
                class="cg-avatar-opt ${deps.avatarDraft === a ? 'cg-avatar-sel' : ''}"
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
        <div class="cg-modal-actions">
          <button type="submit" class="cg-btn cg-btn-primary">Join the grid</button>
        </div>
      </form>
    </div>
  </div>`
