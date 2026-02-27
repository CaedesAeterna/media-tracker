from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class Episode(BaseModel):
    episode_number: int
    title: Optional[str] = None
    air_date: Optional[str] = None

class Season(BaseModel):
    season_number: int
    episodes: List[Episode] = []

class MediaItem(BaseModel):
    title: str
    media_type: str # movie, series, book, etc.
    description: Optional[str] = None
    seasons: Optional[List[Season]] = [] # New field for Series support
    creator: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MediaItemCreate(MediaItem):
    pass

class MediaItemDB(MediaItem):
    id: str
