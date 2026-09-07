import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Globe, Database, Wrench } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const ToolNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isRunning = nodeData.status === "RUNNING";
  const isSuccess = nodeData.status === "SUCCESS";

  const getToolIcon = () => {
    switch (nodeData.toolType) {
      case "TAVILY_SEARCH":
        return <Globe className="h-3.5 w-3.5" />;
      case "KNOWLEDGE_RAG":
        return <Database className="h-3.5 w-3.5" />;
      default:
        return <Wrench className="h-3.5 w-3.5" />;
    }
  };

  const toolConfig = nodeData.toolConfig || {
    DAYS: 3,
    MAX_RESULTS: 5,
    SEARCH_DEPTH: "advanced",
    TOPIC: "general",
  };

  return (
    <div
      className={`group relative min-w-[230px] rounded-xl border bg-white p-3.5 shadow-sm transition-all ${
        selected ? "border-brand-600 ring-2 ring-brand-500/20 shadow-md" : "border-line hover:border-brand-300"
      } ${isRunning ? "ring-2 ring-amber-400 animate-pulse" : ""} ${
        isSuccess ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-teal-500 transition-transform group-hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
            {getToolIcon()}
          </div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            {nodeData.title || "TAVILY SEARCH"}
          </h4>
        </div>
        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 border border-teal-200">
          TOOL
        </span>
      </div>

      {/* Parameter Key-Values */}
      <div className="space-y-1 rounded-lg bg-surface-page p-2 border border-line/60 font-mono text-[10px]">
        {Object.entries(toolConfig).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-ink-secondary">
            <span className="text-ink-muted">{key}</span>
            <span className="font-semibold text-ink-primary truncate max-w-[110px]">
              {String(value)}
            </span>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-teal-500 transition-transform group-hover:scale-125"
      />
    </div>
  );
});

ToolNode.displayName = "ToolNode";
