import { html } from 'lit';
import { component, useEffect, useState } from 'haunted';

const ProjectPage = () => {
    return html`hello-wold`
}

customElements.define("project-page", component(ProjectPage, { observedAttributes: [], useShadowDOM: false}))