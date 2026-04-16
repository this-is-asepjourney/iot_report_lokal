"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPostFormData, AuthUser, Device, ErrorPayload, loadCurrentUser } from "@/lib/api";

const makeInitial = (): ErrorPayload => ({
  device: "",
  mcid: "",
  mac_address: "",
  factory: "",
  line: "",
  date: new Date().toISOString(),
  problem: "",
  action: "",
  technician_name: "",
  status: "pending",
});

export default function InputDeviceErrorPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<ErrorPayload>(makeInitial());
  const [currentUser, setCurrentUserState] = useState<AuthUser | null>(null);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const user = loadCurrentUser();
    setCurrentUserState(user);
    // Auto-set technician_name dari user yang login
    if (user?.name) {
      setForm((prev) => ({ ...prev, technician_name: user.name }));
    }
    apiGet<Device[]>("/devices/")
      .then(setDevices)
      .catch((err: Error) => setError(err.message));
  }, []);

  function applySelectedDevice(selected: Device) {
    setForm((prev) => ({
      ...prev,
      device: selected.id,
      mcid: selected.mcid,
      mac_address: selected.mac_address,
      factory: selected.factory,
      line: selected.line,
    }));
    setDeviceQuery(selected.mcid);
  }

  function onDeviceInputChange(value: string) {
    setDeviceQuery(value);
    const selected = devices.find(
      (item) => item.mcid.toLowerCase() === value.trim().toLowerCase()
    );
    if (selected) {
      applySelectedDevice(selected);
      return;
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (photoFile) {
        const formData = new FormData();
        if (form.device) formData.append("device", form.device);
        formData.append("mcid", form.mcid);
        formData.append("mac_address", form.mac_address);
        formData.append("factory", form.factory);
        formData.append("line", form.line);
        formData.append("date", form.date);
        formData.append("problem", form.problem);
        formData.append("action", form.action);
        formData.append("technician_name", form.technician_name);
        formData.append("status", form.status);
        formData.append("photo", photoFile);
        await apiPostFormData("/repairs/", formData);
      } else {
        const payload: Partial<ErrorPayload> = { ...form };
        if (!payload.device) delete payload.device;
        await apiPost("/repairs/", payload);
      }
      setMessage("Input device error berhasil disimpan.");
      setError("");
      const fresh = makeInitial();
      if (currentUser?.name) fresh.technician_name = currentUser.name;
      setForm(fresh);
      setDeviceQuery("");
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = "";
    } catch (err) {
      setError((err as Error).message);
      setMessage("");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">Input Device Error</h1>
      <p className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-primary)] sm:text-sm">
        MCID unik: jika MCID sudah ada, data device akan diperbarui dan repair pending (jika ada) akan di-update, bukan dibuat baru.
      </p>

      <form
        onSubmit={onSubmit}
        className="grid w-full max-w-xl gap-3 rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4"
      >
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--color-primary)]">Pilih Device</span>
          <input
            list="device-options"
            value={deviceQuery}
            onChange={(e) => onDeviceInputChange(e.target.value)}
            placeholder="Ketik MCID/Factory/Line untuk cari device"
            className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
          />
          <datalist id="device-options">
            {devices.map((item) => (
              <option key={item.id} value={item.mcid} />
            ))}
          </datalist>
        </label>

        <Input label="MCID" value={form.mcid} onChange={(v) => setForm((p) => ({ ...p, mcid: v }))} />
        <Input
          label="MAC Address Device"
          value={form.mac_address}
          onChange={(v) => setForm((p) => ({ ...p, mac_address: v }))}
          required={false}
        />
        <Input
          label="Factory"
          value={form.factory}
          onChange={(v) => setForm((p) => ({ ...p, factory: v }))}
        />
        <Input label="Line" value={form.line} onChange={(v) => setForm((p) => ({ ...p, line: v }))} />
        <Input
          label="Problem"
          value={form.problem}
          onChange={(v) => setForm((p) => ({ ...p, problem: v }))}
        />
        <Input
          label="Action"
          value={form.action}
          onChange={(v) => setForm((p) => ({ ...p, action: v }))}
        />
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--color-primary)]">Foto (opsional)</span>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="rounded border border-[var(--color-secondary)] p-2 text-sm"
          />
          {photoFile && (
            <span className="text-xs text-[var(--color-secondary)]">
              Terpilih: {photoFile.name}
            </span>
          )}
        </label>
        {/* Technician Name — read-only, diisi otomatis dari akun login */}
        <div className="grid gap-1 text-sm">
          <span className="text-[var(--color-primary)]">Teknisi</span>
          <div className="flex items-center gap-2 rounded border border-[var(--color-secondary)]/60 bg-[var(--color-accent)]/10 px-3 py-2 text-sm text-[var(--color-primary)]">
            <span className="font-medium">{form.technician_name || "—"}</span>
            <span className="ml-auto text-xs text-[var(--color-secondary)]">otomatis dari akun login</span>
          </div>
        </div>

        <button type="submit" className="min-h-[44px] rounded bg-[var(--color-primary)] p-3 text-white hover:opacity-90 sm:min-h-0">
          Simpan Error
        </button>
      </form>

      {message && <p className="rounded bg-emerald-50 p-3 text-emerald-700">{message}</p>}
      {error && <p className="rounded bg-rose-50 p-3 text-rose-700">{error}</p>}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-[var(--color-primary)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
        required={required}
      />
    </label>
  );
}
