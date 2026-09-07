"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

type MapZone = {
  id: string;
  name: string;
  risk: number | null;
  confidence: number | null;
  lat: number;
  lng: number;
  rainfall: number;
  soilMoisture: number;
  tilt: number;
  population: number;
  roads: number;
  bridges: number;
  status: string;
  reasons: string[];
  recommendedAction: string;
  predictionAvailable?: boolean;
};

type MapProps = {
  zones: MapZone[];
};

const getRiskColor = (status: string) => {
  switch (status) {
    case "CRITICAL":
      return "red";
    case "HIGH":
      return "orange";
    case "MODERATE":
      return "yellow";
    case "LOW":
      return "green";
    default:
      return "gray";
  }
};

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [center, map]);

  return null;
}

export default function Map({ zones }: MapProps) {
  const center: [number, number] =
    zones.length > 0
      ? [
          zones.reduce((sum, zone) => sum + zone.lat, 0) / zones.length,
          zones.reduce((sum, zone) => sum + zone.lng, 0) / zones.length,
        ]
      : [27.5, 93.5];

  return (
    <MapContainer
      center={center}
      zoom={10}
      scrollWheelZoom={true}
      className="h-full w-full"
    >
      <MapRecenter center={center} />

      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {zones.map((zone) => {
        const hasPrediction =
          zone.predictionAvailable === true && zone.risk !== null;

        return (
          <CircleMarker
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={10}
            pathOptions={{
              color: getRiskColor(zone.status),
              fillColor: getRiskColor(zone.status),
              fillOpacity: 0.8,
            }}
          >
            <Popup>
              <div className="min-w-[230px] text-black">
                <h3 className="text-lg font-bold">{zone.name}</h3>

                <hr className="my-2" />

                {!hasPrediction ? (
                  <p className="font-semibold text-gray-700">
                    NO BACKEND PREDICTION
                  </p>
                ) : (
                  <>
                    <p>
                      <strong>Risk Score:</strong> {zone.risk}%
                    </p>

                    <p>
                      <strong>Risk Level:</strong> {zone.status}
                    </p>

                    <p>
                      <strong>Data Confidence:</strong>{" "}
                      {zone.confidence !== null ? `${zone.confidence}%` : "N/A"}
                    </p>
                  </>
                )}

                <p>
                  <strong>Rainfall:</strong>{" "}
                  {hasPrediction ? `${zone.rainfall} mm` : "N/A"}
                </p>

                <p>
                  <strong>Soil Moisture:</strong>{" "}
                  {hasPrediction ? `${zone.soilMoisture}%` : "N/A"}
                </p>

                <p>
                  <strong>Ground Movement:</strong>{" "}
                  {hasPrediction ? `${zone.tilt}°` : "N/A"}
                </p>

                <p>
                  <strong>Population:</strong>{" "}
                  {zone.population.toLocaleString()}
                </p>

                <p>
                  <strong>Infrastructure:</strong> N/A (Pending GIS feed)
                </p>

                {hasPrediction && (
                  <>
                    <hr className="my-2" />

                    <p className="font-semibold">ML Factors</p>

                    <ul className="list-disc pl-5 text-sm">
                      {zone.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>

                    <hr className="my-2" />

                    <p>
                      <strong>Recommended Action:</strong>
                    </p>

                    <p className="text-sm">
                      {zone.recommendedAction ||
                        "No backend recommendation available."}
                    </p>
                  </>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
