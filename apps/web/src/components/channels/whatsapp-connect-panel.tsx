"use client";

import { useState, type FormEvent } from "react";

import { useSetChannelCredentials, useUpdateChannel } from "@/lib/hooks/use-channels";
import type { Channel, ChannelConnectionInfo } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyField } from "./copy-field";

export function WhatsAppConnectPanel({
  channel,
  connectionInfo,
}: {
  channel: Channel;
  connectionInfo: ChannelConnectionInfo;
}) {
  const config = (channel.config ?? {}) as Record<string, unknown>;
  const updateChannel = useUpdateChannel(channel.id);
  const setCredentials = useSetChannelCredentials(channel.id);

  const [phoneNumberId, setPhoneNumberId] = useState(String(config.phoneNumberId ?? ""));
  const [verifyToken, setVerifyToken] = useState(String(config.verifyToken ?? ""));
  const [accessToken, setAccessToken] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSaved, setCredSaved] = useState(false);

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    setConfigError(null);
    try {
      await updateChannel.mutateAsync({
        config: { phoneNumberId: phoneNumberId.trim(), verifyToken: verifyToken.trim() },
      });
    } catch (err) {
      setConfigError(getErrorMessage(err, "Could not save."));
    }
  }

  async function saveToken(event: FormEvent) {
    event.preventDefault();
    setCredError(null);
    setCredSaved(false);
    if (!accessToken.trim()) {
      setCredError("Paste the access token first.");
      return;
    }
    try {
      await setCredentials.mutateAsync({ type: "BEARER_TOKEN", payload: { token: accessToken.trim() } });
      setAccessToken("");
      setCredSaved(true);
    } catch (err) {
      setCredError(getErrorMessage(err, "Could not save the token."));
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={saveConfig} className="space-y-4">
        <Input
          label="Phone number ID"
          hint="From Meta → WhatsApp → API Setup. Inbound webhooks are matched to this channel by it."
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          placeholder="123456789012345"
        />
        <Input
          label="Verify token"
          hint="Any secret string — you'll paste the same value into Meta's webhook config."
          value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value)}
          placeholder="my-verify-secret"
        />
        {configError && <p className="text-sm text-status-critical">{configError}</p>}
        <Button type="submit" size="sm" isLoading={updateChannel.isPending}>
          Save settings
        </Button>
      </form>

      {connectionInfo.webhookUrl && (
        <CopyField label="Callback URL (set this in Meta)" value={connectionInfo.webhookUrl} />
      )}

      <form onSubmit={saveToken} className="space-y-3 border-t border-line pt-5">
        <Input
          label="Permanent access token"
          hint={
            channel.hasCredentials
              ? "A token is already saved. Submitting replaces it."
              : "From your Meta app's System User. Stored encrypted."
          }
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="EAAG…"
        />
        {credError && <p className="text-sm text-status-critical">{credError}</p>}
        {credSaved && <p className="text-sm text-emerald-700">Access token saved.</p>}
        <Button type="submit" size="sm" variant="secondary" isLoading={setCredentials.isPending}>
          {channel.hasCredentials ? "Replace token" : "Save token"}
        </Button>
      </form>

      <ol className="list-decimal space-y-1 border-t border-line pt-5 pl-5 text-sm text-ink-secondary">
        <li>In Meta → WhatsApp → Configuration, set the callback URL above and the verify token.</li>
        <li>Subscribe the app to the <code>messages</code> webhook field.</li>
        <li>Save the phone number ID and a permanent access token here.</li>
        <li>Send a WhatsApp message to your number — it appears under Conversations.</li>
      </ol>
    </div>
  );
}
