"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthToken } from "@/lib/api";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  // Tunggu client-side hydration selesai (mencegah SSR mismatch)
  useEffect(() => {
    setHydrated(true);
  }, []);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (!hydrated) return;
    const token = getAuthToken();
    if (!token && !isAuthPage) {
      router.replace("/login");
    } else if (token && isAuthPage) {
      router.replace("/");
    }
  }, [hydrated, isAuthPage, router]);

  // Sebelum hydration: tampil spinner kecil
  if (!hydrated) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      </div>
    );
  }

  const token = getAuthToken();

  // Sedang redirect — tampil kosong sebentar
  if ((!token && !isAuthPage) || (token && isAuthPage)) {
    return null;
  }

  return <>{children}</>;
}
