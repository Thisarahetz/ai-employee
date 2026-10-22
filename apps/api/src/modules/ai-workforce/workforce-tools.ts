/**
 * Tool catalogue + permission policy for the AI Workforce command engine.
 *
 * Every tool an AI employee can call is described here with a risk level:
 *   READ        — reads business data; runs automatically once granted.
 *   WRITE       — changes something low-impact; runs automatically for
 *                 AUTOMATIC employees, needs owner approval otherwise.
 *   SENSITIVE   — high-impact (sends external communications, spends or
 *                 refunds money, deletes data, cancels things); ALWAYS needs
 *                 explicit owner approval, whatever the employee's level.
 *   RESTRICTED  — never executable by an AI employee (permission/role
 *                 management, money transfers, settings changes).
 *
 * The policy is evaluated server-side at execution time against a freshly
 * loaded employee record, so the model can only ever *request* a tool — it
 * cannot widen its own grants, and nothing in this catalogue can modify
 * employee permissions, tool grants or approvals.
 */

export type ToolRisk = 'READ' | 'WRITE' | 'SENSITIVE' | 'RESTRICTED';

export interface WorkforceToolSpec {
  /** Name the model calls. */
  name: string;
  /** Grant key stored in AiEmployee.connectedTools. */
  grant: string;
  label: string;
  description: string;
  risk: ToolRisk;
  /** AiEmployee.permissions toggle that must also be `true` (e.g. viewCustomers). */
  requiresPermission?: string;
  parameters: Record<string, unknown>;
  source: 'internal' | 'integration';
  integrationId?: string;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  required.length ? { type: 'object', properties, required } : { type: 'object', properties };

export const INTERNAL_TOOLS: WorkforceToolSpec[] = [
  {
    name: 'list_tasks',
    grant: 'tasks.read',
    label: 'View team tasks',
    description:
      'List AI workforce tasks with their status, assignee and progress. Optional filters: status (QUEUED, RUNNING, WAITING_APPROVAL, PAUSED, COMPLETED, FAILED, CANCELLED) and employeeName.',
    risk: 'READ',
    parameters: obj({
      status: { type: 'string' },
      employeeName: { type: 'string' },
      limit: { type: 'number' },
    }),
    source: 'internal',
  },
  {
    name: 'get_task',
    grant: 'tasks.read',
    label: 'View team tasks',
    description: 'Get one task in detail, including its result or error.',
    risk: 'READ',
    parameters: obj({ taskId: { type: 'string' } }, ['taskId']),
    source: 'internal',
  },
  {
    name: 'summarize_activity',
    grant: 'activity.read',
    label: 'Read activity history',
    description: 'Summarize AI employee activity and completed tasks for a period ("today" or "week").',
    risk: 'READ',
    parameters: obj({ period: { type: 'string', enum: ['today', 'week'] } }),
    source: 'internal',
  },
  {
    name: 'search_knowledge_base',
    grant: 'knowledge.search',
    label: 'Search company knowledge',
    description: "Semantic search over the company's knowledge base documents (policies, services, pricing, procedures).",
    risk: 'READ',
    parameters: obj({ query: { type: 'string' } }, ['query']),
    source: 'internal',
  },
  {
    name: 'get_business_metrics',
    grant: 'metrics.read',
    label: 'Read business metrics',
    description:
      'Get real platform metrics for the last N days compared with the previous N days: customer conversations, new customers, human handoffs, appointments booked/cancelled, leads, and AI action executions.',
    risk: 'READ',
    parameters: obj({ days: { type: 'number' } }),
    source: 'internal',
  },
  {
    name: 'list_customers',
    grant: 'customers.read',
    label: 'Read customer records',
    description: 'List customers known to the platform (name, email, phone, last contact). Optional search text.',
    risk: 'READ',
    requiresPermission: 'viewCustomers',
    parameters: obj({ search: { type: 'string' }, limit: { type: 'number' } }),
    source: 'internal',
  },
  {
    name: 'fetch_webpage',
    grant: 'web.fetch',
    label: 'Read public web pages',
    description:
      'Fetch a public web page (http/https) and return its title, meta description, headings, links count and visible text. Use to analyse a website.',
    risk: 'READ',
    parameters: obj({ url: { type: 'string' } }, ['url']),
    source: 'internal',
  },
  {
    name: 'delegate_task',
    grant: 'tasks.delegate',
    label: 'Delegate work to teammates',
    description:
      'Hand a piece of work to another AI employee (by name or department). The delegated task runs with that employee’s own permissions.',
    risk: 'WRITE',
    parameters: obj(
      {
        employeeName: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      },
      ['employeeName', 'title'],
    ),
    source: 'internal',
  },
  {
    name: 'notify_owner',
    grant: 'owner.notify',
    label: 'Notify the owner',
    description: 'Send an in-app notification to the business owners/admins.',
    risk: 'WRITE',
    parameters: obj({ title: { type: 'string' }, message: { type: 'string' } }, ['title', 'message']),
    source: 'internal',
  },
  {
    name: 'send_email',
    grant: 'email.send',
    label: 'Send emails',
    description: 'Send an email to a recipient. Always held for owner approval before it is sent.',
    risk: 'SENSITIVE',
    parameters: obj(
      { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } },
      ['to', 'subject', 'body'],
    ),
    source: 'internal',
  },
];

