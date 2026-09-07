from datetime import datetime
from typing import Dict


class AlertService:
    @staticmethod
    def generate_alert_from_prediction(zone_id: str, risk_score: float, confidence: float, recommended_action: str = None) -> Dict[str, any]:
        """
        Generate an alert when prediction risk score is >= 75.0.
        Returns alert data dictionary or None if no alert needed.
        """
        if risk_score >= 75.0:
            message = f"CRITICAL: Zone {zone_id} has landslide risk score of {risk_score:.1f}"
            if confidence:
                message += f" (confidence: {confidence:.2f})"
            if recommended_action:
                message += f". Recommended action: {recommended_action}"
            else:
                message += ". Immediate action required."
            
            return {
                'zone_id': zone_id,
                'severity': 'CRITICAL',
                'message': message,
                'timestamp': datetime.utcnow(),
                'status': 'ACTIVE'
            }
        
        return None
