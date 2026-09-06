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
  createAlertApi,
  createPriorityApi,
  type BackendPrediction,
  type BackendSensorReading,
  type BackendPriority,
} from "../lib/api";

const RiskMap = dynamic(() => import("../components/Map"), {
  ssr: false,
});

type Zone = (typeof zonesData)[number] & {
  baseRisk: number;
  priorityScore?: number;
};

type FieldReport = {
  id: number;
  zoneId: string;
  zoneName: string;
  observation: string;
  severity: string;
  time: string;
};

const initialZones: Zone[] = zonesData.map((zone) => ({
  ...zone,
  baseRisk: zone.risk,
}));

const riskFromScore = (score: number) => {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
};

// Standalone risk calculation from raw sensor values (used in mergeBackendZoneData)
const calculateRawRisk = (
  rainfall: number,
  soilMoisture: number,
  tilt: number
): number => {
  const rainfallScore = Math.min(100, (rainfall / 200) * 50);
  const soilScore = Math.min(100, soilMoisture);
  const tiltScore = Math.min(100, (tilt / 10) * 100);
  const raw = rainfallScore * 0.4 + soilScore * 0.35 + tiltScore * 0.25;
  return Math.max(0, Math.min(100, Math.round(raw)));
};

const calculateSimulatedRisk = (
  zone: Zone,
  rainfall: number,
  soilMoisture: number,
  tilt: number
) => {
  const rainfallEffect =
    ((rainfall - zone.rainfall) / 200) * 25;

  const soilEffect =
    ((soilMoisture - zone.soilMoisture) / 100) * 20;

  const tiltEffect =
    ((tilt - zone.tilt) / 10) * 15;

  const simulated =
    zone.baseRisk +
    rainfallEffect +
    soilEffect +
    tiltEffect;

  return Math.max(0, Math.min(100, Math.round(simulated)));
};

const getStatusClass = (status: string) => {
  if (status === "CRITICAL") {
    return "bg-red-500/10 text-red-400";
  }

  if (status === "HIGH") {
    return "bg-orange-500/10 text-orange-400";
  }

  if (status === "MEDIUM") {
    return "bg-yellow-500/10 text-yellow-400";
  }

  return "bg-green-500/10 text-green-400";
};

const getRiskTextClass = (status: string) => {
  if (status === "CRITICAL") return "text-red-400";
  if (status === "HIGH") return "text-orange-400";
  if (status === "MEDIUM") return "text-yellow-400";
  return "text-green-400";
};

const getSeverityClass = (severity: string) => {
  if (severity === "CRITICAL") return "text-red-400 bg-red-500/10";
  if (severity === "HIGH") return "text-orange-400 bg-orange-500/10";
  if (severity === "MEDIUM") return "text-yellow-400 bg-yellow-500/10";
  return "text-green-400 bg-green-500/10";
};

