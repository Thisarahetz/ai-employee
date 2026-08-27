"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useCreateChannel } from "@/lib/hooks/use-channels";
import type { ChannelType } from "@/lib/types";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
  { value: "WEBSITE_CHAT", label: "Website Chat" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
];

export function AddChannelForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const createChannel = useCreateChannel();
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("WEBSITE_CHAT");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give the channel a name.");
      return;
    }
    try {
      const channel = await createChannel.mutateAsync({ name: name.trim(), type });
      onDone();
      // Land on the detail page to finish connecting it.
      router.push(`/channels/${channel.id}`);
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the channel."));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-line bg-white p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-ink-primary">Add a new channel</h2>

      {error && (
        <p className="rounded-md bg-status-critical/10 px-3 py-2 text-sm text-status-critical">{error}</p>
      )}

      <Input
        label="Channel name"
        placeholder="e.g. Website Chat"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <Select label="Type" value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
        {CHANNEL_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={createChannel.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={createChannel.isPending} disabled={!name.trim()}>
          Create channel
        </Button>
      </div>
    </form>
  );
}
