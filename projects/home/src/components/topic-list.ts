import { html } from 'lit';
import { component, useEffect, useState } from 'haunted';
import DOMPurify from 'dompurify'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

type FeedType = 'discussion_event' | 'commit_event'
type TopicType = 'project' 

interface FeedEntry {
  name: string
  type: FeedType
  id: string
  title: string
  link: string
  updated: string 
}

interface Topic {
  display_name?: string | null
  type?: TopicType | null
  url?: string | null
  description?: string | null
  name: string
  feeds: { type: FeedType; url: string }[]
  meta?: { label: string; content: string }[]
}

interface TopicGroup {
  name: string
  entries: FeedEntry[]
}

// titles arrive as HTML; flatten to plain text for use in attributes like alt
const toPlainText = (value: string) =>
    DOMPurify.sanitize(value ?? '', { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
        .replace(/\s+/g, ' ')
        .trim()

const TopicList = (
    { 'feed-url': feedUrl = 'feeds.json' }) => {
    const [topics, setTopics] = useState<Record<string, Topic>>({})
    const [topicGroups, setTopicGroups] = useState<TopicGroup[]>([])
    const [generatedTimestamp, setGeneratedTimestamp] = useState(null)

    useEffect(() => {
        const load = async () => {
            const [topicsData, topicGroupsData, generatedTimestampData] = await fetchFeeds()
            setTopics(topicsData);
            setTopicGroups(topicGroupsData)
            setGeneratedTimestamp(generatedTimestampData)
        }
        load();
    }, [])

    const friendlyTime = (timestamp: string) => {
        const diffMs = new Date(timestamp).getTime() - Date.now()
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        const units: [Intl.RelativeTimeFormatUnit, number][] = [
            ['day', 86_400_000], ['hour', 3_600_000],
            ['minute', 60_000], ['second', 1000],
        ]
        for (const [unit, ms] of units) {
            if (Math.abs(diffMs) >= ms || unit === 'second')
                return rtf.format(Math.round(diffMs / ms), unit)
        }
        return ''
    }

    const entriesByTopic = (entries: any[]) => {
        return entries.reduce((topics, currentEntry) => {
            const topicName = currentEntry["name"]
            const topicIndex = topics
                .findIndex((p: any) => p["name"] === topicName)
            if (topicIndex >= 0) {
                const prevEntries = topics[topicIndex]["entries"]
                topics[topicIndex].entries = [...prevEntries, currentEntry]
            } else {
                topics = [...topics, { 
                    name: topicName, 
                    entries: [currentEntry] 
                }]
            }
            return topics
        }, [])
    }

    const fetchFeeds = async () => {
        const response = await fetch(feedUrl)
        const data = await response.json()
        console.log(data)

        return [data.topics, entriesByTopic(data.entries), data.generated];
    }

    return html`
        <header class="ledger-head">
            <span class="ledger-title">Feeds</span>
        </header>
        <ul class="topics">
            ${topicGroups.map((topicGroup: any) => { 
                const topic = topics[topicGroup["name"]];
                return html`
                <li class="topic">
                    <details name="topics">
                        <summary>
                            <section>
                                <span class="marker" aria-hidden="true"></span>
                                <h2>${topic.display_name ?? topic.name} <span class="topic-type-${topic.type}">${topic.type}</span></h2>
                                <time class="timestamp" datetime=${topicGroup.entries[0].updated}>
                                    ${friendlyTime(topicGroup.entries[0].updated)}
                                </time>
                            </section>
                            ${topic.description
                                ? html`<section><p>${topic.description}</p></section>`
                                : ''}
                        </summary>
                        ${topic.url ? html`
                        <dl class="topic-meta">
                            <dt>link</dt>
                            <dd>
                                <a href=${topic.url} target="_blank" rel="noopener">
                                    ${topic.url}
                                </a>
                            </dd>
                            ${
                                topic.meta &&
                                topic.meta.map((metaItem) => {
                                    return html`
                                    <dt>${metaItem.label}</dt>
                                    <dd>${unsafeHTML(DOMPurify.sanitize(metaItem.content))}</dd>
                                    `
                                })
                            }
                        </dl>
                        ` : ''}
                        <ol class="entries">
                            ${topicGroup.entries.map((entry: any) => {
                                const title = toPlainText(entry.title)
                                const altText = title
                                    ? `Avatar of the author who posted: ${title.length > 80 ? title.slice(0, 80) + '…' : title}`
                                    : 'Author avatar'
                                return html`
                                <li class="entry" data-type=${entry.type}>
                                    <div class="entry-body">
                                        ${entry.image &&
                                            html`<img class="entry-thumb" src="${entry.image}" alt=${altText} loading="lazy">`
                                        }
                                        <a class="entry-title" href=${entry.link} target="_blank" rel="noopener">
                                            ${unsafeHTML(DOMPurify.sanitize(entry.title))}
                                        </a>
                                    </div>
                                    <div class="entry-meta">
                                        ${entry.type === 'discussion_event'
                                            ? html`<span class="entry-tag">discussion</span>`
                                            : ''}
                                        <time datetime=${entry.updated}>
                                            ${entry.updated.slice(0, 10)}
                                        </time>
                                    </div>
                                </li>`
                            })}
                        </ol>
                    </details>
                </li>`
            })}
        </ul>
        ${generatedTimestamp &&
            html` <div class="ledger-foot">
            Last generated: ${friendlyTime(generatedTimestamp)}
            </div>`
        }
    `
}

customElements.define("topic-list", component(TopicList, { observedAttributes: ['feed-url'], useShadowDOM: false}))