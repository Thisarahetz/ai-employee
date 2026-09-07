import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Bot, Sparkles } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const LlmNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isRunning = nodeData.status === "RUNNING";
  const isSuccess = nodeData.status === "SUCCESS";

  return (
    <div
      className={`group relative min-w-[240px] max-w-[280px] rounded-xl border bg-white p-3.5 shadow-sm transition-all ${
        selected ? "border-brand-600 ring-2 ring-brand-500/20 shadow-md" : "border-line hover:border-brand-300"
      } ${isRunning ? "ring-2 ring-amber-400 animate-pulse" : ""} ${
        isSuccess ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-500 transition-transform group-hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            {nodeData.title || "LLM"}
          </h4>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200/60">
          <Sparkles className="h-3 w-3" />
          {nodeData.model || "gpt-4o"}
        </span>
      </div>

      {/* Content Preview */}
      <div className="rounded-lg bg-surface-page p-2 border border-line/60 space-y-1">
        <p className="text-[11px] text-ink-secondary line-clamp-2 italic">
          &quot;{nodeData.systemPrompt || "Analyze query, decide if more search is needed, extract next topic..."}&quot;
        </p>
        <div className="flex items-center justify-between pt-1 border-t border-line/40 text-[10px] text-ink-muted">
          <span>Output: JSON</span>
          <span>Temp: {nodeData.toolConfig?.temperature ?? 0.2}</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-indigo-500 transition-transform group-hover:scale-125"
      />
    </div>
  );
});

LlmNode.displayName = "LlmNode";
