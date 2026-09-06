from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, ForeignKey("zones.zone_id"), index=True)
    timestamp = Column(DateTime)
    risk_score = Column(Float)
    risk_level = Column(String)
    confidence = Column(Float)

    zone = relationship("Zone", backref="predictions")
