import { html } from 'lit';
import { component, useEffect, useState } from 'haunted';


const ProjectList = (
    { 'feed-url': feedUrl = 'entries.json' }) => {
    const [projects, setProjects] = useState([])

    useEffect(() => {
        const load = async () => {
            const data = await fetchProjectFeedEntries()
            setProjects(data)
        }
        load();
    }, [])

    const entriesByProject = (entries: any[]) => {
        return entries.reduce((projects, currentEntry) => {
            const projectName = currentEntry["project_name"]
            const projectIndex = projects
                .findIndex((p) => p["project_name"] === projectName)
            if (projectIndex >= 0) {
                const prevEntries = projects[projectIndex]["entries"]
                projects[projectIndex].entries = [...prevEntries, currentEntry]
            } else {
                projects = [...projects, { 
                    project_name: projectName, 
                    entries: [currentEntry] 
                }]
            }
            return projects
        }, [])
    }

    const fetchProjectFeedEntries = async () => {
        const response = await fetch(feedUrl)
        const data = await response.json()
        console.log(data)

        return entriesByProject(data.entries);
    }

    return html`
        <header class="ledger-head">
            <span class="ledger-title">Feeds</span>
            <span class="ledger-meta">
                ${projects.length} ${projects.length === 1 ? 'project' : 'projects'}
            </span>
        </header>
        <ul class="projects">
            ${projects.map((project: any) => html`
                <li class="project">
                    <details name="projects">
                        <summary>
                            <span class="marker" aria-hidden="true"></span>
                            <h2>${project.project_name}</h2>
                            <time class="timestamp" datetime=${project.entries[0].updated}>
                                ${project.entries[0].updated.slice(0, 10)}
                            </time>
                        </summary>
                        <ol class="entries">
                            ${project.entries.map((entry: any) => html`
                                <li class="entry">
                                    <a href=${entry.link} target="_blank" rel="noopener">
                                        ${entry.title}
                                    </a>
                                    <time datetime=${entry.updated}>
                                        ${entry.updated.slice(0, 10)}
                                    </time>
                                </li>
                            `)}
                        </ol>
                    </details>
                </li>
            `)}
        </ul>
    `
}

customElements.define("project-list", component(ProjectList, { observedAttributes: ['feed-url'], useShadowDOM: false}))