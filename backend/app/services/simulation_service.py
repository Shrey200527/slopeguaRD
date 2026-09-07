from typing import Dict, Any
from backend.app.services.prediction_service import PredictionService
from backend.app.services.priority_service import PriorityService


class SimulationService:
    @staticmethod
    def simulate_landslide_risk(
        zone_id: str,
        rainfall_24h: float,
        soil_moisture: float,
        ground_movement: float,
        slope: float = 0.0,
        elevation: float = 0.0,
        historical_risk: float = 0.0
    ) -> Dict[str, Any]:
        """
        Simulate how landslide risk and priority change when forecast rainfall is applied.
        Deterministic, stateless, and does not persist to database.
        Uses LOW / MODERATE / HIGH / CRITICAL risk tiers.
        """
        # Baseline risk without forecast rainfall and movement (current state)
        baseline_result = PredictionService.calculate_risk(
            rainfall_24h=0.0,
            soil_moisture=soil_moisture,
            ground_movement=0.0,
            slope=slope,
            elevation=elevation,
            historical_risk=historical_risk
        )
        baseline_score = baseline_result['risk_score']
        baseline_level = baseline_result['risk_level']

        # Soil moisture saturation adjustment based on forecast rainfall infiltration
        simulated_soil_moisture = min(100.0, soil_moisture + (rainfall_24h * 0.2))

        # Simulated risk with forecast rainfall and ground movement applied
        simulated_result = PredictionService.calculate_risk(
            rainfall_24h=rainfall_24h,
            soil_moisture=simulated_soil_moisture,
            ground_movement=ground_movement,
            slope=slope,
            elevation=elevation,
            historical_risk=historical_risk
        )
        simulated_score = simulated_result['risk_score']
        simulated_level = simulated_result['risk_level']

        # Determine priority based on simulated risk, exposure, and urgency
        exposure = max(historical_risk, 50.0)
        if simulated_score >= 75.0:
            urgency = 95.0
        elif simulated_score >= 50.0:
            urgency = 80.0
        elif simulated_score >= 25.0:
            urgency = 60.0
        else:
            urgency = 30.0

        priority_result = PriorityService.calculate_priority(
            risk=simulated_score,
            exposure=exposure,
            urgency=urgency
        )
        simulated_priority_score = priority_result['priority_score']
        recommended_action = simulated_result['recommended_action']

        changed_from_current = (simulated_score != baseline_score) or (simulated_level != baseline_level)

        if changed_from_current:
            message = (
                f"Simulated risk shifted from {baseline_score:.1f} ({baseline_level}) "
                f"to {simulated_score:.1f} ({simulated_level}) under {rainfall_24h:.1f}mm forecast rainfall."
            )
        else:
            message = f"Simulated risk remains unchanged at {simulated_score:.1f} ({simulated_level})."

        return {
            "zone_id": zone_id,
            "simulated_risk_score": simulated_score,
            "simulated_risk_level": simulated_level,
            "simulated_priority_score": simulated_priority_score,
            "recommended_action": recommended_action,
            "changed_from_current": changed_from_current,
            "message": message
        }
