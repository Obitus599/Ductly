"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/admin/bookings",
    label: "Bookings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/admin/customers",
    label: "Customers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: "/admin/teams",
    label: "Teams",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    href: "/admin/feedback",
    label: "Reviews",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    href: "/admin/contacts",
    label: "Inbox",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    href: "/admin/errors",
    label: "Error Log",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    href: "/admin/calendar",
    label: "Calendar",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="10" y1="14" x2="10" y2="18" />
        <line x1="14" y1="14" x2="14" y2="18" />
      </svg>
    ),
  },
  {
    href: "/admin/revenue",
    label: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/admin/travel",
    label: "Travel Calc",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Login page — render without sidebar/topbar
  if (pathname === "/admin/login") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "rgb(247,248,250)" }}>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "rgb(247,248,250)" }}>
      {/* Sidebar */}
      <aside
        className="w-[240px] shrink-0 flex flex-col border-r"
        style={{
          background: "white",
          borderColor: "rgb(238,240,244)",
        }}
      >
        {/* Logo */}
        <Link
          href="/admin"
          className="flex items-center justify-between px-6 h-[64px] border-b"
          style={{ borderColor: "rgb(238,240,244)" }}
        >
          <Image
            src="/images/logo.png"
            alt="DUCTly"
            width={130}
            height={40}
            className="h-[40px] w-auto object-contain"
          />
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{
              background: "rgb(240,252,252)",
              color: "rgb(80,160,160)",
              fontFamily: "var(--font-badge)",
            }}
          >
            Admin
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14px] font-medium transition-all"
                style={{
                  fontFamily: "var(--font-body)",
                  background: active
                    ? "linear-gradient(135deg, rgba(147,216,216,0.12), rgba(149,207,140,0.12))"
                    : "transparent",
                  color: active ? "rgb(60,140,130)" : "rgb(130,135,145)",
                }}
              >
                <span style={{ opacity: active ? 1 : 0.55 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t space-y-3"
          style={{ borderColor: "rgb(238,240,244)" }}
        >
          <Link
            href="/"
            className="flex items-center gap-2 text-[13px] transition-colors hover:opacity-80"
            style={{
              fontFamily: "var(--font-body)",
              color: "rgb(160,165,175)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back to site
          </Link>
          <button
            type="button"
            onClick={() => {
              fetch("/api/admin/auth", { method: "DELETE" }).then(() => {
                window.location.href = "/admin/login";
              });
            }}
            className="flex items-center gap-2 text-[13px] transition-colors hover:opacity-80 w-full"
            style={{
              fontFamily: "var(--font-body)",
              color: "rgb(200,160,160)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="h-[64px] flex items-center justify-between px-8 border-b shrink-0"
          style={{
            background: "white",
            borderColor: "rgb(238,240,244)",
          }}
        >
          <h1
            className="text-[18px] font-normal tracking-[-0.03em]"
            style={{
              fontFamily: "var(--font-heading)",
              color: "rgb(61,61,61)",
            }}
          >
            {NAV_ITEMS.find(
              (n) =>
                n.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(n.href)
            )?.label ?? "Admin"}
          </h1>
          <div
            className="flex items-center gap-2 text-[13px]"
            style={{
              fontFamily: "var(--font-body)",
              color: "rgb(160,165,175)",
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-medium"
              style={{
                background:
                  "linear-gradient(135deg, rgb(147,216,216), rgb(149,207,140))",
                color: "white",
                fontFamily: "var(--font-badge)",
              }}
            >
              A
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
