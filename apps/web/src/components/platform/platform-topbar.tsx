"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { MobileMenuButton } from "@/components/layout/mobile-nav";

export function PlatformTopbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center">
        <MobileMenuButton />
        <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-primary">Platform · Super Admin</p>
        <p className="hidden truncate text-xs text-ink-muted sm:block">
          {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}
        </p>
        </div>
      </div>
      <Button variant="secondary" size="sm" onClick={logout} className="shrink-0 whitespace-nowrap">
        Log out
      </Button>
    </header>
  );
}
