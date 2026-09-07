from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base


class Priority(Base):
    __tablename__ = "priorities"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, ForeignKey("zones.zone_id"), index=True)
    risk = Column(Float)
    exposure = Column(Float)
    urgency = Column(Float)
    priority_score = Column(Float)
    recommended_action = Column(String)

    zone = relationship("Zone", backref="priorities")
