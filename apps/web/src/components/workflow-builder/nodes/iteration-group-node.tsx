import React, { memo } from "react";
import { NodeProps } from "@xyflow/react";
import { Repeat } from "lucide-react";
import { WorkflowNodeData } from "../types";

export const IterationGroupNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as WorkflowNodeData;

  return (
    <div
      className={`h-full w-full rounded-2xl border-2 border-dashed bg-slate-50/40 p-4 transition-all ${
        selected ? "border-brand-500 bg-brand-50/20" : "border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-600 text-white">
          <Repeat className="h-3 w-3" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          {nodeData.title || "ITERATION LOOP"}
        </span>
        <span className="rounded bg-white px-2 py-0.5 text-[10px] font-mono font-medium text-slate-600 border border-slate-200">
          Max iterations: {nodeData.maxIterations || 3}
        </span>
      </div>
    </div>
  );
});

IterationGroupNode.displayName = "IterationGroupNode";
