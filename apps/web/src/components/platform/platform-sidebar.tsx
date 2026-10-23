"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bot,
  Building2,
  CreditCard,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { ResponsiveSidebar } from "@/components/layout/mobile-nav";

interface NavGroup {
  title: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    match: (pathname: string) => boolean;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Platform",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        match: (p: string) => p === "/admin",
      },
    ],
  },
  {
    title: "Tenants & Users",
    items: [
      {
        href: "/admin/tenants",
        label: "Businesses",
        icon: Building2,
        match: (p: string) => p.startsWith("/admin/tenants"),
      },
      {
        href: "/admin/users",
        label: "Platform Users",
        icon: Users,
        match: (p: string) => p.startsWith("/admin/users"),
      },
    ],
  },
  {
    title: "AI Management",
    items: [
      {
        href: "/admin/ai-employees",
        label: "AI Employees",
        icon: Bot,
        match: (p: string) => p.startsWith("/admin/ai-employees"),
      },
      {
        href: "/admin/ai-templates",
        label: "AI Templates",
        icon: Sparkles,
        match: (p: string) => p.startsWith("/admin/ai-templates"),
      },
      {
        href: "/admin/business-types",
        label: "Business Types",
        icon: Layers,
        match: (p: string) => p.startsWith("/admin/business-types"),
      },
    ],
  },
  {
    title: "Plans & Usage",
    items: [
      {
        href: "/admin/plans",
        label: "Subscriptions",
        icon: CreditCard,
        match: (p: string) => p.startsWith("/admin/plans"),
      },
      {
        href: "/admin/usage",
        label: "Platform Usage",
        icon: BarChart3,
        match: (p: string) => p.startsWith("/admin/usage"),
      },
    ],
  },
  {
    title: "Operations & Security",
    items: [
      {
        href: "/admin/health",
        label: "System Health",
        icon: Activity,
        match: (p: string) => p.startsWith("/admin/health"),
      },
      {
        href: "/admin/audit",
        label: "Audit Logs",
        icon: ShieldCheck,
        match: (p: string) => p.startsWith("/admin/audit"),
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings,
        match: (p: string) => p.startsWith("/admin/settings"),
      },
    ],
  },
];

export function PlatformSidebar() {
  const pathname = usePathname() ?? "";
  const { memberships } = useAuth();

  return (
    <ResponsiveSidebar className="w-64 shrink-0 flex-col border-r border-line bg-white px-4 py-5" label="Admin menu">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white shadow-sm">
          AI
        </span>
        <div>
          <span className="text-sm font-semibold tracking-tight text-ink-primary block leading-tight">AI Employee</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
            Super Admin
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto pr-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700 font-semibold shadow-xs"
                      : "text-ink-secondary hover:bg-surface-page hover:text-ink-primary",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand-600" : "text-ink-muted")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-line pt-4 space-y-2">
        {memberships.length > 0 && (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-page hover:text-ink-primary"
          >
            <ArrowLeft className="h-4 w-4 text-ink-muted" />
            <span>Exit to workspace</span>
          </Link>
        )}
        <div className="px-2 pt-1 flex items-center justify-between text-[11px] text-ink-muted">
          <span>Platform v1.2</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
            Online
          </span>
        </div>
      </div>
    </ResponsiveSidebar>
  );
}

