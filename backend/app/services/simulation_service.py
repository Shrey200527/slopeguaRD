from typing import Any, Dict

from backend.app.services.prediction_service import PredictionService


class SimulationService:
    @staticmethod
    async def simulate_landslide_risk(
        zone_id: str,
        latitude: float,
        longitude: float,
        rainfall_24h: float,
        soil_moisture: float,
        ground_movement: float,
        current_risk_score: float | None = None,
    ) -> Dict[str, Any]:
        """
        Run a stateless hypothetical prediction through the real ML service.
        Nothing is persisted.
        """

        simulated_result = await PredictionService.predict(
            latitude=latitude,
            longitude=longitude,
            rainfall_24h=rainfall_24h,
            soil_moisture=soil_moisture,
            ground_movement=ground_movement,
        )

        simulated_score = simulated_result["risk_score"]
        simulated_level = simulated_result["risk_level"]

        changed_from_current = (
            current_risk_score is not None
            and round(simulated_score, 2) != round(current_risk_score, 2)
        )

        if current_risk_score is None:
            message = (
                f"Simulated risk is "
                f"{simulated_score:.1f} ({simulated_level})."
            )
        elif changed_from_current:
            message = (
                f"Simulated risk shifted from "
                f"{current_risk_score:.1f} to "
                f"{simulated_score:.1f} ({simulated_level})."
            )
        else:
            message = (
                f"Simulated risk remains at "
                f"{simulated_score:.1f} ({simulated_level})."
            )

        return {
            "zone_id": zone_id,
            "simulated_risk_score": simulated_score,
            "simulated_risk_level": simulated_level,
            "simulated_priority_score": 0.0,
            "recommended_action": simulated_result["recommended_action"],
            "changed_from_current": changed_from_current,
            "message": message,
        }