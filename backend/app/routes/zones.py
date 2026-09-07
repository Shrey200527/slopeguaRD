from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.zone import Zone

router = APIRouter(prefix="/zones", tags=["zones"])


@router.get("")
def get_zones(db: Session = Depends(get_db)):
    zones = db.query(Zone).all()

    return [
        {
            "zone_id": zone.zone_id,
            "name": zone.name,
            "latitude": zone.latitude,
            "longitude": zone.longitude,
            "slope": zone.slope,
            "elevation": zone.elevation,
            "historical_risk": zone.historical_risk,
        }
        for zone in zones
    ]


@router.get("/{zone_id}")
def get_zone(zone_id: str, db: Session = Depends(get_db)):
    zone = (
        db.query(Zone)
        .filter(Zone.zone_id == zone_id)
        .first()
    )

    if not zone:
        raise HTTPException(
            status_code=404,
            detail=f"Zone '{zone_id}' not found",
        )

    return {
        "zone_id": zone.zone_id,
        "name": zone.name,
        "latitude": zone.latitude,
        "longitude": zone.longitude,
        "slope": zone.slope,
        "elevation": zone.elevation,
        "historical_risk": zone.historical_risk,
    }
