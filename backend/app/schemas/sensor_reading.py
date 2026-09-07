from datetime import datetime

from pydantic import BaseModel, Field


class SensorReadingRequest(BaseModel):
    device_id: str
    zone_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    rainfall_24h: float = Field(ge=0)
    soil_moisture: float = Field(ge=0, le=100)
    ground_movement: float = Field(ge=0)


class SensorReadingResponse(BaseModel):
    id: int
    device_id: str
    zone_id: str
    latitude: float
    longitude: float
    timestamp: datetime
    rainfall_24h: float
    soil_moisture: float
    ground_movement: float

    class Config:
        from_attributes = True