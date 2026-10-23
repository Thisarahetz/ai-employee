"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useActiveLocation } from "@/lib/location-context";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { useMarkNotificationRead, useNotifications } from "@/lib/hooks/use-notifications";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { MobileMenuButton } from "@/components/layout/mobile-nav";

/** In-app page an alert links to, e.g. where to fix a setup problem. */
function fixHref(metadata: Record<string, unknown> | undefined): string | null {
  const href = metadata?.href;
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") ? href : null;
}

export function Topbar() {
  const { user, activeTenant, logout } = useAuth();
  const { activeLocationId, setActiveLocationId } = useActiveLocation();
  const { data: businesses } = useBusinesses();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;
  const { t, locale, setLocale } = useI18n();

  // The single top-bar picker is the location/branch switcher. It only makes
  // sense once the workspace has more than one location; otherwise the
  // workspace name stands in as plain text.
  const locations = useMemo(() => businesses ?? [], [businesses]);
  const hasMultipleLocations = locations.length > 1;

  // Drop a remembered location that no longer exists (deleted branch).
  useEffect(() => {
    if (activeLocationId && locations.length > 0 && !locations.some((l) => l.id === activeLocationId)) {
      setActiveLocationId(null);
    }
  }, [activeLocationId, locations, setActiveLocationId]);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center">
        <MobileMenuButton label={t("Open menu")} />
        <div className="min-w-0">
          {/* The business name always shows; with several branches the picker sits under it. */}
          <p className="truncate text-sm font-medium text-ink-primary">{activeTenant?.name ?? t("Your workspace")}</p>
          {hasMultipleLocations ? (
            <select
              aria-label={t("Switch location")}
              value={activeLocationId ?? ""}
              onChange={(e) => setActiveLocationId(e.target.value || null)}
              className="max-w-full rounded-md border-none bg-transparent p-0 text-xs text-ink-secondary focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">{t("All locations")}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="hidden truncate text-xs text-ink-secondary sm:block">
              {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <select
          aria-label={t("Dashboard language")}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-medium text-ink-secondary focus:border-brand-500 focus:outline-none"
        >
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotifOpen((open) => !open)}
            className="relative rounded-full p-2 text-ink-secondary hover:bg-surface-page"
            aria-label={t("Notifications")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-status-critical" />
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-white shadow-lg">
              <div className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink-primary">{t("Notifications")}</div>
              {!notifications?.length ? (
                <p className="px-4 py-6 text-center text-sm text-ink-muted">{t("No notifications")}</p>
              ) : (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {notifications.map((notification) => (
                    <li key={notification.id} className={cn("px-4 py-3", !notification.isRead && "bg-brand-50/60")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-primary">{t(notification.title)}</p>
                          <p className="mt-0.5 line-clamp-3 text-xs text-ink-secondary">{notification.body}</p>
                          {fixHref(notification.metadata) && (
                            <Link
                              href={fixHref(notification.metadata)!}
                              onClick={() => setIsNotifOpen(false)}
                              className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline"
                            >
                              {t("Fix it")} →
                            </Link>
                          )}
                          <p className="mt-1 text-[11px] text-ink-muted">{formatDateTime(notification.createdAt)}</p>
                        </div>
                        {!notification.isRead && (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(notification.id)}
                            className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
                          >
                            {t("Mark read")}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <Button variant="secondary" size="sm" onClick={logout} className="whitespace-nowrap">
          {t("Log out")}
        </Button>
      </div>
    </header>
  );
}
