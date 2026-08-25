import { Channel } from "@/lib/types";

export function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-soft bg-white p-6 shadow-sm">
      <div className="flex flex-col space-y-1">
        <h3 className="font-medium text-ink-primary">{channel.name}</h3>
        <p className="text-sm text-ink-secondary">
          Type: {channel.type} • Status: <span className={channel.status === "ACTIVE" ? "text-green-600" : "text-yellow-600"}>{channel.status}</span>
        </p>
      </div>
      <div>
        <button
          className="text-sm font-medium text-red-600 hover:text-red-700"
          onClick={() => alert('Delete channel logic here')}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
