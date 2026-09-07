"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import zonesData from "../data/mockZones.json";
import RiskTrendChart from "../components/RiskTrendChart";
import ZoneAnalytics from "../components/ZoneAnalytics";
import {
  getAlertsApi,
  getSensorDataApi,
  getPrioritiesApi,
  getFieldReportsApi,
  postFieldReportApi,
  postSimulationApi,
  postPredictionApi,
  acknowledgeAlertApi,
  type BackendPrediction,
  type BackendSensorReading,
  type BackendPriority,
} from "../lib/api";

const RiskMap = dynamic(() => import("../components/Map"), {
  ssr: false,
});

type Zone = Omit<
  (typeof zonesData)[number],
  "risk" | "confidence"
> & {
  baseRisk: number;
  risk: number | null;
  confidence: number | null;
  priorityScore?: number;
  predictionAvailable: boolean;
};

type FieldReport = {
  id: number;
  zoneId: string;
  zoneName: string;
  observation: string;
  severity: string;
  time: string;
};

type DashboardAlert = {
  id: string;
  zoneId: string;
  zoneName: string;
  message: string;
  severity: string;
  time: string;
  status: string;
  acknowledged: boolean;
};

const initialZones: Zone[] = zonesData.map((zone) => ({
  ...zone,
  baseRisk: zone.risk,
  risk: null,
  confidence: null,
  status: "NO PREDICTION",
  reasons: [],
  recommendedAction: "",
  predictionAvailable: false,
}));

const getStatusClass = (status: string) => {
  if (status === "CRITICAL") return "bg-red-500/10 text-red-400";
  if (status === "HIGH") return "bg-orange-500/10 text-orange-400";
  if (status === "MODERATE") return "bg-yellow-500/10 text-yellow-400";
  if (status === "LOW") return "bg-green-500/10 text-green-400";
  return "bg-slate-500/10 text-slate-400";
};

const getRiskTextClass = (status: string) => {
  if (status === "CRITICAL") return "text-red-400";
  if (status === "HIGH") return "text-orange-400";
  if (status === "MODERATE") return "text-yellow-400";
  if (status === "LOW") return "text-green-400";
  return "text-slate-400";
};

const getSeverityClass = (severity: string) => {
  if (severity === "CRITICAL") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (severity === "HIGH") return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (severity === "MODERATE") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  if (severity === "LOW") return "text-green-400 bg-green-500/10 border-green-500/20";
  return "text-slate-400 bg-slate-500/10 border-slate-500/20";
};

const getBackendStatusLabel = (connected: boolean) =>
  connected ? "CONNECTED" : "LAST KNOWN DATA";

const hasPrediction = (zone: Zone) =>
  zone.predictionAvailable === true && zone.risk !== null;

const formatRiskProbability = (value: number) => {
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
};

function BackendStatusBadges({ connected }: { connected: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold tracking-wider text-slate-300">
        BACKEND DATA
      </span>

      <span
        className={`rounded-full px-3 py-1 text-[10px] font-bold tracking-wider ${
          connected
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-orange-500/10 text-orange-400"
        }`}
      >
        {getBackendStatusLabel(connected)}
      </span>
    </div>
  );
}

