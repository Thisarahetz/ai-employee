/**
 * Deterministic natural-language interpreter for owner commands.
 *
 * It decides *what kind* of command this is and *who* it is for — status
 * questions, daily summaries, task control (pause/cancel/prioritise/
 * reassign), reviews, meetings, follow-ups, or new work — and extracts
 * priority/deadline. It deliberately does not call an LLM: routing and
 * control commands must be predictable, cheap and testable. Understanding
 * the substance of a new task is done by the LLM inside the task executor.
 */

export type CommandIntent =
  | 'STATUS_QUERY'
  | 'TEAM_STATUS'
  | 'DAILY_SUMMARY'
  | 'TASK_FOLLOWUP'
  | 'CONTROL'
  | 'REVIEW'
  | 'MEETING'
  | 'NEW_TASK';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface InterpreterEmployee {
  id: string;
  name: string;
  role: string;
  department: string;
  description?: string;
  responsibilities?: unknown;
  status: string;
}

export interface InterpreterTask {
  id: string;
  title: string;
  status: string;
  employeeId: string | null;
  priority?: string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface InterpreterContext {
  employees: InterpreterEmployee[];
  /** Recent tasks (any status), newest first. */
  tasks: InterpreterTask[];
  /** What the conversation was last about. */
  focus?: { taskIds?: string[]; employeeIds?: string[] };
  now?: Date;
  /** Business time zone (IANA), used for calendar deadlines. */
  timeZone?: string;
}

export type ControlAction = 'PAUSE' | 'RESUME' | 'CANCEL' | 'PRIORITIZE' | 'REASSIGN';

export interface ControlOp {
  action: ControlAction;
  /** Resolved task ids (empty if nothing matched). */
  taskIds: string[];
  /** The phrase used to refer to the task, e.g. "the customer report". */
  reference: string;
  /** REASSIGN target. */
  employeeId?: string;
  /** When nothing actionable matched: an already-finished task the owner probably meant. */
  finishedTaskId?: string;
}

export interface ParsedCommand {
  intent: CommandIntent;
  /** Employees this command is addressed to / routed to. */
  employeeIds: string[];
  /** True when the owner named the employees; false when the engine routed it. */
  explicitEmployees: boolean;
  allEmployees: boolean;
  controls: ControlOp[];
  priority: TaskPriority;
  deadline: Date | null;
  title: string;
  description: string;
  /** Earlier tasks this command refers to ("it", "the report", ...). */
  referencedTaskIds: string[];
  reviewTargetTaskId?: string;
  period?: 'today' | 'week';
  routingNote?: string;
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const ACTIVE = new Set(['QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'PAUSED', 'BLOCKED']);

const CONTROL_VERBS: Record<string, ControlAction> = {
  stop: 'PAUSE',
  pause: 'PAUSE',
  hold: 'PAUSE',
  halt: 'PAUSE',
  suspend: 'PAUSE',
  cancel: 'CANCEL',
  abort: 'CANCEL',
  drop: 'CANCEL',
  kill: 'CANCEL',
  scrap: 'CANCEL',
  resume: 'RESUME',
  continue: 'RESUME',
  unpause: 'RESUME',
  restart: 'RESUME',
  retry: 'RESUME',
  'try again': 'RESUME',
  redo: 'RESUME',
  rerun: 'RESUME',
  prioritize: 'PRIORITIZE',
  prioritise: 'PRIORITIZE',
  expedite: 'PRIORITIZE',
  'focus on': 'PRIORITIZE',
  reassign: 'REASSIGN',
  move: 'REASSIGN',
  'hand over': 'REASSIGN',
};
const VERB_ALT = Object.keys(CONTROL_VERBS)
  .sort((a, b) => b.length - a.length)
  .map((v) => v.replace(' ', '\\s+'))
  .join('|');
const CLAUSE_START = '(?:^|[,;.]\\s*|\\b(?:and|then|also|please|now)\\s+)';
const CONTROL_CLAUSE = new RegExp(`${CLAUSE_START}(${VERB_ALT})\\b(.*?)(?=${CLAUSE_START}(?:${VERB_ALT})\\b|$)`, 'gi');
const LEADING_CONTROL = new RegExp(`^(?:please\\s+|ok(?:ay)?[,\\s]+|now\\s+|hey[,\\s]+)*(?:${VERB_ALT})\\b`, 'i');

const DEPARTMENT_ALIASES: Record<string, string[]> = {
  Marketing: ['marketing', 'marketer', 'growth'],
  Sales: ['sales', 'sales team', 'salesperson'],
  'Customer Support': ['support', 'customer support', 'customer service', 'helpdesk', 'help desk'],
  Inventory: ['inventory', 'stock', 'warehouse'],
  Operations: ['operations', 'ops'],
  Finance: ['finance', 'accounting', 'analyst', 'analytics', 'bookkeeping'],
};

/** Topic keywords used to route a task when the owner didn't name anyone. */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  Marketing: [
    'marketing', 'campaign', 'promotion', 'promo', 'social', 'brand', 'content', 'seo', 'website', 'conversion',
    'conversions', 'ads', 'advert', 'newsletter', 'retention', 'audience', 'engagement',
  ],
  Sales: [
    'lead', 'leads', 'prospect', 'prospects', 'potential customers', 'quote', 'quotation', 'deal', 'pipeline',
    'upsell', 'outreach', 'cold', 'sell',
  ],
  Finance: [
    'revenue', 'profit', 'sales performance', 'financial', 'finance', 'margin', 'cost', 'budget', 'decreased',
    'declined', 'drop in sales', 'kpi', 'metrics', 'performance', 'forecast', 'trend',
  ],
  'Customer Support': ['complaint', 'complaints', 'support', 'ticket', 'warranty', 'feedback', 'review', 'refund request'],
  Inventory: ['stock', 'inventory', 'reorder', 'supplier', 'purchase order', 'restock'],
  Operations: ['meeting', 'schedule', 'agenda', 'calendar', 'process', 'operations', 'staff', 'appointment', 'booking', 'shift'],
};

const STOPWORDS = new Set(
  'a an the and or of to for in on at by with from our your my me you we us it this that is are be please can could would will ai agent assistant specialist team employee'.split(
    ' ',
  ),
);

const ALL_EMPLOYEES = /\b(everyone|everybody|all (?:ai )?employees|all (?:the )?agents|(?:the )?whole team|all of you|each of you|entire team)\b/i;
const REFERENCE_PRONOUN = /\b(it|that|this|those|these|the (?:report|results?|plan|list|findings|analysis|summary|draft|output|work))\b/i;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s@&'-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Job-title words too common to identify one employee on their own. */
const GENERIC_TITLE_WORDS = new Set(
  'ai specialist assistant agent employee officer lead manager coordinator controller executive associate representative rep team staff head senior junior business client customer'.split(' '),
);

function employeeAliases(e: InterpreterEmployee): string[] {
  const name = norm(e.name);
  const role = norm(e.role);
  const aliases = new Set<string>([name, name.replace(/^ai\s+/, ''), role]);
  // Distinctive words: "receptionist", "front-desk", "booking".
  for (const word of `${name} ${role}`.split(' ')) {
    if (word.length >= 5 && !GENERIC_TITLE_WORDS.has(word) && !STOPWORDS.has(word)) aliases.add(word);
  }
  for (const alias of DEPARTMENT_ALIASES[e.department] ?? [norm(e.department)]) {
    aliases.add(alias);
    aliases.add(`${alias} team`);
    aliases.add(`${alias} agent`);
    aliases.add(`${alias} employee`);
  }
  return [...aliases].filter((a) => a.length > 2);
}

/** Employees whose alias appears in `phrase` (longest alias wins per employee). */
export function matchEmployees(phrase: string, employees: InterpreterEmployee[]): InterpreterEmployee[] {
  const p = ` ${norm(phrase)} `;
  return employees.filter((e) => employeeAliases(e).some((a) => p.includes(` ${a} `) || p.includes(`@${a}`)));
}

/**
 * Finds who the owner is *addressing* — "ask marketing to…", "@Sales…",
 * "Finance, please…", "tell the whole team…". Topic words elsewhere in the
 * sentence ("analyse our sales") do not count as addressing.
 */
function addressedEmployees(
  text: string,
  employees: InterpreterEmployee[],
): { employees: InterpreterEmployee[]; all: boolean; rest: string } {
  const patterns = [
    /^(?:please\s+)?(?:ask|tell|have|get|let|instruct|assign|delegate(?:\s+this)?\s+to)\s+([^,.;:]{2,50}?)\s+(?:to\s+)?(?=\b(?:prepare|create|make|find|check|analy[sz]e|review|write|draft|build|research|look|send|summari[sz]e|give|do|handle|work|investigate|compile|plan|update|run|report|identify|explain|arrange|schedule|book|email|e-mail|message|text|call|contact|remind|notify|reach|follow|list|collect|calculate|compare|organi[sz]e|post|reply|respond|suggest|estimate|track|monitor|audit|clean|fix|set)\b)/i,
    /^@([\w&' -]+?)[,:]\s*/i,
    /^([\w&' -]{3,40}?)[,:]\s+/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const who = m[1];
    const rest = text.slice(m[0].length).trim();
    if (ALL_EMPLOYEES.test(who)) return { employees: [], all: true, rest };
    const found = matchEmployees(who, employees);
    if (found.length) return { employees: found, all: false, rest };
  }
  // "@Name" anywhere.
  const at = [...text.matchAll(/@([\w&'-]+(?:\s[\w&'-]+)?)/g)].flatMap((m) => matchEmployees(`@${m[1]}`, employees));
  if (at.length) return { employees: dedupe(at), all: false, rest: text };
  if (/^(?:please\s+)?(?:everyone|everybody|team|all (?:ai )?employees)\b[,:]?/i.test(text)) {
    return { employees: [], all: true, rest: text.replace(/^(?:please\s+)?(?:everyone|everybody|team|all (?:ai )?employees)\b[,:]?\s*/i, '') };
  }
  return { employees: [], all: false, rest: text };
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/** Picks the best-suited active employee for a task by topic. */
export function routeByTopic(
  text: string,
  employees: InterpreterEmployee[],
): { employee?: InterpreterEmployee; note?: string } {
  const candidates = employees.filter((e) => e.status === 'ACTIVE');
  if (!candidates.length) return { note: 'No active AI employees are available.' };

  const t = ` ${norm(text)} `;
  const textTokens = new Set(tokens(text));
  let best: InterpreterEmployee | undefined;
  let bestScore = 0;

  for (const e of candidates) {
    let score = 0;
    for (const kw of TOPIC_KEYWORDS[e.department] ?? []) if (t.includes(` ${kw} `)) score += 3;
    const profile = [e.name, e.role, e.department, e.description ?? '', ...(Array.isArray(e.responsibilities) ? e.responsibilities.map(String) : [])].join(' ');
    for (const tok of new Set(tokens(profile))) if (textTokens.has(tok)) score += 1;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }

  if (best) return { employee: best };
  const fallback = candidates.find((e) => e.department === 'Operations') ?? candidates[0];
  return { employee: fallback, note: `No clear specialist for this request — assigned to ${fallback.name}.` };
}

export function extractPriority(text: string): TaskPriority {
  const t = text.toLowerCase();
  if (/\b(urgent|urgently|asap|immediately|right away|critical|top priority|emergency)\b/.test(t)) return 'URGENT';
  if (/\b(high[- ]priority|important|soon as possible|priority)\b/.test(t)) return 'HIGH';
  if (/\b(low[- ]priority|whenever|no rush|when you have time|not urgent)\b/.test(t)) return 'LOW';
  return 'MEDIUM';
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Calendar date (y, m 1-12, d, weekday) of `at` as seen in `timeZone`. */
function zonedDate(at: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** Milliseconds `timeZone` is ahead of UTC at instant `utcMs`. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
      .formatToParts(new Date(utcMs))
      .map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** 23:59 on calendar day (y, m, d + addDays) in `timeZone`. */
function endOfDay(y: number, m: number, d: number, timeZone: string, addDays = 0): Date {
  const wall = Date.UTC(y, m - 1, d + addDays, 23, 59);
  return new Date(wall - zoneOffset(wall, timeZone));
}

/**
 * Only explicit deadline phrasing counts ("by tomorrow", "before Friday",
 * "due next week", "within 3 days"). "A plan for next month" or "a meeting
 * tomorrow" describe the work, not when it's due. Calendar phrases resolve
 * in the business's time zone, not the server's.
 */
export function extractDeadline(
  text: string,
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Date | null {
  const t = text.toLowerCase();
  const m = t.match(/\b(?:by|before|due|until|no later than|deadline(?: is)?)\s+(.{2,30}?)(?:[,.!?]|$|\s+(?:and|so|then)\b)/);
  const within = t.match(/\b(?:within|in)\s+(\d{1,2})\s+(hour|hours|day|days|week|weeks)\b/);
  if (within && /\b(within|in \d+ (?:hours?|days?|weeks?)\b)/.test(t) && !m) {
    const n = Number(within[1]);
    const unit = within[2];
    const ms = unit.startsWith('hour') ? 3600e3 : unit.startsWith('day') ? 86400e3 : 7 * 86400e3;
    return new Date(now.getTime() + n * ms);
  }
  if (!m) return null;
  const phrase = m[1].trim();
  const today = zonedDate(now, timeZone);
  const eod = (addDays = 0) => endOfDay(today.y, today.m, today.d, timeZone, addDays);

  if (/^(today|tonight|end of (?:the )?day|eod|close of business|cob)\b/.test(phrase)) return eod();
  if (/^tomorrow\b/.test(phrase)) return eod(1);
  if (/^(?:the )?end of (?:the )?week\b|^this week\b/.test(phrase)) return eod((5 - today.dow + 7) % 7);
  if (/^next week\b/.test(phrase)) return eod(7);
  if (/^(?:the )?end of (?:the )?month\b/.test(phrase)) {
    const last = new Date(Date.UTC(today.y, today.m, 0)).getUTCDate();
    return eod(last - today.d);
  }
  const wd = phrase.match(/^(?:next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    let diff = (WEEKDAYS.indexOf(wd[1]) - today.dow + 7) % 7;
    if (diff === 0) diff = 7;
    return eod(diff);
  }
  const iso = phrase.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return endOfDay(Number(iso[1]), Number(iso[2]), Number(iso[3]), timeZone);
  return null;
}

/** Turns a command into a short task title. */
/** Deadline and urgency phrasing belongs in the task fields, not the title. */
const TITLE_META = [
  /[,;]?\s*\b(?:by|before|due|until|no later than)\s+(?:today|tonight|tomorrow|eod|end of (?:the )?(?:day|week|month)|this week|next week|(?:next |this )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|\d{4}-\d{2}-\d{2})\b/gi,
  /[,;.]?\s*\b(?:urgent(?:ly)?|asap|as soon as possible|right away|immediately|high[- ]priority|top priority|low[- ]priority|no rush|it'?s urgent)\b[.!,]?/gi,
];

export function makeTitle(text: string): string {
  let t = TITLE_META.reduce((acc, re) => acc.replace(re, ''), text)
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:]+|[\s,;:]+$/g, '');
  if (!t) t = text;
  t = t
    .replace(/^(?:please|can you|could you|would you|i need you to|i want you to|kindly)\s+/i, '')
    .replace(/\s+(?:please|thanks|thank you)[.!]*$/i, '')
    .replace(/[?.!]+$/, '')
    .trim();
  if (t.length > 90) t = `${t.slice(0, 87).replace(/\s+\S*$/, '')}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function scoreTitleMatch(reference: string, title: string): number {
  const ref = tokens(reference).filter((t) => !['task', 'current', 'work', 'job'].includes(t));
  if (!ref.length) return 0;
  const titleTokens = new Set(tokens(title));
  const hits = ref.filter((t) => titleTokens.has(t) || [...titleTokens].some((tt) => tt.startsWith(t) || t.startsWith(tt))).length;
  return hits / ref.length;
}

function resolveTaskReference(
  reference: string,
  ctx: InterpreterContext,
  scopeEmployeeIds: string[],
  action: ControlAction,
): string[] {
  const ref = norm(reference);
  const pool = ctx.tasks.filter((t) => (scopeEmployeeIds.length ? t.employeeId && scopeEmployeeIds.includes(t.employeeId) : true));
  const candidates =
    action === 'RESUME'
      ? pool.filter((t) => t.status === 'PAUSED' || t.status === 'BLOCKED' || t.status === 'FAILED')
      : action === 'PRIORITIZE' || action === 'REASSIGN'
        ? pool.filter((t) => !TERMINAL.has(t.status))
        : pool.filter((t) => ACTIVE.has(t.status) && t.status !== (action === 'PAUSE' ? 'PAUSED' : ''));

  if (/\b(all|everything|every task|all tasks)\b/.test(ref)) return candidates.map((t) => t.id);

  let best: InterpreterTask | undefined;
  let bestScore = 0;
  for (const t of candidates) {
    const s = scoreTitleMatch(ref, t.title);
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }
  if (best && bestScore >= 0.5) return [best.id];

  // Generic reference: "the current task", "it", "what you're doing".
  const generic = !ref || /\b(current|this|that|it|task|work|job|what you|whatever|doing)\b/.test(ref);
  if (!generic) return [];
  const focused = (ctx.focus?.taskIds ?? []).filter((id) => candidates.some((c) => c.id === id));
  if (focused.length && !/\bcurrent\b/.test(ref)) return [focused[0]];
  const pick = candidates.find((t) => t.status === 'RUNNING') ?? candidates[0];
  return pick ? [pick.id] : [];
}

function parseControls(text: string, ctx: InterpreterContext, scope: string[]): ControlOp[] {
  const ops: ControlOp[] = [];
  for (const m of text.matchAll(CONTROL_CLAUSE)) {
    const verb = m[1].toLowerCase().replace(/\s+/g, ' ');
    const action = CONTROL_VERBS[verb];
    let object = (m[2] ?? '').trim().replace(/^(?:working on|work on|on|with)\s+/i, '');
    let employeeId: string | undefined;

    if (action === 'REASSIGN') {
      const to = object.match(/^(.*?)\s+(?:to|over to)\s+(.+)$/i);
      if (to) {
        object = to[1];
        employeeId = matchEmployees(to[2], ctx.employees)[0]?.id;
      }
    }
    const reference = object.replace(/[.!?]+$/, '').trim();
    const taskIds = resolveTaskReference(reference, ctx, scope, action);
    let finishedTaskId: string | undefined;
    if (!taskIds.length) {
      const scored = ctx.tasks
        .filter((t) => TERMINAL.has(t.status))
        .map((t) => ({ t, s: scoreTitleMatch(reference, t.title) }))
        .sort((a, b) => b.s - a.s);
      if (scored[0]?.s >= 0.5) finishedTaskId = scored[0].t.id;
    }
    ops.push({ action, reference, taskIds, employeeId, finishedTaskId });
  }
  return ops;
}

export function parseCommand(rawText: string, ctx: InterpreterContext): ParsedCommand {
  const text = rawText.trim();
  const t = text.toLowerCase();
  const now = ctx.now ?? new Date();
  const addressed = addressedEmployees(text, ctx.employees);
  const focusTaskIds = (ctx.focus?.taskIds ?? []).filter((id) => ctx.tasks.some((tk) => tk.id === id));

  const base: ParsedCommand = {
    intent: 'NEW_TASK',
    employeeIds: addressed.employees.map((e) => e.id),
    explicitEmployees: addressed.employees.length > 0 || addressed.all,
    allEmployees: addressed.all,
    controls: [],
    priority: extractPriority(text),
    deadline: extractDeadline(text, now, ctx.timeZone),
    title: makeTitle(addressed.rest || text),
    description: text,
    referencedTaskIds: [],
  };

  // 1. Task control: "stop the current task and prioritize the customer report".
  if (LEADING_CONTROL.test(addressed.rest) || LEADING_CONTROL.test(text)) {
    const scope = base.employeeIds;
    const controls = parseControls(addressed.rest || text, ctx, scope);
    if (controls.length) return { ...base, intent: 'CONTROL', controls };
  }

  // 2. Daily / weekly summary.
  if (
    /\b(summary|summari[sz]e|recap|rundown|report)\b.*\b(today|this week|completed|done|accomplished|finished)\b/.test(t) ||
    /\bwhat (?:did|has|have) (?:you|the team|everyone|we)\b.*\b(do|done|complete|completed|accomplish|finish)/.test(t)
  ) {
    return { ...base, intent: 'DAILY_SUMMARY', period: /\bweek\b/.test(t) ? 'week' : 'today' };
  }

  // 3. Team status report.
  if (/\b(team status|status report|status update|how is the team|how's the team|team update|standup|stand-up)\b/.test(t)) {
    return { ...base, intent: 'TEAM_STATUS' };
  }

  // 4. "What are you working on?" style status questions.
  if (
    /\bwhat(?:'s| is| are)\b.*\b(working on|doing|busy with|in progress|on your plate)\b/.test(t) ||
    /\b(current|active|running|open|pending) tasks\b/.test(t) ||
    /\bwhat tasks\b/.test(t)
  ) {
    const mentioned = base.employeeIds.length ? base.employeeIds : matchEmployees(text, ctx.employees).map((e) => e.id);
    return { ...base, intent: 'STATUS_QUERY', employeeIds: mentioned, explicitEmployees: mentioned.length > 0 };
  }

  // 5. Reviews: "ask Finance to review the marketing plan".
  const review = text.match(/\b(review|double[- ]check|proofread|critique|audit|check over|sanity[- ]check)\b\s+(.*)$/i);
  if (review && (base.employeeIds.length || /^(?:please\s+)?(?:review|double[- ]check|proofread|critique)/i.test(addressed.rest))) {
    const targetPhrase = review[2];
    const ownerOfWork = matchEmployees(targetPhrase.replace(/'s\b/g, ''), ctx.employees).filter((e) => !base.employeeIds.includes(e.id));
    const completed = ctx.tasks.filter((tk) => tk.status === 'COMPLETED' || tk.status === 'WAITING_APPROVAL');
    let target: InterpreterTask | undefined;
    if (ownerOfWork.length) target = completed.find((tk) => tk.employeeId === ownerOfWork[0].id && scoreTitleMatch(targetPhrase, tk.title) > 0) ?? completed.find((tk) => tk.employeeId === ownerOfWork[0].id);
    if (!target) {
      const scored = completed.map((tk) => ({ tk, s: scoreTitleMatch(targetPhrase, tk.title) })).sort((a, b) => b.s - a.s);
      if (scored[0]?.s >= 0.5) target = scored[0].tk;
    }
    if (!target && REFERENCE_PRONOUN.test(targetPhrase) && focusTaskIds.length) target = ctx.tasks.find((tk) => tk.id === focusTaskIds[0]);
    if (target) {
      let reviewers = base.employeeIds;
      let note: string | undefined;
      if (!reviewers.length) {
        const routed = routeByTopic(target.title, ctx.employees.filter((e) => e.id !== target!.employeeId));
        reviewers = routed.employee ? [routed.employee.id] : [];
        note = routed.note;
      }
      return { ...base, intent: 'REVIEW', employeeIds: reviewers, reviewTargetTaskId: target.id, routingNote: note };
    }
  }

  // 6. Meetings: needs a calendar integration — handled by the command service.
  if (/\b(arrange|schedule|book|set up|setup|organi[sz]e|plan|call)\b.*\b(meeting|call|sync|catch[- ]up)\b/.test(t) || /\bmeeting\b.*\b(with|tomorrow|today|next|on)\b/.test(t)) {
    const routed = base.employeeIds.length ? undefined : routeByTopic('meeting schedule agenda operations', ctx.employees);
    return {
      ...base,
      intent: 'MEETING',
      employeeIds: base.employeeIds.length ? base.employeeIds : routed?.employee ? [routed.employee.id] : [],
      routingNote: routed?.note,
    };
  }

  // 7. Follow-up questions about the task we were just discussing.
  if (focusTaskIds.length && /^(what|why|how|did|does|show|tell|any|is|was|where|when|has|can you show|give me)\b/.test(t)) {
    if (/\b(it|that|this|you find|findings|result|results|status|done yet|finished|fail|failed|progress|the report|the plan|the analysis|so far|happen(?:ed|ing|s)?|went wrong|wrong|error|update|news)\b/.test(t)) {
      return { ...base, intent: 'TASK_FOLLOWUP', referencedTaskIds: [focusTaskIds[0]] };
    }
  }

  // 8. New work.
  const referenced = REFERENCE_PRONOUN.test(text) ? focusTaskIds.slice(0, 2) : [];
  if (addressed.all) {
    return {
      ...base,
      employeeIds: ctx.employees.filter((e) => e.status === 'ACTIVE').map((e) => e.id),
      referencedTaskIds: referenced,
    };
  }
  if (base.employeeIds.length) return { ...base, referencedTaskIds: referenced };

  const routed = routeByTopic(text, ctx.employees);
  return {
    ...base,
    employeeIds: routed.employee ? [routed.employee.id] : [],
    explicitEmployees: false,
    routingNote: routed.note,
    referencedTaskIds: referenced,
  };
}
