from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models.prediction import Prediction
from backend.app.models.alert import Alert
from backend.app.models.zone import Zone
from backend.app.schemas.prediction import (
    PredictionRequest,
    PredictionResponse,
)
from backend.app.services.prediction_service import PredictionService
from backend.app.services.alert_service import AlertService


router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("", response_model=PredictionResponse)
async def create_prediction(
    request: PredictionRequest,
    db: Session = Depends(get_db),
):
    # 1. Find the requested zone.
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

    # 2. The zone must have coordinates.
    if zone.latitude is None or zone.longitude is None:
        raise HTTPException(
            status_code=400,
            detail=f"Zone '{request.zone_id}' has no coordinates",
        )

    try:
        # 3. Send the location + dynamic signals to the real ML service.
        risk_result = await PredictionService.predict(
            latitude=float(zone.latitude),
            longitude=float(zone.longitude),
            rainfall_24h=request.rainfall_24h,
            soil_moisture=request.soil_moisture,
            ground_movement=request.ground_movement,
        )

        # 4. Persist the ML prediction.
        db_prediction = Prediction(
            zone_id=request.zone_id,
            timestamp=datetime.utcnow(),
            risk_score=risk_result["risk_score"],
            risk_level=risk_result["risk_level"],
            confidence=risk_result["confidence"],
        )

        db.add(db_prediction)
        db.commit()
        db.refresh(db_prediction)

        # 5. Generate an alert when required.
        alert_data = AlertService.generate_alert_from_prediction(
            zone_id=db_prediction.zone_id,
            risk_score=db_prediction.risk_score,
            confidence=db_prediction.confidence,
            recommended_action=risk_result["recommended_action"],
        )

        if alert_data:
            try:
                db_alert = Alert(
                    zone_id=alert_data["zone_id"],
                    severity=alert_data["severity"],
                    message=alert_data["message"],
                    timestamp=alert_data["timestamp"],
                    status=alert_data["status"],
                )

                db.add(db_alert)
                db.commit()
                db.refresh(db_alert)

            except Exception as alert_error:
                db.rollback()
                print(
                    f"Warning: Failed to create alert: "
                    f"{alert_error}"
                )

        # 6. Return the ML result using the frontend contract.
        return PredictionResponse(
            zone_id=db_prediction.zone_id,
            terrain_probability=risk_result["terrain_probability"],
            rainfall_factor=risk_result["rainfall_factor"],
            soil_moisture_factor=risk_result[
                "soil_moisture_factor"
            ],
            ground_movement_factor=risk_result[
                "ground_movement_factor"
            ],
            risk_probability=risk_result["risk_probability"],
            risk_score=db_prediction.risk_score,
            risk_level=db_prediction.risk_level,
            confidence=db_prediction.confidence,
            recommended_action=risk_result[
                "recommended_action"
            ],
            drivers=risk_result.get("drivers", []),
        )

    except HTTPException:
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=502,
            detail=f"ML prediction failed: {exc}",
        )