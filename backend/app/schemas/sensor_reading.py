from pydantic import BaseModel
from datetime import datetime


class SensorReadingRequest(BaseModel):
    zone_id: str
    timestamp: datetime
    rainfall: float
    soil_moisture: float
    tilt: float


class SensorReadingResponse(BaseModel):
    id: int
    zone_id: str
    timestamp: datetime
    rainfall: float
    soil_moisture: float
    tilt: float

    class Config:
        from_attributes = True
