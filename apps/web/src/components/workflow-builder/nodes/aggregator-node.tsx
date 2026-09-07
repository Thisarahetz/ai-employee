import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { SlidersHorizontal } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const AggregatorNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isRunning = nodeData.status === "RUNNING";
  const isSuccess = nodeData.status === "SUCCESS";

  const variables = nodeData.assignedVariables || [
    { name: "nextSearchTopic", mode: "OVERWRITE", source: "LLM.topic" },
    { name: "shouldContinue", mode: "OVERWRITE", source: "LLM.continue" },
    { name: "findings", mode: "APPEND", source: "Tavily.results" },
  ];

  return (
    <div
      className={`group relative min-w-[220px] rounded-xl border bg-white p-3.5 shadow-sm transition-all ${
        selected ? "border-brand-600 ring-2 ring-brand-500/20 shadow-md" : "border-line hover:border-brand-300"
      } ${isRunning ? "ring-2 ring-amber-400 animate-pulse" : ""} ${
        isSuccess ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-cyan-600 transition-transform group-hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
          {nodeData.title || "ASSIGN VARIABLES"}
        </h4>
      </div>

      {/* Variable Assignments */}
      <div className="space-y-1.5 rounded-lg bg-surface-page p-2 border border-line/60 font-mono text-[10px]">
        {variables.map((v, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-ink-secondary truncate max-w-[120px]">{v.name}</span>
            <span
              className={`rounded px-1 py-0.2 text-[9px] font-bold ${
                v.mode === "APPEND"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              {v.mode}
            </span>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-cyan-600 transition-transform group-hover:scale-125"
      />
    </div>
  );
});

AggregatorNode.displayName = "AggregatorNode";
