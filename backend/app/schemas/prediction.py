from pydantic import BaseModel
from datetime import datetime


class PredictionRequest(BaseModel):
    zone_id: str
    rainfall: float
    soil_moisture: float
    slope: float
    elevation: float
    historical_risk: float
    tilt: float


class PredictionResponse(BaseModel):
    zone_id: str
    risk_score: float
    risk_level: str
    confidence: float
    drivers: list[str]

    class Config:
        from_attributes = True