export default function Home() {
  const [zones, setZones] = useState<Zone[]>(initialZones);

  const [selectedZoneId, setSelectedZoneId] = useState(initialZones[0].id);

  const selectedZone =
    zones.find((zone) => zone.id === selectedZoneId) ?? zones[0];

  const [activeSection, setActiveSection] = useState("dashboard");

  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const [sensorData, setSensorData] = useState<BackendSensorReading[]>([]);
  const [priorities, setPriorities] = useState<BackendPriority[]>([]);
  const [, setBackendReports] = useState<unknown[]>([]);

  const [predictionsByZone, setPredictionsByZone] = useState<
    Record<string, BackendPrediction>
  >({});

  const [backendRiskHistory, setBackendRiskHistory] = useState<
    {
      zoneId: string;
      time: string;
      risk: number;
    }[]
  >([]);

  const [simulationResult, setSimulationResult] = useState<{
    simulated_risk_score: number;
    simulated_risk_level: string;
    simulated_priority_score: number;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [backendPrediction, setBackendPrediction] =
    useState<BackendPrediction | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [fieldReports, setFieldReports] = useState<FieldReport[]>([]);

  const [reportZone, setReportZone] = useState(initialZones[0].id);
  const [reportSeverity, setReportSeverity] = useState("MODERATE");
  const [reportObservation, setReportObservation] = useState("");
  const [showReportForm, setShowReportForm] = useState(false);

  // Scenario Inputs — neutral defaults, not seeded from mock zone data
  const [rainfall, setRainfall] = useState(100);
  const [soilMoisture, setSoilMoisture] = useState(60);
  const [groundTilt, setGroundTilt] = useState(2.0);

  const mergeBackendZoneData = useCallback(
    (
      sensors: BackendSensorReading[],
      fetchedPriorities: BackendPriority[],
      predictions: Record<string, BackendPrediction>
    ) => {
      return initialZones.map((zone) => {
        const sensor = sensors
          .filter((item) => item.zone_id === zone.id)
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )[0];

        const priority = fetchedPriorities.find(
          (item) => item.zone_id === zone.id
        );

        const prediction = predictions[zone.id];

        return {
          ...zone,
          risk: prediction != null ? Number(prediction.risk_score) : null,
          status: prediction?.risk_level ?? "NO PREDICTION",
          confidence:
            prediction != null
              ? Math.round(
                  prediction.confidence <= 1
                    ? prediction.confidence * 100
                    : prediction.confidence
                )
              : null,
          reasons: prediction
            ? [
                `Terrain susceptibility: ${prediction.terrain_probability}`,
                `Rainfall factor: ${prediction.rainfall_factor}`,
                `Soil moisture factor: ${prediction.soil_moisture_factor}`,
                `Ground movement factor: ${prediction.ground_movement_factor}`,
              ]
            : [],
          rainfall: sensor?.rainfall ?? zone.rainfall,
          soilMoisture: sensor?.soil_moisture ?? zone.soilMoisture,
          tilt: sensor?.tilt ?? zone.tilt,
          priorityScore: priority?.priority_score ?? zone.priorityScore ?? 0,
          recommendedAction:
            prediction?.recommended_action ||
            priority?.recommended_action ||
            "",
          predictionAvailable: prediction != null,
        };
      });
    },
    []
  );

  const refreshBackendData = useCallback(async () => {
    try {
      setBackendError(null);

      const [
        fetchedAlerts,
        fetchedSensors,
        fetchedPriorities,
        fetchedReports,
      ] = await Promise.all([
        getAlertsApi(),
        getSensorDataApi(),
        getPrioritiesApi(),
        getFieldReportsApi(),
      ]);

      if (fetchedAlerts && Array.isArray(fetchedAlerts)) {
        setAlerts(
          fetchedAlerts.map((alert) => ({
            id: String(alert.id),
            zoneId: alert.zone_id,
            zoneName:
              zonesData.find((z) => z.id === alert.zone_id)?.name ||
              alert.zone_id,
            message: alert.message,
            severity: alert.severity,
            time: alert.timestamp
              ? new Date(alert.timestamp).toLocaleString()
              : "Unknown time",
            status: alert.status || "ACTIVE",
            acknowledged: alert.status === "ACKNOWLEDGED",
          }))
        );
      }

      const sensors = Array.isArray(fetchedSensors) ? fetchedSensors : [];
      const fetchedPris = Array.isArray(fetchedPriorities)
        ? fetchedPriorities
        : [];

      setSensorData(sensors);
      setPriorities(fetchedPris);

      setPredictionsByZone((currentPredictions) => {
        const mergedZones = mergeBackendZoneData(
          sensors,
          fetchedPris,
          currentPredictions
        );
        setZones(mergedZones);
        return currentPredictions;
      });

      if (fetchedReports && Array.isArray(fetchedReports)) {
        setBackendReports(fetchedReports);
        const convertedReports: FieldReport[] = fetchedReports.map((report) => {
          const zone = zonesData.find((item) => item.id === report.zone_id);
          return {
            id: report.id,
            zoneId: report.zone_id,
            zoneName: zone?.name ?? report.zone_id,
            observation: report.description ?? "Field observation",
            severity: report.type ?? "MODERATE",
            time: report.timestamp
              ? new Date(report.timestamp).toLocaleString()
              : "Recently",
          };
        });
        setFieldReports(convertedReports);
      }

      setIsBackendConnected(true);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Backend refresh failed:", error);
      setIsBackendConnected(false);
      setBackendError("Backend unavailable. Showing last known data.");
    }
  }, [mergeBackendZoneData]);

  useEffect(() => {
    refreshBackendData();
  }, [refreshBackendData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      refreshBackendData();
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshBackendData]);

  useEffect(() => {
    // Reset scenario inputs to neutral defaults when zone changes.
    // We do NOT seed them from zone mock data — sliders are user-defined,
    // not live sensor readings.
    setRainfall(100);
    setSoilMoisture(60);
    setGroundTilt(2.0);
    setSimulationResult(null);
  }, [selectedZone.id]);

  useEffect(() => {
    setBackendPrediction(predictionsByZone[selectedZoneId] ?? null);
  }, [selectedZoneId, predictionsByZone]);

  const criticalZones = zones.filter(
    (zone) => hasPrediction(zone) && zone.status === "CRITICAL"
  ).length;

  const highRiskZones = zones.filter(
    (zone) => hasPrediction(zone) && zone.status === "HIGH"
  ).length;

  const unacknowledgedAlertsCount = alerts.filter(
    (alert) => !alert.acknowledged && alert.status !== "ACKNOWLEDGED"
  ).length;

  const sensorReadingCount = sensorData.length;

  const selectedZoneRiskHistory = useMemo(
    () =>
      backendRiskHistory
        .filter((item) => item.zoneId === selectedZone.id)
        .map((item) => ({
          time: item.time,
          risk: item.risk,
        })),
    [backendRiskHistory, selectedZone.id]
  );

  const selectedZoneSensor = useMemo(() => {
    return sensorData
      .filter((item: any) => item.zone_id === selectedZone.id)
      .sort(
        (a: any, b: any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];
  }, [sensorData, selectedZone.id]);

  const hasSensorReading = Boolean(selectedZoneSensor);

  useEffect(() => {
    const sectionIds = [
      "dashboard",
      "risk-map",
      "zone-details",
      "alerts",
      "priorities",
      "field-reports",
      "simulation",
    ];

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visibleEntries.length > 0) {
          setActiveSection(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-15% 0px -65% 0px",
        threshold: [0.1, 0.3, 0.5],
      }
    );

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const updateScenarioInputs = (
    newRainfall: number,
    newSoilMoisture: number,
    newTilt: number
  ) => {
    setRainfall(newRainfall);
    setSoilMoisture(newSoilMoisture);
    setGroundTilt(newTilt);
  };

  const runBackendPrediction = async () => {
    if (!selectedZone) return;

    try {
      setPredictionLoading(true);

      const prediction = await postPredictionApi({
        zoneId: selectedZone.id,
        rainfall24h: rainfall,
        soilMoisture: soilMoisture,
        groundMovement: groundTilt,
      });

      const updatedPredictions = {
        ...predictionsByZone,
        [prediction.zone_id]: prediction,
      };
      setPredictionsByZone(updatedPredictions);
      setBackendPrediction(prediction);

      setBackendRiskHistory((current) => {
        const newPoint = {
          zoneId: prediction.zone_id,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          risk: Number(prediction.risk_score),
        };

        return [...current, newPoint].slice(-10);
      });

      setZones((currentZones) =>
        currentZones.map((zone) =>
          zone.id === prediction.zone_id
            ? {
                ...zone,
                risk: Number(prediction.risk_score),
                confidence: Math.round(
                  prediction.confidence <= 1
                    ? prediction.confidence * 100
                    : prediction.confidence
                ),
                status: prediction.risk_level,
                predictionAvailable: true,
                recommendedAction: prediction.recommended_action,
                reasons: [
                  `Terrain susceptibility: ${prediction.terrain_probability}`,
                  `Rainfall factor: ${prediction.rainfall_factor}`,
                  `Soil moisture factor: ${prediction.soil_moisture_factor}`,
                  `Ground movement factor: ${prediction.ground_movement_factor}`,
                ],
              }
            : zone
        )
      );
    } catch (error) {
      console.error("Backend prediction failed:", error);
    } finally {
      setPredictionLoading(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportObservation.trim()) {
      alert("Please enter a field observation.");
      return;
    }

    const zone = zones.find((item) => item.id === reportZone) ?? zones[0];

    const newReport: FieldReport = {
      id: Date.now(),
      zoneId: zone.id,
      zoneName: zone.name,
      observation: reportObservation,
      severity: reportSeverity,
      time: new Date().toLocaleString(),
    };

    setFieldReports((reports) => [newReport, ...reports]);

    try {
      await postFieldReportApi({
        zoneId: zone.id,
        latitude: zone.lat,
        longitude: zone.lng,
        type: reportSeverity,
        description: reportObservation,
        image: "",
      });
    } catch (error) {
      console.error("Field report API failed:", error);
    }

    setSelectedZoneId(zone.id);
    setReportObservation("");
    setReportSeverity("MODERATE");
    setShowReportForm(false);
  };

  const runBackendSimulation = async () => {
    if (!selectedZone) return;

    setIsSimulating(true);

    try {
      const result = await postSimulationApi({
        zoneId: selectedZone.id,
        rainfall24h: rainfall,
        soilMoisture: soilMoisture,
        groundMovement: groundTilt,
      });

      setSimulationResult(result);
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    setAlerts((currentAlerts) =>
      currentAlerts.map((item) =>
        item.id === alertId
          ? {
              ...item,
              acknowledged: true,
              status: "ACKNOWLEDGED",
            }
          : item
      )
    );

    try {
      await acknowledgeAlertApi(alertId);
    } catch (error) {
      console.warn("Backend alert acknowledgement failed or unsupported:", error);
    }
  };

  const selectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const navItems = [
    ["Dashboard", "dashboard"],
    ["Map", "risk-map"],
    ["Zone Details", "zone-details"],
    ["Alerts", "alerts"],
    ["Priorities", "priorities"],
    ["Field Reports", "field-reports"],
    ["Simulation", "simulation"],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 px-4 py-4 backdrop-blur md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.25em] text-cyan-400">
              PREDICT → ASSESS → ACT
            </p>
            <h1 className="text-2xl font-bold tracking-wide">
              SLOPEGUARD
              <span className="text-cyan-400">–NER</span>
            </h1>
            <p className="text-sm text-slate-400">
              ML-based landslide risk assessment command center
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <BackendStatusBadges connected={isBackendConnected} />

            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Last successful update
              </p>
              <p
                suppressHydrationWarning
                className="text-sm font-semibold text-slate-200"
              >
                {lastUpdated ? lastUpdated.toLocaleTimeString() : "None yet"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row">
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-800 bg-slate-900 px-4 py-3 md:hidden">
          {navItems.map(([label, id]) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs ${
                activeSection === id
                  ? "bg-cyan-500/10 text-cyan-400"
                  : "text-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <aside className="hidden min-h-[calc(100vh-81px)] w-60 shrink-0 border-r border-slate-800 bg-slate-900 p-4 md:block">
          <nav className="sticky top-24 space-y-2">
            {navItems.map(([label, id]) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className={`w-full rounded-lg px-4 py-3 text-left text-sm transition ${
                  activeSection === id
                    ? "bg-cyan-500/10 text-cyan-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}

            <div className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-500">BACKEND STATUS</p>
              <div className="mt-3">
                <BackendStatusBadges connected={isBackendConnected} />
              </div>
            </div>
          </nav>
        </aside>

        <section id="dashboard" className="flex-1 p-4 md:p-6">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Command Center</h2>
              <p className="text-sm text-slate-400">
                Operational overview of monitored zones, backend predictions,
                and response priorities
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={refreshBackendData}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Refresh
              </button>

              <button
                onClick={() => setAutoRefresh((value) => !value)}
                className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                  autoRefresh
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-slate-700 bg-slate-900 text-slate-400"
                }`}
              >
                {autoRefresh ? "Auto Refresh ON" : "Auto Refresh OFF"}
              </button>
            </div>
          </div>

          {backendError && (
            <div className="mb-4 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-orange-300">
                    Backend connection unavailable
                  </p>
                  <p className="text-xs text-orange-200/70">
                    Showing last known backend data. No local sensor simulation
                    is running.
                  </p>
                </div>

                <span className="w-fit rounded-full border border-orange-400/30 px-3 py-1 text-[10px] font-bold tracking-wider text-orange-300">
                  LAST KNOWN DATA
                </span>
              </div>
            </div>
          )}

          <div className="mb-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-3">
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="text-[10px] font-bold tracking-[0.2em] text-cyan-400">
                PREDICT
              </p>
              <p className="mt-2 text-sm font-semibold text-white">ML Model</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Rainfall, terrain, soil moisture, and ground movement are sent
                to the backend ML engine.
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[10px] font-bold tracking-[0.2em] text-amber-300">
                ASSESS
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                Risk Assessment
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Risk score, data confidence, exposure, and priority are shown
                only from backend outputs.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-[10px] font-bold tracking-[0.2em] text-emerald-400">
                ACT
              </p>
              <p className="mt-2 text-sm font-semibold text-white">
                Command Center
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                Alerts, recommended action, field observations, and response
                prioritization.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Critical Zones
              </p>
              <p className="mt-2 text-3xl font-bold text-red-400">
                {String(criticalZones).padStart(2, "0")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                From backend ML predictions
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                High-Risk Zones
              </p>
              <p className="mt-2 text-3xl font-bold text-orange-400">
                {String(highRiskZones).padStart(2, "0")}
              </p>
              <p className="mt-1 text-xs text-slate-500">Monitor closely</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Active Alerts
              </p>
              <p className="mt-2 text-3xl font-bold text-yellow-400">
                {String(unacknowledgedAlertsCount).padStart(2, "0")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                From backend alert service
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Sensor Readings
              </p>
              <p className="mt-1 text-3xl font-bold text-white">
                {sensorReadingCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Backend readings received
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div
              id="risk-map"
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2"
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">GIS Risk Map</h3>
                  <p className="text-xs text-slate-500">
                    Zone positions from GIS coordinates. Risk colors come from
                    backend prediction levels.
                  </p>
                </div>
                <BackendStatusBadges connected={isBackendConnected} />
              </div>

              <div className="relative h-80 overflow-hidden rounded-lg border border-slate-700 md:h-[28rem]">
                <RiskMap zones={zones} />

                <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-700 bg-slate-950/95 p-3 shadow-lg">
                  <p className="mb-2 text-xs font-semibold text-white">
                    Risk Level
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-500"></span>
                      CRITICAL
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-orange-500"></span>
                      HIGH
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-yellow-400"></span>
                      MODERATE
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-green-500"></span>
                      LOW
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              id="alerts"
              className="rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Alerts</h3>
                  <p className="text-xs text-slate-500">
                    Backend alert service only. This dashboard does not create
                    alerts from field reports or local risk math.
                  </p>
                </div>
                <span className="rounded-md bg-red-500/10 px-3 py-1 text-xs text-red-400">
                  {unacknowledgedAlertsCount} active
                </span>
              </div>

              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    No alerts received from backend.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-4 ${
                        alert.acknowledged
                          ? "border-slate-800 bg-slate-950 opacity-70"
                          : getSeverityClass(alert.severity)
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider ${getStatusClass(
                              alert.severity
                            )}`}
                          >
                            {alert.severity}
                          </span>
                          <p className="mt-2 font-medium">{alert.zoneName}</p>
                          <p className="mt-1 text-xs text-slate-300">
                            {alert.message}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            {alert.time}
                          </p>
                          <p className="mt-2 text-[10px] font-bold tracking-wider text-slate-400">
                            STATUS: {alert.status}
                          </p>
                        </div>

                        {!alert.acknowledged && (
                          <button
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                            className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>

                      {alert.acknowledged && (
                        <p className="mt-3 text-xs text-green-400">
                          ✓ Alert acknowledged
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div
            id="zone-details"
            className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900 p-5"
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Selected Zone</h3>
                <p className="text-xs text-slate-500">
                  Backend ML prediction for {selectedZone.name}
                </p>
              </div>
              <span
                className={`w-fit rounded-md px-3 py-1 text-xs font-semibold ${getStatusClass(
                  hasPrediction(selectedZone)
                    ? selectedZone.status
                    : "NO PREDICTION"
                )}`}
              >
                {hasPrediction(selectedZone)
                  ? selectedZone.status
                  : "NO PREDICTION"}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Risk Score
                </p>
                <p className="mt-2 text-2xl font-bold text-white">
                  {hasPrediction(selectedZone)
                    ? `${selectedZone.risk}%`
                    : "N/A"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Risk Level
                </p>
                <p
                  className={`mt-1 text-lg font-bold ${getRiskTextClass(
                    selectedZone.status
                  )}`}
                >
                  {hasPrediction(selectedZone)
                    ? selectedZone.status
                    : "NO PREDICTION"}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  Data Confidence
                </p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {selectedZone.confidence !== null
                    ? `${selectedZone.confidence}%`
                    : "N/A"}
                </p>
              </div>
            </div>

            {!hasPrediction(selectedZone) && (
              <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
                <p className="text-sm font-semibold text-slate-300">
                  No backend prediction available
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Run an ML prediction for this zone to view risk assessment,
                  confidence, contributing factors and recommended action.
                </p>
              </div>
            )}

            {hasPrediction(selectedZone) && (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Terrain Susceptibility
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {backendPrediction
                        ? backendPrediction.terrain_probability.toFixed(3)
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Rainfall Factor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {backendPrediction
                        ? backendPrediction.rainfall_factor.toFixed(3)
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Soil Moisture Factor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {backendPrediction
                        ? backendPrediction.soil_moisture_factor.toFixed(3)
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">
                      Ground Movement Factor
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {backendPrediction
                        ? backendPrediction.ground_movement_factor.toFixed(3)
                        : "N/A"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Risk Probability
                    </p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      {backendPrediction
                        ? formatRiskProbability(
                            backendPrediction.risk_probability
                          )
                        : "N/A"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500">
                      Recommended Action
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {backendPrediction?.recommended_action ||
                        "No backend recommendation available."}
                    </p>
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Rainfall</p>
                {hasSensorReading ? (
                  <>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedZoneSensor.rainfall} mm
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      Last known backend reading
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold text-slate-400">
                      N/A
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      No backend reading available
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Soil Moisture</p>
                {hasSensorReading ? (
                  <>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedZoneSensor.soil_moisture}%
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      Last known backend reading
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold text-slate-400">
                      N/A
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      No backend reading available
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Ground Movement</p>
                {hasSensorReading ? (
                  <>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedZoneSensor.tilt}°
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      Last known backend reading
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold text-slate-400">
                      N/A
                    </p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      No backend reading available
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">Infrastructure</p>
                <p className="mt-1 text-lg font-semibold text-slate-400">
                  N/A
                </p>
                <p className="mt-1 text-[10px] text-slate-600">
                  No backend GIS exposure data available
                </p>
              </div>
            </div>

            {hasSensorReading && (
              <div className="mt-4">
                <p className="mb-3 text-sm font-semibold">
                  Environmental observations
                </p>
                <ZoneAnalytics
                  rainfall={selectedZoneSensor.rainfall}
                  soilMoisture={selectedZoneSensor.soil_moisture}
                  tilt={selectedZoneSensor.tilt}
                />
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4">
              <h3 className="font-semibold">Monitored Risk Zones</h3>
              <p className="text-xs text-slate-500">
                Risk values appear only after a backend ML prediction exists
                for that zone.
              </p>
            </div>

            <div className="space-y-4">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  onClick={() => selectZone(zone.id)}
                  className={`cursor-pointer rounded-lg border p-4 transition ${
                    selectedZone.id === zone.id
                      ? "border-cyan-500 bg-cyan-500/5"
                      : "border-slate-800 bg-slate-950 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{zone.name}</p>
                      <p className="text-xs text-slate-500">Risk Score</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">
                        {hasPrediction(zone) ? `${zone.risk}%` : "N/A"}
                      </p>
                      <p className={`text-xs ${getRiskTextClass(zone.status)}`}>
                        {hasPrediction(zone) ? zone.status : "NO PREDICTION"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                      style={{
                        width: hasPrediction(zone) ? `${zone.risk}%` : "0%",
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5">
              <h3 className="font-semibold">Risk Trend Analysis</h3>
              <p className="text-xs text-slate-500">
                History is recorded only when this dashboard receives a backend
                ML prediction.
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Selected Zone</p>
                  <p className="font-semibold">{selectedZone.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Current Risk</p>
                  <p className="text-xl font-bold text-cyan-400">
                    {hasPrediction(selectedZone)
                      ? `${selectedZone.risk}%`
                      : "N/A"}
                  </p>
                </div>
              </div>

              {selectedZoneRiskHistory.length === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-500">
                  No backend prediction history available for this zone yet.
                </div>
              ) : (
                <RiskTrendChart data={selectedZoneRiskHistory} />
              )}
            </div>
          </div>

          <div
            id="priorities"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <h3 className="font-semibold">Top Response Priorities</h3>
            <p className="mb-4 text-xs text-slate-500">
              Values shown exactly as returned by the backend priority service.
            </p>

            <div className="space-y-4">
              {priorities.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No response priorities available from backend.
                </div>
              ) : (
                priorities.map((priority) => (
                  <div
                    key={priority.id || priority.zone_id}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">
                          {zones.find((z) => z.id === priority.zone_id)?.name ||
                            priority.zone_id}
                        </h3>
                        <p className="text-sm text-slate-400">Priority Score</p>
                      </div>
                      <span className="text-2xl font-bold text-cyan-400">
                        {Number(
                          priority.priority_score ?? priority.risk ?? 0
                        ).toFixed(1)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-400">Risk</p>
                        <p className="font-medium">
                          {Number(priority.risk ?? 0).toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Exposure</p>
                        <p className="font-medium">
                          {Number(priority.exposure ?? 0).toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Urgency</p>
                        <p className="font-medium">
                          {Number(priority.urgency ?? 0).toFixed(1)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-slate-900 p-3">
                      <p className="text-xs text-slate-400">
                        Recommended Action
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-200">
                        {priority.recommended_action ||
                          "No backend recommendation available."}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            id="field-reports"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Field Reports</h3>
                <p className="text-xs text-slate-500">
                  Ground observations only. Submitting a report does not change
                  risk scores or create ML predictions.
                </p>
              </div>
              <button
                onClick={() => setShowReportForm(!showReportForm)}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                {showReportForm ? "Close Form" : "Submit Observation"}
              </button>
            </div>

            {showReportForm && (
              <div className="mb-5 rounded-lg border border-cyan-500/30 bg-slate-950 p-5">
                <h4 className="mb-4 font-semibold">New Field Observation</h4>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-400">
                      Zone
                    </label>
                    <select
                      value={reportZone}
                      onChange={(event) => setReportZone(event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    >
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">
                      Observed Severity
                    </label>
                    <select
                      value={reportSeverity}
                      onChange={(event) =>
                        setReportSeverity(event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    >
                      <option>LOW</option>
                      <option>MODERATE</option>
                      <option>HIGH</option>
                      <option>CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm text-slate-400">
                    Observation
                  </label>
                  <textarea
                    value={reportObservation}
                    onChange={(event) =>
                      setReportObservation(event.target.value)
                    }
                    rows={4}
                    placeholder="Describe the field observation..."
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSubmitReport}
                    className="rounded-lg bg-green-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-green-400"
                  >
                    Submit Observation
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {fieldReports.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No field observations received from backend.
                </div>
              ) : (
                fieldReports.map((report) => (
                  <div
                    key={report.id}
                    className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-bold tracking-wider text-slate-500">
                          OBSERVATION
                        </p>
                        <p className="mt-1 font-medium">{report.zoneName}</p>
                        <p className="mt-2 text-sm text-slate-300">
                          {report.observation}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {report.time}
                        </p>
                      </div>
                      <span
                        className={`rounded-md border px-3 py-1 text-xs font-semibold ${getSeverityClass(
                          report.severity
                        )}`}
                      >
                        {report.severity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            id="simulation"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <div className="mb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Scenario Simulation
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Adjust scenario inputs and send them to the backend
                    simulation service.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[10px] font-bold tracking-wider text-blue-300">
                  SCENARIO INPUTS
                </span>
              </div>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    Backend Prediction
                  </p>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300">
                    REAL BACKEND DATA
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-white">
                  {hasPrediction(selectedZone)
                    ? `${selectedZone.risk}%`
                    : "N/A"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {hasPrediction(selectedZone)
                    ? selectedZone.status
                    : "No backend prediction for this zone yet."}
                </p>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">
                    Scenario Simulation
                  </p>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-blue-300">
                    USER-DEFINED SCENARIO
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-white">
                  {simulationResult
                    ? `${Math.round(simulationResult.simulated_risk_score)}%`
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {simulationResult
                    ? simulationResult.simulated_risk_level
                    : "No simulation run yet."}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
                <h4 className="mb-6 font-semibold">Scenario Inputs</h4>
                <p className="mb-6 text-xs text-slate-500">
                  These sliders are user-defined scenario values, not live
                  sensor streams.
                </p>

                <div>
                  <div className="flex justify-between">
                    <label className="text-sm">Rainfall</label>
                    <span className="font-semibold text-cyan-400">
                      {rainfall} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={rainfall}
                    onChange={(event) =>
                      updateScenarioInputs(
                        Number(event.target.value),
                        soilMoisture,
                        groundTilt
                      )
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />
                </div>

                <div className="mt-8">
                  <div className="flex justify-between">
                    <label className="text-sm">Soil Moisture</label>
                    <span className="font-semibold text-cyan-400">
                      {soilMoisture}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={soilMoisture}
                    onChange={(event) =>
                      updateScenarioInputs(
                        rainfall,
                        Number(event.target.value),
                        groundTilt
                      )
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />
                </div>

                <div className="mt-8">
                  <div className="flex justify-between">
                    <label className="text-sm">Ground Movement</label>
                    <span className="font-semibold text-cyan-400">
                      {groundTilt.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={groundTilt}
                    onChange={(event) =>
                      updateScenarioInputs(
                        rainfall,
                        soilMoisture,
                        Number(event.target.value)
                      )
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Simulation Result</h4>
                  <span className="text-xs text-slate-500">
                    {selectedZone.name}
                  </span>
                </div>

                {!simulationResult ? (
                  <div className="mt-8 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
                    No simulation run yet.
                  </div>
                ) : (
                  <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="text-xs font-semibold text-blue-300">
                      SIMULATION RESULT
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-slate-500">Risk Score</p>
                        <p className="text-xl font-bold text-cyan-400">
                          {Math.round(simulationResult.simulated_risk_score)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Risk Level</p>
                        <p className="text-xl font-bold text-cyan-400">
                          {simulationResult.simulated_risk_level}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Priority Score</p>
                        <p className="text-xl font-bold text-cyan-400">
                          {Math.round(
                            simulationResult.simulated_priority_score
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  <button
                    onClick={runBackendSimulation}
                    disabled={isSimulating}
                    className="w-full rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSimulating
                      ? "Running scenario simulation..."
                      : "Run Scenario Simulation"}
                  </button>

                  <button
                    onClick={runBackendPrediction}
                    disabled={predictionLoading}
                    className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {predictionLoading
                      ? "Running backend prediction..."
                      : "Run Backend ML Prediction"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="mb-4 text-lg font-semibold">
              Backend Sensor Readings
            </h3>
            {sensorData.length === 0 ? (
              <p className="text-sm text-slate-400">
                No sensor readings available from backend.
              </p>
            ) : (
              <div className="space-y-3">
                {sensorData.slice(0, 5).map((sensor) => (
                  <div
                    key={sensor.id || sensor.zone_id}
                    className="rounded-lg border border-slate-800 bg-slate-950 p-3"
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold">
                        {zonesData.find((z) => z.id === sensor.zone_id)?.name ||
                          sensor.zone_id}
                      </span>
                      <span className="text-xs text-slate-400">
                        {sensor.timestamp
                          ? new Date(sensor.timestamp).toLocaleTimeString()
                          : "Unknown time"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>Rainfall {sensor.rainfall} mm</div>
                      <div>Soil {sensor.soil_moisture}%</div>
                      <div>Movement {sensor.tilt}°</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-semibold">Data Sources</h3>
            <p className="mt-1 text-xs text-slate-500">
              Sources represented through the backend. Individual feed
              connectivity is not separately verified in this dashboard.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">Source</th>
                    <th className="pb-3 pr-4">Purpose</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {[
                    ["IoT Sensors", "Soil moisture / ground movement"],
                    ["Weather Data", "Rainfall"],
                    ["GIS", "Terrain / spatial information"],
                    ["ML Model", "Risk prediction"],
                    ["Field Reports", "Ground observations"],
                    ["Historical Inventory", "Landslide history"],
                  ].map(([source, purpose]) => (
                    <tr key={source}>
                      <td className="py-3 pr-4 font-medium text-white">
                        {source}
                      </td>
                      <td className="py-3 pr-4">{purpose}</td>
                      <td className="py-3">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold tracking-wider text-slate-300">
                          BACKEND PROVIDED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="mt-10 border-t border-slate-800 py-6 text-center">
            <p className="text-xs text-slate-600">
              SlopeGuard–NER • ML-based landslide risk assessment and response
              command center
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
