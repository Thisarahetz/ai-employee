import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MessageSquareText, Send } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const AnswerNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isRunning = nodeData.status === "RUNNING";
  const isSuccess = nodeData.status === "SUCCESS";

  return (
    <div
      className={`group relative min-w-[210px] rounded-xl border bg-white p-3.5 shadow-sm transition-all ${
        selected ? "border-brand-600 ring-2 ring-brand-500/20 shadow-md" : "border-line hover:border-brand-300"
      } ${isRunning ? "ring-2 ring-amber-400 animate-pulse" : ""} ${
        isSuccess ? "border-emerald-500 ring-1 ring-emerald-500/30" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-orange-500 transition-transform group-hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white shadow-xs">
            <MessageSquareText className="h-3.5 w-3.5" />
          </div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            {nodeData.title || "ANSWER"}
          </h4>
        </div>
        <span className="flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 border border-orange-200">
          <Send className="h-2.5 w-2.5" />
          DISPATCH
        </span>
      </div>

      {/* Answer Reference */}
      <div className="rounded-lg bg-orange-50/50 p-2 border border-orange-200/60 font-mono text-[11px]">
        <span className="text-[10px] uppercase text-orange-600 block font-semibold">Output text:</span>
        <span className="text-ink-primary font-bold">
          {nodeData.outputVariable || "@Reasoning.text"}
        </span>
      </div>
    </div>
  );
});

AnswerNode.displayName = "AnswerNode";
