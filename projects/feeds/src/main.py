import os
from pathlib import Path
from typing import cast, Optional
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

class TopicType(str, Enum):
    project = "project"

class FeedType(str, Enum):
    discussion_event = "discussion_event"
    commit_event = "commit_event"

class Feed(BaseModel):
    type: FeedType
    url: HttpUrl

class Topic(BaseModel):
    type: TopicType | None = None
    url: str | None = None
    description: str | None = None
    name: str
    feeds: list[Feed]

class FeedEntry(BaseModel):
    name: str
    type: FeedType
    id: str
    title: str
    link: str
    updated: datetime

class Output(BaseModel):
    topics: dict[str, Topic]
    entries: list[FeedEntry]


def get_topics() -> dict[str, Topic]:
    with open(FEEDS_FILE) as f:
        feeds_list = cast(list[object],yaml.safe_load(f))
    topics = [Topic.model_validate(item) for item in feeds_list]
    topics_by_name = {
        topic.name: topic
        for topic in topics
    }
    return topics_by_name

def fetch_feed_entries(name: str, feed_type: FeedType, url: str):
    response = httpx.get(url)
    parsed = feedparser.parse(response.content)  # pyright: ignore[reportUnknownMemberType]
    entries = cast(list[dict[str, object]], parsed.entries)
    entries = [FeedEntry.model_validate({**entry, "name": name, "type": feed_type}) for entry in entries]

    return entries

def entries_for_topic(topic: Topic) -> list[FeedEntry]:
    return [
        entry
        for feed in topic.feeds
        for entry in fetch_feed_entries(topic.name, feed.type, str(feed.url))
    ]

def fetch_all_entries(topics: dict[str, Topic]):
    entries = [
        entry
        for topic in topics.values()
        for entry in entries_for_topic(topic)
    ]
    return sorted(
        entries,
        key=lambda e: e.updated,
        reverse=True
    )


def save_feed_entries(topics: dict[str, Topic], entries: list[FeedEntry]):
    Path(FEED_OUTPUT_FOLDER).mkdir(parents=True, exist_ok=True)
    feed_output = Output(topics=topics, entries=entries)
    output_filename = Path(FEED_OUTPUT_FOLDER) / "feeds.json"
    _ = output_filename.write_text(feed_output.model_dump_json(indent=2))

def main():
    topics = get_topics()
    entries = fetch_all_entries(topics)

    save_feed_entries(topics, entries)

if __name__ == "__main__":
    main()