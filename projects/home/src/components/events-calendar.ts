import { html } from 'lit';
import { component } from 'haunted';

const EventsCalendar = () => {
    return html`hello-wold`
}

customElements.define("events-calendar", component(EventsCalendar, { observedAttributes: [], useShadowDOM: false}))