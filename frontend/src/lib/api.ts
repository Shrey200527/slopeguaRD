const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// =============================
// Generic GET
// =============================

export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GET ${endpoint} failed: ${response.status}`);
  }

  return response.json();
}

// =============================
// Generic POST
// =============================

export async function apiPost<T>(
  endpoint: string,
  data: unknown
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`POST ${endpoint} failed: ${response.status}`);
  }

  return response.json();
}

// =============================
// Backend API Types
// =============================

export type BackendAlert = {
  id: number;
  zone_id: string;
  severity: string;
  message: string;
  timestamp: string;
  status: string;
};

export type BackendSensorReading = {
  id: number;
  zone_id: string;
  rainfall: number;
  soil_moisture: number;
  tilt: number;
  timestamp: string;
};

export type BackendPriority = {
  id: number;
  zone_id: string;
  risk: number;
  exposure: number;
  urgency: number;
  priority_score: number;
  recommended_action: string;
};

export type BackendFieldReport = {
  id: number;
  zone_id: string;
  latitude: number;
  longitude?: number;
  type?: string;
  description?: string;
  image?: string;
  status?: string;
  timestamp?: string;
};

export type SimulationResponse = {
  zone_id: string;
  simulated_risk_score: number;
  simulated_risk_level: string;
  simulated_priority_score: number;
};

export type BackendPrediction = {
  zone_id: string;
  risk_score: number;
  risk_level: string;
  confidence: number;
  drivers: string[];
};

// =============================
// Alerts
// =============================

export async function getAlertsApi() {
  return apiGet<BackendAlert[]>("/alerts");
}

export async function createAlertApi(data: {
  zoneId: string;
  severity: string;
  message: string;
}) {
  return apiPost<BackendAlert>("/alerts", {
    zone_id: data.zoneId,
    severity: data.severity,
    message: data.message,
  });
}

// =============================
// Sensor Data
// =============================

export async function getSensorDataApi() {
  return apiGet<BackendSensorReading[]>("/sensor-data");
}

// =============================
// Priorities
// =============================

export async function getPrioritiesApi() {
  return apiGet<BackendPriority[]>("/priorities");
}

export async function createPriorityApi(data: {
  zoneId: string;
  risk: number;
  exposure: number;
  urgency: number;
}) {
  return apiPost<BackendPriority>("/priorities", {
    zone_id: data.zoneId,
    risk: data.risk,
    exposure: data.exposure,
    urgency: data.urgency,
  });
}

// =============================
// Field Reports
// =============================

export async function getFieldReportsApi() {
  return apiGet<BackendFieldReport[]>("/field-report");
}

export async function postFieldReportApi(data: {
  zoneId: string;
  latitude: number;
  longitude: number;
  type: string;
  description: string;
  image?: string;
}) {
  return apiPost<BackendFieldReport>("/field-report", {
    zone_id: data.zoneId,
    latitude: data.latitude,
    longitude: data.longitude,
    timestamp: new Date().toISOString(),
    type: data.type,
    description: data.description,
    image: data.image || "",
  });
}

// =============================
// Simulation & Prediction
// =============================

export async function postSimulationApi(data: {
  zoneId: string;
  rainfall: number;
  soilMoisture: number;
  slope: number;
  elevation: number;
  historicalRisk: number;
  tilt: number;
}) {
  return apiPost<SimulationResponse>("/simulate", {
    zone_id: data.zoneId,
    forecast_rainfall: data.rainfall,
    current_soil_moisture: data.soilMoisture,
    slope: data.slope,
    elevation: data.elevation,
    historical_risk: data.historicalRisk,
    current_tilt: data.tilt,
  });
}

export async function postPredictionApi(data: {
  zoneId: string;
  rainfall: number;
  soilMoisture: number;
  slope: number;
  elevation: number;
  historicalRisk: number;
  tilt: number;
}) {
  return apiPost<BackendPrediction>("/predict", {
    zone_id: data.zoneId,
    rainfall: data.rainfall,
    soil_moisture: data.soilMoisture,
    slope: data.slope,
    elevation: data.elevation,
    historical_risk: data.historicalRisk,
    tilt: data.tilt,
  });
}
