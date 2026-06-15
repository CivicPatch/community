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
}

interface TopicGroup {
  name: string
  entries: FeedEntry[]
}

const TopicList = (
    { 'feed-url': feedUrl = 'feeds.json' }) => {
    const [topics, setTopics] = useState<Record<string, Topic>>({})
    const [topicGroups, setTopicGroups] = useState<TopicGroup[]>([])

    useEffect(() => {
        const load = async () => {
            const [topicsData, topicGroupsData] = await fetchFeeds()
            setTopics(topicsData);
            setTopicGroups(topicGroupsData)
        }
        load();
    }, [])

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

        return [data.topics, entriesByTopic(data.entries)];
    }

    return html`
        <header class="ledger-head">
            <span class="ledger-title">Feeds</span>
        </header>
        <ul class="topics">
            ${topicGroups.map((topicGroup: any) => { 
                const topic: any = topics[topicGroup["name"]];
                return html`
                <li class="topic">
                    <details name="topics">
                        <summary>
                            <section>
                                <span class="marker" aria-hidden="true"></span>
                                <h2><span class="topic-type-${topic.type}">${topic.type}</span> ${topic.display_name ?? topic.name}</h2>
                                <time class="timestamp" datetime=${topicGroup.entries[0].updated}>
                                    ${topicGroup.entries[0].updated.slice(0, 10)}
                                </time>
                            </section>
                            <section>
                                ${topic.description &&
                                    html`<p>${topic.description}</p>`
                                }
                            </section>
                        </summary>
                        <dl class="topic-meta">
                            ${topic.url ? html`
                                <dt>link</dt>
                                <dd>
                                    <a href=${topic.url} target="_blank" rel="noopener">
                                        ${topic.url}
                                    </a>
                                </dd>
                            ` : ''}
                        </dl>
                        <ol class="entries">
                            ${topicGroup.entries.map((entry: any) => html`
                                <li class="entry">
                                    ${entry.image &&
                                        html`<img src="${entry.image}">`
                                    }
                                    <a href=${entry.link} target="_blank" rel="noopener">
                                        ${unsafeHTML(DOMPurify.sanitize(entry.title))}
                                    </a>
                                    <time datetime=${entry.updated}>
                                        ${entry.updated.slice(0, 10)}
                                    </time>
                                </li>
                            `)}
                        </ol>
                    </details>
                </li>`
            })}
        </ul>
    `
}

customElements.define("topic-list", component(TopicList, { observedAttributes: ['feed-url'], useShadowDOM: false}))