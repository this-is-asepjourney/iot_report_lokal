"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await login({ email, password });
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-xl border border-[var(--color-secondary)] bg-[var(--color-surface)] p-4 sm:mt-10 sm:p-5">
      <h1 className="mb-4 text-xl font-bold text-[var(--color-primary)] sm:text-2xl">Login</h1>
      <form onSubmit={onSubmit} className="grid gap-3">
        <input
          className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0 disabled:opacity-60"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          autoComplete="email"
        />
        <input
          className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0 disabled:opacity-60"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={loading}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded bg-[var(--color-primary)] p-3 text-white disabled:opacity-70 sm:min-h-0"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Memproses...
            </>
          ) : (
            "Masuk"
          )}
        </button>
      </form>
      {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      <p className="mt-4 text-sm text-[var(--color-primary)]">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold underline">
          Daftar
        </Link>
      </p>
    </div>
  );
}
