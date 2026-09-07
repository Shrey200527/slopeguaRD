from pydantic import BaseModel
from datetime import datetime


class AlertRequest(BaseModel):
    zone_id: str
    severity: str
    message: str


class AlertResponse(BaseModel):
    id: int
    zone_id: str
    severity: str
    message: str
    timestamp: datetime
    status: str

    class Config:
        from_attributes = True
