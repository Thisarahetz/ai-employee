/**
 * Pure logic for automation rules: condition matching, {{placeholder}}
 * rendering and input validation. No I/O, so it is unit-tested directly.
 */
import { isRuleTriggerAllowed } from '../../events/external-event-policy';

export const CONDITION_OPS = ['eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists', 'in'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export interface RuleCondition {
  field: string;
  op: ConditionOp;
  value?: unknown;
}

export const ACTION_TYPES = ['CREATE_TASK', 'NOTIFY_OWNER'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+){0,5}$/;

/** Reads `a.b.c` from an event payload. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const asNumber = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

export function conditionMatches(c: RuleCondition, payload: unknown): boolean {
  const actual = getPath(payload, c.field);
  switch (c.op) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'not_exists':
      return actual === undefined || actual === null || actual === '';
    case 'eq':
      return norm(actual) === norm(c.value) || (typeof c.value === 'number' && asNumber(actual) === c.value);
    case 'neq':
      return !(norm(actual) === norm(c.value) || (typeof c.value === 'number' && asNumber(actual) === c.value));
    case 'contains':
      return typeof actual === 'string' ? actual.toLowerCase().includes(String(c.value ?? '').toLowerCase()) : Array.isArray(actual) && actual.map(norm).includes(norm(c.value));
    case 'not_contains':
      return !conditionMatches({ ...c, op: 'contains' }, payload);
    case 'in':
      return Array.isArray(c.value) && c.value.map(norm).includes(norm(actual));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = asNumber(actual);
      const b = asNumber(c.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return c.op === 'gt' ? a > b : c.op === 'gte' ? a >= b : c.op === 'lt' ? a < b : a <= b;
    }
    default:
      return false;
  }
}

export const allConditionsMatch = (conds: RuleCondition[], payload: unknown) => conds.every((c) => conditionMatches(c, payload));

/**
 * Fills {{field.path}} from the event. Values are flattened to one line and
 * capped, so an event can't smuggle a wall of text into a task title.
 */
export function renderTemplate(template: string, payload: unknown, maxValueLength = 200): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(payload, path);
    if (v === undefined || v === null) return '';
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxValueLength);
  });
}

/** Keeps the event data handed to the AI small and JSON-safe. */
export function compactPayload(payload: Record<string, unknown>, maxBytes = 4000): Record<string, unknown> {
  const { tenantId: _t, ...rest } = payload;
  const json = JSON.stringify(rest);
  if (json.length <= maxBytes) return JSON.parse(json);
  return { truncated: true, preview: json.slice(0, maxBytes) };
}

export interface RuleInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  triggerEvent?: string;
  conditions?: unknown;
  actionType?: string;
  employeeId?: string | null;
  taskTitle?: string;
  taskDescription?: string;
  priority?: string;
  dedupeKey?: string | null;
  cooldownSeconds?: number;
  maxRunsPerHour?: number;
  allowAiTriggered?: boolean;
}

export class RuleValidationError extends Error {}

/** Validates and normalises rule input. `creating` requires the mandatory fields. */
export function normalizeRuleInput(input: RuleInput, creating: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fail = (m: string): never => {
    throw new RuleValidationError(m);
  };

  if (creating || input.name !== undefined) {
    const name = input.name?.trim();
    if (!name) fail('A rule name is required.');
    out.name = name!.slice(0, 120);
  }
  if (input.description !== undefined) out.description = String(input.description ?? '').slice(0, 1000);
  if (input.enabled !== undefined) out.enabled = Boolean(input.enabled);

  if (creating || input.triggerEvent !== undefined) {
    const ev = String(input.triggerEvent ?? '').trim();
    if (!ev || !isRuleTriggerAllowed(ev)) fail(`"${ev}" is not an event a rule can listen to.`);
    out.triggerEvent = ev;
  }

  if (input.conditions !== undefined) {
    if (!Array.isArray(input.conditions)) fail('conditions must be a list.');
    const list = input.conditions as unknown[];
    if (list.length > 10) fail('A rule can have at most 10 conditions.');
    out.conditions = list.map((raw, i) => {
      const c = raw as RuleCondition;
      if (!c || typeof c.field !== 'string' || !FIELD.test(c.field)) fail(`Condition ${i + 1}: field must look like "status" or "customer.tier".`);
      if (!CONDITION_OPS.includes(c.op)) fail(`Condition ${i + 1}: op must be one of ${CONDITION_OPS.join(', ')}.`);
      if (c.op === 'in' && !Array.isArray(c.value)) fail(`Condition ${i + 1}: "in" needs a list of values.`);
      const value = c.op === 'exists' || c.op === 'not_exists' ? undefined : c.value;
      if (value !== undefined && JSON.stringify(value).length > 500) fail(`Condition ${i + 1}: value is too long.`);
      return { field: c.field, op: c.op, ...(value !== undefined ? { value } : {}) };
    });
  } else if (creating) {
    out.conditions = [];
  }

  if (creating || input.actionType !== undefined) {
    const a = String(input.actionType ?? 'CREATE_TASK').toUpperCase();
    if (!(ACTION_TYPES as readonly string[]).includes(a)) fail(`actionType must be one of ${ACTION_TYPES.join(', ')}.`);
    out.actionType = a;
  }
  if (creating || input.taskTitle !== undefined) {
    const t = input.taskTitle?.trim();
    if (!t) fail('A task title (or notification title) is required.');
    out.taskTitle = t!.slice(0, 200);
  }
  if (input.taskDescription !== undefined) out.taskDescription = String(input.taskDescription ?? '').slice(0, 4000);
  if (input.priority !== undefined) {
    const p = String(input.priority).toUpperCase();
    if (!PRIORITIES.includes(p)) fail(`priority must be one of ${PRIORITIES.join(', ')}.`);
    out.priority = p;
  }
  if (input.employeeId !== undefined) out.employeeId = input.employeeId || null;
  if (input.dedupeKey !== undefined) out.dedupeKey = input.dedupeKey ? String(input.dedupeKey).slice(0, 200) : null;
  if (input.cooldownSeconds !== undefined) {
    const n = Number(input.cooldownSeconds);
    if (!Number.isInteger(n) || n < 0 || n > 30 * 86400) fail('cooldownSeconds must be between 0 and 2592000 (30 days).');
    out.cooldownSeconds = n;
  }
  if (input.maxRunsPerHour !== undefined) {
    const n = Number(input.maxRunsPerHour);
    if (!Number.isInteger(n) || n < 1 || n > 200) fail('maxRunsPerHour must be between 1 and 200.');
    out.maxRunsPerHour = n;
  }
  if (input.allowAiTriggered !== undefined) out.allowAiTriggered = Boolean(input.allowAiTriggered);
  return out;
}
