/**
 * The shape of an industry template and its validator. Templates are data
 * (stored in IndustryTemplate.definition), so every field is checked here
 * before it is saved or applied.
 */
import { assertScheduleAllowed } from '../ai-workforce/cron';
import { RuleInput, RuleValidationError, normalizeRuleInput } from '../ai-workforce/automation-rules';

export const ACTION_LEVELS = ['AUTOMATIC', 'APPROVAL_REQUIRED', 'OWNER_ONLY'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const KEY = /^[a-z][a-z0-9_]{1,40}$/;

export interface TemplateEmployeeDef {
  key: string;
  name: string;
  role: string;
  department: string;
  businessFunction: string;
  description: string;
  actionLevel: (typeof ACTION_LEVELS)[number];
  responsibilities: string[];
  permissions: Record<string, boolean>;
  systemPrompt: string;
  /** Workforce tool grants (see workforce-tools.ts); omitted = role-safe defaults. */
  toolGrants?: string[];
}

export interface TemplateScheduleDef {
  employeeKey: string;
  title: string;
  description?: string;
  cron: string;
  priority?: string;
}

export interface TemplateRuleDef extends RuleInput {
  /** Required for CREATE_TASK rules: which template employee handles it. */
  employeeKey?: string;
}

export interface TemplateDefinition {
  departments: string[];
  employees: TemplateEmployeeDef[];
  schedules: TemplateScheduleDef[];
  rules: TemplateRuleDef[];
}

export class TemplateValidationError extends Error {}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

export function validateDefinition(raw: unknown): TemplateDefinition {
  const fail = (m: string): never => {
    throw new TemplateValidationError(m);
  };
  if (!raw || typeof raw !== 'object') fail('definition must be an object.');
  const d = raw as Record<string, unknown>;

  const employeesIn = Array.isArray(d.employees) ? d.employees : fail('definition.employees must be a list.');
  if (employeesIn.length === 0) fail('A template needs at least one AI employee.');
  if (employeesIn.length > 20) fail('A template can have at most 20 AI employees.');
  const keys = new Set<string>();
  const employees: TemplateEmployeeDef[] = employeesIn.map((e: any, i: number) => {
    const at = `Employee ${i + 1}`;
    const key = str(e?.key, 41);
    if (!KEY.test(key)) fail(`${at}: key must be lowercase letters, digits or _ (e.g. "receptionist").`);
    if (keys.has(key)) fail(`${at}: duplicate key "${key}".`);
    keys.add(key);
    const name = str(e?.name, 100);
    const role = str(e?.role, 100);
    if (!name || !role) fail(`${at}: name and role are required.`);
    const actionLevel = (ACTION_LEVELS as readonly string[]).includes(e?.actionLevel) ? e.actionLevel : 'APPROVAL_REQUIRED';
    const permissions: Record<string, boolean> = {};
    if (e?.permissions && typeof e.permissions === 'object') {
      for (const [k, v] of Object.entries(e.permissions).slice(0, 40)) if (/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) permissions[k] = v === true;
    }
    const toolGrants = e?.toolGrants === undefined ? undefined : strList(e.toolGrants, 40, 80);
    return {
      key,
      name,
      role,
      department: str(e?.department, 60) || 'Operations',
      businessFunction: str(e?.businessFunction, 200) || role,
      description: str(e?.description, 1000),
      actionLevel,
      responsibilities: strList(e?.responsibilities, 20, 300),
      permissions,
      systemPrompt: str(e?.systemPrompt, 4000),
      ...(toolGrants ? { toolGrants } : {}),
    };
  });

  const schedulesIn = d.schedules === undefined ? [] : Array.isArray(d.schedules) ? d.schedules : fail('definition.schedules must be a list.');
  if (schedulesIn.length > 20) fail('A template can have at most 20 schedules.');
  const schedules: TemplateScheduleDef[] = schedulesIn.map((s: any, i: number) => {
    const at = `Schedule ${i + 1}`;
    const employeeKey = str(s?.employeeKey, 41);
    if (!keys.has(employeeKey)) fail(`${at}: employeeKey "${employeeKey}" is not an employee in this template.`);
    const title = str(s?.title, 200);
    if (!title) fail(`${at}: title is required.`);
    const cron = str(s?.cron, 100);
    try {
      assertScheduleAllowed(cron, 'UTC');
    } catch (err) {
      fail(`${at}: ${(err as Error).message}`);
    }
    const priority = PRIORITIES.includes(String(s?.priority ?? '').toUpperCase()) ? String(s.priority).toUpperCase() : 'MEDIUM';
    return { employeeKey, title, description: str(s?.description, 4000), cron, priority };
  });

  const rulesIn = d.rules === undefined ? [] : Array.isArray(d.rules) ? d.rules : fail('definition.rules must be a list.');
  if (rulesIn.length > 30) fail('A template can have at most 30 automation rules.');
  const rules: TemplateRuleDef[] = rulesIn.map((r: any, i: number) => {
    const at = `Rule ${i + 1}`;
    let normalized: Record<string, unknown>;
    try {
      normalized = normalizeRuleInput({ ...r, employeeId: undefined }, true);
    } catch (err) {
      if (err instanceof RuleValidationError) fail(`${at}: ${err.message}`);
      throw err;
    }
    const employeeKey = r?.employeeKey ? str(r.employeeKey, 41) : undefined;
    if (normalized!.actionType === 'CREATE_TASK' && (!employeeKey || !keys.has(employeeKey))) {
      fail(`${at}: choose which template employee handles it (employeeKey).`);
    }
    return { ...(normalized! as RuleInput), ...(employeeKey ? { employeeKey } : {}) };
  });

  const departments = strList(d.departments, 30, 60);
  for (const e of employees) if (!departments.includes(e.department)) departments.push(e.department);
  return { departments, employees, schedules, rules };
}
