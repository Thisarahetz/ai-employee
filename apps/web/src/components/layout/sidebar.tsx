"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  MessageSquare,
  FileText,
  Building2,
  Users,
  Smartphone,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  CalendarClock,
  Workflow,
  LayoutTemplate,
  Plug,
  MessageSquareReply,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useAiEmployeeApprovals } from "@/lib/hooks/use-ai-employees";
import { useSavedAnswers } from "@/lib/hooks/use-saved-answers";
import { useSoftwareRequired } from "@/components/integrations/software-required";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { ResponsiveSidebar } from "@/components/layout/mobile-nav";

const MAIN_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ai-employees", label: "AI Employees", icon: Bot },
  { href: "/command-center", label: "Command Center", icon: Sparkles },
  { href: "/automation", label: "Schedules & Limits", icon: CalendarClock },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/business-setup", label: "Business Setup", icon: LayoutTemplate },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/knowledge-base", label: "Business Info", icon: FileText },
  { href: "/saved-answers", label: "Saved Answers", icon: MessageSquareReply },
];

const BUSINESS_NAV_ITEMS = [
  { href: "/locations", label: "Locations", icon: Building2 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/channels", label: "Channels", icon: Smartphone },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const pendingApprovals = useAiEmployeeApprovals("PENDING");
  const pendingCount = pendingApprovals.data?.length || 0;
  const software = useSoftwareRequired();
  const unanswered = useSavedAnswers("SUGGESTED").data?.length ?? 0;

  const isSuperAdmin = user?.platformRole === "SUPER_ADMIN";
  const { t } = useI18n();

  return (
    <ResponsiveSidebar
      className="w-60 shrink-0 flex-col justify-between overflow-y-auto border-r border-line bg-white px-4 py-6"
      label={t("Main menu")}
      closeLabel={t("Close menu")}
    >
      <div>
        {/* Brand Header */}
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
            AI
          </span>
          <div>
            <span className="text-sm font-bold text-ink-primary block leading-none">
              AI Employee
            </span>
            <span className="text-[10px] text-ink-muted">Business OS</span>
          </div>
        </div>

        {/* Main Section */}
        <nav className="flex flex-col gap-1">
          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            {t("Main")}
          </div>

          {MAIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname?.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{t(item.label)}</span>
                </div>
                {item.href === "/ai-employees" && pendingCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-700 text-[9px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
                {item.href === "/saved-answers" && unanswered > 0 && (
                  <span
                    className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-700 px-1 text-[9px] font-bold text-white"
                    title={t("Questions to answer")}
                  >
                    {unanswered}
                  </span>
                )}
                {item.href === "/integrations" && software.required && (
                  <span className="rounded-full bg-amber-700 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    {t("Required")}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Business Section */}
          <div className="mt-4 mb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            {t("Business")}
          </div>

          {BUSINESS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Area */}
      <div>
        {isSuperAdmin && (
          <div className="mb-3 border-t border-line pt-3">
            <Link
              href="/admin"
              className="block rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-page hover:text-ink-primary"
            >
              {t("Platform Console")} →
            </Link>
          </div>
        )}

        <div className="px-2 pt-2 border-t border-line/60 flex items-center justify-between text-[11px] text-ink-muted">
          <span>AI Employee Platform</span>
          <span className="font-mono text-[10px]">v1.0</span>
        </div>
      </div>
    </ResponsiveSidebar>
  );
}
