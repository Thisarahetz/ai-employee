"use client";

import { useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { useDeleteProviderKey, useProviderKeys, useSaveProviderKey } from "@/lib/hooks/use-business-setup";
import { formatDateTime, getErrorMessage } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LABEL = { OPENAI: "OpenAI", ANTHROPIC: "Anthropic (Claude)", GEMINI: "Google Gemini" } as const;

/** Bring-your-own AI keys. Keys are write-only: only the last four characters are ever shown. */
export function ProviderKeysCard() {
  const keys = useProviderKeys();
  const save = useSaveProviderKey();
  const remove = useDeleteProviderKey();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async (provider: string) => {
    setError(null);
    try {
      await save.mutateAsync({ provider, apiKey: draft[provider] ?? "" });
      setDraft((d) => ({ ...d, [provider]: "" }));
    } catch (err) {
      setError(getErrorMessage(err, "Could not save the key."));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your AI provider keys</CardTitle>
        <CardDescription>
          Use your own OpenAI, Anthropic or Gemini account — usage is then billed to you directly. Keys are encrypted and checked
          with the provider before saving; they are never shown again.
          {keys.data && !keys.data.platformKeysAllowed && " This platform requires your own key for each provider you use."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-status-critical">{error}</p>}
        {(keys.data?.providers ?? []).map((p) => (
          <div key={p.provider} className="flex flex-wrap items-center gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
            <KeyRound className="h-4 w-4 text-ink-muted" />
            <div className="min-w-40 flex-1">
              <div className="text-sm font-medium text-ink-primary">{LABEL[p.provider]}</div>
              <div className="text-xs text-ink-secondary">
                {p.hasOwnKey ? (
                  <>
                    Your key {p.keyHint}
                    {p.lastUsedAt ? ` · last used ${formatDateTime(p.lastUsedAt)}` : " · not used yet"}
                  </>
                ) : p.platformKeyAvailable ? (
                  "Using the platform's key"
                ) : (
                  "Not configured"
                )}
              </div>
              {p.lastError && <div className="text-xs text-status-critical">Provider error: {p.lastError}</div>}
            </div>
            {p.hasOwnKey && <Badge color="green">own key</Badge>}
            <input
              type="password"
              autoComplete="off"
              placeholder={p.hasOwnKey ? "Replace key…" : "Paste API key"}
              value={draft[p.provider] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [p.provider]: e.target.value }))}
              className="w-56 rounded-md border border-line px-2 py-1.5 text-sm"
            />
            <Button size="sm" disabled={!draft[p.provider]?.trim()} isLoading={save.isPending && save.variables?.provider === p.provider} onClick={() => submit(p.provider)}>
              Save
            </Button>
            {p.hasOwnKey && (
              <Button
                size="sm"
                variant="ghost"
                title="Remove key"
                onClick={() => confirm(`Remove your ${LABEL[p.provider]} key?`) && remove.mutate(p.provider)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
