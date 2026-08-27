"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Tenants", match: (p: string) => p === "/admin" || p.startsWith("/admin/tenants") },
  { href: "/admin/users", label: "Platform Users", match: (p: string) => p.startsWith("/admin/users") },
];

export function PlatformSidebar() {
  const pathname = usePathname() ?? "";
  const { memberships } = useAuth();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-6 sm:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white">
          AI
        </span>
        <span className="text-base font-semibold text-ink-primary">AI Employee</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Super Admin</div>

        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              item.match(pathname)
                ? "bg-brand-50 text-brand-700"
                : "text-ink-secondary hover:bg-surface-page hover:text-ink-primary",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {memberships.length > 0 && (
        <div className="mb-4 border-t border-line pt-4">
          <Link
            href="/dashboard"
            className="block rounded-md px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-page hover:text-ink-primary"
          >
            ← Exit to workspace
          </Link>
        </div>
      )}

      <p className="px-2 text-xs text-ink-muted">Platform console</p>
    </aside>
  );
}
