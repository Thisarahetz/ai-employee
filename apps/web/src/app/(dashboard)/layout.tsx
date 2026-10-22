"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { FullPageSpinner } from "@/components/ui/spinner";
import { SetupProgressButton } from "@/components/getting-started/getting-started";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, memberships } = useAuth();
  const router = useRouter();

  // A pure platform admin (no tenant of their own) has no workspace to render —
  // send them to the standalone console instead of an empty dashboard shell.
  const consoleOnly =
    isAuthenticated && user?.platformRole === "SUPER_ADMIN" && memberships.length === 0;

  // Client-side route guard — the API guards are the real enforcement.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (consoleOnly) {
      router.replace("/admin");
    }
  }, [isLoading, isAuthenticated, consoleOnly, router]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated || consoleOnly) {
    // Avoid flashing protected content while the redirect above takes effect.
    return null;
  }

  return (
    <div className="flex min-h-screen bg-surface-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <SetupProgressButton />
    </div>
  );
}
