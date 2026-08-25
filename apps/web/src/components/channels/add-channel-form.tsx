import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export function AddChannelForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("WHATSAPP");
  const queryClient = useQueryClient();

  const addChannel = useMutation({
    mutationFn: async () => {
      await apiClient.post("/channels", {
        name,
        type,
        config: {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      onDone();
    },
  });

  return (
    <div className="rounded-lg border border-border-soft bg-surface-base p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-medium text-ink-primary">Add a new channel</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-primary mb-1">Channel Name</label>
          <input
            type="text"
            className="w-full rounded-md border border-border-strong px-3 py-2 text-sm text-ink-primary placeholder-ink-muted"
            placeholder="e.g. My Website Chat"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-primary mb-1">Type</label>
          <select
            className="w-full rounded-md border border-border-strong px-3 py-2 text-sm text-ink-primary"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="WHATSAPP">WhatsApp</option>
            <option value="WEBSITE_CHAT">Website Chat</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDone} disabled={addChannel.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => addChannel.mutate()}
            disabled={!name || addChannel.isPending}
          >
            {addChannel.isPending ? "Saving..." : "Add Channel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
