"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPatch, apiPatchFormData, apiUpload, AuthUser, downloadCsv, loadCurrentUser, Repair } from "@/lib/api";

type SortKey = "line" | "date";
type SortDir = "asc" | "desc";

function simulateProgress(setter: (v: number) => void): ReturnType<typeof setInterval> {
  let progress = 0;
  return setInterval(() => {
    const remaining = 90 - progress;
    const step = Math.max(0.5, remaining * 0.08);
    progress = Math.min(90, progress + step);
    setter(Math.round(progress));
  }, 300);
}

export default function ErrorListPage() {
  const [rows, setRows] = useState<Repair[]>([]);
  const [done, setDone] = useState("");
  const [factory, setFactory] = useState("");
  const [line, setLine] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Repair>>({});
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
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

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCheckAll(displayedRows: Repair[]) {
    if (checkedIds.size === displayedRows.length && displayedRows.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(displayedRows.map((r) => r.id)));
    }
  }

  async function bulkUpdateStatus(status: "pending" | "completed" | "dicopot") {
    if (checkedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(checkedIds).map((id) => apiPatch(`/repairs/${id}/`, { status }))
      );
      setInfo(`${checkedIds.size} item diperbarui menjadi "${status}".`);
      setCheckedIds(new Set());
      setError("");
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function loadData() {
    const params = new URLSearchParams();
    if (done) params.set("done", done);
    if (factory) params.set("factory", factory);
    if (line) params.set("line", line);
    if (search) params.set("search", search);
    try {
      const data = await apiGet<Repair[]>(`/repairs/?${params.toString()}`);
      setRows(data);
      setCheckedIds(new Set());
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

    const progressTimer = simulateProgress(setImportProgress);
    try {
      const result = await apiUpload("/admin/import/repairs/", file);
      clearInterval(progressTimer);
      setImportProgress(100);
      setInfo(`✅ Import berhasil: ${result.imported} data error diproses`);
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
      await downloadCsv("/export/repairs.csv", "repairs.csv");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function updateRepairStatus(id: string, status: "pending" | "completed" | "approved" | "dicopot") {
    try {
      await apiPatch(`/repairs/${id}/`, { status });
      setInfo(`Status repair diperbarui menjadi ${status}.`);
      setError("");
      await loadData();
    } catch (err) {
      setError((err as Error).message);
      setInfo("");
    }
  }

  function startEdit(item: Repair) {
    setEditingId(item.id);
    setEditForm({
      problem: item.problem,
      action: item.action,
      factory: item.factory,
      line: item.line,
      status: item.status,
      photo_url: item.photo_url ?? "",
    });
    setEditPhotoFile(null);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
    setEditPhotoFile(null);
  }

  async function saveEdit(id: string) {
    try {
      if (editPhotoFile) {
        const formData = new FormData();
        formData.append("problem", editForm.problem ?? "");
        formData.append("action", editForm.action ?? "");
        formData.append("factory", editForm.factory ?? "");
        formData.append("line", editForm.line ?? "");
        formData.append("status", editForm.status ?? "pending");
        formData.append("photo", editPhotoFile);
        await apiPatchFormData(`/repairs/${id}/`, formData);
      } else {
        await apiPatch(`/repairs/${id}/`, editForm);
      }
      setInfo("Data error berhasil diperbarui.");
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
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, factory, line]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = sortKey === "date" ? new Date(a[sortKey]).getTime() : a[sortKey];
      const vb = sortKey === "date" ? new Date(b[sortKey]).getTime() : b[sortKey];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortDir]);

  const factories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.factory))).sort(),
    [rows]
  );
  const lines = useMemo(() => Array.from(new Set(rows.map((r) => r.line))).sort(), [rows]);
  const pendingCount = useMemo(
    () => rows.filter((item) => item.status === "pending").length,
    [rows]
  );
  const doneCount = useMemo(
    () => rows.filter((item) => item.status === "completed" || item.status === "approved").length,
    [rows]
  );

  const isTeknisi = currentUser?.role === "teknisi";
  const canApprove = currentUser?.role === "supervisor" || currentUser?.role === "admin";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">List Error Device</h1>
      <p className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-primary)] sm:text-sm">
        MCID unik: input error dengan MCID yang sudah ada (dan masih pending) akan meng-update repair yang ada, bukan membuat entri baru.
      </p>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <select
          value={done}
          onChange={(e) => setDone(e.target.value)}
          className="min-h-[44px] rounded border p-2 text-base sm:min-h-0"
        >
          <option value="">Done/Belum (All)</option>
          <option value="done">Done</option>
          <option value="belum">Belum</option>
        </select>

        <select
          value={factory}
          onChange={(e) => setFactory(e.target.value)}
          className="min-h-[44px] rounded border p-2 text-base sm:min-h-0"
        >
          <option value="">Factory (All)</option>
          {factories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={line}
          onChange={(e) => setLine(e.target.value)}
          className="min-h-[44px] rounded border p-2 text-base sm:min-h-0"
        >
          <option value="">Line (All)</option>
          {lines.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search MCID"
          className="min-h-[44px] rounded border p-2 text-base sm:min-h-0"
        />
        <button
          type="button"
          onClick={loadData}
          className="min-h-[44px] rounded bg-[var(--color-primary)] px-4 py-2 text-white hover:opacity-90 sm:min-h-0"
        >
          Search
        </button>
        {!isTeknisi && (
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center rounded bg-[var(--color-secondary)] px-4 py-2 text-white hover:opacity-90 sm:min-h-0">
            Import CSV/JSON
            <input
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={onImportFile}
            />
          </label>
        )}
        <button
          type="button"
          onClick={onExportCsv}
          className="min-h-[44px] rounded bg-[var(--color-primary)] px-4 py-2 text-white hover:opacity-90 sm:min-h-0"
        >
          Export CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <SummaryCard title="Total Sesuai Filter" value={rows.length} />
        <SummaryCard title="Pending" value={pendingCount} />
        <SummaryCard title="Done" value={doneCount} />
      </div>

      {/* Progress bar import */}
      {importing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-blue-700">
            <span>⏳ Mengimpor data error…</span>
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

      {/* Bulk action toolbar */}
      {checkedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-primary)]">
            {checkedIds.size} item dipilih
          </span>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => bulkUpdateStatus("completed")}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            ✓ Tandai Done ({checkedIds.size})
          </button>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => bulkUpdateStatus("pending")}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            ↺ Tandai Pending ({checkedIds.size})
          </button>
          <button
            type="button"
            disabled={bulkLoading}
            onClick={() => {
              if (confirm(`Tandai ${checkedIds.size} item sebagai Dicopot? Device terkait akan menjadi Nonaktif.`))
                bulkUpdateStatus("dicopot");
            }}
            className="rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            ✂ Dicopot ({checkedIds.size})
          </button>
          <button
            type="button"
            onClick={() => setCheckedIds(new Set())}
            className="ml-auto text-xs text-[var(--color-secondary)] underline hover:text-[var(--color-primary)]"
          >
            Batal pilih
          </button>
        </div>
      )}

      <div className="table-scroll-wrap -mx-1 overflow-x-auto rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] px-1">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-[var(--color-accent)]/40">
            <tr>
              <th className="p-2 text-left">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                  checked={checkedIds.size === sortedRows.length && sortedRows.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < sortedRows.length;
                  }}
                  onChange={() => toggleCheckAll(sortedRows)}
                />
              </th>
              <th className="whitespace-nowrap p-2 text-left font-semibold">MCID</th>
              <th className="p-2 text-left font-semibold">Factory</th>
              <th className="p-2 text-left font-semibold">
                <SortableHeader label="Line" sortKey="line" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </th>
              <th className="p-2 text-left font-semibold text-sky-700">Tipe Mesin</th>
              <th className="p-2 text-left font-semibold text-purple-700">Model Mesin</th>
              <th className="p-2 text-left font-semibold text-emerald-700">Tipe IoT</th>
              <th className="p-2 text-left font-semibold">Problem</th>
              <th className="p-2 text-left font-semibold">Status</th>
              <th className="p-2 text-left font-semibold">
                <SortableHeader label="Tanggal" sortKey="date" current={sortKey} dir={sortDir} onToggle={toggleSort} />
              </th>
              <th className="p-2 text-left font-semibold">Foto</th>
              <th className="p-2 text-left font-semibold">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item) => (
              <tr
                key={item.id}
                onClick={() => editingId !== item.id && toggleCheck(item.id)}
                className={`cursor-pointer border-t border-[var(--color-secondary)]/30 transition-colors ${
                  checkedIds.has(item.id)
                    ? "bg-[var(--color-primary)]/8"
                    : "hover:bg-[var(--color-accent)]/10"
                }`}
              >
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                    checked={checkedIds.has(item.id)}
                    onChange={() => toggleCheck(item.id)}
                  />
                </td>
                <td className="p-2 font-medium">{item.mcid}</td>
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1"
                      value={editForm.factory ?? ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, factory: e.target.value }))}
                    />
                  ) : (
                    item.factory || <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-2">
                  {editingId === item.id ? (
                    <input
                      className="w-full rounded border p-1"
                      value={editForm.line ?? ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, line: e.target.value }))}
                    />
                  ) : (
                    item.line || <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Tipe Mesin — read-only dari device */}
                <td className="p-2">
                  {item.device_type_machine ? (
                    <InfoBadge color="sky" value={item.device_type_machine} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Model Mesin — read-only dari device */}
                <td className="p-2">
                  {item.device_model_machine ? (
                    <InfoBadge color="purple" value={item.device_model_machine} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Tipe IoT — read-only dari device */}
                <td className="p-2">
                  {item.device_type_iot ? (
                    <InfoBadge color="emerald" value={item.device_type_iot} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                <td className="p-2">
                  {editingId === item.id ? (
                    <textarea
                      className="w-full rounded border p-1"
                      value={editForm.problem ?? ""}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, problem: e.target.value }))}
                    />
                  ) : (
                    item.problem
                  )}
                </td>
                <td className="p-2">
                  {editingId === item.id ? (
                    <select
                      className="w-full rounded border p-1 text-sm"
                      value={editForm.status ?? "pending"}
                      onChange={(e) =>
                        setEditForm((prev) => ({
                          ...prev,
                          status: e.target.value as Repair["status"],
                        }))
                      }
                    >
                      <option value="pending">pending</option>
                      <option value="completed">completed</option>
                      {canApprove && <option value="approved">approved</option>}
                      <option value="dicopot">dicopot</option>
                    </select>
                  ) : (
                    <RepairStatusBadge status={item.status} />
                  )}
                </td>
                <td className="p-2 text-xs text-slate-500">{new Date(item.date).toLocaleString("id-ID")}</td>
                <td className="p-2">
                  {editingId === item.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        ref={editPhotoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditPhotoFile(e.target.files?.[0] ?? null)}
                        className="max-w-[140px] rounded border p-1 text-xs"
                      />
                      {editPhotoFile ? (
                        <span className="text-xs text-slate-500">{editPhotoFile.name}</span>
                      ) : (
                        <span className="text-xs text-slate-400">Unggah foto baru (opsional)</span>
                      )}
                    </div>
                  ) : item.photo_url ? (
                    <a
                      href={item.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      Lihat
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">-</span>
                  )}
                </td>
                <td className="p-2">
                  {editingId === item.id ? (
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded bg-slate-500 px-2 py-1 text-xs text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => startEdit(item)}
                        className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                      >
                        Edit
                      </button>
                      {item.status !== "completed" && item.status !== "approved" && (
                        <button
                          onClick={() => updateRepairStatus(item.id, "completed")}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Done
                        </button>
                      )}
                      {canApprove && item.status === "completed" && (
                        <button
                          onClick={() => updateRepairStatus(item.id, "approved")}
                          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Approve
                        </button>
                      )}
                      {canApprove && item.status === "approved" && (
                        <button
                          onClick={() => updateRepairStatus(item.id, "pending")}
                          className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Reject
                        </button>
                      )}
                      {item.status === "pending" && (
                        <button
                          onClick={() => {
                            if (confirm(`Tandai ${item.mcid} sebagai Dicopot? Device akan menjadi Nonaktif.`))
                              updateRepairStatus(item.id, "dicopot");
                          }}
                          className="rounded bg-slate-700 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Dicopot
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={12}>
                  Belum ada data error.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3">
      <p className="text-xs text-[var(--color-secondary)]">{title}</p>
      <p className="text-2xl font-bold text-[var(--color-primary)]">{value}</p>
    </div>
  );
}

function RepairStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    completed: "bg-emerald-100 text-emerald-800",
    approved: "bg-blue-100 text-blue-800",
    dicopot: "bg-slate-200 text-slate-700",
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
