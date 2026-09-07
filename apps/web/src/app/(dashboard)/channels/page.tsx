"use client";

import { useState } from "react";
import { useChannels } from "@/lib/hooks/use-channels";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { AddChannelForm } from "@/components/channels/add-channel-form";
import { ChannelCard } from "@/components/channels/channel-card";

export default function ChannelsPage() {
  const channelsQuery = useChannels();
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">Connect Customer Channels</h1>
          <p className="text-xs text-ink-secondary mt-1 max-w-2xl">
            Connect where your customers chat with your business (WhatsApp, Telegram, Website Live Chat).
            Your AI employees will answer inquiries and assist customers on these connected channels.
          </p>
        </div>
        <Button onClick={() => setIsAddOpen((v) => !v)} className="shrink-0 text-xs font-bold">
          {isAddOpen ? "Close" : "+ Connect Channel"}
        </Button>
      </div>

      {isAddOpen && <AddChannelForm onDone={() => setIsAddOpen(false)} />}

      {channelsQuery.isLoading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-white" />
          ))}
        </div>
      ) : channelsQuery.isError ? (
        <ErrorState
          message={getErrorMessage(channelsQuery.error, "Unable to load channels.")}
          onRetry={() => channelsQuery.refetch()}
        />
      ) : !channelsQuery.data?.length ? (
        <EmptyState
          title="No channels configured"
          description="Add a channel like WhatsApp or Website Chat to start receiving customer messages."
        />
      ) : (
        <div className="space-y-4">
          {channelsQuery.data.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}
