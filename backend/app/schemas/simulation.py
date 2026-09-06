from pydantic import BaseModel


class SimulationRequest(BaseModel):
    zone_id: str
    forecast_rainfall: float
    current_soil_moisture: float
    slope: float
    elevation: float
    historical_risk: float
    current_tilt: float


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