/** Grant that covers every READ-risk integration action. */
export const INTEGRATION_READ_GRANT = 'integration:read';
export const integrationGrant = (actionName: string) => `integration:${actionName}`;

/**
 * Applied until the owner explicitly configures an employee's tool access.
 * Read-only tools + low-impact coordination only — never email, never
 * integration write actions.
 */
export const DEFAULT_TOOL_GRANTS = [
  'tasks.read',
  'activity.read',
  'knowledge.search',
  'metrics.read',
  'customers.read',
  'web.fetch',
  'tasks.delegate',
  'owner.notify',
  INTEGRATION_READ_GRANT,
];

const READ_PREFIX = /^(get|list|find|search|check|lookup|fetch|view|read|count)_/i;
const RESTRICTED_PATTERN = /(permission|role|grant|privilege|transfer_money|wire|change_settings|update_settings|delete_employee|api_key|credential)/i;
const SENSITIVE_PATTERN =
  /(delete|remove|destroy|purge|refund|charge|pay|payment|payout|purchase|invoice|cancel|send|email|sms|broadcast|campaign|publish|discount|price)/i;

export function classifyIntegrationAction(name: string): ToolRisk {
  if (RESTRICTED_PATTERN.test(name)) return 'RESTRICTED';
  if (READ_PREFIX.test(name)) return 'READ';
  if (SENSITIVE_PATTERN.test(name)) return 'SENSITIVE';
  return 'WRITE';
}

export function buildIntegrationTool(action: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  integrationId: string;
}): WorkforceToolSpec {
  return {
    name: action.name,
    grant: integrationGrant(action.name),
    label: action.name.replace(/_/g, ' '),
    description: action.description,
    risk: classifyIntegrationAction(action.name),
    parameters: action.parameters,
    source: 'integration',
    integrationId: action.integrationId,
  };
}

export interface PolicyEmployee {
  status: string;
  actionLevel: string;
  permissions: unknown;
  connectedTools: string[];
  toolAccessConfigured: boolean;
}

export function effectiveGrants(employee: Pick<PolicyEmployee, 'connectedTools' | 'toolAccessConfigured'>): Set<string> {
  return new Set(employee.toolAccessConfigured ? employee.connectedTools ?? [] : DEFAULT_TOOL_GRANTS);
}

export function hasGrant(grants: Set<string>, tool: WorkforceToolSpec): boolean {
  if (grants.has(tool.grant)) return true;
  return tool.source === 'integration' && tool.risk === 'READ' && grants.has(INTEGRATION_READ_GRANT);
}

export type PolicyDecision = 'ALLOW' | 'NEEDS_APPROVAL' | 'DENY';

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
}

/**
 * Decides whether an employee may run a tool right now.
 * `ownerApproved` is true only when re-checking a tool call an authorised
 * owner/admin has just approved — it skips the approval gate but none of the
 * other checks (a revoked grant or paused employee still blocks execution).
 */
export function evaluateToolPolicy(
  employee: PolicyEmployee,
  tool: WorkforceToolSpec | undefined,
  opts: { ownerApproved?: boolean } = {},
): PolicyResult {
  if (!tool) return { decision: 'DENY', reason: 'Unknown tool — it is not part of this employee’s toolset.' };
  if (employee.status !== 'ACTIVE') {
    return { decision: 'DENY', reason: 'This AI employee is paused by the owner and cannot act.' };
  }
  if (tool.risk === 'RESTRICTED') {
    return { decision: 'DENY', reason: `"${tool.name}" is restricted to the business owner and can never be run by an AI employee.` };
  }
  if (!hasGrant(effectiveGrants(employee), tool)) {
    return { decision: 'DENY', reason: `The owner has not granted the "${tool.label}" tool to this employee.` };
  }
  if (tool.requiresPermission) {
    const perms = (employee.permissions ?? {}) as Record<string, unknown>;
    if (perms[tool.requiresPermission] !== true) {
      return { decision: 'DENY', reason: `This employee lacks the "${tool.requiresPermission}" permission.` };
    }
  }
  if (opts.ownerApproved) return { decision: 'ALLOW', reason: 'Approved by the owner.' };

  if (tool.risk === 'SENSITIVE') {
    return { decision: 'NEEDS_APPROVAL', reason: 'High-impact action — requires explicit owner approval.' };
  }
  if (tool.risk === 'WRITE' && employee.actionLevel !== 'AUTOMATIC') {
    return {
      decision: 'NEEDS_APPROVAL',
      reason: `This employee's autonomy level (${employee.actionLevel}) requires owner approval for changes.`,
    };
  }
  return { decision: 'ALLOW', reason: 'Permitted.' };
}
