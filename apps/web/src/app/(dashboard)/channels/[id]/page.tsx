"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  useChannel,
  useChannelConnectionInfo,
  useDeleteChannel,
  useTestChannel,
  useUpdateChannel,
} from "@/lib/hooks/use-channels";
import { useBusinesses } from "@/lib/hooks/use-businesses";
import { channelStatusStyles } from "@/lib/status-styles";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { WhatsAppConnectPanel } from "@/components/channels/whatsapp-connect-panel";
import { WebsiteChatConnectPanel } from "@/components/channels/website-chat-connect-panel";

export default function ChannelDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const channelId = params.id;

  const channelQuery = useChannel(channelId);
  const connectionInfoQuery = useChannelConnectionInfo(channelId);
  const { data: businesses } = useBusinesses();
  const testChannel = useTestChannel(channelId);
  const updateChannel = useUpdateChannel(channelId);
  const deleteChannel = useDeleteChannel();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (channelQuery.isLoading) return <FullPageSpinner />;

  if (channelQuery.isError || !channelQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(channelQuery.error, "Unable to load this channel.")}
        onRetry={() => channelQuery.refetch()}
      />
    );
  }

  const channel = channelQuery.data;
  const style = channelStatusStyles[channel.status];
  const connectionInfo = connectionInfoQuery.data;
  const locations = businesses ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/channels" className="text-xs font-medium text-brand-600 hover:underline">
          &larr; All channels
        </Link>
        <div className="mt-1 flex items-center justify-between gap-4">
          <h1 className="truncate text-xl font-semibold text-ink-primary">{channel.name}</h1>
          <StatusBadge {...style} />
        </div>
        <p className="mt-1 text-sm text-ink-secondary">{channel.type.replace(/_/g, " ")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent>
          {connectionInfoQuery.isLoading ? (
            <div className="h-24 animate-pulse rounded-md bg-surface-page" />
          ) : !connectionInfo ? (
            <ErrorState message="Couldn't load connection details." onRetry={() => connectionInfoQuery.refetch()} />
          ) : channel.type === "WHATSAPP" ? (
            <WhatsAppConnectPanel channel={channel} connectionInfo={connectionInfo} />
          ) : channel.type === "WEBSITE_CHAT" ? (
            <WebsiteChatConnectPanel channel={channel} connectionInfo={connectionInfo} />
          ) : (
            <p className="text-sm text-ink-secondary">
              Connecting {channel.type.replace(/_/g, " ")} channels isn&apos;t supported yet.
            </p>
          )}
        </CardContent>
      </Card>

      {locations.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-ink-secondary">
              Conversations that arrive on this channel are assigned to this branch.
            </p>
            <Select
              aria-label="Channel location"
              value={channel.businessId ?? ""}
              disabled={updateChannel.isPending}
              onChange={(e) => updateChannel.mutate({ businessId: e.target.value || null })}
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-ink-secondary">
            Sends a canned message through the channel to confirm delivery works end-to-end.
          </p>
          <Button size="sm" variant="secondary" isLoading={testChannel.isPending} onClick={() => testChannel.mutate()}>
            Send test message
          </Button>
          {testChannel.data && (
            <p className={`text-sm ${testChannel.data.ok ? "text-status-good" : "text-status-critical"}`}>
              {testChannel.data.detail}
            </p>
          )}
          {testChannel.isError && (
            <p className="text-sm text-status-critical">
              {getErrorMessage(testChannel.error, "Test failed.")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-status-critical/30">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-ink-secondary">
            Removing a channel deletes its stored credentials. Channels that already have
            conversations can&apos;t be deleted — set them to inactive instead.
          </p>
          <Button
            size="sm"
            variant="secondary"
            isLoading={updateChannel.isPending}
            onClick={() =>
              updateChannel.mutate({ status: channel.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
            }
          >
            {channel.status === "ACTIVE" ? "Set inactive" : "Set active"}
          </Button>
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="danger"
                isLoading={deleteChannel.isPending}
                onClick={() =>
                  deleteChannel.mutate(channel.id, { onSuccess: () => router.push("/channels") })
                }
              >
                Confirm remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setConfirmingDelete(true)}>
              Remove channel
            </Button>
          )}
          {deleteChannel.isError && (
            <p className="text-sm text-status-critical">
              {getErrorMessage(deleteChannel.error, "Could not remove the channel.")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
