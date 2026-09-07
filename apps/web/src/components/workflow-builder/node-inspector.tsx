import React from "react";
import { Node } from "@xyflow/react";
import { X, Trash2, Copy, Settings2 } from "lucide-react";
import { WorkflowNodeData } from "./types";

interface NodeInspectorProps {
  selectedNode: Node | null;
  onUpdateNodeData: (nodeId: string, newData: Partial<WorkflowNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function NodeInspector({
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: NodeInspectorProps) {
  if (!selectedNode) return null;

  const data = selectedNode.data as unknown as WorkflowNodeData;

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateNodeData(selectedNode.id, { title: e.target.value });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateNodeData(selectedNode.id, { model: e.target.value });
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdateNodeData(selectedNode.id, { systemPrompt: e.target.value });
  };

  const handleConditionChange = (field: string, value: string) => {
    onUpdateNodeData(selectedNode.id, { [field]: value });
  };

  return (
    <aside className="w-80 border-l border-line bg-white p-4 shadow-lg flex flex-col h-full overflow-y-auto animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-primary">Node Inspector</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-muted hover:bg-surface-page hover:text-ink-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 py-4 space-y-4">
        {/* Node ID and Type badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted font-mono">{selectedNode.id}</span>
          <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
            {selectedNode.type}
          </span>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-ink-secondary">Node Title</label>
          <input
            type="text"
            value={data.title || ""}
            onChange={handleTitleChange}
            className="w-full rounded-md border border-line px-3 py-1.5 text-sm text-ink-primary focus:border-brand-500 focus:outline-none"
          />
        </div>

        {/* LLM & REASONING SETTINGS */}
        {(selectedNode.type === "llmNode" || selectedNode.type === "reasoningNode") && (
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">Model</label>
              <select
                value={data.model || "gpt-4o"}
                onChange={handleModelChange}
                className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink-primary focus:border-brand-500 focus:outline-none"
              >
                <option value="gpt-4o">OpenAI GPT-4o (Chat)</option>
                <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                <option value="deepseek-reasoner">DeepSeek Reasoner (R1)</option>
                <option value="deepseek-chat">DeepSeek Chat (V3)</option>
                <option value="gemini-1.5-pro">Google Gemini 1.5 Pro</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">System Instruction</label>
              <textarea
                rows={4}
                value={data.systemPrompt || ""}
                onChange={handlePromptChange}
                placeholder="Enter system prompt for this agent step..."
                className="w-full rounded-md border border-line px-3 py-2 text-xs text-ink-primary focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* CONDITION SETTINGS */}
        {selectedNode.type === "conditionNode" && (
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">Variable Name</label>
              <input
                type="text"
                value={data.conditionVariable || "shouldContinue"}
                onChange={(e) => handleConditionChange("conditionVariable", e.target.value)}
                className="w-full rounded-md border border-line px-3 py-1.5 text-sm text-ink-primary font-mono focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">Operator</label>
              <select
                value={data.conditionOperator || "=="}
                onChange={(e) => handleConditionChange("conditionOperator", e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink-primary focus:border-brand-500 focus:outline-none"
              >
                <option value="==">Equals (==)</option>
                <option value="!=">Not Equals (!=)</option>
                <option value="contains">Contains</option>
                <option value="is_true">Is True</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">Expected Value</label>
              <input
                type="text"
                value={data.conditionValue || "True"}
                onChange={(e) => handleConditionChange("conditionValue", e.target.value)}
                className="w-full rounded-md border border-line px-3 py-1.5 text-sm text-ink-primary font-mono focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* TOOL SETTINGS */}
        {selectedNode.type === "toolNode" && (
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">Tool Provider</label>
              <select
                value={data.toolType || "TAVILY_SEARCH"}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, {
                    toolType: e.target.value as any,
                  })
                }
                className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink-primary focus:border-brand-500 focus:outline-none"
              >
                <option value="TAVILY_SEARCH">Tavily AI Web Search</option>
                <option value="KNOWLEDGE_RAG">pgvector Knowledge Base RAG</option>
                <option value="INTEGRATION_ACTION">External System Action (SDK)</option>
              </select>
            </div>

            <div className="rounded-md bg-surface-page p-2.5 border border-line/60 space-y-2 text-xs">
              <span className="font-semibold text-ink-secondary block">Tool Parameters</span>
              <div className="space-y-1">
                <span className="text-[11px] text-ink-muted">MAX_RESULTS:</span>
                <input
                  type="number"
                  defaultValue={data.toolConfig?.MAX_RESULTS || 5}
                  className="w-full rounded border border-line bg-white px-2 py-1 text-xs"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-ink-muted">SEARCH_DEPTH:</span>
                <input
                  type="text"
                  defaultValue={data.toolConfig?.SEARCH_DEPTH || "advanced"}
                  className="w-full rounded border border-line bg-white px-2 py-1 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* ANSWER SETTINGS */}
        {selectedNode.type === "answerNode" && (
          <div className="space-y-3 pt-2 border-t border-line">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-secondary">Output Variable</label>
              <input
                type="text"
                value={data.outputVariable || "@Reasoning.text"}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { outputVariable: e.target.value })
                }
                className="w-full rounded-md border border-line px-3 py-1.5 text-sm font-mono text-ink-primary focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Delete button */}
      <div className="pt-3 border-t border-line">
        <button
          type="button"
          onClick={() => onDeleteNode(selectedNode.id)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-status-critical/30 bg-red-50/40 py-2 text-xs font-semibold text-status-critical transition-colors hover:bg-red-50 hover:border-status-critical"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Node
        </button>
      </div>
    </aside>
  );
}
