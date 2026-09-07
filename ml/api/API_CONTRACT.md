# SlopeGuard-NER ML API Contract

Base URL:

http://127.0.0.1:8000

---

## GET /

Health/status information.

### Response

```json
{
  "system": "SlopeGuard-NER",
  "status": "online",
  "version": "2.0.0",
  "model": "XGBoost terrain susceptibility"
}
GET /health

Used by frontend/backend to check whether the ML service is available.

Response
{
  "status": "healthy",
  "model_loaded": true,
  "terrain_service": true
}
POST /predict

Manual prediction using supplied terrain and environmental values.

Request
{
  "latitude": 27.78,
  "longitude": 93.47,
  "elevation": 990,
  "slope": 30.19,
  "rainfall_24h": 20,
  "soil_moisture": 30,
  "ground_movement": 0
}
Response structure
{
  "location": {},
  "terrain": {},
  "dynamic_inputs": {},
  "risk": {},
  "model": {}
}
POST /sensor

Primary endpoint for IoT sensor integration.

The IoT device DOES NOT send elevation or slope.

Request
{
  "device_id": "SLOPEGUARD-001",
  "latitude": 27.78,
  "longitude": 93.47,
  "rainfall_24h": 140,
  "soil_moisture": 85,
  "ground_movement": 6
}
Processing

GPS coordinates
→ CartoDEM terrain lookup
→ elevation + slope
→ XGBoost susceptibility
→ dynamic signal fusion
→ risk score
→ risk level
→ recommended action

Response
{
  "device_id": "SLOPEGUARD-001",

  "location": {
    "latitude": 27.78,
    "longitude": 93.47
  },

  "terrain": {
    "elevation_m": 990.0,
    "slope_deg": 30.19
  },

  "sensor_data": {
    "rainfall_24h_mm": 140,
    "soil_moisture_percent": 85,
    "ground_movement": 6
  },

  "risk": {
    "terrain_probability": 0.5926,
    "rainfall_factor": 0.933,
    "soil_moisture_factor": 0.85,
    "ground_movement_factor": 0.6,
    "risk_probability": 0.6661,
    "risk_score": 66.61,
    "risk_level": "HIGH",
    "confidence": 0.9,
    "recommended_action": "Prioritize field verification and prepare precautionary response."
  },

  "status": "sensor_data_processed"
}
Risk levels
Score	Level
0–24.99	LOW
25–49.99	MODERATE
50–74.99	HIGH
75–100	CRITICAL
Current ML model

Algorithm:

XGBoost binary classifier

Current trained features:

elevation
slope

Training data:

GSI landslide inventory
Arunachal Pradesh
440 landslide observations within current DEM coverage
440 background samples

Current baseline evaluation:

ROC-AUC: 0.878
Recall: 0.818
F1: 0.809

NOTE:
These are prototype baseline metrics using the current sampling strategy.
They should not be presented as final operational model performance.

Current dynamic fusion

Terrain susceptibility:

70%

Dynamic environmental signals:

30%

Dynamic signals:

rainfall
soil moisture
ground movement

NOTE:
These fusion weights are prototype decision-layer weights,
not learned model coefficients.

Frontend integration

Frontend should:

Call GET /health.
Display susceptibility/risk information.
Send selected location data to /predict OR sensor data to /sensor.
Display risk score and risk level.
Display recommended action.
Display terrain and environmental factors.
IoT integration

ESP32 should call:

POST /sensor

It should send:

device_id
latitude
longitude
rainfall_24h
soil_moisture
ground_movement

The backend performs terrain lookup automatically.


---

# 4. Now commit your work

Before pushing, check:

```bash
git status