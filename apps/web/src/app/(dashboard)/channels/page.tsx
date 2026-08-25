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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Customer Channels</h1>
          <p className="text-sm text-ink-secondary">Endpoints where customers can interact with the AI Agent.</p>
        </div>
        <Button onClick={() => setIsAddOpen((v) => !v)}>{isAddOpen ? "Close" : "+ Add Channel"}</Button>
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
