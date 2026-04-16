"use client";

import { useEffect, useState } from "react";
import { apiGet, API_BASE_URL, AuthUser, logout } from "@/lib/api";
import { useRouter } from "next/navigation";

const BACKEND_ADMIN_URL = API_BASE_URL.replace(/\/api\/?$/, "/admin/");

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  teknisi: "Teknisi",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-rose-100 text-rose-800",
  supervisor: "bg-amber-100 text-amber-800",
  teknisi: "bg-blue-100 text-blue-800",
};

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<AuthUser>("/auth/me/")
      .then(setMe)
      .catch((err: Error) => setError(err.message));
  }, []);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 py-4">
      <h1 className="text-xl font-bold text-[var(--color-primary)] sm:text-2xl">Akun Saya</h1>

      {error && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      )}

      {/* Info Akun */}
      <div className="rounded-xl border border-[var(--color-secondary)] bg-[var(--color-surface)] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xl font-bold text-[var(--color-primary)]">
            {me?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="font-semibold text-[var(--color-primary)]">
              {me?.name ?? <span className="text-slate-400">Memuat...</span>}
            </p>
            <p className="text-sm text-[var(--color-secondary)]">{me?.email ?? ""}</p>
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--color-secondary)]/40 pt-4">
          <InfoRow label="Role">
            {me ? (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLOR[me.role] ?? "bg-slate-100 text-slate-700"}`}>
                {ROLE_LABEL[me.role] ?? me.role}
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </InfoRow>

          <InfoRow label="Factory Access">
            {me && me.factory_access.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {me.factory_access.map((f) => (
                  <span key={f} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                    {f}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-[var(--color-secondary)]">Semua factory</span>
            )}
          </InfoRow>

          <InfoRow label="Bergabung">
            <span className="text-sm text-[var(--color-secondary)]">
              {me ? new Date(me.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—"}
            </span>
          </InfoRow>
        </div>
      </div>

      {/* Link ke Backend Admin */}
      {me?.role === "admin" && (
        <div className="rounded-xl border border-[var(--color-secondary)] bg-[var(--color-surface)] p-4 sm:p-5">
          <h2 className="mb-1 font-semibold text-[var(--color-primary)]">Panel Administrasi</h2>
          <p className="mb-3 text-xs text-[var(--color-secondary)]">
            Kelola data lengkap — user, device, repair, installation, import/export — melalui panel admin backend.
          </p>
          <a
            href={BACKEND_ADMIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Buka Admin Panel
          </a>
          <p className="mt-2 text-xs text-[var(--color-secondary)]">
            Login dengan email & password akun ini di panel admin.
          </p>
        </div>
      )}

      {/* Logout */}
      <div className="rounded-xl border border-[var(--color-secondary)] bg-[var(--color-surface)] p-4 sm:p-5">
        <h2 className="mb-1 font-semibold text-[var(--color-primary)]">Sesi</h2>
        <p className="mb-3 text-xs text-[var(--color-secondary)]">Keluar dari aplikasi pada perangkat ini.</p>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-28 shrink-0 text-xs font-medium text-[var(--color-secondary)]">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
