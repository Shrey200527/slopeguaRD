from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from backend.app.models.base import Base


class FieldReport(Base):
    __tablename__ = "field_reports"

    id = Column(Integer, primary_key=True, index=True)
    zone_id = Column(String, index=True)
    timestamp = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)
    type = Column(String)
    description = Column(Text)
    image = Column(String)
    status = Column(String)
