from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.models.base import Base


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, ForeignKey("zones.zone_id"), index=True)
    timestamp = Column(DateTime)
    rainfall = Column(Float)
    soil_moisture = Column(Float)
    tilt = Column(Float)

    zone = relationship("Zone", backref="sensor_readings")
