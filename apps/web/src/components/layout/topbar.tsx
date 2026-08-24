"use client";

import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { useMarkNotificationRead, useNotifications } from "@/lib/hooks/use-notifications";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Topbar() {
  const { user, logout } = useAuth();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6">
      <div>
        <p className="text-sm font-medium text-ink-primary">{user?.tenant?.name ?? "Your workspace"}</p>
        <p className="text-xs text-ink-muted">{user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotifOpen((open) => !open)}
            className="relative rounded-full p-2 text-ink-secondary hover:bg-surface-page"
            aria-label="Notifications"
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
              <div className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink-primary">Notifications</div>
              {!notifications?.length ? (
                <p className="px-4 py-6 text-center text-sm text-ink-muted">No notifications</p>
              ) : (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {notifications.map((notification) => (
                    <li key={notification.id} className={cn("px-4 py-3", !notification.isRead && "bg-brand-50/60")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-primary">{notification.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-ink-secondary">{notification.body}</p>
                          <p className="mt-1 text-[11px] text-ink-muted">{formatDateTime(notification.createdAt)}</p>
                        </div>
                        {!notification.isRead && (
                          <button
                            type="button"
                            onClick={() => markRead.mutate(notification.id)}
                            className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
                          >
                            Mark read
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

        <Button variant="secondary" size="sm" onClick={logout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
