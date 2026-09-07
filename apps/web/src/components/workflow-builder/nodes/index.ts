import { StartNode } from "./start-node";
import { LlmNode } from "./llm-node";
import { ConditionNode } from "./condition-node";
import { ToolNode } from "./tool-node";
import { AggregatorNode } from "./aggregator-node";
import { ReasoningNode } from "./reasoning-node";
import { AnswerNode } from "./answer-node";
import { IterationGroupNode } from "./iteration-group-node";

export const nodeTypes = {
  startNode: StartNode,
  llmNode: LlmNode,
  conditionNode: ConditionNode,
  toolNode: ToolNode,
  aggregatorNode: AggregatorNode,
  reasoningNode: ReasoningNode,
  answerNode: AnswerNode,
  iterationGroupNode: IterationGroupNode,
};
