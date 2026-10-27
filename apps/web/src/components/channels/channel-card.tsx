"use client";

import { useState } from "react";
import Link from "next/link";

import { useDeleteChannel } from "@/lib/hooks/use-channels";
import { channelStatusStyles } from "@/lib/status-styles";
import { getErrorMessage } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";
import { Channel } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTestChannel } from "@/lib/hooks/use-channels";

export function ChannelCard({ channel }: { channel: Channel }) {
  const deleteChannel = useDeleteChannel();
  const [confirming, setConfirming] = useState(false);
  const style = channelStatusStyles[channel.status];
  const test = useTestChannel(channel.id);
  const result = test.data;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-white p-5 shadow-sm">
      <Link href={`/channels/${channel.id}`} className="min-w-0 flex-1">
        <h3 className="truncate font-medium text-ink-primary hover:underline">{channel.name}</h3>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-secondary">
          <span>{channel.type.replace(/_/g, " ")}</span>
          <span aria-hidden>•</span>
          <StatusBadge {...style} />
          <StatusBadge
            label={channel.connected ? "Connected" : "Setup needed"}
            color={channel.connected ? "green" : "amber"}
          />
        </p>
        <p className="mt-1 text-xs text-ink-secondary">
          {channel.lastMessageAt
            ? `Working: last customer message ${formatDateTime(channel.lastMessageAt)}`
            : channel.connected
              ? "Ready. No customer message yet, so send a test."
              : "Open this channel to finish connecting it."}
        </p>
        {(result || test.isError) && (
          <p
            className={`mt-1 flex items-start gap-1.5 text-xs ${
              result?.ok ? "text-emerald-700" : "text-status-critical"
            }`}
          >
            {result?.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span>{result ? result.detail : getErrorMessage(test.error, "Test failed.")}</span>
          </p>
        )}
      </Link>

      <div className="shrink-0 space-y-1 text-right">
        <button
          type="button"
          disabled={test.isPending}
          onClick={() => test.mutate()}
          className="block w-full text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
        >
          {test.isPending ? "Testing…" : "Send test"}
        </button>
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={deleteChannel.isPending}
              onClick={() => deleteChannel.mutate(channel.id)}
              className="text-sm font-medium text-status-critical hover:underline disabled:opacity-60"
            >
              {deleteChannel.isPending ? "Removing…" : "Confirm remove"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-sm font-medium text-ink-secondary hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm font-medium text-status-critical hover:underline"
          >
            Remove
          </button>
        )}
        {deleteChannel.isError && (
          <p className="mt-1 text-xs text-status-critical">
            {getErrorMessage(deleteChannel.error, "Could not remove the channel.")}
          </p>
        )}
      </div>
    </div>
  );
}
