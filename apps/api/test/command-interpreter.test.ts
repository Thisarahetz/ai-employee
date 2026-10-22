import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCommand,
  extractDeadline,
  extractPriority,
  routeByTopic,
  type InterpreterContext,
  type InterpreterEmployee,
} from '../src/modules/ai-workforce/command-interpreter';

const employees: InterpreterEmployee[] = [
  { id: 'mkt', name: 'AI Client Retention & Marketing', role: 'Marketing Specialist', department: 'Marketing', description: 'Campaigns and promotions', status: 'ACTIVE' },
  { id: 'sales', name: 'AI Sales Specialist', role: 'Sales Assistant', department: 'Sales', description: 'Finds leads and prepares quotations', status: 'ACTIVE' },
  { id: 'fin', name: 'AI Business Analyst', role: 'Business Intelligence Assistant', department: 'Finance', description: 'Sales summaries and revenue trends', status: 'ACTIVE' },
  { id: 'ops', name: 'AI Operations Coordinator', role: 'Operations Lead', department: 'Operations', description: 'Schedules and processes', status: 'ACTIVE' },
  { id: 'paused', name: 'AI Inventory Controller', role: 'Inventory Controller', department: 'Inventory', status: 'PAUSED' },
];

const NOW = new Date('2026-10-22T10:00:00'); // a Thursday

function ctx(overrides: Partial<InterpreterContext> = {}): InterpreterContext {
  return {
    employees,
    tasks: [
      { id: 't-run', title: 'Analyze website conversion problems', status: 'RUNNING', employeeId: 'mkt' },
      { id: 't-q', title: 'Prepare customer report', status: 'QUEUED', employeeId: 'sales' },
      { id: 't-done', title: 'Create marketing plan for November', status: 'COMPLETED', employeeId: 'mkt' },
      { id: 't-paused', title: 'Lead list for Colombo', status: 'PAUSED', employeeId: 'sales' },
    ],
    now: NOW,
    ...overrides,
  };
}

describe('command interpreter — intents', () => {
  test('status question', () => {
    const r = parseCommand('What tasks are you working on right now?', ctx());
    assert.equal(r.intent, 'STATUS_QUERY');
  });

  test('status question addressed to one employee', () => {
    const r = parseCommand('What is the marketing team working on?', ctx());
    assert.equal(r.intent, 'STATUS_QUERY');
    assert.deepEqual(r.employeeIds, ['mkt']);
  });

  test('daily summary', () => {
    const r = parseCommand('Give me a summary of everything completed today', ctx());
    assert.equal(r.intent, 'DAILY_SUMMARY');
    assert.equal(r.period, 'today');
  });

  test('team status report', () => {
    assert.equal(parseCommand('Send me a team status report', ctx()).intent, 'TEAM_STATUS');
  });

  test('stop current task and prioritize the customer report → two control ops', () => {
    const r = parseCommand('Stop the current task and prioritize the customer report', ctx());
    assert.equal(r.intent, 'CONTROL');
    assert.equal(r.controls.length, 2);
    assert.equal(r.controls[0].action, 'PAUSE');
    assert.deepEqual(r.controls[0].taskIds, ['t-run']);
    assert.equal(r.controls[1].action, 'PRIORITIZE');
    assert.deepEqual(r.controls[1].taskIds, ['t-q']);
  });

  test('cancel vs pause wording', () => {
    const r = parseCommand('Cancel the customer report', ctx());
    assert.equal(r.controls[0].action, 'CANCEL');
    assert.deepEqual(r.controls[0].taskIds, ['t-q']);
  });

  test('resume a paused task by title', () => {
    const r = parseCommand('Resume the lead list', ctx());
    assert.equal(r.controls[0].action, 'RESUME');
    assert.deepEqual(r.controls[0].taskIds, ['t-paused']);
  });

  test('reassign to another employee', () => {
    const r = parseCommand('Reassign the customer report to the marketing team', ctx());
    assert.equal(r.controls[0].action, 'REASSIGN');
    assert.deepEqual(r.controls[0].taskIds, ['t-q']);
    assert.equal(r.controls[0].employeeId, 'mkt');
  });

  test('prioritize something that does not exist yet yields no task ids', () => {
    const r = parseCommand('Prioritize the supplier audit', ctx());
    assert.equal(r.intent, 'CONTROL');
    assert.deepEqual(r.controls[0].taskIds, []);
  });

  test('"stop" in the middle of a sentence is not a control command', () => {
    const r = parseCommand('Create a plan to stop customer churn', ctx());
    assert.equal(r.intent, 'NEW_TASK');
  });

  test('review another agent’s work', () => {
    const r = parseCommand("Ask the business analyst to review the marketing team's plan", ctx());
    assert.equal(r.intent, 'REVIEW');
    assert.deepEqual(r.employeeIds, ['fin']);
    assert.equal(r.reviewTargetTaskId, 't-done');
  });

  test('meeting request', () => {
    const r = parseCommand('Arrange a meeting with the marketing team tomorrow', ctx());
    assert.equal(r.intent, 'MEETING');
    // The marketing team is an attendee, not the assignee.
    assert.deepEqual(r.employeeIds, ['ops']);
  });

  test('follow-up question resolves to the focused task', () => {
    const r = parseCommand('What did you find?', ctx({ focus: { taskIds: ['t-done'] } }));
    assert.equal(r.intent, 'TASK_FOLLOWUP');
    assert.deepEqual(r.referencedTaskIds, ['t-done']);
  });

  test('new task referencing previous result carries context', () => {
    const r = parseCommand('Ask sales to turn that report into an email draft', ctx({ focus: { taskIds: ['t-done'] } }));
    assert.equal(r.intent, 'NEW_TASK');
    assert.deepEqual(r.employeeIds, ['sales']);
    assert.deepEqual(r.referencedTaskIds, ['t-done']);
  });
});

