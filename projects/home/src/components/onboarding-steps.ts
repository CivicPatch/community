import { html } from 'lit';
import { component } from 'haunted';

const OnboardingSteps = () => {
    return html`
    <h2>Onboarding</h2>
    <ol class="onboarding">
        <li class="onboarding-step">
            <h3 class="onboarding-step-title">Join the community</h3>
            <p class="onboarding-step-body">
                Create an account at Unified.
            </p>
        </li>
        <li class="onboarding-step">
            <h3 class="onboarding-step-title">Add your project to the member directory</h3>
            <p class="onboarding-step-body">
            Fill out this <a href="https://forms.gle/yJ8auo39KMPMywgm6" target="_blank">form</a>. 
            </p>
        </li>
        <li class="onboarding-step">
            <h3 class="onboarding-step-title">Add your project feeds</h3>
            <p class="onboarding-step-body">
            Update this <a href="https://github.com/CivicPatch/community/blob/main/projects/feeds/feeds.yaml" target="_blank">yaml file</a>.
            Reach out to the community to get it merged.
            </p>
        </li>
    </ol>
    `
}

customElements.define("onboarding-steps", component(OnboardingSteps, { useShadowDOM: false}))