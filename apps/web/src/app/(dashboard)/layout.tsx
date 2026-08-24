"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Client-side route guard — fine for this scaffold. A production build
  // would enforce this server-side (middleware reading an httpOnly cookie).
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated) {
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
    </div>
  );
}
