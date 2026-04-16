"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, Installation, Repair } from "@/lib/api";

type Tab = "repair" | "maintenance";
type RepairStatusFilter = "" | "belum" | "done";
type SortDir = "asc" | "desc";

function SortableHeader<T extends string>({
  label, sortKey, current, dir, onToggle,
}: {
  label: string;
  sortKey: T;
  current: T | null;
  dir: SortDir;
  onToggle: (key: T) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className="flex items-center gap-1 font-semibold hover:text-[var(--color-primary)]"
    >
      {label}
      <span className="text-xs leading-none">
        {active ? (dir === "asc" ? "▲" : "▼") : <span className="opacity-30">⇅</span>}
      </span>
    </button>
  );
}

export default function HistoryPage() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [tab, setTab] = useState<Tab>("repair");
  const [repairStatusFilter, setRepairStatusFilter] = useState<RepairStatusFilter>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [repairSortKey, setRepairSortKey] = useState<"line" | "date" | null>(null);
  const [repairSortDir, setRepairSortDir] = useState<SortDir>("asc");
  const [installSortKey, setInstallSortKey] = useState<"line" | "date_install" | null>(null);
  const [installSortDir, setInstallSortDir] = useState<SortDir>("asc");

  function toggleRepairSort(key: "line" | "date") {
    if (repairSortKey === key) setRepairSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setRepairSortKey(key); setRepairSortDir("asc"); }
  }
  function toggleInstallSort(key: "line" | "date_install") {
    if (installSortKey === key) setInstallSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setInstallSortKey(key); setInstallSortDir("asc"); }
  }

  useEffect(() => {
    apiGet<{ repairs: Repair[]; installations: Installation[] }>("/history/")
      .then((data) => {
        setRepairs(data.repairs);
        setInstallations(data.installations);
        setError("");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredRepairs = useMemo(() => {
    let data = repairs;
    if (repairStatusFilter === "done") data = data.filter((r) => r.status === "completed" || r.status === "approved");
    else if (repairStatusFilter === "belum") data = data.filter((r) => r.status === "pending");
    if (!repairSortKey) return data;
    return [...data].sort((a, b) => {
      const va = repairSortKey === "date" ? new Date(a[repairSortKey]).getTime() : a[repairSortKey];
      const vb = repairSortKey === "date" ? new Date(b[repairSortKey]).getTime() : b[repairSortKey];
      if (va < vb) return repairSortDir === "asc" ? -1 : 1;
      if (va > vb) return repairSortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [repairs, repairStatusFilter, repairSortKey, repairSortDir]);

  const sortedInstallations = useMemo(() => {
    if (!installSortKey) return installations;
    return [...installations].sort((a, b) => {
      const va = installSortKey === "date_install" ? new Date(a[installSortKey]).getTime() : a[installSortKey];
      const vb = installSortKey === "date_install" ? new Date(b[installSortKey]).getTime() : b[installSortKey];
      if (va < vb) return installSortDir === "asc" ? -1 : 1;
      if (va > vb) return installSortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [installations, installSortKey, installSortDir]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[var(--color-secondary)]">Memuat riwayat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-rose-50 p-4 text-rose-700">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">
        Riwayat Repair & Maintenance
      </h1>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-secondary)] pb-px sm:gap-2">
        <button
          type="button"
          onClick={() => setTab("repair")}
          className={`min-h-[44px] shrink-0 rounded-t px-3 py-2 text-sm font-medium sm:min-h-0 sm:px-4 ${
            tab === "repair"
              ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
              : "text-[var(--color-secondary)] hover:bg-[var(--color-accent)]/20"
          }`}
        >
          Repair ({repairs.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("maintenance")}
          className={`min-h-[44px] shrink-0 rounded-t px-3 py-2 text-sm font-medium sm:min-h-0 sm:px-4 ${
            tab === "maintenance"
              ? "border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]"
              : "text-[var(--color-secondary)] hover:bg-[var(--color-accent)]/20"
          }`}
        >
          Maintenance ({installations.length})
        </button>
      </div>

      {tab === "repair" && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3">
            <span className="text-sm font-medium text-[var(--color-primary)]">Filter status:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRepairStatusFilter("")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  repairStatusFilter === ""
                    ? "bg-[var(--color-primary)] text-white"
                    : "bg-[var(--color-accent)]/30 text-[var(--color-primary)] hover:bg-[var(--color-accent)]/50"
                }`}
              >
                Semua ({repairs.length})
              </button>
              <button
                type="button"
                onClick={() => setRepairStatusFilter("belum")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  repairStatusFilter === "belum"
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                }`}
              >
                Pending ({repairs.filter((r) => r.status === "pending").length})
              </button>
              <button
                type="button"
                onClick={() => setRepairStatusFilter("done")}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  repairStatusFilter === "done"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                }`}
              >
                Done ({repairs.filter((r) => r.status === "completed" || r.status === "approved").length})
              </button>
            </div>
          </div>
          <div className="table-scroll-wrap -mx-1 overflow-x-auto rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] px-1">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-[var(--color-accent)]/40">
              <tr>
                <th className="p-2 text-left font-semibold">
                  <SortableHeader label="Tanggal" sortKey="date" current={repairSortKey} dir={repairSortDir} onToggle={toggleRepairSort} />
                </th>
                <th className="p-2 text-left font-semibold">MCID</th>
                <th className="p-2 text-left font-semibold">Factory</th>
                <th className="p-2 text-left font-semibold">
                  <SortableHeader label="Line" sortKey="line" current={repairSortKey} dir={repairSortDir} onToggle={toggleRepairSort} />
                </th>
                <th className="p-2 text-left font-semibold">Problem</th>
                <th className="p-2 text-left font-semibold">Action</th>
                <th className="p-2 text-left font-semibold">Teknisi</th>
                <th className="p-2 text-left font-semibold">Status</th>
                <th className="p-2 text-left font-semibold">Foto</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepairs.map((item) => (
                <tr key={item.id} className="border-t border-[var(--color-secondary)]/50">
                  <td className="p-2">{new Date(item.date).toLocaleString("id-ID")}</td>
                  <td className="p-2">{item.mcid}</td>
                  <td className="p-2">{item.factory}</td>
                  <td className="p-2">{item.line}</td>
                  <td className="max-w-[200px] truncate p-2" title={item.problem}>
                    {item.problem}
                  </td>
                  <td className="max-w-[200px] truncate p-2" title={item.action}>
                    {item.action || "-"}
                  </td>
                  <td className="p-2">{item.technician_name}</td>
                  <td className="p-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        item.status === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="p-2">
                    {item.photo_url ? (
                      <a
                        href={item.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        Lihat
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRepairs.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={9}>
                    {repairStatusFilter
                      ? "Tidak ada riwayat repair dengan filter ini."
                      : "Belum ada riwayat repair."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === "maintenance" && (
        <div className="table-scroll-wrap -mx-1 overflow-x-auto rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] px-1">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="bg-[var(--color-accent)]/40">
              <tr>
                <th className="p-2 text-left font-semibold">
                  <SortableHeader label="Tanggal Instalasi" sortKey="date_install" current={installSortKey} dir={installSortDir} onToggle={toggleInstallSort} />
                </th>
                <th className="p-2 text-left font-semibold">MCID</th>
                <th className="p-2 text-left font-semibold">MAC Address</th>
                <th className="p-2 text-left font-semibold">Factory</th>
                <th className="p-2 text-left font-semibold">
                  <SortableHeader label="Line" sortKey="line" current={installSortKey} dir={installSortDir} onToggle={toggleInstallSort} />
                </th>
                <th className="p-2 text-left font-semibold">Teknisi</th>
              </tr>
            </thead>
            <tbody>
              {sortedInstallations.map((item) => (
                <tr key={item.id} className="border-t border-[var(--color-secondary)]/50">
                  <td className="p-2">
                    {new Date(item.date_install).toLocaleString("id-ID")}
                  </td>
                  <td className="p-2">{item.mcid}</td>
                  <td className="p-2">{item.mac_address || "-"}</td>
                  <td className="p-2">{item.factory}</td>
                  <td className="p-2">{item.line}</td>
                  <td className="p-2">{item.technician}</td>
                </tr>
              ))}
              {installations.length === 0 && (
                <tr>
                  <td className="p-4 text-slate-500" colSpan={6}>
                    Belum ada riwayat maintenance/instalasi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--color-secondary)]">
        <Link href="/errors" className="underline hover:opacity-80">
          List Error
        </Link>
        {" · "}
        <Link href="/devices" className="underline hover:opacity-80">
          Device List
        </Link>
      </p>
    </div>
  );
}
