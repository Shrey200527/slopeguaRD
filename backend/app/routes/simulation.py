from fastapi import APIRouter
from backend.app.schemas.simulation import SimulationRequest, SimulationResponse
from backend.app.services.simulation_service import SimulationService

router = APIRouter(prefix="/simulate", tags=["simulation"])


@router.post("", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    result = SimulationService.simulate_landslide_risk(
        zone_id=request.zone_id,
        forecast_rainfall=request.forecast_rainfall,
        current_soil_moisture=request.current_soil_moisture,
        slope=request.slope,
        elevation=request.elevation,
        historical_risk=request.historical_risk,
        current_tilt=request.current_tilt
    )
    return result
