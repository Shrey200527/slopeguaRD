from typing import Dict


class PriorityService:
    @staticmethod
    def calculate_priority(risk: float, exposure: float, urgency: float) -> Dict[str, any]:
        """
        Calculate priority score and recommended action based on risk, exposure, and urgency.
        Returns dictionary with priority_score (0-100) and recommended_action.
        """
        # Normalize inputs to 0-1 range
        risk_norm = min(risk / 100.0, 1.0)
        exposure_norm = min(exposure / 100.0, 1.0)
        urgency_norm = min(urgency / 100.0, 1.0)
        
        # Calculate priority score as normalized combination
        priority_score = (risk_norm * exposure_norm * urgency_norm) * 100
        priority_score = round(priority_score, 2)
        
        # Determine recommended action based on priority score
        if priority_score >= 80:
            recommended_action = "immediate evacuation / emergency response"
        elif priority_score >= 60:
            recommended_action = "urgent inspection"
        elif priority_score >= 40:
            recommended_action = "monitor closely"
        else:
            recommended_action = "routine monitoring"
        
        return {
            'priority_score': priority_score,
            'recommended_action': recommended_action
        }
