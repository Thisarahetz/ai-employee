"use client";

import { useMemo, useState, type FormEvent } from "react";

import { useUpdateChannel } from "@/lib/hooks/use-channels";
import type { Channel, ChannelConnectionInfo } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyField } from "./copy-field";

export function WebsiteChatConnectPanel({
  channel,
  connectionInfo,
}: {
  channel: Channel;
  connectionInfo: ChannelConnectionInfo;
}) {
  const config = (channel.config ?? {}) as Record<string, unknown>;
  const updateChannel = useUpdateChannel(channel.id);

  const [title, setTitle] = useState(String(config.title ?? channel.name ?? ""));
  const [accentColor, setAccentColor] = useState(String(config.accentColor ?? "#2a78d6"));
  const [greeting, setGreeting] = useState(String(config.greeting ?? "Hi! How can we help?"));
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await updateChannel.mutateAsync({
        config: { title: title.trim(), accentColor: accentColor.trim(), greeting: greeting.trim() },
      });
    } catch (err) {
      setError(getErrorMessage(err, "Could not save."));
    }
  }

  // Live preview: load the real widget inside an isolated iframe so its fixed
  // positioning doesn't leak onto the dashboard. Re-mounts when the snippet or
  // saved appearance changes.
  const previewSrcDoc = useMemo(() => {
    if (!connectionInfo.widgetUrl) return "";
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#f9f9f7;font-family:system-ui,sans-serif}.hint{position:absolute;top:12px;left:12px;font-size:12px;color:#898781}</style></head><body><div class="hint">Live preview — click the bubble</div><script src="${connectionInfo.widgetUrl}" data-channel-id="${channel.id}" async></script></body></html>`;
  }, [connectionInfo.widgetUrl, channel.id, channel.updatedAt]);

  return (
    <div className="space-y-6">
      {connectionInfo.widgetSnippet && (
        <CopyField
          label="Embed snippet — paste before </body> on your site"
          value={connectionInfo.widgetSnippet}
          multiline
        />
      )}

      <form onSubmit={save} className="space-y-4 border-t border-line pt-5">
        <p className="text-sm font-medium text-ink-primary">Appearance</p>
        <Input label="Header title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="Accent color"
          value={accentColor}
          onChange={(e) => setAccentColor(e.target.value)}
          placeholder="#2a78d6"
        />
        <Input label="Greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
        {error && <p className="text-sm text-status-critical">{error}</p>}
        <Button type="submit" size="sm" isLoading={updateChannel.isPending}>
          Save appearance
        </Button>
      </form>

      {previewSrcDoc && (
        <div className="border-t border-line pt-5">
          <p className="mb-2 text-sm font-medium text-ink-primary">Preview</p>
          <iframe
            key={previewSrcDoc}
            title="Widget preview"
            srcDoc={previewSrcDoc}
            className="h-[420px] w-full rounded-lg border border-line"
          />
        </div>
      )}
    </div>
  );
}
