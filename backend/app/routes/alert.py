from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from backend.app.database import get_db
from backend.app.models.alert import Alert
from backend.app.schemas.alert import AlertRequest, AlertResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.post("", response_model=AlertResponse)
async def create_alert(
    alert: AlertRequest,
    db: Session = Depends(get_db)
):
    try:
        db_alert = Alert(
            zone_id=alert.zone_id,
            severity=alert.severity,
            message=alert.message,
            timestamp=datetime.utcnow(),
            status="ACTIVE"
        )
        db.add(db_alert)
        db.commit()
        db.refresh(db_alert)
        return db_alert
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create alert: {str(e)}")


@router.get("", response_model=list[AlertResponse])
async def get_alerts(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    try:
        alerts = db.query(Alert).order_by(Alert.timestamp.desc()).limit(limit).all()
        return alerts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve alerts: {str(e)}")

@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
):
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id)
        .first()
    )

    if not alert:
        raise HTTPException(
            status_code=404,
            detail=f"Alert '{alert_id}' not found",
        )

    try:
        alert.status = "ACKNOWLEDGED"

        db.commit()
        db.refresh(alert)

        return alert

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to acknowledge alert: {str(exc)}",
        ) from exc