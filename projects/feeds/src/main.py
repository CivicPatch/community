import os
from pathlib import Path
from typing import cast
from pydantic import BaseModel, HttpUrl
from enum import Enum
import httpx
from datetime import datetime 
import yaml

import feedparser 

FEEDS_FILE = os.getenv(
    "FEEDS_FILE", 
    str(Path(__file__).parent.parent / "feeds.yaml")
)
FEED_OUTPUT_FOLDER= os.getenv(
    "FEED_OUTPUT_FOLDER",
    str(Path(__file__).parent.parent / "dist")
)

class FeedType(str, Enum):
    commit_event = "commit_event"

class Feed(BaseModel):
    type: FeedType
    url: HttpUrl

class Project(BaseModel):
    name: str
    feeds: list[Feed]

class FeedEntry(BaseModel):
    project_name: str
    type: FeedType
    id: str
    title: str
    link: str
    updated: datetime

class EntriesOutput(BaseModel):
    entries: list[FeedEntry]


def get_projects() -> list[Project]:
    with open(FEEDS_FILE) as f:
        feeds_list = cast(list[object],yaml.safe_load(f))
    projects = [Project.model_validate(item) for item in feeds_list]
    return projects

def fetch_feed_entries(project_name: str, feed_type: FeedType, url: str):
    response = httpx.get(url)
    parsed = feedparser.parse(response.content)  # pyright: ignore[reportUnknownMemberType]
    entries = cast(list[dict[str, object]], parsed.entries)
    entries = [FeedEntry.model_validate({**entry, "project_name": project_name, "type": feed_type}) for entry in entries]

    return entries

def entries_for_project(project: Project) -> list[FeedEntry]:
    return [
        entry
        for feed in project.feeds
        for entry in fetch_feed_entries(project.name, feed.type, str(feed.url))
    ]

def fetch_all_entries(projects: list[Project]):
    entries = [
        entry
        for project in projects
        for entry in entries_for_project(project)
    ]
    return sorted(
        entries,
        key=lambda e: e.updated,
        reverse=True
    )


def save_feed_entries(entries: list[FeedEntry]):
    Path(FEED_OUTPUT_FOLDER).mkdir(parents=True, exist_ok=True)
    feed_output = EntriesOutput(entries=entries)
    output_filename = Path(FEED_OUTPUT_FOLDER) / "entries.json"
    _ = output_filename.write_text(feed_output.model_dump_json(indent=2))

def main():
    projects = get_projects()
    entries = fetch_all_entries(projects)

    save_feed_entries(entries)

if __name__ == "__main__":
    main()