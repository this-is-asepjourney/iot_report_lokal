"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiUpload, AuthUser, Device, downloadCsv, loadCurrentUser } from "@/lib/api";

type SortKey = "line" | "last_update";
type SortDir = "asc" | "desc";

/** Naik perlahan ke 90% selama proses berlangsung, lalu caller set 100% saat selesai */
function simulateProgress(setter: (v: number) => void): ReturnType<typeof setInterval> {
  let progress = 0;
  return setInterval(() => {
    // Makin mendekati 90%, makin lambat naiknya
    const remaining = 90 - progress;
    const step = Math.max(0.5, remaining * 0.08);
    progress = Math.min(90, progress + step);
    setter(Math.round(progress));
  }, 300);
}

export default function DeviceListPage() {
  const [rows, setRows] = useState<Device[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Device>>({});
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [currentUser, setCurrentUserState] = useState<AuthUser | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = sortKey === "last_update" ? new Date(a[sortKey]).getTime() : a[sortKey];
      const vb = sortKey === "last_update" ? new Date(b[sortKey]).getTime() : b[sortKey];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  async function loadData() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    try {
      const data = await apiGet<Device[]>(`/devices/?${params.toString()}`);
      setRows(data);
      setError("");
      setInfo("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportProgress(0);
    setError("");
    setInfo("");

    // Simulasi progress: naik cepat ke 80% selama proses, lalu 100% setelah selesai
    const progressTimer = simulateProgress(setImportProgress);
    try {
      const result = await apiUpload("/admin/import/devices/", file);
      clearInterval(progressTimer);
      setImportProgress(100);
      setInfo(`✅ Import berhasil: ${result.imported} data device diproses`);
      setError("");
      await loadData();
    } catch (err) {
      clearInterval(progressTimer);
      setImportProgress(0);
      setError((err as Error).message);
      setInfo("");
    } finally {
      setTimeout(() => {
        setImporting(false);
        setImportProgress(0);
      }, 1200);
      event.target.value = "";
    }
  }

  async function onExportCsv() {
    try {
      await downloadCsv("/export/devices.csv", "devices.csv");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(item: Device) {
    setEditingId(item.id);
    setEditForm({
      mcid: item.mcid,
      mac_address: item.mac_address,
      factory: item.factory,
      line: item.line,
      type_machine: item.type_machine,
      model_machine: item.model_machine,
      type_iot: item.type_iot,
      status: item.status,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function saveEdit(id: string) {
    try {
      await apiPatch(`/devices/${id}/`, editForm);
      setInfo("Device berhasil diperbarui.");
      setError("");
      cancelEdit();
      await loadData();
    } catch (err) {
      setError((err as Error).message);
      setInfo("");
    }
  }

  useEffect(() => {
    setCurrentUserState(loadCurrentUser());
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isTeknisi = currentUser?.role === "teknisi";

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">Device List</h1>
      <p className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-primary)] sm:text-sm">
        MCID unik: input atau import dengan MCID yang sudah ada akan memperbarui device tersebut, bukan membuat duplikat.
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search MCID"
          className="min-h-[44px] min-w-0 flex-1 rounded border p-2 text-base sm:min-h-0 sm:flex-initial sm:basis-48"
        />
        <button
          type="button"
          onClick={loadData}
          className="min-h-[44px] shrink-0 rounded bg-[var(--color-primary)] px-4 py-2 text-white hover:opacity-90 sm:min-h-0"
        >
          Search
        </button>
        {!isTeknisi && (
          <label className="flex min-h-[44px] shrink-0 cursor-pointer items-center rounded bg-[var(--color-secondary)] px-4 py-2 text-white hover:opacity-90 sm:min-h-0">
            Import CSV/JSON
            <input type="file" accept=".csv,.json" className="hidden" onChange={onImportFile} />
          </label>
        )}
        <button
          type="button"
          onClick={onExportCsv}
          className="min-h-[44px] shrink-0 rounded bg-[var(--color-primary)] px-4 py-2 text-white hover:opacity-90 sm:min-h-0"
        >
          Export CSV
        </button>
      </div>

      {/* Progress bar import */}
      {importing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-blue-700">
            <span>⏳ Mengimpor data device…</span>
            <span>{importProgress}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-blue-500 transition-all duration-300"
              style={{ width: `${importProgress}%`, backgroundSize: "200% 100%", animation: "shimmer 1.4s linear infinite" }}
            />
          </div>
          <p className="mt-1 text-xs text-blue-500">Jangan tutup halaman ini…</p>
        </div>
      )}

      {error && <p className="rounded-md bg-rose-50 p-3 text-rose-600">{error}</p>}
      {info && <p className="rounded-md bg-emerald-50 p-3 text-emerald-700">{info}</p>}

      {/* Table */}
      <div className="table-scroll-wrap -mx-1 overflow-x-auto rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] px-1">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-[var(--color-accent)]/40">
            <tr>
              <th className="whitespace-nowrap p-2 text-left font-semibold">MCID</th>
              <th className="p-2 text-left font-semibold">MAC Address</th>
              <th className="p-2 text-left font-semibold">Factory</th>
              <th className="p-2 text-left font-semibold">
                <SortableHeader label="Line" sortKey="line" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </th>
              <th className="p-2 text-left font-semibold text-sky-700">Tipe Mesin</th>
              <th className="p-2 text-left font-semibold text-purple-700">Model Mesin</th>
              <th className="p-2 text-left font-semibold text-emerald-700">Tipe IoT</th>
              <th className="p-2 text-left font-semibold">Status</th>
              <th className="p-2 text-left font-semibold">
                <SortableHeader label="Last Update" sortKey="last_update" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </th>
              {!isTeknisi && <th className="p-2 text-left font-semibold">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item) => (
              <tr
                key={item.id}
                className="border-t border-[var(--color-secondary)]/30 transition-colors hover:bg-[var(--color-accent)]/10"
              >
                {/* MCID */}
                <td className="p-2 font-medium">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      value={editForm.mcid ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, mcid: e.target.value }))}
                    />
                  ) : (
                    item.mcid
                  )}
                </td>

                {/* MAC Address */}
                <td className="p-2 font-mono text-xs">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      value={editForm.mac_address ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, mac_address: e.target.value }))}
                    />
                  ) : (
                    item.mac_address || <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Factory */}
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      value={editForm.factory ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, factory: e.target.value }))}
                    />
                  ) : (
                    item.factory || <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Line */}
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      value={editForm.line ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, line: e.target.value }))}
                    />
                  ) : (
                    item.line || <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Tipe Mesin */}
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      placeholder="CNC, Conveyor…"
                      value={editForm.type_machine ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, type_machine: e.target.value }))}
                    />
                  ) : item.type_machine ? (
                    <InfoBadge color="sky" value={item.type_machine} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Model Mesin */}
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      placeholder="DMU 50, CV-200…"
                      value={editForm.model_machine ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, model_machine: e.target.value }))}
                    />
                  ) : item.model_machine ? (
                    <InfoBadge color="purple" value={item.model_machine} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Tipe IoT */}
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1 text-sm"
                      placeholder="Sensor, Gateway…"
                      value={editForm.type_iot ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, type_iot: e.target.value }))}
                    />
                  ) : item.type_iot ? (
                    <InfoBadge color="emerald" value={item.type_iot} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Status */}
                <td className="p-2">
                  {editingId === item.id ? (
                    <select
                      className="w-full rounded border p-1 text-sm"
                      value={editForm.status ?? "active"}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, status: e.target.value as Device["status"] }))
                      }
                    >
                      <option value="active">active</option>
                      <option value="repair">repair</option>
                      <option value="broken">broken</option>
                    </select>
                  ) : (
                    <StatusBadge status={item.status} />
                  )}
                </td>

                {/* Last Update */}
                <td className="p-2 text-xs text-slate-500">
                  {new Date(item.last_update).toLocaleString("id-ID")}
                </td>

                {/* Aksi — hanya supervisor/admin */}
                {!isTeknisi && (
                  <td className="p-2">
                    {editingId === item.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => saveEdit(item.id)}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Simpan
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded bg-slate-400 px-2 py-1 text-xs text-white hover:opacity-90"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(item)}
                        className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={10}>
                  Belum ada data device.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function SortableHeader({
  label, sortKey, current, dir, onToggle,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey | null;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    repair: "bg-amber-100 text-amber-800",
    broken: "bg-rose-100 text-rose-800",
    nonaktif: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status.toUpperCase()}
    </span>
  );
}

function InfoBadge({ value, color }: { value: string; color: "sky" | "purple" | "emerald" }) {
  const colorMap = {
    sky:     "bg-sky-50 text-sky-700 ring-sky-200",
    purple:  "bg-purple-50 text-purple-700 ring-purple-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${colorMap[color]}`}>
      {value}
    </span>
  );
}
