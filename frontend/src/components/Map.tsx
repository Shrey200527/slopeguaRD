"use client";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

type MapZone = {
  id: string;
  name: string;
  risk: number;
  confidence: number;
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
};

type MapProps = {
  zones: MapZone[];
};

const getRiskColor = (status: string) => {
  if (status === "CRITICAL") return "red";
  if (status === "HIGH") return "orange";
  if (status === "MEDIUM") return "yellow";
  return "green";
};

export default function Map({ zones }: MapProps) {
  return (
    <MapContainer
      center={[18.65, 73.65]}
      zoom={10}
      scrollWheelZoom={true}
      className="h-full w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {zones.map((zone) => (
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
              <h3 className="text-lg font-bold">
                {zone.name}
              </h3>

              <hr className="my-2" />

              <p>
                <strong>Risk Score:</strong>{" "}
                {zone.risk}%
              </p>

              <p>
                <strong>Confidence:</strong>{" "}
                {zone.confidence}%
              </p>

              <p>
                <strong>Status:</strong>{" "}
                {zone.status}
              </p>

              <p>
                <strong>Rainfall:</strong>{" "}
                {zone.rainfall} mm
              </p>

              <p>
                <strong>Soil Moisture:</strong>{" "}
                {zone.soilMoisture}%
              </p>

              <p>
                <strong>Ground Tilt:</strong>{" "}
                {zone.tilt}°
              </p>

              <p>
                <strong>Population:</strong>{" "}
                {zone.population.toLocaleString()}
              </p>

              <p>
                <strong>Infrastructure:</strong>{" "}
                {zone.roads} roads /{" "}
                {zone.bridges} bridges
              </p>

              <hr className="my-2" />

              <p className="font-semibold">
                Risk Factors:
              </p>

              <ul className="list-disc pl-5 text-sm">
                {zone.reasons.map((reason) => (
                  <li key={reason}>
                    {reason}
                  </li>
                ))}
              </ul>

              <p className="mt-2">
                <strong>
                  Recommended Action:
                </strong>
              </p>

              <p className="text-sm">
                {zone.recommendedAction}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}