const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  endpoint: string;
  detail?: unknown;

  constructor(status: number, endpoint: string, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

// =============================
// Generic GET
// =============================

export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let detail: unknown = null;
    let message = `GET ${endpoint} failed (${response.status})`;
    try {
      const errorJson = await response.json();
      detail = errorJson?.detail || errorJson;
      if (typeof detail === "string") {
        message += `: ${detail}`;
      } else if (detail) {
        message += `: ${JSON.stringify(detail)}`;
      }
    } catch {
      // response body was not JSON
    }
    throw new ApiError(response.status, endpoint, message, detail);
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
    let detail: unknown = null;
    let message = `POST ${endpoint} failed (${response.status})`;
    try {
      const errorJson = await response.json();
      detail = errorJson?.detail || errorJson;
      if (typeof detail === "string") {
        message += `: ${detail}`;
      } else if (detail) {
        message += `: ${JSON.stringify(detail)}`;
      }
    } catch {
      // response body was not JSON
    }
    throw new ApiError(response.status, endpoint, message, detail);
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

  terrain_probability: number;
  rainfall_factor: number;
  soil_moisture_factor: number;
  ground_movement_factor: number;

  risk_probability: number;
  risk_score: number;
  risk_level: string;
  confidence: number;

  recommended_action: string;
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

export async function acknowledgeAlertApi(alertId: string | number) {
  try {
    return await apiPost<BackendAlert>(`/alerts/${alertId}/acknowledge`, {});
  } catch {
    // If backend doesn't support POST /acknowledge, attempt PATCH
    const res = await fetch(`${API_URL}/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACKNOWLEDGED" }),
    });
    if (!res.ok) {
      throw new Error(`Acknowledge alert failed: ${res.status}`);
    }
    return res.json();
  }
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
  rainfall24h: number;
  soilMoisture: number;
  groundMovement: number;
}) {
  return apiPost<SimulationResponse>("/simulate", {
    zone_id: data.zoneId,
    rainfall_24h: data.rainfall24h,
    soil_moisture: data.soilMoisture,
    ground_movement: data.groundMovement,
  });
}

export async function postPredictionApi(data: {
  zoneId: string;
  rainfall24h: number;
  soilMoisture: number;
  groundMovement: number;
}) {
  return apiPost<BackendPrediction>("/predict", {
    zone_id: data.zoneId,
    rainfall_24h: data.rainfall24h,
    soil_moisture: data.soilMoisture,
    ground_movement: data.groundMovement,
  });
}
