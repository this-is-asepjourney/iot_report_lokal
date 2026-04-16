"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { apiGet, apiPatch, apiPostFormData, Repair } from "@/lib/api";

const PLANNING_STORAGE_KEY = "iot_planning_repair_ids";

type SortKey = "line" | "date" | "factory" | "mcid";
type SortDir = "asc" | "desc";

function sortRepairs(list: Repair[], key: SortKey, dir: SortDir): Repair[] {
  return [...list].sort((a, b) => {
    let va: string | number = a[key] as string;
    let vb: string | number = b[key] as string;
    if (key === "date") {
      va = new Date(a.date).getTime();
      vb = new Date(b.date).getTime();
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortChip({
  label,
  sortKey,
  current,
  dir,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-[var(--color-secondary)]/50 bg-white text-[var(--color-secondary)] hover:border-[var(--color-primary)]/60 hover:text-[var(--color-primary)]"
      }`}
    >
      {label}
      {active ? (dir === "asc" ? " ↑" : " ↓") : " ↕"}
    </button>
  );
}

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getStoredPlanIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PLANNING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function setStoredPlanIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(ids));
}

export default function PlanningPage() {
  const [pendingRepairs, setPendingRepairs] = useState<Repair[]>([]);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [factoryFilter, setFactoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [importingHtml, setImportingHtml] = useState(false);
  const importHtmlInputRef = useRef<HTMLInputElement>(null);

  // Sort state — Rencana Pengerjaan
  const [planSortKey, setPlanSortKey] = useState<SortKey>("line");
  const [planSortDir, setPlanSortDir] = useState<SortDir>("asc");

  // Sort state — List Pending
  const [pendingSortKey, setPendingSortKey] = useState<SortKey>("date");
  const [pendingSortDir, setPendingSortDir] = useState<SortDir>("desc");

  const loadPending = useCallback(async () => {
    try {
      const data = await apiGet<Repair[]>("/repairs/?done=belum");
      setPendingRepairs(data);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPlanIds(getStoredPlanIds());
    loadPending();
  }, [loadPending]);

  const factories = useMemo(
    () => Array.from(new Set(pendingRepairs.map((r) => r.factory))).sort(),
    [pendingRepairs]
  );

  const matchFactory = useCallback(
    (r: Repair) => !factoryFilter || r.factory === factoryFilter,
    [factoryFilter]
  );

  const plannedRepairs = useMemo(
    () =>
      sortRepairs(
        planIds
          .map((id) => pendingRepairs.find((r) => r.id === id))
          .filter((r): r is Repair => r != null)
          .filter(matchFactory),
        planSortKey,
        planSortDir,
      ),
    [planIds, pendingRepairs, matchFactory, planSortKey, planSortDir],
  );

  const notInPlan = useMemo(
    () =>
      sortRepairs(
        pendingRepairs.filter((r) => !planIds.includes(r.id)).filter(matchFactory),
        pendingSortKey,
        pendingSortDir,
      ),
    [pendingRepairs, planIds, matchFactory, pendingSortKey, pendingSortDir],
  );

  function togglePlanSort(key: SortKey) {
    if (planSortKey === key) setPlanSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setPlanSortKey(key); setPlanSortDir("asc"); }
  }

  function togglePendingSort(key: SortKey) {
    if (pendingSortKey === key) setPendingSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setPendingSortKey(key); setPendingSortDir("asc"); }
  }

  function toggleCheck(repairId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(repairId)) next.delete(repairId);
      else next.add(repairId);
      return next;
    });
  }

  function toggleCheckAll() {
    if (checkedIds.size === notInPlan.length && notInPlan.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(notInPlan.map((r) => r.id)));
    }
  }

  function addCheckedToPlan() {
    if (checkedIds.size === 0) return;
    const toAdd = Array.from(checkedIds).filter((id) => !planIds.includes(id));
    if (toAdd.length === 0) return;
    const next = [...planIds, ...toAdd];
    setPlanIds(next);
    setStoredPlanIds(next);
    setCheckedIds(new Set());
    setInfo(`${toAdd.length} item ditambahkan ke rencana.`);
    setTimeout(() => setInfo(""), 2500);
  }

  function addToPlan(repairId: string) {
    if (planIds.includes(repairId)) return;
    const next = [...planIds, repairId];
    setPlanIds(next);
    setStoredPlanIds(next);
    setInfo("Ditambahkan ke rencana.");
    setTimeout(() => setInfo(""), 2000);
  }

  function removeFromPlan(repairId: string) {
    const next = planIds.filter((id) => id !== repairId);
    setPlanIds(next);
    setStoredPlanIds(next);
    setInfo("Dihapus dari rencana.");
    setTimeout(() => setInfo(""), 2000);
  }

  function moveInPlan(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= plannedRepairs.length) return;
    const idA = plannedRepairs[index].id;
    const idB = plannedRepairs[newIndex].id;
    const posA = planIds.indexOf(idA);
    const posB = planIds.indexOf(idB);
    const next = [...planIds];
    [next[posA], next[posB]] = [next[posB], next[posA]];
    setPlanIds(next);
    setStoredPlanIds(next);
  }

  async function markCompleted(repairId: string) {
    try {
      await apiPatch(`/repairs/${repairId}/`, { status: "completed" });
      removeFromPlan(repairId);
      await loadPending();
      setInfo("Repair ditandai selesai.");
      setTimeout(() => setInfo(""), 3000);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function exportPlanningCsv() {
    const headers = [
      "No",
      "MCID",
      "Factory",
      "Line",
      "Problem",
      "Action",
      "Teknisi",
      "Status",
      "Tanggal",
      "Photo URL",
    ];
    const rows = plannedRepairs.map((r, i) => [
      i + 1,
      r.mcid,
      r.factory,
      r.line,
      r.problem,
      r.action ?? "",
      r.technician_name,
      r.status,
      new Date(r.date).toLocaleString("id-ID"),
      r.photo_url ?? "",
    ]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map(escapeCsvCell).join(",")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `rencana-pengerjaan-${date}.csv`);
    setInfo("Rencana berhasil diekspor (CSV).");
    setTimeout(() => setInfo(""), 2500);
  }

  function exportPlanningJson() {
    const data = plannedRepairs.map((r, i) => ({
      no: i + 1,
      mcid: r.mcid,
      factory: r.factory,
      line: r.line,
      problem: r.problem,
      action: r.action ?? "",
      technician_name: r.technician_name,
      status: r.status,
      date: r.date,
      photo_url: r.photo_url ?? null,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `rencana-pengerjaan-${date}.json`);
    setInfo("Rencana berhasil diekspor (JSON).");
    setTimeout(() => setInfo(""), 2500);
  }

  function exportPlanningExcel() {
    const headers = [
      "No",
      "MCID",
      "Factory",
      "Line",
      "Problem",
      "Action",
      "Teknisi",
      "Status",
      "Tanggal",
      "Photo URL",
    ];
    const rows = plannedRepairs.map((r, i) => [
      i + 1,
      r.mcid,
      r.factory,
      r.line,
      r.problem,
      r.action ?? "",
      r.technician_name,
      r.status,
      new Date(r.date).toLocaleString("id-ID"),
      r.photo_url ?? "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 42 },
      { wch: 42 },
      { wch: 18 },
      { wch: 10 },
      { wch: 20 },
      { wch: 36 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rencana Pengerjaan");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `rencana-pengerjaan-${date}.xlsx`);
    setInfo("Rencana berhasil diekspor (Excel).");
    setTimeout(() => setInfo(""), 2500);
  }

  function exportPlanningHtml() {
    const date = new Date().toISOString().slice(0, 10);
    const title = `Rencana Pengerjaan - ${date}`;
    const syncPayload = {
      version: 1 as const,
      exported_at: new Date().toISOString(),
      checked_ids: [] as string[],
      repairs: plannedRepairs.map((r) => ({ id: r.id, mcid: r.mcid })),
    };
    const syncJson = JSON.stringify(syncPayload).replace(/</g, "\\u003c");
    const cards = plannedRepairs
      .map(
        (r, i) => `
    <article class="card">
      <div class="card-num">${i + 1}</div>
      <div class="card-body">
        <label class="done-row">
          <input type="checkbox" class="plan-cb" data-repair-id="${escapeHtml(r.id)}" />
          <span class="done-label">Sudah diperbaiki</span>
        </label>
        <h3 class="mcid">${escapeHtml(r.mcid)}</h3>
        <p class="meta">${escapeHtml(r.factory)} / ${escapeHtml(r.line)}</p>
        <p class="label">Problem:</p>
        <p class="value">${escapeHtml(r.problem)}</p>
        <p class="label">Action:</p>
        <p class="value">${escapeHtml(r.action || "-")}</p>
        <p class="meta">Teknisi: ${escapeHtml(r.technician_name)} · ${escapeHtml(r.status)}</p>
        <p class="meta">Tanggal: ${escapeHtml(new Date(r.date).toLocaleString("id-ID"))}</p>
        ${r.photo_url ? `<a href="${escapeHtml(r.photo_url)}" class="photo-link" target="_blank" rel="noopener">Lihat Foto</a>` : ""}
      </div>
    </article>`
      )
      .join("");
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; color: #333; font-size: 16px; line-height: 1.5; -webkit-text-size-adjust: 100%; }
    h1 { font-size: 1.35rem; margin: 0 0 16px; color: #274b63; }
    .hint { margin: 0 0 16px; color: #666; font-size: 0.9rem; }
    .card { background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; gap: 12px; align-items: flex-start; }
    .card-num { width: 32px; height: 32px; min-width: 32px; background: #4682a9; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; }
    .card-body { flex: 1; min-width: 0; }
    .done-row { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; padding: 8px 10px; background: #f0f7fb; border-radius: 8px; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent; }
    .done-row input { width: 22px; height: 22px; accent-color: #2e7d32; flex-shrink: 0; }
    .done-label { font-weight: 600; color: #274b63; font-size: 0.95rem; }
    .mcid { font-size: 1.15rem; font-weight: 700; margin: 0 0 4px; color: #274b63; word-break: break-word; }
    .meta { font-size: 0.9rem; color: #666; margin: 4px 0; }
    .label { font-size: 0.85rem; font-weight: 600; color: #555; margin: 8px 0 2px; }
    .value { margin: 0; word-break: break-word; white-space: pre-wrap; }
    .photo-link { display: inline-block; margin-top: 6px; color: #4682a9; font-weight: 600; text-decoration: none; }
    .photo-link:active { opacity: 0.8; }
    .save-bar { position: sticky; top: 0; z-index: 10; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .btn-save { width: 100%; padding: 14px 16px; font-size: 1rem; font-weight: 700; color: #fff; background: #2e7d32; border: none; border-radius: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
    .btn-save:active { opacity: 0.92; }
    .save-hint { display: block; margin-top: 10px; font-size: 0.8rem; color: #1b5e20; line-height: 1.4; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="hint">${plannedRepairs.length} item · Centang &quot;Sudah diperbaiki&quot;, lalu tekan <strong>Simpan ke file</strong> (offline). Unggah file hasil simpan ke aplikasi Planning saat sudah online.</p>
  <div class="save-bar" role="region" aria-label="Simpan progres offline">
    <button type="button" id="iot-planning-save-btn" class="btn-save">Simpan ke file (unduh ulang HTML)</button>
    <span class="save-hint">Menyimpan semua centangan ke file HTML baru di folder Unduhan. Gunakan file itu untuk import — bukan file lama sebelum disimpan.</span>
  </div>
  <script type="application/json" id="iot-planning-sync">${syncJson}</script>
${cards || "<p>Tidak ada data rencana.</p>"}
  <script>
(function(){'use strict';
var el=document.getElementById('iot-planning-sync');
if(!el)return;
function parse(){try{return JSON.parse(el.textContent||'{}');}catch(e){return{checked_ids:[]};}
}
function write(o){el.textContent=JSON.stringify(o).replace(/</g,'\\u003c');}
function syncPayloadFromDom(){
var p=parse();
var ids=[];
document.querySelectorAll('input.plan-cb[data-repair-id]').forEach(function(cb){
if(cb.checked)ids.push(cb.getAttribute('data-repair-id'));
});
p.checked_ids=ids;
p.saved_offline_at=new Date().toISOString();
write(p);
}
function downloadSavedHtml(){
syncPayloadFromDom();
var html='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;
var blob=new Blob([html],{type:'text/html;charset=utf-8'});
var a=document.createElement('a');
var url=URL.createObjectURL(blob);
a.href=url;
a.download='rencana-pengerjaan-simpan-'+Date.now()+'.html';
document.body.appendChild(a);
a.click();
a.remove();
setTimeout(function(){URL.revokeObjectURL(url);},0);
}
document.querySelectorAll('input.plan-cb[data-repair-id]').forEach(function(cb){
cb.addEventListener('change',function(){
var p=parse();
if(!p.checked_ids)p.checked_ids=[];
var id=cb.getAttribute('data-repair-id');
var set=new Set(p.checked_ids);
if(cb.checked)set.add(id);else set.delete(id);
p.checked_ids=Array.from(set);
write(p);
});
});
var saveBtn=document.getElementById('iot-planning-save-btn');
if(saveBtn)saveBtn.addEventListener('click',downloadSavedHtml);
})();
  </script>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, `rencana-pengerjaan-${date}.html`);
    setInfo("HTML diekspor. Di HP: centang selesai, lalu gunakan tombol “Simpan ke file (unduh ulang HTML)” sebelum import.");
    setTimeout(() => setInfo(""), 2500);
  }

  async function importPlanningHtml(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportingHtml(true);
    setError("");
    setInfo("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiPostFormData<{
        updated: number;
        skipped: number;
        detail?: string;
        errors?: Array<{ id: string; reason: string }>;
      }>("/planning/import-html/", formData);
      if (res.updated === 0 && res.detail) {
        setInfo(res.detail);
      } else {
        const parts = [`${res.updated} repair ditandai selesai.`];
        if (res.skipped > 0) parts.push(`${res.skipped} dilewati.`);
        setInfo(parts.join(" "));
      }
      if (res.errors && res.errors.length > 0) {
        const sample = res.errors.slice(0, 3).map((e) => `${e.id}: ${e.reason}`).join("; ");
        setError(`Sebagian gagal: ${sample}${res.errors.length > 3 ? "…" : ""}`);
      }
      await loadPending();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportingHtml(false);
      event.target.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[var(--color-secondary)]">Memuat data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">
          Planning Pengerjaan Mesin
        </h1>
        <p className="mt-1 text-xs text-[var(--color-primary)]/80 sm:text-sm">
          Pilih mesin dari list error yang akan dikerjakan atau diselesaikan. Urutan bisa diatur.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}
      {info && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{info}</p>
      )}

      <div className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4">
        <label className="mb-2 block text-sm font-medium text-[var(--color-primary)]">
          Filter Factory
        </label>
        <select
          value={factoryFilter}
          onChange={(e) => setFactoryFilter(e.target.value)}
          className="min-h-[44px] w-full max-w-xs rounded border border-[var(--color-secondary)] bg-white p-2 text-base sm:min-h-0"
        >
          <option value="">Semua Factory</option>
          {factories.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rencana pengerjaan */}
        <section className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4">
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-[var(--color-primary)]">
                Rencana Pengerjaan ({plannedRepairs.length})
              </h2>
            </div>

            {/* Sort bar — Rencana */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--color-secondary)]">Urut:</span>
              <SortChip label="Line"    sortKey="line"    current={planSortKey} dir={planSortDir} onToggle={togglePlanSort} />
              <SortChip label="Tanggal" sortKey="date"    current={planSortKey} dir={planSortDir} onToggle={togglePlanSort} />
              <SortChip label="Factory" sortKey="factory" current={planSortKey} dir={planSortDir} onToggle={togglePlanSort} />
              <SortChip label="MCID"    sortKey="mcid"    current={planSortKey} dir={planSortDir} onToggle={togglePlanSort} />
            </div>

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                ref={importHtmlInputRef}
                type="file"
                accept=".html,text/html"
                className="hidden"
                onChange={importPlanningHtml}
              />
              <button
                type="button"
                disabled={importingHtml}
                onClick={() => importHtmlInputRef.current?.click()}
                className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                {importingHtml ? "Mengimpor…" : "Import HTML (hasil HP)"}
              </button>
              <span className="text-xs text-[var(--color-secondary)]">
                Unggah file HTML yang sudah dicentang di HP untuk update status error.
              </span>
            </div>
            {plannedRepairs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportPlanningExcel}
                  className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={exportPlanningHtml}
                  className="rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Export HTML (untuk HP)
                </button>
                <button
                  type="button"
                  onClick={exportPlanningCsv}
                  className="rounded border border-[var(--color-secondary)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-accent)]/20"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={exportPlanningJson}
                  className="rounded border border-[var(--color-secondary)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-accent)]/20"
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>
          {plannedRepairs.length === 0 ? (
            <p className="text-sm text-[var(--color-secondary)]">
              Belum ada mesin di rencana. Tambahkan dari daftar error di samping.
            </p>
          ) : (
            <ul className="space-y-2">
              {plannedRepairs.map((repair, index) => (
                <li
                  key={repair.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-secondary)]/50 bg-[var(--color-background)]/50 p-3"
                >
                  <span className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/20 text-xs font-semibold text-[var(--color-primary)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--color-primary)]">{repair.mcid}</p>
                    <p className="truncate text-xs text-[var(--color-secondary)]">
                      {repair.factory} / {repair.line} · {repair.problem.slice(0, 50)}
                      {repair.problem.length > 50 ? "…" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveInPlan(index, "up")}
                      disabled={index === 0}
                      className="rounded p-1.5 text-[var(--color-primary)] hover:bg-[var(--color-accent)]/30 disabled:opacity-40"
                      aria-label="Pindah ke atas"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => moveInPlan(index, "down")}
                      disabled={index === plannedRepairs.length - 1}
                      className="rounded p-1.5 text-[var(--color-primary)] hover:bg-[var(--color-accent)]/30 disabled:opacity-40"
                      aria-label="Pindah ke bawah"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => markCompleted(repair.id)}
                      className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    >
                      Selesai
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromPlan(repair.id)}
                      className="rounded bg-slate-500 px-2 py-1 text-xs text-white hover:opacity-90"
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Daftar error (belum di rencana) */}
        <section className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4">
          <h2 className="mb-1 font-semibold text-[var(--color-primary)]">
            List Error Device (Pending) — pilih untuk rencana
          </h2>
          <p className="mb-2 text-xs text-[var(--color-secondary)]">
            Data dari <Link href="/errors" className="underline hover:opacity-80">List Error</Link> dengan status belum.
          </p>

          {/* Sort bar — List Pending */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--color-secondary)]">Urut:</span>
            <SortChip label="Line"    sortKey="line"    current={pendingSortKey} dir={pendingSortDir} onToggle={togglePendingSort} />
            <SortChip label="Tanggal" sortKey="date"    current={pendingSortKey} dir={pendingSortDir} onToggle={togglePendingSort} />
            <SortChip label="Factory" sortKey="factory" current={pendingSortKey} dir={pendingSortDir} onToggle={togglePendingSort} />
            <SortChip label="MCID"    sortKey="mcid"    current={pendingSortKey} dir={pendingSortDir} onToggle={togglePendingSort} />
          </div>

          {notInPlan.length === 0 ? (
            <p className="text-sm text-[var(--color-secondary)]">
              Semua error pending sudah ada di rencana, atau tidak ada data pending.
            </p>
          ) : (
            <>
              {/* Toolbar checklist */}
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-secondary)]/40 bg-[var(--color-background)]/60 px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-primary)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
                    checked={checkedIds.size === notInPlan.length && notInPlan.length > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < notInPlan.length;
                    }}
                    onChange={toggleCheckAll}
                  />
                  {checkedIds.size === 0
                    ? "Pilih Semua"
                    : checkedIds.size === notInPlan.length
                    ? "Batal Pilih Semua"
                    : `${checkedIds.size} dipilih`}
                </label>
                {checkedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={addCheckedToPlan}
                    className="ml-auto rounded bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    + Tambah {checkedIds.size} ke Rencana
                  </button>
                )}
              </div>

              <ul className="max-h-[420px] space-y-2 overflow-y-auto">
                {notInPlan.map((repair) => {
                  const isChecked = checkedIds.has(repair.id);
                  return (
                    <li
                      key={repair.id}
                      onClick={() => toggleCheck(repair.id)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        isChecked
                          ? "border-[var(--color-primary)]/60 bg-[var(--color-primary)]/8"
                          : "border-[var(--color-secondary)]/50 bg-[var(--color-background)]/50 hover:bg-[var(--color-accent)]/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-primary)]"
                        checked={isChecked}
                        onChange={() => toggleCheck(repair.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--color-primary)]">{repair.mcid}</p>
                        <p className="text-xs text-[var(--color-secondary)]">
                          {repair.factory} / {repair.line}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-secondary)]">
                          {repair.problem.slice(0, 60)}
                          {repair.problem.length > 60 ? "…" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToPlan(repair.id);
                        }}
                        className="shrink-0 rounded bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        + Rencanakan
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      <p className="text-xs text-[var(--color-secondary)]">
        Rencana disimpan di perangkat ini (localStorage). <strong>Export HTML (untuk HP)</strong> menyertakan checkbox &quot;Sudah diperbaiki&quot;, tombol <strong>Simpan ke file (unduh ulang HTML)</strong> untuk menyimpan progres offline, lalu unggah file hasil simpan lewat <strong>Import HTML (hasil HP)</strong>. Alternatif: <strong>Export Excel</strong> / CSV / JSON; tombol &quot;Selesai&quot; pada kartu menutup repair tanpa file.
      </p>
    </div>
  );
}
