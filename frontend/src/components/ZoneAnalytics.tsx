"use client";

type ZoneAnalyticsProps = {
  rainfall: number;
  soilMoisture: number;
  tilt: number;
};

export default function ZoneAnalytics({
  rainfall,
  soilMoisture,
  tilt,
}: ZoneAnalyticsProps) {
  const getLevel = (value: number, high: number) => {
    if (value >= high) return "HIGH";
    if (value >= high * 0.6) return "MODERATE";
    return "LOW";
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500">
          Rainfall Condition
        </p>

        <p className="mt-2 text-lg font-semibold">
          {getLevel(rainfall, 150)}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {rainfall} mm recorded
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500">
          Soil Saturation
        </p>

        <p className="mt-2 text-lg font-semibold">
          {getLevel(soilMoisture, 80)}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {soilMoisture}% moisture
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs text-slate-500">
          Ground Movement
        </p>

        <p className="mt-2 text-lg font-semibold">
          {getLevel(tilt, 5)}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {tilt}° ground tilt
        </p>
      </div>
    </div>
  );
}
