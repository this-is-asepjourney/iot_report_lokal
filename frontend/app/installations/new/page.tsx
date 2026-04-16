"use client";

import { FormEvent, useState } from "react";
import { apiPost, InstallationPayload } from "@/lib/api";
import QrScanInput from "@/components/qr-scan-input";

export default function NewInstallationPage() {
  const [form, setForm] = useState<InstallationPayload>({
    mcid: "",
    mac_address: "",
    factory: "",
    line: "",
    date_install: new Date().toISOString(),
    technician: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiPost("/installations/", form);
      setMessage("Data pemasangan baru berhasil disimpan.");
      setError("");
      setForm({
        mcid: "",
        mac_address: "",
        factory: "",
        line: "",
        date_install: new Date().toISOString(),
        technician: "",
      });
    } catch (err) {
      setError((err as Error).message);
      setMessage("");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">New Installation</h1>

      <form
        onSubmit={onSubmit}
        className="grid w-full max-w-xl gap-3 rounded-lg border border-[var(--color-secondary)] bg-[var(--color-surface)] p-3 sm:p-4"
      >
        <QrScanInput
          label="MCID"
          value={form.mcid}
          onChange={(value) => setForm((prev) => ({ ...prev, mcid: value }))}
          placeholder="MCID / scan QR"
        />
        <QrScanInput
          label="MAC Address Device"
          value={form.mac_address}
          onChange={(value) => setForm((prev) => ({ ...prev, mac_address: value }))}
          placeholder="MAC Address / scan QR"
        />
        <Input
          label="Factory"
          value={form.factory}
          onChange={(value) => setForm((prev) => ({ ...prev, factory: value }))}
        />
        <Input
          label="Line"
          value={form.line}
          onChange={(value) => setForm((prev) => ({ ...prev, line: value }))}
        />
        <Input
          label="Technician"
          value={form.technician}
          onChange={(value) => setForm((prev) => ({ ...prev, technician: value }))}
        />

        <button type="submit" className="min-h-[44px] rounded bg-[var(--color-primary)] p-3 text-white hover:opacity-90 sm:min-h-0">
          Simpan Installation
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-[var(--color-primary)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
        required
      />
    </label>
  );
}
