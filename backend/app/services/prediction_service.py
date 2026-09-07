from typing import Dict, Any, List


class PredictionService:
    @staticmethod
    def calculate_risk(
        rainfall_24h: float,
        soil_moisture: float,
        ground_movement: float,
        slope: float = 0.0,
        elevation: float = 0.0,
        historical_risk: float = 0.0
    ) -> Dict[str, Any]:
        """
        Deterministic backend risk calculation (fallback/pre-ML integration).
        Conforms strictly to the frontend and ML contract:
        - Inputs: rainfall_24h, soil_moisture, ground_movement, slope, elevation, historical_risk.
        - Outputs: terrain_probability, rainfall_factor, soil_moisture_factor,
                   ground_movement_factor, risk_probability, risk_score,
                   risk_level (LOW, MODERATE, HIGH, CRITICAL), confidence,
                   recommended_action, drivers.
        """
        # Safe numeric defaults for terrain values
        slope_val = max(float(slope or 0.0), 0.0)
        elev_val = max(float(elevation or 0.0), 0.0)
        hist_val = max(float(historical_risk or 0.0), 0.0)

        # Dynamic environmental signals normalized using ML criteria:
        # rainfall_24h normalized against 150mm threshold (matching ML)
        rainfall_factor = round(min(rainfall_24h / 150.0, 1.0), 3) if rainfall_24h > 0 else 0.0
        # soil_moisture normalized against 100%
        soil_moisture_factor = round(min(soil_moisture / 100.0, 1.0), 3) if soil_moisture > 0 else 0.0
        # ground_movement normalized against 10.0 scale (matching ML)
        ground_movement_factor = round(min(ground_movement / 10.0, 1.0), 3) if ground_movement > 0 else 0.0

        # Dynamic signal fusion layer (45% rain, 35% moisture, 20% movement matching ML)
        dynamic_factor = (
            0.45 * rainfall_factor +
            0.35 * soil_moisture_factor +
            0.20 * ground_movement_factor
        )

        # Heuristic terrain susceptibility proxying XGBoost terrain output
        slope_norm = min(slope_val / 90.0, 1.0)
        elevation_norm = min(elev_val / 2000.0, 1.0)
        hist_norm = min(hist_val / 100.0, 1.0)
        terrain_probability = round(
            0.60 * slope_norm + 0.25 * elevation_norm + 0.15 * hist_norm,
            4
        )

        # Final risk probability fusion (70% terrain, 30% dynamic signals)
        final_probability = (0.70 * terrain_probability) + (0.30 * dynamic_factor)
        final_probability = min(max(final_probability, 0.0), 1.0)

        risk_score = round(final_probability * 100.0, 2)

        # Risk level categorization matching ML contract:
        # 0 - 24.99: LOW
        # 25 - 49.99: MODERATE
        # 50 - 74.99: HIGH
        # 75 - 100: CRITICAL
        if risk_score < 25.0:
            risk_level = "LOW"
            action = "Continue routine monitoring."
        elif risk_score < 50.0:
            risk_level = "MODERATE"
            action = "Increase monitoring and verify local ground conditions."
        elif risk_score < 75.0:
            risk_level = "HIGH"
            action = "Prioritize field verification and prepare precautionary response."
        else:
            risk_level = "CRITICAL"
            action = "Immediate field verification and emergency response assessment required."

        # Input signal completeness confidence
        available_signals = 0
        if rainfall_24h > 0:
            available_signals += 1
        if soil_moisture > 0:
            available_signals += 1
        if ground_movement > 0:
            available_signals += 1
        confidence = round(0.60 + (available_signals / 3) * 0.30, 2)

        # Contributing drivers for explainability
        drivers: List[str] = []
        if rainfall_factor > 0.4:
            drivers.append("Heavy rainfall")
        if soil_moisture_factor > 0.5:
            drivers.append("High soil moisture")
        if ground_movement_factor > 0.2:
            drivers.append("Active ground movement")
        if terrain_probability > 0.5:
            drivers.append("Steep terrain susceptibility")
        if not drivers:
            drivers.append("Normal baseline conditions")

        return {
            "terrain_probability": terrain_probability,
            "rainfall_factor": rainfall_factor,
            "soil_moisture_factor": soil_moisture_factor,
            "ground_movement_factor": ground_movement_factor,
            "risk_probability": round(final_probability, 4),
            "risk_score": risk_score,
            "risk_level": risk_level,
            "confidence": confidence,
            "recommended_action": action,
            "drivers": drivers
        }
