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
    db: Session = Depends(get_db)
):
    # 1. Query zone by zone_id
    zone = db.query(Zone).filter(Zone.zone_id == request.zone_id).first()
    if not zone:
        raise HTTPException(
            status_code=404,
            detail=f"Zone '{request.zone_id}' not found"
        )

    # 2. Read terrain features; for missing nullable values use safe default 0.0
    slope = float(zone.slope) if zone.slope is not None else 0.0
    elevation = float(zone.elevation) if zone.elevation is not None else 0.0
    historical_risk = float(zone.historical_risk) if zone.historical_risk is not None else 0.0

    # 3. Calculate simulated risk and priority
    result = SimulationService.simulate_landslide_risk(
        zone_id=request.zone_id,
        rainfall_24h=request.rainfall_24h,
        soil_moisture=request.soil_moisture,
        ground_movement=request.ground_movement,
        slope=slope,
        elevation=elevation,
        historical_risk=historical_risk
    )
    return result
