import os
from pathlib import Path
from pydantic import BaseModel, HttpUrl
from enum import Enum
import feedparser
import yaml

FEEDS_FILE = os.getenv(
    "FEEDS_FILE", 
    Path(__file__).parent.parent / "feeds.yaml"
)

class FeedType(str, Enum):
    commit_event = "commit_event"

class Feed(BaseModel):
    type: FeedType
    url: HttpUrl

class Project(BaseModel):
    name: str
    feeds: list[Feed]

class FeedEvent(BaseModel):
    pass

class ProjectWithEvents(BaseModel):
    name: str
    events: list[FeedEvent]

def get_projects() -> list[Project]:
    with open(FEEDS_FILE) as f:
        feeds_list: list[object] = yaml.safe_load(f)
    projects = [Project.model_validate(item) for item in feeds_list]
    return projects



def fetch_feed_events(projects: list[Project]):
    pass

def save_feed_events(feed_events: list[FeedEvent]):
    pass

def main():
    projects = get_projects()
    feed_events = fetch_feed_events(projects)

    save_feed_events(feed_events)
