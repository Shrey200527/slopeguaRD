from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.field_report import FieldReport
from backend.app.schemas.field_report import FieldReportRequest, FieldReportResponse

router = APIRouter(prefix="/field-report", tags=["field-report"])


@router.post("", response_model=FieldReportResponse)
async def create_field_report(
    report: FieldReportRequest,
    db: Session = Depends(get_db)
):
    try:
        db_report = FieldReport(
            zone_id=report.zone_id,
            latitude=report.latitude,
            longitude=report.longitude,
            timestamp=report.timestamp,
            type=report.type,
            description=report.description,
            image=report.image,
            status="PENDING"
        )
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        return db_report
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create field report: {str(e)}")


@router.get("", response_model=list[FieldReportResponse])
async def get_field_reports(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    try:
        reports = db.query(FieldReport).order_by(FieldReport.timestamp.desc()).limit(limit).all()
        return reports
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve field reports: {str(e)}")
