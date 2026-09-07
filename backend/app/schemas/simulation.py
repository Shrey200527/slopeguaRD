from pydantic import BaseModel


class SimulationRequest(BaseModel):
    zone_id: str
    rainfall_24h: float
    soil_moisture: float
    ground_movement: float


class SimulationResponse(BaseModel):
    zone_id: str
    simulated_risk_score: float
    simulated_risk_level: str
    simulated_priority_score: float
    recommended_action: str
    changed_from_current: bool
    message: str

    class Config:
        from_attributes = True
