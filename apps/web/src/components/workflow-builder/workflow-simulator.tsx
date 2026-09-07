import React, { useState } from "react";
import { X, Play, Loader2, CheckCircle2, Sparkles, AlertCircle } from "lucide-react";
import { WorkflowExecutionLog } from "./types";

interface WorkflowSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  onRunSimulation: (
    query: string,
    depth: number,
    onStep: (nodeId: string, status: "RUNNING" | "SUCCESS") => void
  ) => Promise<string>;
}

export function WorkflowSimulator({
  isOpen,
  onClose,
  onRunSimulation,
}: WorkflowSimulatorProps) {
  const [query, setQuery] = useState(
    "Compare available weekend packages and policies for Acme Salon"
  );
  const [depth, setDepth] = useState(3);
  const [isRunning, setIsRunning] = useState(false);
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const [logs, setLogs] = useState<WorkflowExecutionLog[]>([]);

  if (!isOpen) return null;

  const handleRun = async () => {
    setIsRunning(true);
    setFinalAnswer(null);
    setLogs([]);

    try {
      const result = await onRunSimulation(
        query,
        depth,
        (nodeId: string, status: "RUNNING" | "SUCCESS") => {
          setLogs((prev) => [
            ...prev,
            {
              id: `${nodeId}-${Date.now()}`,
              nodeId,
              nodeTitle: nodeId.replace("node_", "").toUpperCase(),
              status,
              timestamp: new Date().toLocaleTimeString(),
              outputSummary:
                status === "SUCCESS"
                  ? `Completed execution step for ${nodeId}`
                  : `Evaluating input variables...`,
            },
          ]);
        }
      );
      setFinalAnswer(result);
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          nodeId: "error",
          nodeTitle: "ERROR",
          status: "FAILED",
          timestamp: new Date().toLocaleTimeString(),
          outputSummary: err.message || "Simulation failed",
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-line bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white shadow-xs">
            <Play className="h-3 w-3 fill-current" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Workflow Preview</h3>
            <p className="text-[11px] text-ink-muted">Test execution & debug node loops</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-muted hover:bg-surface-page hover:text-ink-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Input parameters */}
      <div className="p-4 border-b border-line bg-surface-page space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-secondary">
            User Query (query)
          </label>
          <textarea
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isRunning}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-ink-secondary">
            Loop Limit (depth)
          </label>
          <input
            type="number"
            min={1}
            max={5}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            disabled={isRunning}
            className="w-20 rounded-md border border-line bg-white px-2 py-1 text-xs text-center font-mono text-ink-primary"
          />
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running Agent Loop...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              Run Workflow
            </>
          )}
        </button>
      </div>

      {/* Execution Logs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Execution Steps
        </span>

        {logs.length === 0 && !isRunning && (
          <div className="py-8 text-center text-xs text-ink-muted">
            Click &quot;Run Workflow&quot; to test the iterative loop and watch nodes execute.
          </div>
        )}

        <div className="space-y-2 font-mono text-xs">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`rounded-lg border p-2 text-[11px] ${
                log.status === "RUNNING"
                  ? "border-amber-300 bg-amber-50/60 text-amber-900"
                  : log.status === "FAILED"
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-line bg-white text-ink-secondary"
              }`}
            >
              <div className="flex items-center justify-between font-semibold mb-0.5">
                <span className="flex items-center gap-1.5">
                  {log.status === "RUNNING" && (
                    <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                  )}
                  {log.status === "SUCCESS" && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  )}
                  {log.status === "FAILED" && (
                    <AlertCircle className="h-3 w-3 text-red-600" />
                  )}
                  {log.nodeTitle}
                </span>
                <span className="text-[10px] text-ink-muted">{log.timestamp}</span>
              </div>
              <p className="text-[10px] text-ink-secondary truncate">{log.outputSummary}</p>
            </div>
          ))}
        </div>

        {/* Final Synthesized Output */}
        {finalAnswer && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Final Synthesized Answer (@Reasoning.text)
            </div>
            <div className="text-xs text-emerald-950 whitespace-pre-line leading-relaxed font-sans bg-white/80 rounded-lg p-2.5 border border-emerald-100">
              {finalAnswer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
