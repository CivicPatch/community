import os
from pathlib import Path
from typing import cast, Any
from pydantic import BaseModel, HttpUrl
from enum import Enum
import httpx
from datetime import datetime, timezone 
from calendar import timegm

import yaml
from email.utils import parsedate_to_datetime
import nh3
from pprint import pprint
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
    news_event = "news_event"
    discussion_event = "discussion_event"
    commit_event = "commit_event"

class Feed(BaseModel):
    type: FeedType
    url: HttpUrl

class MetaItem(BaseModel):
    label: str
    content: str

class Topic(BaseModel):
    type: TopicType | None = None
    url: str | None = None
    description: str | None = None
    name: str
    display_name: str | None = None
    feeds: list[Feed]
    meta: list[MetaItem] | None = None

class RssEntry(BaseModel):
    id: str
    summary: str
    link: str
    published: str
    image: str | None = None

class FeedEntry(BaseModel):
    name: str
    type: FeedType
    id: str
    title: str
    link: str
    updated: datetime
    image: HttpUrl | None = None

class Output(BaseModel):
    generated: datetime 
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

def to_entry(entry: dict[str, Any]):  # pyright: ignore[reportExplicitAny]
    when = entry.get("updated_parsed") or entry.get("published_parsed")   # struct_time
    title = entry.get("title") or entry.get("summary") or "(untitled)"
    return {
        "id":    entry.get("id") or entry.get("link"),
        "title": nh3.clean(title),
        "link":  entry.get("link"),
        "updated": datetime.fromtimestamp(timegm(when), tz=timezone.utc) if when else None
    }

def fetch_feed_entries(name: str, feed_type: FeedType, url: str):
    response = httpx.get(url)
    parsed = feedparser.parse(response.content)  # pyright: ignore[reportUnknownMemberType]
    #pprint(parsed)
    feed = cast(dict[str, Any], parsed.feed)  # pyright: ignore[reportExplicitAny]
    entries = cast(list[dict[str, object]], parsed.entries)

    entries = [to_entry(entry) for entry in entries]

    feed_image = feed.get("image") or {}
    image: str | None = feed_image.get("href")

    entries = [FeedEntry.model_validate({
        **entry, 
        "name": name, 
        "type": feed_type,
        "image": image
    }) for entry in entries]

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
    current_time = datetime.now(timezone.utc)
    feed_output = Output(generated=current_time, topics=topics, entries=entries)
    output_filename = Path(FEED_OUTPUT_FOLDER) / "feeds.json"
    _ = output_filename.write_text(feed_output.model_dump_json(indent=2))

def main():
    topics = get_topics()
    entries = fetch_all_entries(topics)

    save_feed_entries(topics, entries)

if __name__ == "__main__":
    main()