from datetime import datetime
from typing import Dict, List


class PredictionService:
    @staticmethod
    def calculate_risk(
        rainfall: float,
        soil_moisture: float,
        slope: float,
        elevation: float,
        historical_risk: float,
        tilt: float
    ) -> Dict[str, any]:
        """
        Mock deterministic risk calculation.
        This will be replaced by the actual ML model later.
        """
        # Normalize inputs to 0-1 range for calculation
        rainfall_norm = min(rainfall / 100.0, 1.0)  # Assume max rainfall 100mm
        soil_moisture_norm = min(soil_moisture / 100.0, 1.0)  # Assume max 100%
        slope_norm = min(slope / 90.0, 1.0)  # Assume max slope 90 degrees
        elevation_norm = min(elevation / 2000.0, 1.0)  # Assume max elevation 2000m
        historical_risk_norm = historical_risk / 100.0
        tilt_norm = min(abs(tilt) / 45.0, 1.0)  # Assume max tilt 45 degrees
        
        # Weighted risk calculation (mock algorithm)
        weights = {
            'rainfall': 0.25,
            'soil_moisture': 0.20,
            'slope': 0.15,
            'elevation': 0.10,
            'historical_risk': 0.20,
            'tilt': 0.10
        }
        
        risk_score = (
            rainfall_norm * weights['rainfall'] +
            soil_moisture_norm * weights['soil_moisture'] +
            slope_norm * weights['slope'] +
            elevation_norm * weights['elevation'] +
            historical_risk_norm * weights['historical_risk'] +
            tilt_norm * weights['tilt']
        ) * 100
        
        # Determine risk level
        if risk_score >= 80:
            risk_level = "CRITICAL"
        elif risk_score >= 60:
            risk_level = "HIGH"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
        
        # Calculate confidence based on input consistency
        confidence = 0.7 + (0.3 * (1 - abs(risk_score - 50) / 50))
        confidence = max(0.5, min(0.95, confidence))
        
        # Identify major contributing factors
        drivers = []
        contributions = {
            'High rainfall': rainfall_norm * weights['rainfall'],
            'High soil moisture': soil_moisture_norm * weights['soil_moisture'],
            'Steep slope': slope_norm * weights['slope'],
            'High elevation': elevation_norm * weights['elevation'],
            'Historical risk': historical_risk_norm * weights['historical_risk'],
            'High tilt': tilt_norm * weights['tilt']
        }
        
        # Sort by contribution and take top 3
        sorted_drivers = sorted(contributions.items(), key=lambda x: x[1], reverse=True)
        for driver, contribution in sorted_drivers[:3]:
            if contribution > 0.1:  # Only include significant contributors
                drivers.append(driver)
        
        if not drivers:
            drivers.append("Moderate conditions")
        
        return {
            'risk_score': round(risk_score, 2),
            'risk_level': risk_level,
            'confidence': round(confidence, 2),
            'drivers': drivers
        }
