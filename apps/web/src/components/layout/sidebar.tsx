"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/conversations", label: "Conversations" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/integrations", label: "Integrations" },
  { href: "/ai-configuration", label: "AI Configuration" },
  { href: "/workflows", label: "Workflows" },
  { href: "/team", label: "Team" },
];

const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Tenants" },
  { href: "/admin/users", label: "Platform Users" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  
  const isSuperAdmin = user && user.platformRole !== "NONE";
  const inAdminPanel = pathname?.startsWith("/admin");
  
  // Show only relevant items for the current view
  const navItems = inAdminPanel ? ADMIN_NAV_ITEMS : NAV_ITEMS;

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-6 sm:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white">
          AI
        </span>
        <span className="text-base font-semibold text-ink-primary">AI Employee</span>
      </div>
      
      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
          {inAdminPanel ? "Super Admin" : "Workspace"}
        </div>
        
        {navItems.map((item) => {
          const isActive = item.href === "/admin" 
            ? pathname === "/admin" 
            : (pathname === item.href || pathname?.startsWith(`${item.href}/`));
            
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-brand-50 text-brand-700" : "text-ink-secondary hover:bg-surface-page hover:text-ink-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Switcher for Super Admins to jump between views */}
      {isSuperAdmin && (
        <div className="mb-4 border-t border-line pt-4">
          <Link
            href={inAdminPanel ? "/dashboard" : "/admin"}
            className="block rounded-md px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-page hover:text-ink-primary"
          >
            {inAdminPanel ? "← Back to Workspace" : "→ Super Admin Panel"}
          </Link>
        </div>
      )}

      <p className="px-2 text-xs text-ink-muted">v0.1.0 — scaffold</p>
    </aside>
  );
}
