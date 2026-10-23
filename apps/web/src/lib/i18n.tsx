"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { SI } from "./i18n-si";

/**
 * Dashboard language: English or Sinhala (සිංහල).
 *
 * Strings are looked up by their English text, so any text without a Sinhala
 * translation yet simply stays in English. Use `{name}` placeholders for
 * values: t("Page {page} of {total}", { page: 1, total: 3 }).
 */
export type Locale = "en" | "si";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "si", label: "සිංහල" },
];

const STORAGE_KEY = "ai-employee.locale";

type Vars = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (text: string, vars?: Vars) => string;
}

function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(locale: Locale, text: string, vars?: Vars): string {
  const base = locale === "si" ? (SI[text] ?? text) : text;
  return interpolate(base, vars);
}

const I18nContext = createContext<I18nValue>({
  locale: "en",
  setLocale: () => undefined,
  t: (text, vars) => interpolate(text, vars),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "si" || saved === "en") setLocaleState(saved);
    } catch {
      // Storage blocked: stay in English.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Not remembered, but still switched for this visit.
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (text, vars) => translate(locale, text, vars) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Display names for the customer languages the API reports. */
export const CUSTOMER_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  si: "Sinhala",
  "si-Latn": "Singlish",
};
