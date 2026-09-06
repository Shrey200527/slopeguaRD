from pathlib import Path

import joblib
import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_PATH = BASE_DIR / "models" / "landslide_xgb_model.joblib"

model = joblib.load(MODEL_PATH)

elevations = np.arange(0, 4001, 250)
slopes = np.arange(0, 51, 5)

rows = []

for elevation in elevations:
    for slope in slopes:

        X = pd.DataFrame(
            [{
                "elevation": elevation,
                "slope": slope,
            }]
        )

        probability = model.predict_proba(X)[0][1]

        rows.append({
            "elevation": elevation,
            "slope": slope,
            "risk_probability": probability
        })

result = pd.DataFrame(rows)

print("\nRISK SURFACE")
print("=" * 60)

print(
    result
    .sort_values("risk_probability", ascending=False)
    .head(20)
    .to_string(index=False)
)

print("\nProbability range:")
print(
    f"Min: {result.risk_probability.min():.4f}"
    f"\nMax: {result.risk_probability.max():.4f}"
)

output = BASE_DIR / "data" / "processed" / "risk_surface.csv"

result.to_csv(output, index=False)

print(f"\nSaved to: {output}")