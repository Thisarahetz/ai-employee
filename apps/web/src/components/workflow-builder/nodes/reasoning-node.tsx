import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { BrainCircuit, Cpu } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const ReasoningNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isRunning = nodeData.status === "RUNNING";
  const isSuccess = nodeData.status === "SUCCESS";

  return (
    <div
      className={`group relative min-w-[240px] max-w-[280px] rounded-xl border bg-white p-3.5 shadow-sm transition-all ${
        selected ? "border-brand-600 ring-2 ring-brand-500/20 shadow-md" : "border-line hover:border-brand-300"
      } ${isRunning ? "ring-2 ring-purple-400 animate-pulse" : ""} ${
        isSuccess ? "border-purple-500 ring-1 ring-purple-500/30" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-purple-600 transition-transform group-hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-600 text-white shadow-xs">
            <BrainCircuit className="h-3.5 w-3.5" />
          </div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            {nodeData.title || "REASONING MODEL"}
          </h4>
        </div>
        <span className="flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200/70">
          <Cpu className="h-3 w-3" />
          {nodeData.model || "deepseek-reasoner"}
        </span>
      </div>

      {/* Synthesis preview */}
      <div className="rounded-lg bg-purple-50/40 p-2 border border-purple-100 space-y-1">
        <p className="text-[11px] text-purple-950 line-clamp-2 italic">
          &quot;Synthesize findings across all research iterations, verify citations, and produce structured answer.&quot;
        </p>
        <div className="flex items-center justify-between pt-1 border-t border-purple-200/40 text-[10px] text-purple-700/80">
          <span>Input: @AggregatedFindings</span>
          <span>Mode: Deep Reasoning</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-purple-600 transition-transform group-hover:scale-125"
      />
    </div>
  );
});

ReasoningNode.displayName = "ReasoningNode";
