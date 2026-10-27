"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { useTestChannel } from "@/lib/hooks/use-channels";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Guide = { steps: string[]; whyNotConnected: string; success: string };

const GUIDES: Record<string, Guide> = {
  VOICE: {
    steps: [
      "Paste your Twilio auth token above and save it, then set the voice webhook URL on your Twilio number.",
      "Click \"Send test\" below to check the setup is ready.",
      "Call your Twilio number from your phone and ask a question, for example \"What are your opening hours?\".",
      "Say \"I want to talk to a person\" to check the transfer (or callback) works.",
    ],
    whyNotConnected:
      "A phone line can't be sent a test message. The check confirms the token is saved, the channel is active and your public address is reachable by Twilio. The real proof is a call.",
    success:
      "The channel shows Working as soon as a call comes through, and the conversation appears under Conversations.",
  },
  WEBSITE_CHAT: {
    steps: [
      "Copy the code snippet above and paste it into your website, just before the closing </body> tag. (To try it first, use the Preview above.)",
      "Open your website, click the chat bubble and send a message like a customer would, for example \"What are your opening hours?\".",
      "Check the AI's answer is correct. If it is wrong, fix your business information in the Knowledge Base.",
      "Keep that chat open and click \"Send test message\" below.",
    ],
    whyNotConnected:
      "The test is sent into an existing chat. Until someone has sent at least one message from the chat bubble, there is no chat to send it to, so it shows as not connected.",
    success:
      "A message from your AI employee appears in the open chat within about 2 seconds. Your website chat is connected: customer chats show up in Conversations and your AI employees answer them.",
  },
  WHATSAPP: {
    steps: [
      "Fill in the phone number ID and save the WhatsApp access token above.",
      "From your own phone, send a WhatsApp message to your business number like a customer would.",
      "Check the AI's answer is correct. If it is wrong, fix your business information in the Knowledge Base.",
      "Click \"Send test message\" below within 24 hours of your message.",
    ],
    whyNotConnected:
      "WhatsApp only lets a business message someone who has messaged it first in the last 24 hours. Until a customer (or you) sends a message, there is no one to send the test to.",
    success:
      "The test message arrives on the phone that last messaged you. Your WhatsApp is connected: customer chats show up in Conversations and your AI employees answer them.",
  },
};

export function ChannelTestPanel({ channelId, channelType }: { channelId: string; channelType: string }) {
  const testChannel = useTestChannel(channelId);
  const guide = GUIDES[channelType];
  const result = testChannel.data;

  return (
    <div className="space-y-4">
      {guide ? (
        <>
          <div>
            <p className="text-sm font-medium text-ink-primary">How to test</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-secondary">
              {guide.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
          <div className="rounded-md bg-surface-page p-3 text-sm">
            <p className="font-medium text-ink-primary">Why does it say &quot;not connected&quot;?</p>
            <p className="mt-0.5 text-ink-secondary">{guide.whyNotConnected}</p>
            <p className="mt-2 font-medium text-ink-primary">When the test works</p>
            <p className="mt-0.5 text-ink-secondary">{guide.success}</p>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-secondary">Sends a test message through this channel to check delivery works.</p>
      )}

      <Button size="sm" variant="secondary" isLoading={testChannel.isPending} onClick={() => testChannel.mutate()}>
        Send test message
      </Button>

      {result && (
        <p className={`flex items-start gap-2 text-sm ${result.ok ? "text-emerald-700" : "text-status-critical"}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{result.detail}</span>
        </p>
      )}
      {testChannel.isError && (
        <p className="text-sm text-status-critical">{getErrorMessage(testChannel.error, "Test failed.")}</p>
      )}
    </div>
  );
}
