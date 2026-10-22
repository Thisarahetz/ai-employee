import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERNAL_TOOLS,
  buildIntegrationTool,
  classifyIntegrationAction,
  evaluateToolPolicy,
  type PolicyEmployee,
} from '../src/modules/ai-workforce/workforce-tools';

const tool = (name: string) => INTERNAL_TOOLS.find((t) => t.name === name)!;
const emp = (o: Partial<PolicyEmployee> = {}): PolicyEmployee => ({
  status: 'ACTIVE',
  actionLevel: 'APPROVAL_REQUIRED',
  permissions: { viewCustomers: true },
  connectedTools: [],
  toolAccessConfigured: false,
  ...o,
});
const integ = (name: string) => buildIntegrationTool({ name, description: '', parameters: {}, integrationId: 'i1' });

describe('tool policy', () => {
  test('default grants allow reads', () => {
    assert.equal(evaluateToolPolicy(emp(), tool('get_business_metrics')).decision, 'ALLOW');
  });

  test('email is not in the default grants', () => {
    assert.equal(evaluateToolPolicy(emp(), tool('send_email')).decision, 'DENY');
  });

  test('granted email still always needs approval, even for AUTOMATIC employees', () => {
    const e = emp({ actionLevel: 'AUTOMATIC', toolAccessConfigured: true, connectedTools: ['email.send'] });
    assert.equal(evaluateToolPolicy(e, tool('send_email')).decision, 'NEEDS_APPROVAL');
    assert.equal(evaluateToolPolicy(e, tool('send_email'), { ownerApproved: true }).decision, 'ALLOW');
  });

  test('WRITE needs approval unless AUTOMATIC', () => {
    assert.equal(evaluateToolPolicy(emp(), tool('notify_owner')).decision, 'NEEDS_APPROVAL');
    assert.equal(evaluateToolPolicy(emp({ actionLevel: 'AUTOMATIC' }), tool('notify_owner')).decision, 'ALLOW');
  });

  test('paused employee is denied even with owner approval', () => {
    assert.equal(evaluateToolPolicy(emp({ status: 'PAUSED' }), tool('list_tasks'), { ownerApproved: true }).decision, 'DENY');
  });

  test('revoked grant blocks an approved call', () => {
    const e = emp({ toolAccessConfigured: true, connectedTools: [] });
    assert.equal(evaluateToolPolicy(e, tool('send_email'), { ownerApproved: true }).decision, 'DENY');
  });

  test('configured empty grant list overrides defaults', () => {
    assert.equal(evaluateToolPolicy(emp({ toolAccessConfigured: true }), tool('list_tasks')).decision, 'DENY');
  });

  test('requiresPermission toggle is enforced', () => {
    assert.equal(evaluateToolPolicy(emp({ permissions: {} }), tool('list_customers')).decision, 'DENY');
  });

  test('unknown tool is denied', () => {
    assert.equal(evaluateToolPolicy(emp(), undefined).decision, 'DENY');
  });
});

describe('integration action classification', () => {
  test('risk levels', () => {
    assert.equal(classifyIntegrationAction('get_orders'), 'READ');
    assert.equal(classifyIntegrationAction('refund_order'), 'SENSITIVE');
    assert.equal(classifyIntegrationAction('send_sms'), 'SENSITIVE');
    assert.equal(classifyIntegrationAction('update_role'), 'RESTRICTED');
    assert.equal(classifyIntegrationAction('list_api_keys'), 'RESTRICTED');
    assert.equal(classifyIntegrationAction('create_note'), 'WRITE');
  });

  test('integration reads are covered by the read grant; writes are not', () => {
    assert.equal(evaluateToolPolicy(emp(), integ('get_orders')).decision, 'ALLOW');
    assert.equal(evaluateToolPolicy(emp(), integ('create_note')).decision, 'DENY');
  });

  test('restricted integration actions are denied even when granted and approved', () => {
    const e = emp({ toolAccessConfigured: true, connectedTools: ['integration:update_role'] });
    assert.equal(evaluateToolPolicy(e, integ('update_role'), { ownerApproved: true }).decision, 'DENY');
  });
});
