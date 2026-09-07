export type NodeType =
  | "startNode"
  | "llmNode"
  | "conditionNode"
  | "toolNode"
  | "aggregatorNode"
  | "reasoningNode"
  | "answerNode"
  | "iterationGroupNode";

export interface WorkflowNodeData {
  title: string;
  description?: string;
  category?: string;
  model?: string;
  systemPrompt?: string;
  toolType?: "TAVILY_SEARCH" | "KNOWLEDGE_RAG" | "INTEGRATION_ACTION";
  toolConfig?: Record<string, any>;
  conditionVariable?: string;
  conditionOperator?: string;
  conditionValue?: string;
  inputVariables?: { name: string; type: string; defaultValue?: string }[];
  outputVariable?: string;
  assignedVariables?: { name: string; mode: "OVERWRITE" | "APPEND"; source: string }[];
  isExecuting?: boolean;
  hasExecuted?: boolean;
  status?: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  [key: string]: any;
}

export interface WorkflowExecutionLog {
  id: string;
  nodeId: string;
  nodeTitle: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  timestamp: string;
  inputSummary?: string;
  outputSummary?: string;
}
