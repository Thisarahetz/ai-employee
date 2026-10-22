"use client";

import { Pause, Play, X } from "lucide-react";

import type { AiTask } from "@/lib/types";
import { aiTaskStatusStyles } from "@/lib/status-styles";
import { useControlTask } from "@/lib/hooks/use-ai-workforce";
import { Badge } from "@/components/ui/badge";
import { cn, getErrorMessage } from "@/lib/utils";

/** Live status of a task referenced by a chat message, with quick controls. */
export function TaskChip({ task }: { task: AiTask }) {
  const control = useControlTask();
  const style = aiTaskStatusStyles[task.status] ?? { label: task.status, color: "gray" as const };
  const working = task.status === "RUNNING" || task.status === "QUEUED";
  const canPause = working || task.status === "BLOCKED";
  const canResume = task.status === "PAUSED" || task.status === "BLOCKED" || task.status === "FAILED";
  const canCancel = !["COMPLETED", "FAILED", "CANCELLED"].includes(task.status);
  const who =
    task.kind === "GROUP"
      ? `${task.children?.length ?? 0} employees`
      : task.employee?.name ?? "Unassigned";

  const act = (action: "PAUSE" | "RESUME" | "CANCEL") => control.mutate({ id: task.id, action });

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-page px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink-primary">{task.title}</p>
          <p className="truncate text-[11px] text-ink-muted">
            {who}
            {task.priority !== "MEDIUM" && ` · ${task.priority.toLowerCase()} priority`}
          </p>
        </div>
        <Badge color={style.color}>{style.label}</Badge>
        <div className="flex items-center">
          {canPause && (
            <IconButton label="Pause" onClick={() => act("PAUSE")} disabled={control.isPending}>
              <Pause className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {canResume && (
            <IconButton label={task.status === "FAILED" ? "Retry" : "Resume"} onClick={() => act("RESUME")} disabled={control.isPending}>
              <Play className="h-3.5 w-3.5" />
            </IconButton>
          )}
          {canCancel && (
            <IconButton label="Cancel" onClick={() => act("CANCEL")} disabled={control.isPending}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      {working && (
        <div className="h-1 overflow-hidden rounded-full bg-line" aria-label={`${task.progress}% done`}>
          <div
            className={cn("h-full rounded-full bg-brand-500 transition-all", task.progress === 0 && "w-1/4 animate-pulse")}
            style={task.progress > 0 ? { width: `${Math.min(100, task.progress)}%` } : undefined}
          />
        </div>
      )}
      {control.isError && <p className="text-[11px] text-status-critical">{getErrorMessage(control.error)}</p>}
    </div>
  );
}

function IconButton({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="rounded-md p-1 text-ink-muted transition-colors hover:bg-white hover:text-ink-primary disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}
