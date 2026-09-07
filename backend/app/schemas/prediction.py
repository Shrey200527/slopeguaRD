from pydantic import BaseModel
from typing import List, Optional


class PredictionRequest(BaseModel):
    zone_id: str
    rainfall_24h: float
    soil_moisture: float
    ground_movement: float


class PredictionResponse(BaseModel):
    zone_id: str
    terrain_probability: float
    rainfall_factor: float
    soil_moisture_factor: float
    ground_movement_factor: float
    risk_probability: float
    risk_score: float
    risk_level: str
    confidence: float
    recommended_action: str
    drivers: Optional[List[str]] = []

    class Config:
        from_attributes = True
