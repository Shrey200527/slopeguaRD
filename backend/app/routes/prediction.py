from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from backend.app.database import get_db
from backend.app.models.prediction import Prediction
from backend.app.models.alert import Alert
from backend.app.schemas.prediction import PredictionRequest, PredictionResponse
from backend.app.services.prediction_service import PredictionService
from backend.app.services.alert_service import AlertService

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post("", response_model=PredictionResponse)
async def create_prediction(
    request: PredictionRequest,
    db: Session = Depends(get_db)
):
    try:
        # Calculate risk using the prediction service
        risk_result = PredictionService.calculate_risk(
            rainfall=request.rainfall,
            soil_moisture=request.soil_moisture,
            slope=request.slope,
            elevation=request.elevation,
            historical_risk=request.historical_risk,
            tilt=request.tilt
        )
        
        # Create prediction record
        db_prediction = Prediction(
            zone_id=request.zone_id,
            timestamp=datetime.utcnow(),
            risk_score=risk_result['risk_score'],
            risk_level=risk_result['risk_level'],
            confidence=risk_result['confidence']
        )
        
        db.add(db_prediction)
        db.commit()
        db.refresh(db_prediction)
        
        # Generate alert if risk score is critical
        alert_data = AlertService.generate_alert_from_prediction(
            zone_id=db_prediction.zone_id,
            risk_score=db_prediction.risk_score,
            confidence=db_prediction.confidence
        )
        
        if alert_data:
            try:
                db_alert = Alert(
                    zone_id=alert_data['zone_id'],
                    severity=alert_data['severity'],
                    message=alert_data['message'],
                    timestamp=alert_data['timestamp'],
                    status=alert_data['status']
                )
                db.add(db_alert)
                db.commit()
                db.refresh(db_alert)
            except Exception as alert_error:
                db.rollback()
                # Alert creation failed, but prediction is already saved
                # Log the error but don't fail the prediction request
                print(f"Warning: Failed to create alert: {alert_error}")
        
        # Return response with calculated risk
        return PredictionResponse(
            zone_id=db_prediction.zone_id,
            risk_score=db_prediction.risk_score,
            risk_level=db_prediction.risk_level,
            confidence=db_prediction.confidence,
            drivers=risk_result['drivers']
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create prediction: {str(e)}")
