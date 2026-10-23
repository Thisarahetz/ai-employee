"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { MobileNavProvider } from "@/components/layout/mobile-nav";
import { PlatformSidebar } from "@/components/platform/platform-sidebar";
import { PlatformTopbar } from "@/components/platform/platform-topbar";
import { FullPageSpinner } from "@/components/ui/spinner";

/**
 * The standalone Platform Super Admin console. Deliberately NOT nested under
 * the tenant `(dashboard)` shell — no tenant switcher, no workspace nav, no
 * notifications. The API's `PlatformAdminGuard` is the real enforcement; this
 * client guard just keeps non-admins from seeing a broken/empty page.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  const isSuperAdmin = user?.platformRole === "SUPER_ADMIN";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (!isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, isSuperAdmin, router]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated || !isSuperAdmin) {
    return null;
  }

  return (
    <MobileNavProvider>
    <div className="flex min-h-screen bg-surface-page">
      <PlatformSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PlatformTopbar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
    </MobileNavProvider>
  );
}
