from typing import List, Dict, Any
from sqlalchemy.orm import Session
from backend.app.models.field_report import FieldReport
from backend.app.schemas.sync import OfflineReportItem


class SyncService:
    @staticmethod
    def sync_reports(db: Session, reports: List[OfflineReportItem]) -> Dict[str, Any]:
        """
        Process a batch of offline field reports and persist them to the database.
        Applies in-batch and database-level duplicate detection.
        Sets status to 'PENDING'.
        """
        if not reports:
            return {
                "success": True,
                "synced_count": 0,
                "failed_count": 0,
                "message": "0 offline reports synchronized successfully",
                "errors": []
            }

        synced_count = 0
        failed_count = 0
        errors: List[str] = []
        seen_in_batch = set()

        for idx, item in enumerate(reports):
            try:
                # Deduplication key based on report signature
                dedup_key = (item.zone_id, item.timestamp, item.type, item.description)
                if dedup_key in seen_in_batch:
                    # Duplicate item within the same batch payload
                    continue
                seen_in_batch.add(dedup_key)

                # Check if identical record already exists in database (e.g. client retries)
                existing = db.query(FieldReport).filter(
                    FieldReport.zone_id == item.zone_id,
                    FieldReport.timestamp == item.timestamp,
                    FieldReport.type == item.type,
                    FieldReport.description == item.description
                ).first()

                if existing:
                    # Already exists in DB from previous sync
                    synced_count += 1
                    continue

                # Instantiate new FieldReport with PENDING status
                new_report = FieldReport(
                    zone_id=item.zone_id,
                    latitude=item.latitude,
                    longitude=item.longitude,
                    timestamp=item.timestamp,
                    type=item.type,
                    description=item.description,
                    image=item.image,
                    status="PENDING"
                )
                db.add(new_report)
                synced_count += 1
            except Exception as e:
                failed_count += 1
                errors.append(f"Report at index {idx} failed: {str(e)}")

        try:
            db.commit()
        except Exception as e:
            db.rollback()
            return {
                "success": False,
                "synced_count": 0,
                "failed_count": len(reports),
                "message": f"Database commit failed during synchronization: {str(e)}",
                "errors": [str(e)]
            }

        return {
            "success": failed_count == 0,
            "synced_count": synced_count,
            "failed_count": failed_count,
            "message": f"{synced_count} offline reports synchronized successfully" if failed_count == 0 else f"{synced_count} synchronized, {failed_count} failed",
            "errors": errors
        }
