from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.schemas.sync import SyncRequest, SyncResponse
from backend.app.services.sync_service import SyncService

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
async def sync_offline_reports(
    request: SyncRequest,
    db: Session = Depends(get_db)
):
    try:
        result = SyncService.sync_reports(db=db, reports=request.reports)
        if not result["success"] and result["failed_count"] == len(request.reports) and len(request.reports) > 0:
            raise HTTPException(status_code=500, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synchronization failed: {str(e)}")
