from pathlib import Path

import joblib
import pandas as pd

from fastapi import FastAPI
from pydantic import BaseModel, Field

from ml.api.terrain import get_terrain

class LocationPredictionRequest(BaseModel):
    latitude: float
    longitude: float
    rainfall_24h: float = 0.0
    soil_moisture: float = 0.0
    ground_movement: float = 0.0
# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_PATH = (
    BASE_DIR
    / "models"
    / "landslide_xgb_model.joblib"
)


# ============================================================
# LOAD MODEL
# ============================================================

model = joblib.load(MODEL_PATH)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="SlopeGuard-NER Risk API",
    description=(
        "AI-powered landslide susceptibility and "
        "dynamic risk assessment API"
    ),
    version="2.0.0",
)


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class PredictionRequest(BaseModel):

    latitude: float
    longitude: float

    elevation: float = Field(
        ...,
        ge=-100,
        le=9000,
    )

    slope: float = Field(
        ...,
        ge=0,
        le=90,
    )

    rainfall_24h: float = Field(
        0,
        ge=0,
    )

    soil_moisture: float = Field(
        0,
        ge=0,
        le=100,
    )

    ground_movement: float = Field(
        0,
        ge=0,
    )


class SensorData(BaseModel):

    device_id: str

    latitude: float
    longitude: float

    rainfall_24h: float = Field(
        ...,
        ge=0,
    )

    soil_moisture: float = Field(
        ...,
        ge=0,
        le=100,
    )

    ground_movement: float = Field(
        ...,
        ge=0,
    )


# ============================================================
# RISK ENGINE
# ============================================================

def calculate_risk(
    elevation: float,
    slope: float,
    rainfall_24h: float,
    soil_moisture: float,
    ground_movement: float,
):

    # --------------------------------------------------------
    # TERRAIN MODEL
    # --------------------------------------------------------

    X = pd.DataFrame(
        [{
            "elevation": elevation,
            "slope": slope,
        }]
    )

    terrain_probability = float(
        model.predict_proba(X)[0][1]
    )

    # --------------------------------------------------------
    # DYNAMIC SIGNALS
    # --------------------------------------------------------

    rainfall_factor = min(
        rainfall_24h / 150.0,
        1.0,
    )

    moisture_factor = (
        soil_moisture / 100.0
    )

    movement_factor = min(
        ground_movement / 10.0,
        1.0,
    )

    # Prototype fusion layer.
    dynamic_factor = (
        0.45 * rainfall_factor
        + 0.35 * moisture_factor
        + 0.20 * movement_factor
    )

    # --------------------------------------------------------
    # FINAL RISK
    # --------------------------------------------------------

    final_probability = (
        0.70 * terrain_probability
        + 0.30 * dynamic_factor
    )

    final_probability = min(
        max(final_probability, 0.0),
        1.0,
    )

    risk_score = round(
        final_probability * 100,
        2,
    )

    # --------------------------------------------------------
    # RISK LEVEL
    # --------------------------------------------------------

    if risk_score < 25:
        risk_level = "LOW"

    elif risk_score < 50:
        risk_level = "MODERATE"

    elif risk_score < 75:
        risk_level = "HIGH"

    else:
        risk_level = "CRITICAL"

    # --------------------------------------------------------
    # ACTION
    # --------------------------------------------------------

    if risk_level == "LOW":

        action = (
            "Continue routine monitoring."
        )

    elif risk_level == "MODERATE":

        action = (
            "Increase monitoring and verify "
            "local ground conditions."
        )

    elif risk_level == "HIGH":

        action = (
            "Prioritize field verification and "
            "prepare precautionary response."
        )

    else:

        action = (
            "Immediate field verification and "
            "emergency response assessment required."
        )

    # --------------------------------------------------------
    # CONFIDENCE
    # --------------------------------------------------------

    # This is NOT statistical model confidence.
    # It represents input completeness for the prototype.

    available_signals = 0

    if rainfall_24h > 0:
        available_signals += 1

    if soil_moisture > 0:
        available_signals += 1

    if ground_movement > 0:
        available_signals += 1

    confidence = round(
        0.60
        + (available_signals / 3) * 0.30,
        2,
    )

    return {
        "terrain_probability": round(
            terrain_probability,
            4,
        ),

        "rainfall_factor": round(
            rainfall_factor,
            3,
        ),

        "soil_moisture_factor": round(
            moisture_factor,
            3,
        ),

        "ground_movement_factor": round(
            movement_factor,
            3,
        ),

        "risk_probability": round(
            final_probability,
            4,
        ),

        "risk_score": risk_score,

        "risk_level": risk_level,

        "confidence": confidence,

        "recommended_action": action,
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "system": "SlopeGuard-NER",
        "status": "online",
        "version": "2.0.0",
        "model": "XGBoost terrain susceptibility",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "model_loaded": True,
        "terrain_service": True,
    }


