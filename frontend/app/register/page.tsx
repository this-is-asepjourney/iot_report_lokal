"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { register } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await register({ name, email, password, role: "teknisi", factory_access: [] });
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-xl border border-[var(--color-secondary)] bg-[var(--color-surface)] p-4 sm:mt-10 sm:p-5">
      <h1 className="mb-4 text-xl font-bold text-[var(--color-primary)] sm:text-2xl">Register</h1>
      <form onSubmit={onSubmit} className="grid gap-3">
        <input
          className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
          placeholder="Nama"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="min-h-[44px] rounded border border-[var(--color-secondary)] p-2 text-base sm:min-h-0"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="min-h-[44px] rounded bg-[var(--color-primary)] p-3 text-white sm:min-h-0">Daftar</button>
      </form>
      {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      <p className="mt-4 text-sm text-[var(--color-primary)]">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold underline">
          Login
        </Link>
      </p>
    </div>
  );
}
