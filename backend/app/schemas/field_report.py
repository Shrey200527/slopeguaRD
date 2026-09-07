from pydantic import BaseModel
from datetime import datetime


class FieldReportRequest(BaseModel):
    zone_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    type: str
    description: str
    image: str


class FieldReportResponse(BaseModel):
    id: int
    zone_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    type: str
    description: str
    image: str
    status: str

    class Config:
        from_attributes = True
