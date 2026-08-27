"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  useConversation,
  useConversationMessages,
  useReturnToAi,
  useSendMessage,
  useTakeControl,
} from "@/lib/hooks/use-conversations";
import { conversationStatusStyles } from "@/lib/status-styles";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/ui/error-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageBubble } from "@/components/conversations/message-bubble";
import type { Message } from "@/lib/types";

export default function ConversationDetailPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const [loadedPages, setLoadedPages] = useState(1);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationQuery = useConversation(conversationId);
  const messagesQuery = useConversationMessages(conversationId, loadedPages);
  const takeControl = useTakeControl(conversationId);
  const returnToAi = useReturnToAi(conversationId);
  const sendMessage = useSendMessage(conversationId);

  // Messages are re-sorted client-side by createdAt ascending, since the
  // exact ordering returned by GET /conversations/:id/messages?page= isn't
  // specified in the contract.
  const sortedMessages = useMemo<Message[]>(() => {
    const raw = messagesQuery.data;
    const messages = Array.isArray(raw)
      ? raw
      : (raw?.data ?? (raw as unknown as { items?: Message[] })?.items ?? []);
    return [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messagesQuery.data]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputText.trim();
    if (!content || sendMessage.isPending) return;

    setInputText("");
    await sendMessage.mutateAsync(content);
  };

  if (conversationQuery.isLoading) return <FullPageSpinner />;

  if (conversationQuery.isError || !conversationQuery.data) {
    return (
      <ErrorState
        message={getErrorMessage(conversationQuery.error, "Unable to load this conversation.")}
        onRetry={() => conversationQuery.refetch()}
      />
    );
  }

  const conversation = conversationQuery.data;
  const style = conversationStatusStyles[conversation.status];
  const isHumanHandling = conversation.status === "HUMAN_HANDLING";
  const isClosed = conversation.status === "CLOSED";
  const total = Array.isArray(messagesQuery.data)
    ? messagesQuery.data.length
    : (messagesQuery.data?.total ?? sortedMessages.length);
  const hasMoreOlder = sortedMessages.length > 0 && sortedMessages.length < total;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Link href="/conversations" className="text-xs font-medium text-brand-600 hover:underline">
            &larr; All conversations
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold text-ink-primary">
            {conversation.customer?.name || conversation.customer?.email || conversation.customer?.phone || "Conversation"}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge {...style} />
            {conversation.channel?.type && <span className="text-xs text-ink-muted">via {conversation.channel.type}</span>}
          </div>
        </div>

        {!isClosed && (
          <div className="shrink-0">
            {isHumanHandling ? (
              <Button
                variant="secondary"
                isLoading={returnToAi.isPending}
                onClick={() => returnToAi.mutate()}
              >
                Return to AI
              </Button>
            ) : (
              <Button isLoading={takeControl.isPending} onClick={() => takeControl.mutate()}>
                Take control
              </Button>
            )}
          </div>
        )}
      </div>

      {(takeControl.isError || returnToAi.isError || sendMessage.isError) && (
        <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {getErrorMessage(takeControl.error ?? returnToAi.error ?? sendMessage.error, "Could not update the conversation.")}
        </p>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex-1 space-y-4 overflow-y-auto min-h-[350px]">
          {hasMoreOlder && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                isLoading={messagesQuery.isFetching}
                onClick={() => setLoadedPages((p) => p + 1)}
              >
                Load older messages
              </Button>
            </div>
          )}

          {messagesQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 w-2/3 animate-pulse rounded-2xl bg-surface-page" />
              ))}
            </div>
          ) : messagesQuery.isError ? (
            <ErrorState
              message={getErrorMessage(messagesQuery.error, "Unable to load messages.")}
              onRetry={() => messagesQuery.refetch()}
            />
          ) : !sortedMessages.length ? (
            <EmptyState title="No messages yet" />
          ) : (
            sortedMessages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {!isClosed && (
          <div className="border-t border-line bg-surface-card p-3">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isHumanHandling
                    ? "Type a reply as a human agent..."
                    : "Type a message (will take control from AI)..."
                }
                className="flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button
                type="submit"
                isLoading={sendMessage.isPending}
                disabled={!inputText.trim()}
              >
                Send
              </Button>
            </form>
            {isHumanHandling && (
              <p className="mt-1.5 text-[11px] text-ink-muted">
                ⚡ You are in human control. Messages will be sent directly to the customer.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

