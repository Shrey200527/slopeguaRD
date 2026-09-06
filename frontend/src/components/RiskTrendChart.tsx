"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type RiskPoint = {
  time: string;
  risk: number;
};

type RiskTrendChartProps = {
  data: RiskPoint[];
};

export default function RiskTrendChart({
  data,
}: RiskTrendChartProps) {
  return (
    <div className="h-[300px] w-full">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Waiting for backend sensor data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

            <XAxis dataKey="time" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} />

            <YAxis
              domain={[0, 100]}
              stroke="#64748b"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              label={{
                value: "Risk %",
                angle: -90,
                position: "insideLeft",
                fill: "#94a3b8",
              }}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#020617",
                border: "1px solid #334155",
                borderRadius: "8px",
                color: "#ffffff",
              }}
            />

            <Line
              type="monotone"
              dataKey="risk"
              stroke="#22d3ee"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
