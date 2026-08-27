"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiClient, clearStoredTokens, getStoredTokens, setStoredTokens } from "./api-client";
import type { AuthResponse, AuthUser, BusinessType, Tenant, TenantRole } from "./types";

// NOTE: the user profile + memberships are cached in localStorage alongside
// the tokens (see api-client.ts) purely so the dashboard shell can render
// the tenant switcher / user email without an extra round trip on every
// load. Refreshed on every login/signup/switch-tenant response.
const USER_STORAGE_KEY = "ai-employee.user";
const SESSION_STORAGE_KEY = "ai-employee.session";

export interface SignupInput {
  tenantName: string;
  businessType: BusinessType;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface Membership {
  tenantId: string;
  role: TenantRole;
  tenant: Tenant;
}

interface SessionInfo {
  activeTenantId: string | null;
  memberships: Membership[];
}

interface AuthContextValue {
  user: AuthUser | null;
  activeTenantId: string | null;
  activeTenant: Tenant | null;
  memberships: Membership[];
  /** True while hydrating from localStorage on first client render. */
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Resolves with the fresh auth payload so callers can route on role/memberships. */
  login: (email: string, password: string) => Promise<AuthResponse>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<SessionInfo>({ activeTenantId: null, memberships: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const tokens = getStoredTokens();
      const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (tokens?.accessToken && rawUser) {
        setUser(JSON.parse(rawUser) as AuthUser);
        if (rawSession) setSession(JSON.parse(rawSession) as SessionInfo);
      }
    } catch {
      // Malformed/blocked storage — treat as logged out.
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistSession = useCallback((data: AuthResponse) => {
    setStoredTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    const sessionInfo: SessionInfo = { activeTenantId: data.activeTenantId, memberships: data.memberships };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionInfo));
    setUser(data.user);
    setSession(sessionInfo);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/login", { email, password });
      persistSession(data);
      return data;
    },
    [persistSession],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/signup", input);
      persistSession(data);
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    clearStoredTokens();
    window.localStorage.removeItem(USER_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
    setSession({ activeTenantId: null, memberships: [] });
  }, []);

  const activeTenant = session.memberships.find((m) => m.tenantId === session.activeTenantId)?.tenant ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      activeTenantId: session.activeTenantId,
      activeTenant,
      memberships: session.memberships,
      isLoading,
      isAuthenticated: !!user,
      login,
      signup,
      logout,
    }),
    [user, session, activeTenant, isLoading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
