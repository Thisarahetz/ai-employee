import axios, { type AxiosRequestConfig } from "axios";

/**
 * Single axios instance + token storage for the whole app. Keeping this the
 * only place that talks HTTP means fixing response-envelope mismatches once
 * the real backend is live is a one-file change, not a page-by-page rewrite.
 *
 * NOTE: tokens are kept in localStorage for this scaffold's simplicity.
 * In production, httpOnly cookies set by the API are the safer choice
 * (immune to XSS token theft) — swapping that in only touches this file
 * plus the /auth/refresh flow, not every page that calls the API.
 */

const ACCESS_TOKEN_KEY = "ai-employee.accessToken";
const REFRESH_TOKEN_KEY = "ai-employee.refreshToken";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getStoredTokens(): StoredTokens | null {
  if (!isBrowser()) return null;
  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function setStoredTokens(tokens: StoredTokens): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearStoredTokens(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const apiClient = axios.create({ baseURL });

// Attach the current access token to every request.
apiClient.interceptors.request.use((config) => {
  const tokens = getStoredTokens();
  if (tokens?.accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

// Single-flight refresh: concurrent 401s share one /auth/refresh call.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return null;
  try {
    // Use a bare axios call (not `apiClient`) so this request never re-enters
    // the response interceptor below and recurses.
    const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${baseURL}/auth/refresh`,
      { refreshToken: tokens.refreshToken },
    );
    setStoredTokens(data);
    return data.accessToken;
  } catch {
    clearStoredTokens();
    return null;
  }
}

interface RetryableRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as RetryableRequestConfig | undefined;
    const status = error?.response?.status;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/");

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }

      const newAccessToken = await refreshInFlight;
      if (newAccessToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      }

      if (isBrowser()) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);
