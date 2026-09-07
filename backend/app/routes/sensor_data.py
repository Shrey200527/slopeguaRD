from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.sensor_reading import SensorReading
from backend.app.models.zone import Zone
from backend.app.schemas.sensor_reading import (
    SensorReadingRequest,
    SensorReadingResponse,
)

router = APIRouter(prefix="/sensor-data", tags=["sensor-data"])


@router.post("", response_model=SensorReadingResponse)
async def create_sensor_reading(
    reading: SensorReadingRequest,
    db: Session = Depends(get_db),
):
    zone = (
        db.query(Zone)
        .filter(Zone.zone_id == reading.zone_id)
        .first()
    )

    if not zone:
        raise HTTPException(
            status_code=404,
            detail=f"Zone '{reading.zone_id}' not found",
        )

    try:
        db_reading = SensorReading(
            device_id=reading.device_id,
            zone_id=reading.zone_id,
            latitude=reading.latitude,
            longitude=reading.longitude,
            timestamp=reading.timestamp,
            rainfall_24h=reading.rainfall_24h,
            soil_moisture=reading.soil_moisture,
            ground_movement=reading.ground_movement,
        )

        db.add(db_reading)
        db.commit()
        db.refresh(db_reading)

        return db_reading

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store sensor reading: {str(exc)}",
        ) from exc


@router.get("", response_model=list[SensorReadingResponse])
async def get_sensor_readings(
    limit: int = 100,
    db: Session = Depends(get_db),
):
    try:
        readings = (
            db.query(SensorReading)
            .order_by(SensorReading.timestamp.desc())
            .limit(limit)
            .all()
        )

        return readings

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve sensor readings: {str(exc)}",
        ) from exc