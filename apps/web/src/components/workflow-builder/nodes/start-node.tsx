import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const StartNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isRunning = nodeData.status === "RUNNING";
  const isSuccess = nodeData.status === "SUCCESS";

  return (
    <div
      className={`group relative min-w-[200px] rounded-xl border bg-white p-3.5 shadow-sm transition-all ${
        selected ? "border-brand-600 ring-2 ring-brand-500/20 shadow-md" : "border-line hover:border-brand-300"
      } ${isRunning ? "ring-2 ring-amber-400 animate-pulse" : ""} ${
        isSuccess ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500 text-white shadow-xs">
          <Play className="h-3.5 w-3.5 fill-current" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            {nodeData.title || "START"}
          </h4>
        </div>
      </div>

      {/* Input Parameters Preview */}
      <div className="space-y-1.5 rounded-lg bg-surface-page p-2 border border-line/60">
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-secondary">
          <span className="flex items-center gap-1">
            <span className="text-brand-600 font-semibold">{`{x}`}</span> depth
          </span>
          <span className="rounded bg-white px-1.5 py-0.5 border border-line text-ink-primary font-bold">
            {nodeData.inputVariables?.find((v) => v.name === "depth")?.defaultValue || "3"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-ink-secondary">
          <span className="flex items-center gap-1">
            <span className="text-brand-600 font-semibold">{`{x}`}</span> query
          </span>
          <span className="text-[10px] text-ink-muted italic">user input</span>
        </div>
      </div>

      {/* Output Connection */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-blue-500 transition-transform group-hover:scale-125"
      />
    </div>
  );
});

StartNode.displayName = "StartNode";
