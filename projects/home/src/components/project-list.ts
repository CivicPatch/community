import { html } from 'lit';
import { component, useEffect, useState } from 'haunted';


const ProjectList = () => {
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
        const response = await fetch('entries.json')
        const data = await response.json()
        console.log(data)

        return entriesByProject(data.entries);
    }


    return html`
        <ul class="projects">
            ${projects.map((project: any) => html`
                <li class="project">
                    <details name="projects">
                        <summary>
                            <h2>${project.project_name}</h2>
                            <span class="count">${project.entries.length}</span>
                        </summary>
                        <ul class="entries">
                            ${project.entries.map((entry: any) => html`
                                <li class="entry">
                                    <a href=${entry.link} target="_blank" rel="noopener">
                                        ${entry.title}
                                    </a>
                                    <time datetime=${entry.updated}>
                                        ${new Date(entry.updated).toLocaleDateString()}
                                    </time>
                                </li>
                            `)}
                        </ul>
                    </details>
                </li>
            `)}
        </ul>
    `
}

customElements.define("project-list", component(ProjectList, { useShadowDOM: false}))