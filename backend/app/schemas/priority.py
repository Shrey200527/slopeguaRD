from pydantic import BaseModel


class PriorityRequest(BaseModel):
    zone_id: str
    risk: float
    exposure: float
    urgency: float


class PriorityResponse(BaseModel):
    id: int
    zone_id: str
    risk: float
    exposure: float
    urgency: float
    priority_score: float
    recommended_action: str

    class Config:
        from_attributes = True
