"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useConversations } from "@/lib/hooks/use-conversations";
import { useActiveLocation } from "@/lib/location-context";
import type { Conversation, ConversationStatus } from "@/lib/types";
import { conversationStatusStyles } from "@/lib/status-styles";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { LanguageBadge } from "@/components/conversations/language-badge";
import { useI18n } from "@/lib/i18n";

// The contract doesn't state the page size — assumed fixed at 20 for
// pagination controls; adjust once the real default is confirmed.
const ASSUMED_PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: ConversationStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "AI_HANDLING", label: "AI handling" },
  { value: "HUMAN_HANDLING", label: "Human handling" },
  { value: "CLOSED", label: "Closed" },
];

const LANGUAGE_OPTIONS = [
  { value: "", label: "All languages" },
  { value: "si", label: "Sinhala" },
  { value: "si-Latn", label: "Singlish" },
  { value: "en", label: "English" },
];

export default function ConversationsPage() {
  const { activeLocationId } = useActiveLocation();
  const [status, setStatus] = useState<ConversationStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [language, setLanguage] = useState("");
  const { t } = useI18n();
  const { data, isLoading, isError, error, refetch } = useConversations(status, page, activeLocationId, language);

  // Reset to the first page whenever the branch filter changes.
  useEffect(() => setPage(1), [activeLocationId]);

  const conversations: Conversation[] = Array.isArray(data) ? (data as Conversation[]) : (data?.data ?? []);
  const total = Array.isArray(data) ? data.length : (data?.total ?? conversations.length);
  const hasNextPage = page * ASSUMED_PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">{t("Conversations")}</h1>
          <p className="text-sm text-ink-secondary">{t("Every customer conversation across all channels.")}</p>
        </div>
        <div className="flex gap-2">
          <div className="w-44">
            <Select
              aria-label={t("Filter by language")}
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setPage(1);
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </Select>
          </div>
        <div className="w-56">
          <Select
            aria-label={t("Filter by status")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ConversationStatus | "ALL");
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </Select>
        </div>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-surface-page" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <ErrorState message={getErrorMessage(error, t("Unable to load conversations."))} onRetry={() => refetch()} />
          </div>
        ) : !conversations.length ? (
          <div className="p-5">
            <EmptyState title="No conversations" description="Conversations will appear here once customers reach out." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">{t("Customer")}</th>
                  <th className="px-5 py-3 font-medium">{t("Location")}</th>
                  <th className="px-5 py-3 font-medium">{t("Channel")}</th>
                  <th className="px-5 py-3 font-medium">{t("Status")}</th>
                  <th className="px-5 py-3 font-medium">{t("Language")}</th>
                  <th className="px-5 py-3 font-medium">{t("Last message")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {conversations.map((conversation) => {
                  const style = conversationStatusStyles[conversation.status];
                  return (
                    <tr key={conversation.id} className="hover:bg-surface-page">
                      <td className="px-5 py-3">
                        <Link href={`/conversations/${conversation.id}`} className="font-medium text-brand-600 hover:underline">
                          {conversation.customer?.name || conversation.customer?.email || conversation.customer?.phone || conversation.customerId}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">{conversation.business?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-ink-secondary">{conversation.channel?.type ?? "—"}</td>
                      <td className="px-5 py-3">
                        <StatusBadge {...style} />
                      </td>
                      <td className="px-5 py-3">
                        <LanguageBadge language={conversation.language} />
                      </td>
                      <td className="px-5 py-3 text-ink-secondary">{formatDateTime(conversation.lastMessageAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!isLoading && !isError && conversations.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-muted">
            {t("Page {page} · {total} total", { page, total: total.toLocaleString() })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("Previous")}
            </Button>
            <Button variant="secondary" size="sm" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)}>
              {t("Next")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
