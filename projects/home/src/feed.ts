// The Feeds list as a PURE lit template: data in, markup out — no hooks, no fetch,
// no DOM. That purity is what lets it render two ways from one source of truth:
//   • at build, lit-ssr renders it with feeds.json → static HTML (works with no JS)
//   • (if ever wanted) a client component could call the same template to refresh
// Untrusted feed data is cleaned at INGESTION by the pipeline (projects/feeds/src/main.py):
// titles are stripped to plain text (some feeds, e.g. Mastodon, put an HTML post body
// there) and links are validated to http(s). So the view renders titles as plain escaped
// text and binds links raw. Only topic meta — authored feeds.yaml config (trusted), whose
// links are intentional — renders via unsafeHTML. Times render as absolute dates (the
// no-JS fallback, never stale); [data-relative] ones become "3 days ago" via enhance-times.

import { html } from 'lit'
import type { TemplateResult } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

export interface FeedEntry {
  name: string
  type: string
  title: string
  link: string
  updated: string
  image?: string | null
}

export interface Topic {
  name: string
  display_name?: string | null
  type?: string | null
  url?: string | null
  description?: string | null
  meta?: { label: string; content: string }[]
}

export interface FeedData {
  generated?: string
  topics?: Record<string, Topic>
  entries?: FeedEntry[]
}

const day = (s?: string): string => (s ? new Date(s).toISOString().slice(0, 10) : '')

// group entries by topic name, preserving first-seen order
const groupByTopic = (entries: FeedEntry[]) => {
  const groups: { name: string; entries: FeedEntry[] }[] = []
  const index: Record<string, number> = {}
  for (const e of entries) {
    if (index[e.name] == null) {
      index[e.name] = groups.length
      groups.push({ name: e.name, entries: [e] })
    } else groups[index[e.name]].entries.push(e)
  }
  return groups
}

export const feedTemplate = (data: FeedData): TemplateResult => {
  const topics = data.topics ?? {}
  const groups = groupByTopic(data.entries ?? [])
  return html`
    <header class="ledger-head"><span class="ledger-title">Feeds</span></header>
    <ul class="topics">
      ${groups.map((g) => {
        const t = topics[g.name] ?? { name: g.name }
        const first = g.entries[0]
        return html`
          <li class="topic">
            <details name="topics">
              <summary>
                <section>
                  <span class="marker" aria-hidden="true"></span>
                  <h2>${t.display_name ?? t.name} <span class="topic-type-${t.type}">${t.type}</span></h2>
                  <time class="timestamp" data-relative datetime=${first.updated}>${day(first.updated)}</time>
                </section>
                ${t.description ? html`<section><p>${t.description}</p></section>` : ''}
              </summary>
              ${t.url
                ? html`
                    <dl class="topic-meta">
                      <dt>link</dt>
                      <dd><a href=${t.url} target="_blank" rel="noopener">${t.url}</a></dd>
                      ${(t.meta ?? []).map(
                        (m) => html`<dt>${m.label}</dt>
                          <dd>${unsafeHTML(m.content)}</dd>`,
                      )}
                    </dl>
                  `
                : ''}
              <ol class="entries">
                ${g.entries.map(
                  (e) => html`
                    <li class="entry" data-type=${e.type}>
                      <div class="entry-body">
                        ${e.image
                          ? html`<img class="entry-thumb" src=${e.image} alt="Author avatar" loading="lazy" />`
                          : ''}
                        <a class="entry-title" href=${e.link} target="_blank" rel="noopener"
                          >${e.title}</a
                        >
                      </div>
                      <div class="entry-meta">
                        ${e.type === 'discussion_event' ? html`<span class="entry-tag">discussion</span>` : ''}
                        <time datetime=${e.updated}>${day(e.updated)}</time>
                      </div>
                    </li>
                  `,
                )}
              </ol>
            </details>
          </li>
        `
      })}
    </ul>
    ${data.generated
      ? html`<div class="ledger-foot">
          Last generated: <time data-relative datetime=${data.generated}>${day(data.generated)}</time>
        </div>`
      : ''}
  `
}
