"use client";

import { useState, type FormEvent } from "react";

import { useSetChannelCredentials, useUpdateChannel } from "@/lib/hooks/use-channels";
import type { Channel, ChannelConnectionInfo } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyField } from "./copy-field";

const PHONE = /^\+?[0-9]{6,15}$/;

export function VoiceConnectPanel({
  channel,
  connectionInfo,
}: {
  channel: Channel;
  connectionInfo: ChannelConnectionInfo;
}) {
  const config = (channel.config ?? {}) as Record<string, unknown>;
  const updateChannel = useUpdateChannel(channel.id);
  const setCredentials = useSetChannelCredentials(channel.id);

  const [transferNumber, setTransferNumber] = useState(String(config.transferNumber ?? ""));
  const [greeting, setGreeting] = useState(String(config.greeting ?? ""));
  const [voice, setVoice] = useState(String(config.voice ?? ""));
  const [authToken, setAuthToken] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSaved, setCredSaved] = useState(false);

  async function saveConfig(event: FormEvent) {
    event.preventDefault();
    setConfigError(null);
    setConfigSaved(false);
    const transfer = transferNumber.trim();
    if (transfer && !PHONE.test(transfer)) {
      setConfigError("Enter the transfer number with country code, digits only, e.g. +94112345678.");
      return;
    }
    try {
      await updateChannel.mutateAsync({
        config: { transferNumber: transfer, greeting: greeting.trim(), voice: voice.trim() },
      });
      setConfigSaved(true);
    } catch (err) {
      setConfigError(getErrorMessage(err, "Could not save."));
    }
  }

  async function saveToken(event: FormEvent) {
    event.preventDefault();
    setCredError(null);
    setCredSaved(false);
    if (!authToken.trim()) {
      setCredError("Paste the Twilio auth token first.");
      return;
    }
    try {
      await setCredentials.mutateAsync({ type: "BEARER_TOKEN", payload: { token: authToken.trim() } });
      setAuthToken("");
      setCredSaved(true);
    } catch (err) {
      setCredError(getErrorMessage(err, "Could not save the token."));
    }
  }

  return (
    <div className="space-y-6">
      {connectionInfo.webhookUrl && (
        <CopyField label="Voice webhook URL (set this in Twilio)" value={connectionInfo.webhookUrl} />
      )}

      <form onSubmit={saveToken} className="space-y-3">
        <Input
          label="Twilio auth token"
          hint={
            channel.hasCredentials
              ? "A token is already saved. Submitting replaces it."
              : "From the Twilio Console dashboard. Used to check that calls really come from Twilio. Stored encrypted."
          }
          type="password"
          autoComplete="off"
          value={authToken}
          onChange={(e) => setAuthToken(e.target.value)}
        />
        {credError && <p className="text-sm text-status-critical">{credError}</p>}
        {credSaved && <p className="text-sm text-emerald-700">Auth token saved.</p>}
        <Button type="submit" size="sm" variant="secondary" isLoading={setCredentials.isPending}>
          {channel.hasCredentials ? "Replace token" : "Save token"}
        </Button>
      </form>

      <form onSubmit={saveConfig} className="space-y-4 border-t border-line pt-5">
        <Input
          label="Transfer to a person (optional)"
          hint="When the caller asks for a person, or the AI can't help, the call is transferred to this number. Leave empty to tell the caller someone will call back."
          value={transferNumber}
          onChange={(e) => setTransferNumber(e.target.value)}
          placeholder="+94112345678"
        />
        <Input
          label="Greeting (optional)"
          hint="What the caller hears first. Empty uses “Welcome to your business” in your default language."
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          placeholder="Hello, thanks for calling. How can I help?"
        />
        <Input
          label="Voice (optional)"
          hint="A text-to-speech voice name your Twilio account supports. Empty uses the platform default."
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
        />
        {configError && <p className="text-sm text-status-critical">{configError}</p>}
        {configSaved && <p className="text-sm text-emerald-700">Settings saved.</p>}
        <Button type="submit" size="sm" isLoading={updateChannel.isPending}>
          Save settings
        </Button>
      </form>

      <ol className="list-decimal space-y-1 border-t border-line pt-5 pl-5 text-sm text-ink-secondary">
        <li>In the Twilio Console, open Phone Numbers → your number → Voice Configuration.</li>
        <li>Set “A call comes in” to Webhook, HTTP POST, with the URL above.</li>
        <li>Paste your Twilio auth token here and save it.</li>
        <li>Make sure this channel is active, then call the number. The conversation appears under Conversations.</li>
      </ol>
    </div>
  );
}
