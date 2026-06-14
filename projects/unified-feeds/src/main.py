import os
from pathlib import Path
from pydantic import BaseModel
import feedparser
import yaml

FEEDS_FILE = os.getenv(
    "FEEDS_FILE", 
    Path(__file__).parent.parent / "feeds.yaml"
)

class Project(BaseModel):
    pass

class FeedEvent(BaseModel):
    pass

def get_projects() -> list[Project]:
    pass

def fetch_feed_events(projects: list[Project]):
    pass

def save_feed_events(feed_events: list[FeedEvent]):
    pass

def main():
    projects = get_projects()
    feed_events = fetch_feed_events(projects)

    save_feed_events(feed_events)