describe('command interpreter — routing', () => {
  test('topic routing picks the specialist', () => {
    assert.deepEqual(parseCommand('Analyze our website and identify problems affecting conversions.', ctx()).employeeIds, ['mkt']);
    assert.deepEqual(parseCommand('Find potential customers and prepare a lead report.', ctx()).employeeIds, ['sales']);
    assert.deepEqual(parseCommand('Check our sales performance and explain why sales decreased.', ctx()).employeeIds, ['fin']);
    assert.deepEqual(parseCommand('Create a marketing plan for next month.', ctx()).employeeIds, ['mkt']);
  });

  test('topic words are not treated as addressing', () => {
    const r = parseCommand('Check our sales performance', ctx());
    assert.equal(r.explicitEmployees, false);
  });

  test('explicit addressing overrides topic routing', () => {
    const r = parseCommand('Ask the operations coordinator to create a marketing plan', ctx());
    assert.deepEqual(r.employeeIds, ['ops']);
    assert.equal(r.explicitEmployees, true);
  });

  test('@mention addressing', () => {
    assert.deepEqual(parseCommand('@sales find 10 new leads', ctx()).employeeIds, ['sales']);
  });

  test('whole team addressing targets all active employees only', () => {
    const r = parseCommand('Ask everyone to prepare a one-line update on their work', ctx());
    assert.equal(r.allEmployees, true);
    assert.deepEqual(r.employeeIds.sort(), ['fin', 'mkt', 'ops', 'sales']);
  });

  test('paused employees are never routed to', () => {
    const r = routeByTopic('reorder stock from supplier', employees);
    assert.notEqual(r.employee?.id, 'paused');
  });

  test('no active employees yields a note', () => {
    const r = routeByTopic('anything', [employees[4]]);
    assert.equal(r.employee, undefined);
    assert.match(r.note ?? '', /No active/);
  });
});

describe('command interpreter — priority & deadline', () => {
  test('priority keywords', () => {
    assert.equal(extractPriority('Do this ASAP'), 'URGENT');
    assert.equal(extractPriority('high priority: lead list'), 'HIGH');
    assert.equal(extractPriority('no rush, whenever'), 'LOW');
    assert.equal(extractPriority('Create a plan'), 'MEDIUM');
  });

  test('explicit deadlines', () => {
    const tomorrow = extractDeadline('Send the report by tomorrow', NOW)!;
    assert.equal(tomorrow.getDate(), 23);
    const friday = extractDeadline('finish it before Friday', NOW)!;
    assert.equal(friday.getDay(), 5);
    assert.equal(friday.getDate(), 23);
    const inThree = extractDeadline('do it within 3 days', NOW)!;
    assert.equal(Math.round((inThree.getTime() - NOW.getTime()) / 86400e3), 3);
  });

  test('descriptive dates are not deadlines', () => {
    assert.equal(extractDeadline('Create a marketing plan for next month', NOW), null);
    assert.equal(extractDeadline('Arrange a meeting tomorrow', NOW), null);
  });
});

