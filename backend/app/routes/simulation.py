from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.zone import Zone
from backend.app.schemas.simulation import SimulationRequest, SimulationResponse
from backend.app.services.simulation_service import SimulationService

router = APIRouter(prefix="/simulate", tags=["simulation"])


@router.post("", response_model=SimulationResponse)
async def simulate(
    request: SimulationRequest,
    db: Session = Depends(get_db),
):
    zone = (
        db.query(Zone)
        .filter(Zone.zone_id == request.zone_id)
        .first()
    )

    if not zone:
        raise HTTPException(
            status_code=404,
            detail=f"Zone '{request.zone_id}' not found",
        )

    if zone.latitude is None or zone.longitude is None:
        raise HTTPException(
            status_code=400,
            detail=f"Zone '{request.zone_id}' has no valid coordinates",
        )

    try:
        result = await SimulationService.simulate_landslide_risk(
            zone_id=request.zone_id,
            latitude=zone.latitude,
            longitude=zone.longitude,
            rainfall_24h=request.rainfall_24h,
            soil_moisture=request.soil_moisture,
            ground_movement=request.ground_movement,
        )

        return result

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc