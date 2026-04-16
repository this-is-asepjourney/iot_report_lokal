"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthUser, getAuthToken, loadCurrentUser, logout } from "@/lib/api";

const mainMenus = [
  { href: "/", label: "Dashboard" },
  { href: "/errors", label: "List Error" },
  { href: "/planning", label: "Planning" },
  { href: "/devices", label: "Device List" },
  { href: "/history", label: "Riwayat" },
];

const inputMenus = [
  { href: "/installations/new", label: "New Install" },
  { href: "/errors/new", label: "Input Error" },
];

const DESKTOP_BREAKPOINT = 1024;

const ROLE_BADGE: Record<string, string> = {
  admin:      "bg-rose-100 text-rose-700",
  supervisor: "bg-amber-100 text-amber-700",
  teknisi:    "bg-blue-100 text-blue-700",
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = Boolean(getAuthToken());
    setLoggedIn(token);
    setCurrentUser(token ? loadCurrentUser() : null);
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onResize() {
      if (typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onLogout() {
    logout();
    setLoggedIn(false);
    setCurrentUser(null);
    setMenuOpen(false);
    router.replace("/login");
  }

  function navLink(href: string, label: string, mobile = false) {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    const base = "block rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap";
    const active = "bg-[var(--color-primary)]/15 text-[var(--color-primary)]";
    const inactive =
      "text-[var(--color-primary)]/90 hover:bg-[var(--color-accent)]/25 hover:text-[var(--color-primary)]";
    const cls = mobile
      ? `${base} w-full text-left ${isActive ? active : inactive}`
      : `${base} ${isActive ? active : inactive}`;
    return (
      <Link key={href} href={href} className={cls}>
        {label}
      </Link>
    );
  }

  const allMenus = [
    ...mainMenus,
    ...inputMenus,
    ...(loggedIn ? [{ href: "/admin", label: "Akun" }] : []),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-secondary)]/60 bg-[var(--color-surface)]/98 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:px-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-md py-1.5 pr-3 text-base font-bold text-[var(--color-primary)] hover:opacity-80"
        >
          IoT Report
        </Link>

        {/* Desktop nav — visible at lg (1024px+) */}
        <div className="hidden lg:flex lg:flex-1 lg:items-center lg:gap-1">
          <div className="flex items-center gap-0.5">
            {mainMenus.map((m) => navLink(m.href, m.label))}
          </div>
          <span className="mx-1.5 h-4 w-px shrink-0 bg-[var(--color-secondary)]/40" aria-hidden />
          <div className="flex items-center gap-0.5">
            {inputMenus.map((m) => navLink(m.href, m.label))}
          </div>
        </div>

        {/* Desktop right actions */}
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {loggedIn && navLink("/admin", "Akun")}
          {loggedIn && currentUser && (
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--color-secondary)]/40 px-2.5 py-1">
              <span className="max-w-[100px] truncate text-xs font-medium text-[var(--color-primary)]">
                {currentUser.name}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[currentUser.role] ?? "bg-slate-100 text-slate-700"}`}>
                {currentUser.role}
              </span>
            </div>
          )}
          {loggedIn ? (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Login
            </Link>
          )}
        </div>

        {/* Mobile / tablet: hamburger — visible below lg */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[var(--color-primary)] hover:bg-[var(--color-accent)]/25"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
          >
            {menuOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile / tablet drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            aria-hidden
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed right-0 top-0 z-40 flex h-full w-[min(300px,88vw)] flex-col gap-1 border-l border-[var(--color-secondary)]/40 bg-[var(--color-surface)] p-4 shadow-xl lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-[var(--color-primary)]">IoT Report</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--color-accent)]/25"
                aria-label="Tutup"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {loggedIn && currentUser && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--color-accent)]/20 px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-sm font-bold text-[var(--color-primary)]">
                  {currentUser.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--color-primary)]">{currentUser.name}</p>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_BADGE[currentUser.role] ?? "bg-slate-100 text-slate-700"}`}>
                    {currentUser.role}
                  </span>
                </div>
              </div>
            )}
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)]">
              Menu
            </p>
            {allMenus.map((m) => navLink(m.href, m.label, true))}
            <span className="my-2 h-px bg-[var(--color-secondary)]/30" />
            {loggedIn ? (
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2.5 text-left text-sm font-medium text-white"
              >
                Logout
              </button>
            ) : (
              <Link
                href="/login"
                className="block rounded-md bg-[var(--color-primary)] px-3 py-2.5 text-center text-sm font-medium text-white"
                onClick={() => setMenuOpen(false)}
              >
                Login
              </Link>
            )}
          </div>
        </>
      )}
    </header>
  );
}
