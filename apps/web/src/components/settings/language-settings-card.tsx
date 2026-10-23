"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Languages } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { LOCALES, useI18n, type Locale } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/utils";
import type { Tenant } from "@/lib/types";

/**
 * Two language choices in one place:
 * - how the AI answers customers (business-wide, saved on the server), and
 * - the language of this dashboard (per person, saved in this browser).
 */
export function LanguageSettingsCard() {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const tenantQuery = useQuery({
    queryKey: ["tenant"],
    queryFn: async () => (await apiClient.get<Tenant>("/tenants")).data,
  });

  const [defaultLanguage, setDefaultLanguage] = useState<"en" | "si">("en");
  const [matchCustomer, setMatchCustomer] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!tenantQuery.data) return;
    setDefaultLanguage(tenantQuery.data.defaultLanguage === "si" ? "si" : "en");
    setMatchCustomer(tenantQuery.data.matchCustomerLanguage !== false);
  }, [tenantQuery.data]);

  const save = useMutation({
    mutationFn: async () =>
      (await apiClient.patch<Tenant>("/tenants", { defaultLanguage, matchCustomerLanguage: matchCustomer })).data,
    onSuccess: (tenant) => {
      queryClient.setQueryData(["tenant"], tenant);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-xs space-y-5">
      <div className="flex items-center gap-2">
        <Languages className="h-5 w-5 text-brand-600" />
        <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wider">{t("Languages")}</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-ink-primary">{t("Customer replies")}</p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {t("The AI understands English, Sinhala and Singlish (Sinhala typed in English letters).")}
            </p>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-ink-primary">
            <input
              type="checkbox"
              checked={matchCustomer}
              onChange={(e) => setMatchCustomer(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-500"
            />
            <span>
              <span className="font-semibold">{t("Reply in the customer's language")}</span>
              <span className="block text-ink-secondary">
                {t("A customer who writes in Sinhala gets Sinhala replies; Singlish gets Singlish.")}
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <label htmlFor="default-language" className="text-xs font-bold text-ink-primary">
              {matchCustomer ? t("Default language (before we know the customer's)") : t("Always reply in")}
            </label>
            <select
              id="default-language"
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value as "en" | "si")}
              className="w-full max-w-xs rounded-xl border border-line bg-white px-3.5 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
            >
              <option value="en">English</option>
              <option value="si">සිංහල (Sinhala)</option>
            </select>
            <p className="text-[11px] text-ink-muted">{t("Also sets the language of the website chat window.")}</p>
          </div>

          {save.isError && (
            <p className="rounded-md bg-status-critical/10 px-3 py-2 text-xs text-status-critical">
              {getErrorMessage(save.error, t("Could not save your settings."))}
            </p>
          )}

          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || tenantQuery.isLoading}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saved ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-300" /> {t("Saved")}
              </>
            ) : save.isPending ? (
              t("Saving...")
            ) : (
              t("Save language settings")
            )}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-ink-primary">{t("Dashboard language")}</p>
            <p className="mt-0.5 text-xs text-ink-secondary">
              {t("Only changes what you see. Each team member can choose their own.")}
            </p>
          </div>
          <div className="flex gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setLocale(l.value as Locale)}
                aria-pressed={locale === l.value}
                className={
                  locale === l.value
                    ? "rounded-xl border border-brand-600 bg-brand-50 px-4 py-2 text-xs font-bold text-brand-700"
                    : "rounded-xl border border-line bg-white px-4 py-2 text-xs font-semibold text-ink-secondary hover:bg-surface-page"
                }
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
