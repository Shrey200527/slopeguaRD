from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models.priority import Priority
from backend.app.schemas.priority import PriorityRequest, PriorityResponse
from backend.app.services.priority_service import PriorityService

router = APIRouter(prefix="/priorities", tags=["priorities"])


@router.post("", response_model=PriorityResponse)
async def create_priority(
    request: PriorityRequest,
    db: Session = Depends(get_db)
):
    try:
        # Calculate priority score and recommended action
        priority_result = PriorityService.calculate_priority(
            risk=request.risk,
            exposure=request.exposure,
            urgency=request.urgency
        )
        
        # Create priority record
        db_priority = Priority(
            zone_id=request.zone_id,
            risk=request.risk,
            exposure=request.exposure,
            urgency=request.urgency,
            priority_score=priority_result['priority_score'],
            recommended_action=priority_result['recommended_action']
        )
        
        db.add(db_priority)
        db.commit()
        db.refresh(db_priority)
        return db_priority
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create priority: {str(e)}")


@router.get("", response_model=list[PriorityResponse])
async def get_priorities(
    limit: int = 100,
    db: Session = Depends(get_db)
):
    try:
        priorities = db.query(Priority).order_by(Priority.priority_score.desc()).limit(limit).all()
        return priorities
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve priorities: {str(e)}")
