import { Node, Edge } from "@xyflow/react";

export const initialNodes: Node[] = [
  // 1. START NODE
  {
    id: "node_start",
    type: "startNode",
    position: { x: 50, y: 120 },
    data: {
      title: "START",
      inputVariables: [
        { name: "depth", type: "number", defaultValue: "3" },
        { name: "query", type: "string" },
      ],
      status: "IDLE",
    },
  },

  // 2. ITERATION CONTAINER
  {
    id: "node_iteration_group",
    type: "iterationGroupNode",
    position: { x: 260, y: 40 },
    style: { width: 880, height: 460 },
    data: {
      title: "ITERATION (DEEP RESEARCH LOOP)",
      maxIterations: 3,
      status: "IDLE",
    },
  },

  // 3. LLM PLANNER (Inside loop)
  {
    id: "node_llm",
    type: "llmNode",
    position: { x: 300, y: 110 },
    data: {
      title: "LLM (PLANNER)",
      model: "gpt-4o",
      systemPrompt:
        "Determine what info is missing. Output nextSearchTopic and shouldContinue (true/false).",
      toolConfig: { temperature: 0.2 },
      status: "IDLE",
    },
  },

  // 4. ASSIGN VARIABLES (Topic & Continue flag)
  {
    id: "node_assign_vars",
    type: "aggregatorNode",
    position: { x: 620, y: 110 },
    data: {
      title: "ASSIGN VARIABLES",
      assignedVariables: [
        { name: "nextSearchTopic", mode: "OVERWRITE", source: "LLM.topic" },
        { name: "shouldContinue", mode: "OVERWRITE", source: "LLM.continue" },
        { name: "topics", mode: "APPEND", source: "LLM.topic" },
      ],
      status: "IDLE",
    },
  },

  // 5. IF / ELSE CONDITION
  {
    id: "node_condition",
    type: "conditionNode",
    position: { x: 300, y: 280 },
    data: {
      title: "IF / ELSE",
      conditionVariable: "shouldContinue",
      conditionOperator: "==",
      conditionValue: "True",
      status: "IDLE",
    },
  },

  // 6. TAVILY SEARCH TOOL
  {
    id: "node_tavily",
    type: "toolNode",
    position: { x: 560, y: 280 },
    data: {
      title: "TAVILY SEARCH",
      toolType: "TAVILY_SEARCH",
      toolConfig: {
        DAYS: 3,
        MAX_RESULTS: 5,
        SEARCH_DEPTH: "advanced",
        TOPIC: "general",
      },
      status: "IDLE",
    },
  },

  // 7. ASSIGN FINDINGS
  {
    id: "node_assign_findings",
    type: "aggregatorNode",
    position: { x: 840, y: 280 },
    data: {
      title: "ASSIGN FINDINGS",
      assignedVariables: [
        { name: "findings", mode: "APPEND", source: "Tavily.results" },
        { name: "iterationCount", mode: "APPEND", source: "System.loopIndex" },
      ],
      status: "IDLE",
    },
  },

  // 8. REASONING MODEL (DeepSeek Reasoner)
  {
    id: "node_reasoning",
    type: "reasoningNode",
    position: { x: 1200, y: 110 },
    data: {
      title: "REASONING MODEL",
      model: "deepseek-reasoner",
      systemPrompt:
        "Synthesize all accumulated findings into an exhaustive, structured report.",
      status: "IDLE",
    },
  },

  // 9. FINAL ANSWER
  {
    id: "node_answer",
    type: "answerNode",
    position: { x: 1200, y: 280 },
    data: {
      title: "ANSWER",
      outputVariable: "@Reasoning.text",
      status: "IDLE",
    },
  },
];

export const initialEdges: Edge[] = [
  {
    id: "edge_start_llm",
    source: "node_start",
    target: "node_llm",
    animated: true,
    style: { stroke: "#256abf", strokeWidth: 2 },
  },
  {
    id: "edge_llm_vars",
    source: "node_llm",
    target: "node_assign_vars",
    style: { stroke: "#6366f1", strokeWidth: 2 },
  },
  {
    id: "edge_llm_condition",
    source: "node_llm",
    target: "node_condition",
    style: { stroke: "#6366f1", strokeWidth: 2 },
  },
  {
    id: "edge_condition_tavily",
    source: "node_condition",
    sourceHandle: "if_true",
    target: "node_tavily",
    animated: true,
    style: { stroke: "#10b981", strokeWidth: 2 },
  },
  {
    id: "edge_tavily_findings",
    source: "node_tavily",
    target: "node_assign_findings",
    style: { stroke: "#0d9488", strokeWidth: 2 },
  },
  {
    id: "edge_findings_reasoning",
    source: "node_assign_findings",
    target: "node_reasoning",
    animated: true,
    style: { stroke: "#9333ea", strokeWidth: 2 },
  },
  {
    id: "edge_reasoning_answer",
    source: "node_reasoning",
    target: "node_answer",
    animated: true,
    style: { stroke: "#f97316", strokeWidth: 2 },
  },
];
