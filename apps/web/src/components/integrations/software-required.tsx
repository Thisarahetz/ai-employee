"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plug } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useIntegrations } from "@/lib/hooks/use-integrations";

/**
 * Connecting the business's software is a required setup step. Owners and
 * admins (the people who can do it) see this until one integration is CONNECTED.
 */
export function useSoftwareRequired() {
  const { memberships, activeTenantId } = useAuth();
  const role = memberships.find((m) => m.tenantId === activeTenantId)?.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const q = useIntegrations(canManage);
  const list = q.data ?? [];
  return {
    required: canManage && q.isSuccess && !list.some((i) => i.status === "CONNECTED"),
    started: list.length > 0,
  };
}

/** Banner on every page until the software is connected. It cannot be hidden. */
export function SoftwareRequiredBanner() {
  const pathname = usePathname();
  const { required, started } = useSoftwareRequired();
  if (!required || pathname?.startsWith("/integrations") || pathname === "/onboarding") return null;

  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-status-warning/30 bg-status-warning/10 px-6 py-3">
      <Plug className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm text-ink-primary">
        <strong>{started ? "Finish connecting your software." : "Connect your software to finish setup."}</strong>{" "}
        {started
          ? "Paste the Base URL your developer sent and click Test connection."
          : "Your AI employees need your booking or business software to see real customers, bookings and prices."}
      </div>
      <Link
        href="/integrations"
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
      >
        {started ? "Finish connecting" : "Connect your software"}
      </Link>
    </div>
  );
}