export default function Home() {
  const [zones, setZones] = useState<Zone[]>(initialZones);

  const [selectedZoneId, setSelectedZoneId] = useState(
    initialZones[0].id
  );

  const selectedZone =
    zones.find((zone) => zone.id === selectedZoneId) ?? zones[0];

  const [activeSection, setActiveSection] =
    useState("dashboard");

  const [alerts, setAlerts] = useState<any[]>([]);
  const [isBackendConnected, setIsBackendConnected] = useState(false);

  const [sensorData, setSensorData] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [, setBackendReports] = useState<any[]>([]);

  const [predictionsByZone, setPredictionsByZone] = useState<
    Record<string, BackendPrediction>
  >({});

  const [backendRiskHistory, setBackendRiskHistory] = useState<
    {
      time: string;
      risk: number;
    }[]
  >([]);

  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [backendPrediction, setBackendPrediction] = useState<any>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [fieldReports, setFieldReports] = useState<FieldReport[]>([
    {
      id: 1,
      zoneId: "ZONE-A",
      zoneName: "Zone A — Khed",
      observation:
        "Visible ground cracks reported near residential area.",
      severity: "CRITICAL",
      time: "10 min ago",
    },
    {
      id: 2,
      zoneId: "ZONE-B",
      zoneName: "Zone B — Maval",
      observation:
        "Increased water seepage observed on slope surface.",
      severity: "HIGH",
      time: "25 min ago",
    },
  ]);

  const [reportZone, setReportZone] = useState(
    initialZones[0].id
  );

  const [reportSeverity, setReportSeverity] =
    useState("MEDIUM");

  const [reportObservation, setReportObservation] =
    useState("");

  const [showReportForm, setShowReportForm] =
    useState(false);

  // Simulation values
  const [rainfall, setRainfall] = useState(
    initialZones[0].rainfall
  );

  const [soilMoisture, setSoilMoisture] = useState(
    initialZones[0].soilMoisture
  );

  const [groundTilt, setGroundTilt] = useState(
    initialZones[0].tilt
  );

  const [liveSensorMode, setLiveSensorMode] =
    useState(false);

  const [riskHistory, setRiskHistory] = useState<number[]>(
    [74, 77, 79, 81, 83, 84, 85, 86]
  );

  // Update backend risk history for RiskTrendChart
  const updateBackendRiskHistory = useCallback((readings: any[]) => {
    if (!readings || readings.length === 0) return;

    const history = readings
      .slice(-10)
      .map((reading) => ({
        time: reading.timestamp
          ? new Date(reading.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Now",
        risk: calculateRawRisk(
          reading.rainfall,
          reading.soil_moisture,
          reading.tilt
        ),
      }));

    setBackendRiskHistory(history);
  }, []);

  // Unified zone merge: always rebuilds from initialZones so old sensor
  // values never become the new baseline.
  const mergeBackendZoneData = useCallback(
    (
      sensors: BackendSensorReading[],
      fetchedPriorities: BackendPriority[],
      predictions: Record<string, BackendPrediction>
    ) =>
      initialZones.map((zone) => {
        // Pick the most recent sensor reading for this zone
        const sensor = sensors
          .filter((item) => item.zone_id === zone.id)
          .sort(
            (a, b) =>
              new Date(b.timestamp).getTime() -
              new Date(a.timestamp).getTime()
          )[0];

        const priority = fetchedPriorities.find(
          (item) => item.zone_id === zone.id
        );

        const prediction = predictions[zone.id];

        let risk = zone.baseRisk;
        let confidence = zone.confidence;
        let status = zone.status;
        let reasons = zone.reasons;

        if (prediction) {
          // ML prediction takes priority over sensor-derived risk
          risk = prediction.risk_score;
          confidence = prediction.confidence * 100;
          status = prediction.risk_level;
          reasons = prediction.drivers;
        } else if (sensor) {
          risk = calculateRawRisk(
            sensor.rainfall,
            sensor.soil_moisture,
            sensor.tilt
          );
          status = riskFromScore(risk);
          reasons = [
            sensor.rainfall > 100
              ? "Heavy rainfall"
              : "Moderate rainfall",
            sensor.soil_moisture > 70
              ? "High soil moisture"
              : "Moderate soil moisture",
            sensor.tilt > 3
              ? "Increasing ground tilt"
              : "Stable ground movement",
          ];
        }

        return {
          ...zone,
          risk: Math.round(risk),
          confidence: Math.round(confidence),
          status,
          reasons,
          rainfall: sensor?.rainfall ?? zone.rainfall,
          soilMoisture: sensor?.soil_moisture ?? zone.soilMoisture,
          tilt: sensor?.tilt ?? zone.tilt,
          priorityScore: priority?.priority_score ?? 0,
          recommendedAction:
            priority?.recommended_action ?? zone.recommendedAction,
        };
      }),
    []
  );

  // Fetch backend data — always merges from initialZones (no stale baseline)
  const refreshBackendData = useCallback(async () => {
    try {
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
              : "Just now",
            acknowledged: alert.status === "ACKNOWLEDGED",
          }))
        );
      }

      const sensors = Array.isArray(fetchedSensors) ? fetchedSensors : [];
      const fetchedPris = Array.isArray(fetchedPriorities) ? fetchedPriorities : [];

      setSensorData(sensors);
      setPriorities(fetchedPris);

      // Unified zone merge: sensor + priority + any cached predictions
      setPredictionsByZone((currentPredictions) => {
        const mergedZones = mergeBackendZoneData(
          sensors,
          fetchedPris,
          currentPredictions
        );
        setZones(mergedZones);
        return currentPredictions; // predictions unchanged by a refresh
      });

      updateBackendRiskHistory(sensors);

      if (fetchedReports && Array.isArray(fetchedReports)) {
        setBackendReports(fetchedReports);
        const convertedReports: FieldReport[] = fetchedReports.map(
          (report) => {
            const zone = zonesData.find(
              (item) => item.id === report.zone_id
            );
            return {
              id: report.id,
              zoneId: report.zone_id,
              zoneName: zone?.name ?? report.zone_id,
              observation: report.description ?? "Field Observation",
              severity: report.type ?? "MEDIUM",
              time: report.timestamp
                ? new Date(report.timestamp).toLocaleString()
                : "Recently",
            };
          }
        );
        if (convertedReports.length > 0) {
          setFieldReports(convertedReports);
        }
      }

      setIsBackendConnected(true);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Backend connection failed:", error);
      setIsBackendConnected(false);
    }
  }, [mergeBackendZoneData, updateBackendRiskHistory]);

  // Initial load and auto refresh timer
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

  // Change simulation values when selected zone changes
  useEffect(() => {
    setRainfall(selectedZone.rainfall);
    setSoilMoisture(selectedZone.soilMoisture);
    setGroundTilt(selectedZone.tilt);

    setRiskHistory([
      Math.max(0, selectedZone.risk - 12),
      Math.max(0, selectedZone.risk - 9),
      Math.max(0, selectedZone.risk - 7),
      Math.max(0, selectedZone.risk - 5),
      Math.max(0, selectedZone.risk - 3),
      Math.max(0, selectedZone.risk - 2),
      Math.max(0, selectedZone.risk - 1),
      selectedZone.risk,
    ]);
  }, [selectedZone.id, selectedZone.rainfall, selectedZone.soilMoisture, selectedZone.tilt, selectedZone.risk]);

  const simulatedRisk = useMemo(
    () =>
      calculateSimulatedRisk(
        selectedZone,
        rainfall,
        soilMoisture,
        groundTilt
      ),
    [
      selectedZone,
      rainfall,
      soilMoisture,
      groundTilt,
    ]
  );

  const simulatedStatus = riskFromScore(simulatedRisk);

  // Dynamic dashboard statistics
  const criticalZones = zones.filter(
    (zone) => zone.status === "CRITICAL"
  ).length;

  const highRiskZones = zones.filter(
    (zone) => zone.status === "HIGH"
  ).length;

  const unacknowledgedAlertsCount = alerts.filter(
    (alert) => !alert.acknowledged
  ).length;

  // Simulated: 6 sensors per monitored zone
  const activeSensors = zones.length * 6;

  // Active sidebar tracking
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
          .sort(
            (a, b) =>
              b.intersectionRatio -
              a.intersectionRatio
          );

        if (visibleEntries.length > 0) {
          setActiveSection(
            visibleEntries[0].target.id
          );
        }
      },
      {
        rootMargin: "-15% 0px -65% 0px",
        threshold: [0.1, 0.3, 0.5],
      }
    );

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);

      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  // Live sensor simulation
  useEffect(() => {
    if (!liveSensorMode) return;

    const interval = setInterval(() => {
      setZones((currentZones) =>
        currentZones.map((zone) => {
          if (zone.id !== selectedZoneId) {
            return zone;
          }

          const rainfallChange =
            Math.random() * 10 - 3;

          const soilChange =
            Math.random() * 6 - 1;

          const tiltChange =
            Math.random() * 0.6 - 0.1;

          const newRainfall = Math.max(
            0,
            Math.min(
              200,
              Math.round(
                zone.rainfall + rainfallChange
              )
            )
          );

          const newSoilMoisture = Math.max(
            0,
            Math.min(
              100,
              Math.round(
                zone.soilMoisture + soilChange
              )
            )
          );

          const newTilt = Math.max(
            0,
            Math.min(
              10,
              Number(
                (
                  zone.tilt + tiltChange
                ).toFixed(1)
              )
            )
          );

          const newRisk =
            calculateSimulatedRisk(
              zone,
              newRainfall,
              newSoilMoisture,
              newTilt
            );

          setRiskHistory((history) => [
            ...history.slice(-7),
            newRisk,
          ]);

          setLastUpdated(new Date());

          return {
            ...zone,
            rainfall: newRainfall,
            soilMoisture: newSoilMoisture,
            tilt: newTilt,
            risk: newRisk,
            status: riskFromScore(newRisk),
          };
        })
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [liveSensorMode, selectedZoneId]);

  const updateSelectedZone = (
    newRainfall: number,
    newSoilMoisture: number,
    newTilt: number
  ) => {
    setRainfall(newRainfall);
    setSoilMoisture(newSoilMoisture);
    setGroundTilt(newTilt);

    setLastUpdated(new Date());

    const newRisk = calculateSimulatedRisk(
      selectedZone,
      newRainfall,
      newSoilMoisture,
      newTilt
    );

    setRiskHistory((history) => [
      ...history.slice(-7),
      newRisk,
    ]);
  };

  const generateBackendAlert = async (
    zoneId: string,
    riskScore: number,
    riskLevel: string,
    drivers: string[]
  ) => {
    if (riskScore < 80) {
      return;
    }

    try {
      const message =
        `AI detected CRITICAL landslide risk in ${zoneId}. ` +
        `Risk score: ${riskScore.toFixed(1)}%. ` +
        `Drivers: ${drivers.join(", ")}.`;

      await createAlertApi({
        zoneId,
        severity: "CRITICAL",
        message,
      });

      await refreshBackendData();
    } catch (error) {
      console.error("Failed to create alert:", error);
    }
  };

  const generateBackendPriority = async (
    zoneId: string,
    riskScore: number
  ) => {
    const zone = zones.find((item) => item.id === zoneId);

    if (!zone) return;

    try {
      const exposure = Math.min(
        100,
        (zone.population / 15000) * 100
      );

      const urgency =
        riskScore >= 80
          ? 95
          : riskScore >= 65
            ? 80
            : riskScore >= 50
              ? 60
              : 30;

      const result = await createPriorityApi({
        zoneId,
        risk: riskScore,
        exposure,
        urgency,
      });

      setPriorities((current) => {
        const existing = current.filter(
          (item) => item.zone_id !== zoneId
        );

        return [...existing, result];
      });
    } catch (error) {
      console.error("Priority calculation failed:", error);
    }
  };

  const runBackendPrediction = async () => {
    if (!selectedZone) return;

    try {
      setPredictionLoading(true);

      const prediction = await postPredictionApi({
        zoneId: selectedZone.id,
        rainfall,
        soilMoisture,
        slope: 30,
        elevation: 500,
        historicalRisk: selectedZone.baseRisk,
        tilt: groundTilt,
      });

      // Store prediction so mergeBackendZoneData can use it on next refresh
      const updatedPredictions = {
        ...predictionsByZone,
        [prediction.zone_id]: prediction,
      };
      setPredictionsByZone(updatedPredictions);

      setBackendPrediction(prediction);

      // Immediately apply prediction to zone state
      setZones((currentZones) =>
        currentZones.map((zone) =>
          zone.id === prediction.zone_id
            ? {
                ...zone,
                risk: Math.round(prediction.risk_score),
                confidence: Math.round(prediction.confidence * 100),
                status: prediction.risk_level,
                reasons:
                  prediction.drivers && prediction.drivers.length > 0
                    ? prediction.drivers
                    : zone.reasons,
              }
            : zone
        )
      );

      await generateBackendAlert(
        prediction.zone_id,
        prediction.risk_score,
        prediction.risk_level,
        prediction.drivers || []
      );

      await generateBackendPriority(
        prediction.zone_id,
        prediction.risk_score
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

    const zone =
      zones.find((item) => item.id === reportZone) ??
      zones[0];

    const severityIncrease: Record<string, number> = {
      LOW: 3,
      MEDIUM: 6,
      HIGH: 10,
      CRITICAL: 15,
    };

    const newRisk = Math.min(
      100,
      zone.risk + severityIncrease[reportSeverity]
    );

    const newStatus = riskFromScore(newRisk);

    const newReport: FieldReport = {
      id: Date.now(),
      zoneId: zone.id,
      zoneName: zone.name,
      observation: reportObservation,
      severity: reportSeverity,
      time: "Just now",
    };

    setFieldReports((reports) => [
      newReport,
      ...reports,
    ]);

    setZones((currentZones) =>
      currentZones.map((item) =>
        item.id === zone.id
          ? {
              ...item,
              risk: newRisk,
              status: newStatus,
            }
          : item
      )
    );

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

    if (
      reportSeverity === "HIGH" ||
      reportSeverity === "CRITICAL"
    ) {
      setAlerts((current) => [
        {
          id: `ALT-${Date.now()}`,
          zoneId: zone.id,
          zoneName: zone.name,
          severity: reportSeverity,
          message: `Field Report: ${reportObservation.substring(0, 30)}...`,
          time: "Just now",
          acknowledged: false,
        },
        ...current,
      ]);
    }

    setSelectedZoneId(zone.id);

    setReportObservation("");
    setReportSeverity("MEDIUM");
    setShowReportForm(false);
    setLastUpdated(new Date());
  };

  const runBackendSimulation = async () => {
    if (!selectedZone) return;

    setIsSimulating(true);

    try {
      const result = await postSimulationApi({
        zoneId: selectedZone.id,
        rainfall: rainfall,
        soilMoisture: soilMoisture,
        slope: 30,
        elevation: 500,
        historicalRisk: selectedZone.baseRisk,
        tilt: groundTilt,
      });

      setSimulationResult(result);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((currentAlerts) =>
      currentAlerts.map((item) =>
        item.id === alertId
          ? {
              ...item,
              acknowledged: true,
            }
          : item
      )
    );

    setLastUpdated(new Date());
  };

  const selectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
  };

  const scrollToSection = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: "smooth",
      });
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-wide">
              SLOPEGUARD
              <span className="text-cyan-400">
                –NER
              </span>
            </h1>

            <p className="text-sm text-slate-400">
              Landslide Early Warning & Response
              Intelligence
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${isBackendConnected ? "bg-green-400 animate-pulse" : "bg-cyan-400"}`}></div>

            <span className={`text-sm ${isBackendConnected ? "text-green-400" : "text-cyan-400"}`}>
              {isBackendConnected ? "FASTAPI API CONNECTED" : "SYSTEM ONLINE"}
            </span>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* SIDEBAR */}
        <aside className="hidden min-h-[calc(100vh-81px)] w-60 border-r border-slate-800 bg-slate-900 p-4 md:block">
          <nav className="sticky top-24 space-y-2">
            {[
              ["Dashboard", "dashboard"],
              ["Map", "risk-map"],
              ["Zone Details", "zone-details"],
              ["Alerts", "alerts"],
              ["Priorities", "priorities"],
              ["Field Reports", "field-reports"],
              ["Simulation", "simulation"],
            ].map(([label, id]) => (
              <button
                key={id}
                onClick={() =>
                  scrollToSection(id)
                }
                className={`w-full rounded-lg px-4 py-3 text-left text-sm transition ${
                  activeSection === id
                    ? "bg-cyan-500/10 text-cyan-400"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}

            {/* SYSTEM STATUS */}
            <div className="mt-8 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="text-xs text-slate-500">
                SYSTEM STATUS
              </p>

              <div className="mt-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-400"></span>

                <span className="text-xs text-green-400">
                  {isBackendConnected ? "FastAPI Connected" : "All systems operational"}
                </span>
              </div>
            </div>
          </nav>
        </aside>

        {/* MAIN */}
        <section
          id="dashboard"
          className="flex-1 p-6"
        >
          {/* DASHBOARD HEADING */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">
                Command Center
              </h2>

              <p className="text-sm text-slate-400">
                Real-time overview of landslide risk
                and response priorities
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isBackendConnected
                      ? "bg-green-400 animate-pulse"
                      : "bg-red-500"
                  }`}
                />
                <span className="font-medium text-slate-200">
                  {isBackendConnected
                    ? "Backend Connected"
                    : "Backend Offline"}
                </span>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
                <p className="text-xs text-slate-500">Last Updated</p>
                <p suppressHydrationWarning className="mt-1 text-sm font-semibold text-green-400">
                  {lastUpdated ? lastUpdated.toLocaleTimeString() : "Just now"}
                </p>
              </div>

              <button
                onClick={refreshBackendData}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                ↻ Refresh
              </button>

              <button
                onClick={() => setAutoRefresh((value) => !value)}
                className={`rounded-lg border px-4 py-3 text-sm font-semibold transition ${
                  autoRefresh
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-slate-700 bg-slate-900 text-slate-400"
                }`}
              >
                {autoRefresh ? "⏸ Auto Refresh ON" : "▶ Auto Refresh OFF"}
              </button>
            </div>
          </div>

          {/* SUMMARY CARDS */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Critical Zones
              </p>

              <p className="mt-2 text-3xl font-bold text-red-400">
                {String(criticalZones).padStart(
                  2,
                  "0"
                )}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Immediate attention
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                High-Risk Zones
              </p>

              <p className="mt-2 text-3xl font-bold text-orange-400">
                {String(highRiskZones).padStart(
                  2,
                  "0"
                )}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Monitor closely
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Active Alerts
              </p>

              <p className="mt-2 text-3xl font-bold text-yellow-400">
                {String(unacknowledgedAlertsCount).padStart(
                  2,
                  "0"
                )}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Requiring response
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">
                Active Sensors
              </p>

              <p className="mt-2 text-3xl font-bold text-cyan-400">
                {activeSensors}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Reporting normally
              </p>
            </div>
          </div>

          {/* MAP + ALERTS */}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {/* MAP */}
            <div
              id="risk-map"
              className="rounded-xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    GIS Risk Map
                  </h3>

                  <p className="text-xs text-slate-500">
                    Current risk distribution
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {liveSensorMode && (
                    <span className="rounded-md bg-green-500/10 px-3 py-1 text-xs text-green-400">
                      SENSOR STREAM
                    </span>
                  )}

                  <span className="rounded-md bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">
                    LIVE
                  </span>
                </div>
              </div>

              <div className="relative h-80 overflow-hidden rounded-lg border border-slate-700">
                <RiskMap zones={zones} />

                {/* MAP LEGEND */}
                <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-slate-700 bg-slate-950/95 p-3 shadow-lg">
                  <p className="mb-2 text-xs font-semibold text-white">
                    Risk Level
                  </p>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-red-500"></span>
                      Critical
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-orange-500"></span>
                      High
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-yellow-400"></span>
                      Medium
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-green-500"></span>
                      Low
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ALERTS */}
            <div
              id="alerts"
              className="rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Active Alerts</h3>

                  <p className="text-xs text-slate-500">
                    Live system alerts requiring attention
                  </p>
                </div>

                <span className="rounded-md bg-red-500/10 px-3 py-1 text-xs text-red-400">
                  {unacknowledgedAlertsCount} active
                </span>
              </div>

              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                    No active alerts from backend.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-lg border p-4 ${
                        alert.acknowledged
                          ? "border-slate-800 bg-slate-950 opacity-60"
                          : "border-red-500/20 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {alert.zoneName}
                            </p>

                            <span
                              className={`text-xs font-semibold ${
                                alert.severity === "CRITICAL"
                                  ? "text-red-400"
                                  : alert.severity === "HIGH"
                                    ? "text-orange-400"
                                    : "text-yellow-400"
                              }`}
                            >
                              {alert.severity}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-slate-400">
                            {alert.message}
                          </p>

                          <p className="mt-2 text-xs text-slate-600">
                            {alert.time}
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

          {/* AI EXPLANATION */}
          <div
            id="zone-details"
            className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900 p-5"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  AI Risk Explanation
                </h3>

                <p className="text-xs text-slate-500">
                  Why the AI assigned this risk
                  score
                </p>
              </div>

              <span className="rounded-md bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">
                EXPLAINABLE AI
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Selected Zone
                </p>

                <p className="mt-2 font-semibold">
                  {selectedZone.name}
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Risk Score
                </p>

                <p className="mt-2 text-2xl font-bold text-cyan-400">
                  {selectedZone.risk}%
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  AI Confidence
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {selectedZone.confidence}%
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="mb-3 text-sm font-semibold">
                Main Contributing Factors
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {selectedZone.reasons.map(
                  (reason) => (
                    <div
                      key={reason}
                      className="flex items-center gap-3 rounded-lg bg-slate-900 p-3"
                    >
                      <span className="h-2 w-2 rounded-full bg-red-400"></span>

                      <span className="text-sm">
                        {reason}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-400">
              The AI combines environmental and
              ground-movement indicators to estimate
              landslide probability. Higher rainfall,
              soil saturation and ground movement
              increase the overall risk score.
            </p>
          </div>

          {/* SELECTED ZONE DETAILS */}
          <div className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900 p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  Zone Details
                </h3>

                <p className="text-xs text-slate-500">
                  Selected zone:{" "}
                  {selectedZone.name}
                </p>
              </div>

              <span
                className={`rounded-md px-3 py-1 text-xs font-semibold ${getStatusClass(
                  selectedZone.status
                )}`}
              >
                {selectedZone.status}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  AI Risk Score
                </p>

                <p className="mt-2 text-3xl font-bold text-cyan-400">
                  {selectedZone.risk}%
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  AI Confidence
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {selectedZone.confidence}%
                </p>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Population at Risk
                </p>

                <p className="mt-2 text-3xl font-bold">
                  {selectedZone.population.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Rainfall
                </p>

                <p className="mt-1 text-lg font-semibold">
                  {selectedZone.rainfall} mm
                </p>
              </div>

              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Soil Moisture
                </p>

                <p className="mt-1 text-lg font-semibold">
                  {selectedZone.soilMoisture}%
                </p>
              </div>

              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Ground Tilt
                </p>

                <p className="mt-1 text-lg font-semibold">
                  {selectedZone.tilt}°
                </p>
              </div>

              <div className="rounded-lg bg-slate-950 p-4">
                <p className="text-xs text-slate-500">
                  Infrastructure
                </p>

                <p className="mt-1 text-lg font-semibold">
                  {selectedZone.roads} Roads /{" "}
                  {selectedZone.bridges} Bridges
                </p>
              </div>
            </div>

            {/* Zone Analytics */}
            <div className="mt-4">
              <p className="mb-3 text-sm font-semibold">
                Environmental Condition Analysis
              </p>

              <ZoneAnalytics
                rainfall={selectedZone.rainfall}
                soilMoisture={selectedZone.soilMoisture}
                tilt={selectedZone.tilt}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <p className="mb-3 text-sm font-semibold">
                  Risk Factors
                </p>

                <ul className="space-y-2">
                  {selectedZone.reasons.map(
                    (reason) => (
                      <li
                        key={reason}
                        className="flex items-center gap-2 text-sm text-slate-300"
                      >
                        <span className="h-2 w-2 rounded-full bg-red-400"></span>
                        {reason}
                      </li>
                    )
                  )}
                </ul>
              </div>

              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
                <p className="mb-2 text-sm font-semibold text-cyan-400">
                  Recommended Action
                </p>

                <p className="text-sm text-slate-300">
                  {selectedZone.recommendedAction}
                </p>
              </div>
            </div>
          </div>

          {/* RISK ZONES */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4">
              <h3 className="font-semibold">
                Monitored Risk Zones
              </h3>

              <p className="text-xs text-slate-500">
                AI-generated risk assessment
              </p>
            </div>

            <div className="space-y-4">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  onClick={() =>
                    selectZone(zone.id)
                  }
                  className={`cursor-pointer rounded-lg border p-4 transition ${
                    selectedZone.id === zone.id
                      ? "border-cyan-500 bg-cyan-500/5"
                      : "border-slate-800 bg-slate-950 hover:border-cyan-500/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {zone.name}
                      </p>

                      <p className="text-xs text-slate-500">
                        AI Risk Score
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-bold">
                        {zone.risk}%
                      </p>

                      <p
                        className={`text-xs ${getRiskTextClass(
                          zone.status
                        )}`}
                      >
                        {zone.status}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                      style={{
                        width: `${zone.risk}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Trend Analysis */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-5">
              <h3 className="font-semibold">Risk Trend Analysis</h3>

              <p className="text-xs text-slate-500">
                Historical AI risk progression for the selected monitoring period
              </p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">
                    Selected Zone
                  </p>

                  <p className="font-semibold">
                    {selectedZone.name}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    Current Risk
                  </p>

                  <p className="text-xl font-bold text-cyan-400">
                    {selectedZone.risk}%
                  </p>
                </div>
              </div>

              <RiskTrendChart data={backendRiskHistory} />
            </div>
          </div>

          {/* PRIORITIES */}
          <div
            id="priorities"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <h3 className="font-semibold">
              Top Response Priorities
            </h3>

            <p className="mb-4 text-xs text-slate-500">
              Areas requiring immediate attention
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
                          {zones.find((z) => z.id === priority.zone_id)?.name || priority.zone_id}
                        </h3>

                        <p className="text-sm text-slate-400">
                          Priority Score
                        </p>
                      </div>

                      <span className="text-2xl font-bold text-cyan-400">
                        {Number(priority.priority_score ?? priority.risk ?? 0).toFixed(1)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-slate-400 text-xs">Risk</p>
                        <p className="font-medium">{Number(priority.risk ?? 0).toFixed(1)}</p>
                      </div>

                      <div>
                        <p className="text-slate-400 text-xs">Exposure</p>
                        <p className="font-medium">{Number(priority.exposure ?? 0).toFixed(1)}</p>
                      </div>

                      <div>
                        <p className="text-slate-400 text-xs">Urgency</p>
                        <p className="font-medium">{Number(priority.urgency ?? 0).toFixed(1)}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-slate-900 p-3">
                      <p className="text-xs text-slate-400">
                        Recommended Action
                      </p>

                      <p className="mt-1 text-sm font-medium text-slate-200">
                        {priority.recommended_action || "Prepare response protocol and monitor closely."}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* FIELD REPORTS */}
          <div
            id="field-reports"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  Field Reports
                </h3>

                <p className="text-xs text-slate-500">
                  Observations submitted by field
                  teams
                </p>
              </div>

              <button
                onClick={() =>
                  setShowReportForm(
                    !showReportForm
                  )
                }
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
              >
                {showReportForm
                  ? "Close Form"
                  : "Submit Field Report"}
              </button>
            </div>

            {/* REPORT FORM */}
            {showReportForm && (
              <div className="mb-5 rounded-lg border border-cyan-500/30 bg-slate-950 p-5">
                <h4 className="mb-4 font-semibold">
                  New Field Report
                </h4>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-slate-400">
                      Zone
                    </label>

                    <select
                      value={reportZone}
                      onChange={(event) =>
                        setReportZone(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    >
                      {zones.map((zone) => (
                        <option
                          key={zone.id}
                          value={zone.id}
                        >
                          {zone.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-slate-400">
                      Severity
                    </label>

                    <select
                      value={reportSeverity}
                      onChange={(event) =>
                        setReportSeverity(
                          event.target.value
                        )
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                    >
                      <option>LOW</option>
                      <option>MEDIUM</option>
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
                      setReportObservation(
                        event.target.value
                      )
                    }
                    rows={4}
                    placeholder="Describe the field observation..."
                    className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={
                      handleSubmitReport
                    }
                    className="rounded-lg bg-green-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-green-400"
                  >
                    Submit Report
                  </button>
                </div>
              </div>
            )}

            {/* REPORT LIST */}
            <div className="space-y-3">
              {fieldReports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {report.zoneName}
                      </p>

                      <p className="mt-2 text-sm text-slate-300">
                        {report.observation}
                      </p>

                      <p className="mt-2 text-xs text-slate-500">
                        {report.time}
                      </p>
                    </div>

                    <span
                      className={`rounded-md px-3 py-1 text-xs font-semibold ${getSeverityClass(
                        report.severity
                      )}`}
                    >
                      {report.severity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SIMULATION */}
          <div
            id="simulation"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5"
          >
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  Risk Simulation & AI Prediction
                </h3>

                <p className="text-xs text-slate-500">
                  Test environmental scenarios & generate live AI ML risk predictions
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  Live Sensor Mode
                </span>

                <button
                  onClick={() =>
                    setLiveSensorMode(
                      !liveSensorMode
                    )
                  }
                  className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                    liveSensorMode
                      ? "bg-green-500 text-slate-950"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {liveSensorMode
                    ? "LIVE ON"
                    : "START LIVE"}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* INPUTS */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
                <h4 className="mb-6 font-semibold">
                  Simulation Inputs
                </h4>

                {/* RAINFALL */}
                <div>
                  <div className="flex justify-between">
                    <label className="text-sm">
                      Rainfall
                    </label>

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
                      updateSelectedZone(
                        Number(event.target.value),
                        soilMoisture,
                        groundTilt
                      )
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />

                  <div className="flex justify-between text-xs text-slate-600">
                    <span>0 mm</span>
                    <span>200 mm</span>
                  </div>
                </div>

                {/* SOIL */}
                <div className="mt-8">
                  <div className="flex justify-between">
                    <label className="text-sm">
                      Soil Moisture
                    </label>

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
                      updateSelectedZone(
                        rainfall,
                        Number(event.target.value),
                        groundTilt
                      )
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />

                  <div className="flex justify-between text-xs text-slate-600">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* TILT */}
                <div className="mt-8">
                  <div className="flex justify-between">
                    <label className="text-sm">
                      Ground Tilt
                    </label>

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
                      updateSelectedZone(
                        rainfall,
                        soilMoisture,
                        Number(event.target.value)
                      )
                    }
                    className="mt-3 w-full accent-cyan-400"
                  />

                  <div className="flex justify-between text-xs text-slate-600">
                    <span>0°</span>
                    <span>10°</span>
                  </div>
                </div>
              </div>

              {/* RESULT */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">
                    Simulation Result
                  </h4>

                  <span className="text-xs text-slate-500">
                    {selectedZone.name}
                  </span>
                </div>

                <div className="mt-8 text-center">
                  <p className="text-xs text-slate-500">
                    SIMULATED RISK
                  </p>

                  <p className="mt-2 text-6xl font-bold text-cyan-400">
                    {simulatedRisk}%
                  </p>

                  <span
                    className={`mt-4 inline-block rounded-lg px-5 py-3 text-sm font-bold ${getStatusClass(
                      simulatedStatus
                    )}`}
                  >
                    {simulatedStatus}
                  </span>
                </div>

                <div className="mt-8 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                    style={{
                      width: `${simulatedRisk}%`,
                    }}
                  ></div>
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    onClick={runBackendSimulation}
                    disabled={isSimulating}
                    className="w-full rounded-lg bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSimulating
                      ? "Running AI Simulation..."
                      : "Run Backend AI Simulation"}
                  </button>

                  <button
                    onClick={runBackendPrediction}
                    disabled={predictionLoading}
                    className="w-full rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {predictionLoading
                      ? "Running AI Prediction..."
                      : "Run Backend AI Prediction"}
                  </button>
                </div>

                {simulationResult && (
                  <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/5 p-4">
                    <p className="text-xs text-green-400 font-semibold">
                      BACKEND SIMULATION RESULT
                    </p>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Risk Score
                        </p>
                        <p className="text-xl font-bold text-cyan-400">
                          {Math.round(simulationResult.simulated_risk_score ?? simulationResult.risk ?? 0)}%
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Risk Level
                        </p>
                        <p className="text-xl font-bold text-cyan-400">
                          {simulationResult.simulated_risk_level ?? simulationResult.level}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Priority Score
                        </p>
                        <p className="text-xl font-bold text-cyan-400">
                          {Math.round(simulationResult.simulated_priority_score ?? simulationResult.priority ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {backendPrediction && (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <h3 className="font-semibold text-red-400">
                      Backend AI Prediction
                    </h3>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-slate-400">
                          Risk Score
                        </p>
                        <p className="text-2xl font-bold text-red-400">
                          {Number(backendPrediction.risk_score ?? 0).toFixed(1)}%
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Risk Level
                        </p>
                        <p className="text-2xl font-bold text-red-400">
                          {backendPrediction.risk_level}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">
                          Confidence
                        </p>
                        <p className="text-xl font-semibold">
                          {(Number(backendPrediction.confidence ?? 0.9) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-semibold">
                        Risk Drivers
                      </p>

                      <ul className="mt-2 list-disc pl-5 text-sm text-slate-300 space-y-1">
                        {backendPrediction.drivers && backendPrediction.drivers.map(
                          (driver: string) => (
                            <li key={driver}>{driver}</li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RISK HISTORY */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  Risk History
                </h3>

                <p className="text-xs text-slate-500">
                  Recent simulated and sensor risk
                  readings
                </p>
              </div>

              <span className="rounded-md bg-cyan-500/10 px-3 py-1 text-xs text-cyan-400">
                {liveSensorMode
                  ? "LIVE"
                  : "SIMULATED"}
              </span>
            </div>

            <div className="mt-6 flex h-48 items-end gap-2 rounded-lg bg-slate-950 p-4">
              {riskHistory.map(
                (value, index) => (
                  <div
                    key={`${value}-${index}`}
                    className="group relative flex h-full flex-1 items-end"
                  >
                    <div
                      className="w-full rounded-t-md bg-cyan-400 transition-all duration-500 hover:bg-cyan-300"
                      style={{
                        height: `${Math.max(
                          5,
                          value
                        )}%`,
                      }}
                    ></div>

                    <span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 text-xs text-white group-hover:block">
                      {value}%
                    </span>
                  </div>
                )
              )}
            </div>

            <div className="mt-2 flex justify-between text-xs text-slate-600">
              <span>Earlier</span>
              <span>Latest</span>
            </div>
          </div>

          {/* LIVE BACKEND SENSOR DATA */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="mb-4 text-lg font-semibold">
              Live Backend Sensor Data
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
                        {zonesData.find((z) => z.id === sensor.zone_id)?.name || sensor.zone_id}
                      </span>

                      <span className="text-xs text-slate-400">
                        {sensor.timestamp ? new Date(sensor.timestamp).toLocaleTimeString() : "Just now"}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        🌧️ {sensor.rainfall} mm
                      </div>

                      <div>
                        💧 {sensor.soil_moisture}%
                      </div>

                      <div>
                        📐 {sensor.tilt}°
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* DATA SOURCES */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="font-semibold">
              Connected Data Sources
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              Inputs currently represented in the
              prototype
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                "Rainfall",
                "Soil Moisture",
                "Satellite / GIS",
                "Ground Sensors",
                "Field Reports",
              ].map((source) => (
                <div
                  key={source}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-400"></span>

                    <span className="text-sm">
                      {source}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-green-400">
                    Connected
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* FOOTER */}
          <footer className="mt-10 border-t border-slate-800 py-6 text-center">
            <p className="text-xs text-slate-600">
              SlopeGuard–NER • AI-Powered Landslide
              Early Warning & Response System
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}