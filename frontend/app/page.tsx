"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, DashboardResponse } from "@/lib/api";

const MACHINE_COLORS = [
  "#4682A9", "#749BC2", "#91C8E4", "#2563eb", "#0ea5e9",
  "#38bdf8", "#7c3aed", "#a78bfa", "#059669", "#34d399",
];

export default function Home() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    apiGet<DashboardResponse>("/dashboard/summary/")
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  // Gabungkan data device & error per type_machine dalam satu tabel
  const machineRows = useMemo(() => {
    const map = new Map<string, { type_machine: string; devices: number; errors: number }>();

    for (const d of data?.devices_by_type_machine ?? []) {
      const key = d.type_machine || "(kosong)";
      map.set(key, { type_machine: key, devices: d.total, errors: 0 });
    }
    for (const e of data?.errors_by_type_machine ?? []) {
      const key = e.type_machine || "(kosong)";
      const row = map.get(key) ?? { type_machine: key, devices: 0, errors: 0 };
      row.errors = e.total;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.devices - a.devices);
  }, [data]);

  // Data bar chart gabungan device+error per type_machine
  const machineChartData = machineRows.map((r) => ({
    name: r.type_machine,
    Device: r.devices,
    Error: r.errors,
  }));

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">Dashboard</h1>

      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-600">{error}</p>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <Card title="Total Device" value={data?.summary.total_devices ?? 0} color="primary" />
        <Card title="Total Error" value={data?.summary.total_errors ?? 0} color="danger" />
        <Card title="Error Pending" value={data?.summary.pending_errors ?? 0} color="warning" />
        <Card title="Error Selesai" value={data?.summary.completed_errors ?? 0} color="success" />
      </div>

      {/* ─── Akumulasi per Tipe Mesin ─── */}
      <section className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4">
        <h2 className="mb-3 font-semibold text-[var(--color-primary)]">
          Akumulasi per Tipe Mesin
        </h2>

        {/* Tabel ringkasan */}
        {machineRows.length === 0 ? (
          <p className="text-sm text-gray-400">Belum ada data tipe mesin.</p>
        ) : (
          <div className="mb-4 overflow-x-auto rounded-md border border-gray-100">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-accent)]/20 text-[var(--color-primary)]">
                  <th className="px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipe Mesin</th>
                  <th className="px-3 py-2 text-right font-semibold">Jumlah Device</th>
                  <th className="px-3 py-2 text-right font-semibold">Jumlah Error</th>
                  <th className="px-3 py-2 text-left font-semibold">Proporsi Device</th>
                </tr>
              </thead>
              <tbody>
                {machineRows.map((row, i) => {
                  const totalDev = data?.summary.total_devices || 1;
                  const pct = Math.round((row.devices / totalDev) * 100);
                  return (
                    <tr key={row.type_machine} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-[var(--color-primary)]">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                          style={{ background: MACHINE_COLORS[i % MACHINE_COLORS.length] }}
                        >
                          {row.type_machine}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-[var(--color-primary)]">
                        {row.devices}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-rose-500">
                        {row.errors}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: MACHINE_COLORS[i % MACHINE_COLORS.length],
                              }}
                            />
                          </div>
                          <span className="w-8 text-right text-xs text-gray-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bar chart Device vs Error per tipe mesin */}
        {machineChartData.length > 0 && (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={machineChartData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="top" />
                <Bar dataKey="Device" fill="#4682A9" radius={[3, 3, 0, 0]}>
                  {machineChartData.map((_, i) => (
                    <Cell key={i} fill={MACHINE_COLORS[i % MACHINE_COLORS.length]} />
                  ))}
                </Bar>
                <Bar dataKey="Error" fill="#f87171" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ─── Charts Factory & Status ─── */}
      <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
        <section className="min-h-[260px] rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:h-80">
          <h2 className="mb-3 font-semibold text-[var(--color-primary)]">Device per Factory</h2>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={data?.devices_by_factory ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="factory" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#4682A9" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="min-h-[260px] rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:h-80">
          <h2 className="mb-3 font-semibold text-[var(--color-primary)]">Status Device</h2>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie
                data={data?.devices_by_status ?? []}
                dataKey="total"
                nameKey="status"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {(data?.devices_by_status ?? []).map((_, i) => (
                  <Cell key={i} fill={MACHINE_COLORS[i % MACHINE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="min-h-[260px] rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:h-80">
        <h2 className="mb-3 font-semibold text-[var(--color-primary)]">Error per Factory</h2>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={data?.errors_by_factory ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="factory" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="total" fill="#91C8E4" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function Card({
  title,
  value,
  color = "primary",
}: {
  title: string;
  value: number;
  color?: "primary" | "danger" | "warning" | "success";
}) {
  const colorMap = {
    primary: "text-[var(--color-primary)]",
    danger: "text-rose-500",
    warning: "text-amber-500",
    success: "text-emerald-600",
  };
  return (
    <div className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4">
      <p className="truncate text-xs text-[var(--color-secondary)] sm:text-sm">{title}</p>
      <p className={`text-xl font-bold sm:text-2xl ${colorMap[color]}`}>{value}</p>
    </div>
  );
}
