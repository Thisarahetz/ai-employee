"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiClient, clearStoredTokens, getStoredTokens, setStoredTokens } from "./api-client";
import type { AuthResponse, AuthUser } from "./types";

// NOTE: the user profile is cached in localStorage alongside the tokens
// (see api-client.ts) purely so the dashboard shell can render the tenant
// name / user email without an extra round trip on every load. It is
// refreshed on every login/signup response.
const USER_STORAGE_KEY = "ai-employee.user";

export interface SignupInput {
  tenantName: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True while hydrating from localStorage on first client render. */
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const tokens = getStoredTokens();
      const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
      if (tokens?.accessToken && rawUser) {
        setUser(JSON.parse(rawUser) as AuthUser);
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
    setUser(data.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await apiClient.post<AuthResponse>("/auth/login", { email, password });
      persistSession(data);
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
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isAuthenticated: !!user, login, signup, logout }),
    [user, isLoading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