describe('command interpreter — time zones & aliases', () => {
  test('"by tomorrow" ends at 23:59 in the business time zone, not the server zone', () => {
    const now = new Date('2026-10-22T02:30:00Z'); // 08:00 in Colombo
    const d = extractDeadline('send it by tomorrow', now, 'Asia/Colombo')!;
    assert.equal(d.toISOString(), '2026-10-23T18:29:00.000Z'); // 23:59 +05:30
    const ny = extractDeadline('send it by tomorrow', now, 'America/New_York')!;
    assert.equal(ny.toISOString(), '2026-10-23T03:59:00.000Z'); // Oct 22 22:30 NY -> tomorrow 23:59 EDT
  });

  test('weekday deadlines use the local calendar day', () => {
    // 20:00 UTC Thursday = 01:30 Friday in Colombo, so "by Friday" means next week's Friday.
    const now = new Date('2026-10-22T20:00:00Z');
    const d = extractDeadline('finish before Friday', now, 'Asia/Colombo')!;
    assert.equal(d.toISOString(), '2026-10-30T18:29:00.000Z');
  });

  test('distinctive job-title words address an employee', () => {
    const team: InterpreterEmployee[] = [
      { id: 'desk', name: 'AI Front-Desk Receptionist', role: 'Receptionist & Booking Assistant', department: 'Customer Support', status: 'ACTIVE' },
      { id: 'inv', name: 'AI Inventory Specialist', role: 'Inventory Controller', department: 'Inventory', status: 'ACTIVE' },
    ];
    const p = parseCommand('Ask the receptionist to look up our cancellation policy', { employees: team, tasks: [] });
    assert.deepEqual(p.employeeIds, ['desk']);
    assert.equal(p.explicitEmployees, true);
    assert.equal(p.title, 'Look up our cancellation policy');
  });

  test('generic title words do not address anyone', () => {
    const p = parseCommand('Ask the specialist to check stock', { employees, tasks: [] });
    assert.equal(p.explicitEmployees, false);
  });
});

describe('command interpreter — real phrasing', () => {
  test('"retry it" retries the failed task in focus instead of creating a task', () => {
    const p = parseCommand('retry it', ctx({
      tasks: [{ id: 't-fail', title: 'Prepare customer list', status: 'FAILED', employeeId: 'sales' }],
      focus: { taskIds: ['t-fail'] },
    }));
    assert.equal(p.intent, 'CONTROL');
    assert.equal(p.controls[0].action, 'RESUME');
    assert.deepEqual(p.controls[0].taskIds, ['t-fail']);
  });

  test('"try again" is a retry', () => {
    const p = parseCommand('try again', ctx({
      tasks: [{ id: 't-fail', title: 'Prepare customer list', status: 'FAILED', employeeId: 'sales' }],
      focus: { taskIds: ['t-fail'] },
    }));
    assert.equal(p.intent, 'CONTROL');
  });

  test('deadline and urgency words are kept out of the title', () => {
    assert.equal(parseCommand('Ask sales to prepare a lead list, by Friday', ctx()).title, 'Prepare a lead list');
    assert.equal(
      parseCommand('Check our metrics for the last 14 days. Urgent, by tomorrow', ctx()).title,
      'Check our metrics for the last 14 days',
    );
    assert.equal(parseCommand('Find new leads ASAP', ctx()).title, 'Find new leads');
  });
});

describe('command interpreter — follow-ups', () => {
  const focused = () => ctx({
    tasks: [{ id: 't-fail', title: 'Find lapsed customers', status: 'FAILED', employeeId: 'sales' }],
    focus: { taskIds: ['t-fail'] },
  });
  for (const q of ['what happened?', 'what went wrong?', 'why did it fail?', 'any update?']) {
    test(`"${q}" is a follow-up on the focused task`, () => {
      const p = parseCommand(q, focused());
      assert.equal(p.intent, 'TASK_FOLLOWUP');
      assert.deepEqual(p.referencedTaskIds, ['t-fail']);
    });
  }
});

describe('command interpreter — contact verbs', () => {
  test('"ask X to email ..." keeps the whole instruction as the task', () => {
    const p = parseCommand('Ask sales to email sarah.m@example.com a short reminder to book her next appointment', ctx());
    assert.deepEqual(p.employeeIds, ['sales']);
    assert.equal(p.title, 'Email sarah.m@example.com a short reminder to book her next appointment');
  });
});

