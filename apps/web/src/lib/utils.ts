import { clsx, type ClassValue } from "clsx";

/** Merge conditional class names. Thin wrapper so call sites don't import clsx directly. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Best-effort human-readable message extraction from an Axios/fetch-style error. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error && typeof error === "object") {
    const anyError = error as { response?: { data?: { message?: string | string[] } }; message?: string };
    const apiMessage = anyError.response?.data?.message;
    if (Array.isArray(apiMessage) && apiMessage.length > 0) return apiMessage.join(", ");
    if (typeof apiMessage === "string" && apiMessage.length > 0) return apiMessage;
    if (typeof anyError.message === "string" && anyError.message.length > 0) return anyError.message;
  }
  return fallback;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Compact number formatting for stat tiles: 1284 -> "1,284", 12900 -> "12.9K". */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatCurrencyUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

/** Duration between two ISO timestamps, formatted as "2m 14s" / "1h 3m". */
export function formatDuration(startedAt: string, finishedAt?: string | null): string {
  if (!finishedAt) return "In progress";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
