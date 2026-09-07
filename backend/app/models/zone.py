from sqlalchemy import Column, Integer, String, Float
from backend.app.models.base import Base


class Zone(Base):
    __tablename__ = "zones"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, unique=True, index=True)
    name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    slope = Column(Float, nullable=True, default=0.0)
    elevation = Column(Float, nullable=True, default=0.0)
    historical_risk = Column(Float, nullable=True, default=0.0)
