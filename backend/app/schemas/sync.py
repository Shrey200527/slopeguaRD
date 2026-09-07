from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from pydantic import Field

class OfflineReportItem(BaseModel):
    zone_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    type: str
    description: str
    image: str


class SyncRequest(BaseModel):
    reports: List[OfflineReportItem] = Field(default_factory=list)


class SyncResponse(BaseModel):
    success: bool
    synced_count: int
    failed_count: int
    message: str
    errors: Optional[List[str]] = None

    class Config:
        from_attributes = True
