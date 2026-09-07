from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, ForeignKey("zones.zone_id"), index=True)
    severity = Column(String)
    message = Column(String)
    timestamp = Column(DateTime)
    status = Column(String)

    zone = relationship("Zone", backref="alerts")
