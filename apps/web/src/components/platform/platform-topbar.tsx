"use client";

import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function PlatformTopbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-white px-6">
      <div>
        <p className="text-sm font-medium text-ink-primary">Platform · Super Admin</p>
        <p className="text-xs text-ink-muted">
          {user ? `${user.firstName} ${user.lastName} · ${user.email}` : ""}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={logout}>
        Log out
      </Button>
    </header>
  );
}
