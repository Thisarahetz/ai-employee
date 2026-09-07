"use client";

import React, { useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Play,
  Save,
  Plus,
  RotateCcw,
  Sparkles,
  GitBranch,
  Globe,
  SlidersHorizontal,
  BrainCircuit,
  MessageSquareText,
  FileCode,
  Check,
} from "lucide-react";

import { nodeTypes } from "./nodes";
import { initialNodes, initialEdges } from "./initial-elements";
import { NodeInspector } from "./node-inspector";
import { WorkflowSimulator } from "./workflow-simulator";
import { WorkflowNodeData, NodeType } from "./types";

export function WorkflowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  // Handle edge connection
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#256abf", strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Update node data from inspector
  const handleUpdateNodeData = (nodeId: string, newData: Partial<WorkflowNodeData>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...newData,
            },
          };
        }
        return node;
      })
    );
  };

  // Delete node
  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  };

  // Add new node from menu
  const handleAddNode = (type: NodeType) => {
    const newId = `node_${Date.now()}`;
    let newNodeData: WorkflowNodeData;

    switch (type) {
      case "llmNode":
        newNodeData = {
          title: "LLM (ASSISTANT)",
          model: "gpt-4o",
          systemPrompt: "You are an autonomous AI employee task agent.",
          status: "IDLE",
        };
        break;
      case "conditionNode":
        newNodeData = {
          title: "IF / ELSE",
          conditionVariable: "status",
          conditionOperator: "==",
          conditionValue: "SUCCESS",
          status: "IDLE",
        };
        break;
      case "toolNode":
        newNodeData = {
          title: "TOOL ACTION",
          toolType: "TAVILY_SEARCH",
          toolConfig: { MAX_RESULTS: 5, TOPIC: "general" },
          status: "IDLE",
        };
        break;
      case "aggregatorNode":
        newNodeData = {
          title: "ASSIGN VARIABLES",
          assignedVariables: [{ name: "result", mode: "OVERWRITE", source: "Tool.output" }],
          status: "IDLE",
        };
        break;
      case "reasoningNode":
        newNodeData = {
          title: "REASONING MODEL",
          model: "deepseek-reasoner",
          systemPrompt: "Synthesize facts and formulate precise solution.",
          status: "IDLE",
        };
        break;
      case "answerNode":
        newNodeData = {
          title: "ANSWER",
          outputVariable: "@Reasoning.text",
          status: "IDLE",
        };
        break;
      default:
        newNodeData = {
          title: "START",
          inputVariables: [{ name: "query", type: "string" }],
          status: "IDLE",
        };
    }

    const newNode: Node = {
      id: newId,
      type,
      position: { x: 450 + Math.random() * 50, y: 150 + Math.random() * 50 },
      data: newNodeData,
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newId);
    setIsAddMenuOpen(false);
  };

  // Reset to default research loop
  const handleResetToTemplate = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNodeId(null);
  };

  // Save workflow graph
  const handleSave = () => {
    const graphData = {
      nodes,
      edges,
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("ai_employee_active_workflow", JSON.stringify(graphData));
    } catch {
      // Ignore if localStorage unavailable
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Simulation execution engine
  const handleRunSimulation = async (
    query: string,
    depth: number,
    onStep: (nodeId: string, status: "RUNNING" | "SUCCESS") => void
  ): Promise<string> => {
    // Helper sleep
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Reset status of all nodes
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: "IDLE" } })));

    // Step 1: Start node
    onStep("node_start", "RUNNING");
    setNodes((nds) =>
      nds.map((n) => (n.id === "node_start" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n))
    );
    await sleep(600);
    onStep("node_start", "SUCCESS");
    setNodes((nds) =>
      nds.map((n) => (n.id === "node_start" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n))
    );

    // Iteration loop
    const actualIterations = Math.min(depth, 2);
    for (let i = 1; i <= actualIterations; i++) {
      // Step 2: LLM Planner
      onStep("node_llm", "RUNNING");
      setNodes((nds) =>
        nds.map((n) => (n.id === "node_llm" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n))
      );
      await sleep(700);
      onStep("node_llm", "SUCCESS");
      setNodes((nds) =>
        nds.map((n) => (n.id === "node_llm" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n))
      );

      // Step 3: Assign vars
      onStep("node_assign_vars", "RUNNING");
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "node_assign_vars" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n
        )
      );
      await sleep(400);
      onStep("node_assign_vars", "SUCCESS");
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "node_assign_vars" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n
        )
      );

      // Step 4: Condition check
      onStep("node_condition", "RUNNING");
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "node_condition" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n
        )
      );
      await sleep(500);
      onStep("node_condition", "SUCCESS");
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "node_condition" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n
        )
      );

      // Step 5: Tavily Search
      onStep("node_tavily", "RUNNING");
      setNodes((nds) =>
        nds.map((n) => (n.id === "node_tavily" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n))
      );
      await sleep(800);
      onStep("node_tavily", "SUCCESS");
      setNodes((nds) =>
        nds.map((n) => (n.id === "node_tavily" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n))
      );

      // Step 6: Assign Findings
      onStep("node_assign_findings", "RUNNING");
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "node_assign_findings" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n
        )
      );
      await sleep(400);
      onStep("node_assign_findings", "SUCCESS");
      setNodes((nds) =>
        nds.map((n) =>
          n.id === "node_assign_findings" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n
        )
      );
    }

    // Step 7: Reasoning model
    onStep("node_reasoning", "RUNNING");
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "node_reasoning" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n
      )
    );
    await sleep(900);
    onStep("node_reasoning", "SUCCESS");
    setNodes((nds) =>
      nds.map((n) =>
        n.id === "node_reasoning" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n
      )
    );

    // Step 8: Answer node
    onStep("node_answer", "RUNNING");
    setNodes((nds) =>
      nds.map((n) => (n.id === "node_answer" ? { ...n, data: { ...n.data, status: "RUNNING" } } : n))
    );
    await sleep(400);
    onStep("node_answer", "SUCCESS");
    setNodes((nds) =>
      nds.map((n) => (n.id === "node_answer" ? { ...n, data: { ...n.data, status: "SUCCESS" } } : n))
    );

    return `Based on ${actualIterations} iterative search cycles and synthesis via DeepSeek Reasoner for query: "${query}":

1. Available Services: Acme Salon offers Premium Bridal Packages, Balayage Color Styling, and Express Treatments.
2. Weekend Availability: Saturday slots available from 10:00 AM - 4:00 PM; booking requires 24h advance confirmation.
3. Policies: Free cancellations up to 12 hours prior; 10% deposit required for bookings exceeding $150.`;
  };

  return (
    <div className="relative flex h-[calc(100vh-6.5rem)] w-full flex-col overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      {/* Top Header & Toolbar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-5 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <h2 className="text-sm font-bold text-ink-primary">
              Iterative Deep Research &amp; Action
            </h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-ink-muted">
              v1.0 · Unpublished
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Node Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-xs hover:bg-surface-page hover:text-ink-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Node
            </button>

            {isAddMenuOpen && (
              <div className="absolute right-0 top-9 z-30 w-52 rounded-xl border border-line bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  Agent Nodes
                </div>
                <button
                  type="button"
                  onClick={() => handleAddNode("llmNode")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  LLM Agent / Planner
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode("reasoningNode")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                >
                  <BrainCircuit className="h-3.5 w-3.5 text-purple-600" />
                  Reasoning Model (R1/o1)
                </button>
                <div className="my-1 border-t border-line" />
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  Logic &amp; Tools
                </div>
                <button
                  type="button"
                  onClick={() => handleAddNode("conditionNode")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                >
                  <GitBranch className="h-3.5 w-3.5 text-amber-500" />
                  If / Else Condition
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode("toolNode")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                >
                  <Globe className="h-3.5 w-3.5 text-teal-600" />
                  Tool / Search
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode("aggregatorNode")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-600" />
                  Assign Variables
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode("answerNode")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-secondary hover:bg-surface-page hover:text-ink-primary"
                >
                  <MessageSquareText className="h-3.5 w-3.5 text-orange-500" />
                  Answer Output
                </button>
              </div>
            )}
          </div>

          {/* Reset Template */}
          <button
            type="button"
            onClick={handleResetToTemplate}
            title="Reset to Deep Research template"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-secondary shadow-xs hover:bg-surface-page transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-primary shadow-xs hover:bg-surface-page transition-colors"
          >
            {saveSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 text-ink-secondary" />
                Save
              </>
            )}
          </button>

          {/* Preview / Test Run Button (Matching screenshot) */}
          <button
            type="button"
            onClick={() => setIsSimulatorOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Preview
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative flex-1 bg-surface-page">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
          <Controls className="!border-line !bg-white !shadow-md !rounded-lg" />
          <MiniMap
            className="!border-line !bg-white !shadow-md !rounded-lg"
            nodeColor={(n) => {
              if (n.type === "startNode") return "#3b82f6";
              if (n.type === "llmNode") return "#6366f1";
              if (n.type === "conditionNode") return "#f59e0b";
              if (n.type === "toolNode") return "#0d9488";
              if (n.type === "reasoningNode") return "#9333ea";
              if (n.type === "answerNode") return "#f97316";
              return "#94a3b8";
            }}
          />
        </ReactFlow>

        {/* Floating Node Inspector Sidebar */}
        {selectedNode && (
          <div className="absolute right-0 top-0 bottom-0 z-20">
            <NodeInspector
              selectedNode={selectedNode}
              onUpdateNodeData={handleUpdateNodeData}
              onDeleteNode={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        )}

        {/* Workflow Test Simulator Drawer */}
        <WorkflowSimulator
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          onRunSimulation={handleRunSimulation}
        />
      </div>
    </div>
  );
}