# ============================================================
# MANUAL PREDICTION
# ============================================================

@app.post("/predict")
def predict(request: PredictionRequest):

    result = calculate_risk(
        elevation=request.elevation,
        slope=request.slope,
        rainfall_24h=request.rainfall_24h,
        soil_moisture=request.soil_moisture,
        ground_movement=request.ground_movement,
    )

    return {

        "location": {
            "latitude": request.latitude,
            "longitude": request.longitude,
        },

        "terrain": {
            "elevation_m": request.elevation,
            "slope_deg": request.slope,
        },

        "dynamic_inputs": {
            "rainfall_24h_mm": request.rainfall_24h,
            "soil_moisture_percent": request.soil_moisture,
            "ground_movement": request.ground_movement,
        },

        "risk": result,

        "model": {
            "type": "XGBoost",
            "features": [
                "elevation",
                "slope",
            ],
        },
    }

@app.post("/predict/location")
def predict_location(payload: LocationPredictionRequest):
    terrain = get_terrain(payload.latitude, payload.longitude)

    result = calculate_risk(
        elevation=terrain["elevation_m"],
        slope=terrain["slope_deg"],
        rainfall_24h=payload.rainfall_24h,
        soil_moisture=payload.soil_moisture,
        ground_movement=payload.ground_movement,
    )

    return {
        "location": {
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        },
        "terrain": {
            "elevation_m": terrain["elevation_m"],
            "slope_deg": terrain["slope_deg"],
        },
        "dynamic_inputs": {
            "rainfall_24h_mm": payload.rainfall_24h,
            "soil_moisture_percent": payload.soil_moisture,
            "ground_movement": payload.ground_movement,
        },
        "risk": result,
        "model": {
            "type": "XGBoost",
            "features": ["elevation", "slope"],
        },
    }
# ============================================================
# IOT SENSOR ENDPOINT
# ============================================================

@app.post("/sensor")
def receive_sensor_data(data: SensorData):

    # --------------------------------------------------------
    # AUTOMATIC TERRAIN LOOKUP
    # --------------------------------------------------------

    terrain = get_terrain(
        data.latitude,
        data.longitude,
    )

    elevation = terrain["elevation_m"]
    slope = terrain["slope_deg"]

    # --------------------------------------------------------
    # RISK CALCULATION
    # --------------------------------------------------------

    result = calculate_risk(
        elevation=elevation,
        slope=slope,
        rainfall_24h=data.rainfall_24h,
        soil_moisture=data.soil_moisture,
        ground_movement=data.ground_movement,
    )

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return {

        "device_id": data.device_id,

        "location": {
            "latitude": data.latitude,
            "longitude": data.longitude,
        },

        "terrain": {
            "elevation_m": elevation,
            "slope_deg": slope,
        },

        "sensor_data": {
            "rainfall_24h_mm": data.rainfall_24h,
            "soil_moisture_percent": data.soil_moisture,
            "ground_movement": data.ground_movement,
        },

        "risk": result,

        "status": "sensor_data_processed",
    }