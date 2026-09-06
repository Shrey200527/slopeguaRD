from pathlib import Path

import joblib
import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_PATH = (
    BASE_DIR
    / "models"
    / "landslide_xgb_model.joblib"
)


class SlopeGuardRiskEngine:

    def __init__(self):
        self.model = joblib.load(MODEL_PATH)

        self.features = [
            "elevation",
            "slope",
        ]

    def predict(self, elevation, slope):

        X = pd.DataFrame(
            [{
                "elevation": elevation,
                "slope": slope,
            }]
        )

        probability = float(
            self.model.predict_proba(X)[0][1]
        )

        risk_score = round(probability * 100, 2)

        if risk_score < 25:
            level = "LOW"
        elif risk_score < 50:
            level = "MODERATE"
        elif risk_score < 75:
            level = "HIGH"
        else:
            level = "CRITICAL"

        return {
            "risk_probability": round(probability, 4),
            "risk_score": risk_score,
            "risk_level": level,
            "features": {
                "elevation_m": round(float(elevation), 2),
                "slope_deg": round(float(slope), 2),
            }
        }


if __name__ == "__main__":

    engine = SlopeGuardRiskEngine()

    test_cases = [
        (500, 10),
        (1500, 25),
        (2500, 35),
        (3500, 45),
    ]

    print("\nSLOPEGUARD RISK ENGINE")
    print("======================")

    for elevation, slope in test_cases:

        result = engine.predict(
            elevation,
            slope
        )

        print(
            f"\nElevation: {elevation} m"
            f"\nSlope: {slope}°"
            f"\nRisk: {result['risk_score']}"
            f"\nLevel: {result['risk_level']}"
        )