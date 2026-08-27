"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "./auth-context";

/**
 * The location/branch the dashboard is currently scoped to. `null` means
 * "All locations" (no filter). The choice is remembered per workspace in
 * localStorage so switching tenants doesn't carry a stale branch over.
 *
 * Only the top-bar switcher writes this; pages read `activeLocationId` and
 * pass it to their queries (conversations, dashboard counts, ...).
 */
const STORAGE_PREFIX = "ai-employee.activeLocation.";

interface LocationContextValue {
  activeLocationId: string | null;
  setActiveLocationId: (id: string | null) => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { activeTenantId } = useAuth();
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(null);

  // Load this workspace's remembered branch whenever the active tenant changes.
  useEffect(() => {
    if (!activeTenantId) {
      setActiveLocationIdState(null);
      return;
    }
    try {
      setActiveLocationIdState(window.localStorage.getItem(STORAGE_PREFIX + activeTenantId));
    } catch {
      setActiveLocationIdState(null);
    }
  }, [activeTenantId]);

  const setActiveLocationId = useCallback(
    (id: string | null) => {
      setActiveLocationIdState(id);
      if (!activeTenantId) return;
      try {
        if (id) window.localStorage.setItem(STORAGE_PREFIX + activeTenantId, id);
        else window.localStorage.removeItem(STORAGE_PREFIX + activeTenantId);
      } catch {
        // Storage blocked — the in-memory value still works for this session.
      }
    },
    [activeTenantId],
  );

  const value = useMemo(
    () => ({ activeLocationId, setActiveLocationId }),
    [activeLocationId, setActiveLocationId],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useActiveLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useActiveLocation must be used within a <LocationProvider>");
  return ctx;
}
