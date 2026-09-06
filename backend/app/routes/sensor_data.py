from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.sensor_reading import SensorReading
from backend.app.schemas.sensor_reading import SensorReadingRequest, SensorReadingResponse

router = APIRouter(prefix="/sensor-data", tags=["sensor-data"])


@router.post("", response_model=SensorReadingResponse)
async def create_sensor_reading(
    reading: SensorReadingRequest,
    db: Session = Depends(get_db)
):
    try:
        db_reading = SensorReading(
            zone_id=reading.zone_id,
            timestamp=reading.timestamp,
            rainfall=reading.rainfall,
            soil_moisture=reading.soil_moisture,
            tilt=reading.tilt
        )
        db.add(db_reading)
        db.commit()
        db.refresh(db_reading)
        return db_reading
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create sensor reading: {str(e)}")


@router.get("", response_model=list[SensorReadingResponse])
async def get_sensor_readings(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    try:
        readings = db.query(SensorReading).order_by(SensorReading.timestamp.desc()).limit(limit).all()
        return readings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve sensor readings: {str(e)}")
