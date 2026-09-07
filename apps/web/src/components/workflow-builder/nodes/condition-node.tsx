import React, { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
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
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-amber-500 transition-transform group-hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs">
          <GitBranch className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
          {nodeData.title || "IF / ELSE"}
        </h4>
      </div>

      {/* Condition expression */}
      <div className="mb-3 rounded-lg bg-amber-50/60 p-2 border border-amber-200/50">
        <p className="text-[11px] font-mono text-amber-900 flex items-center gap-1">
          <span className="font-semibold text-amber-700">{nodeData.conditionVariable || "shouldContinue"}</span>
          <span className="text-ink-muted">is</span>
          <span className="rounded bg-white px-1 font-bold text-amber-700 border border-amber-200">
            {nodeData.conditionValue || "True"}
          </span>
        </p>
      </div>

      {/* Branch Labels and Handles */}
      <div className="space-y-2 pt-1 border-t border-line/40">
        <div className="relative flex items-center justify-between text-[11px] font-semibold text-emerald-700">
          <span>IF (True)</span>
          <Handle
            id="if_true"
            type="source"
            position={Position.Right}
            style={{ top: "auto", right: "-18px" }}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-emerald-500"
          />
        </div>
        <div className="relative flex items-center justify-between text-[11px] font-semibold text-ink-muted">
          <span>ELSE (False)</span>
          <Handle
            id="if_false"
            type="source"
            position={Position.Right}
            style={{ top: "auto", right: "-18px" }}
            className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-slate-400"
          />
        </div>
      </div>
    </div>
  );
});

ConditionNode.displayName = "ConditionNode";
