import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentType } from '@prisma/client';
import { decide, INTENT_ROUTES } from '../src/modules/nlu/nlu-policy';
import { nluConfig } from '../src/modules/nlu/nlu.config';
import { normalizeForNlu } from '../src/modules/nlu/nlu.service';
import type { RasaParse } from '../src/modules/nlu/nlu.types';

const cfg = nluConfig({ RASA_ENABLED: 'true', RASA_BASE_URL: 'http://rasa:5005' });
const p = (intent: string, confidence: number, runnerUp = 0.01): RasaParse => ({ intent, confidence, runnerUp, entities: [] });

describe('nlu config', () => {
  test('is on when a URL is set, unless RASA_ENABLED=false', () => {
    assert.equal(nluConfig({}).enabled, false);
    assert.equal(nluConfig({ RASA_ENABLED: 'true' }).enabled, false);
    assert.equal(nluConfig({ RASA_BASE_URL: 'http://x' }).enabled, true);
    assert.equal(nluConfig({ RASA_BASE_URL: 'http://x', RASA_ENABLED: 'false' }).enabled, false);
    assert.equal(cfg.enabled, true);
  });
  test('thresholds come from the environment, bad values fall back', () => {
    const c = nluConfig({ RASA_HIGH_CONFIDENCE: '0.9', RASA_LOW_CONFIDENCE: 'abc', RASA_BASE_URL: 'http://x/' });
    assert.equal(c.highConfidence, 0.9);
    assert.equal(c.lowConfidence, 0.5);
    assert.equal(c.baseUrl, 'http://x');
  });
});

describe('decide', () => {
  test('supported intents route to the right agent with deterministic search words', () => {
    const d = decide(p('ask_pricing', 0.99), 'gana kiyada', {}, cfg);
    assert.equal(d.path, 'rasa');
    assert.ok(d.path === 'rasa' && d.agent === 'knowledge_agent' && /price/.test(d.searchQuery ?? ''));
    const b = decide(p('book_appointment', 0.95), 'heta appointment ekak ona', {}, cfg);
    assert.ok(b.path === 'rasa' && b.agent === 'action_agent');
  });

  test('every intent in the catalogue has an explicit route', () => {
    for (const i of ['greeting', 'thanks', 'goodbye', 'request_human', 'affirm', 'deny', 'ask_business_hours', 'ask_pricing', 'ask_location', 'ask_services', 'book_appointment', 'check_availability', 'cancel_appointment', 'reschedule_appointment', 'lookup_booking']) {
      assert.ok(INTENT_ROUTES[i], i);
    }
  });

  test('unknown / unsupported intents go to the LLM', () => {
    for (const i of ['out_of_scope', 'nlu_fallback', 'something_new']) {
      const d = decide(p(i, 0.99), 'x', {}, cfg);
      assert.deepEqual([d.path, d.path === 'llm' && d.reason], ['llm', 'unsupported_intent']);
    }
  });

  test('low and medium confidence go to the LLM with the right reason', () => {
    assert.equal(decide(p('ask_pricing', 0.3), 'x', {}, cfg).path === 'llm' && (decide(p('ask_pricing', 0.3), 'x', {}, cfg) as any).reason, 'low_confidence');
    assert.equal((decide(p('ask_pricing', 0.7), 'x', {}, cfg) as any).reason, 'medium_confidence');
  });

  test('a close runner-up is ambiguous', () => {
    assert.equal((decide(p('ask_pricing', 0.85, 0.8), 'x', {}, cfg) as any).reason, 'ambiguous');
  });

  test('cancel and reschedule need the stricter bar: 0.85 is not enough', () => {
    assert.equal((decide(p('cancel_appointment', 0.85), 'cancel', {}, cfg) as any).reason, 'medium_confidence');
    assert.equal((decide(p('reschedule_appointment', 0.9), 'move', {}, cfg) as any).reason, 'medium_confidence');
    assert.equal(decide(p('cancel_appointment', 0.95), 'cancel', {}, cfg).path, 'rasa');
  });

  test('request_human is never routed by Rasa alone', () => {
    assert.equal((decide(p('request_human', 0.999), 'agent please', {}, cfg) as any).reason, 'sensitive_intent');
  });

  test('fixed replies only for short messages', () => {
    assert.ok(decide(p('goodbye', 0.99), 'bye machan', {}, cfg).path === 'rasa');
    assert.equal((decide(p('goodbye', 0.99), 'ok bye but first tell me about the price of a full bridal package please', {}, cfg) as any).reason, 'long_message');
  });

  test('"yes" and "no" only count inside a booking conversation', () => {
    assert.equal((decide(p('affirm', 0.99), 'ow', {}, cfg) as any).reason, 'context_required');
    assert.equal((decide(p('affirm', 0.99), 'ow', { previousAgent: AgentType.KNOWLEDGE }, cfg) as any).reason, 'context_required');
    const d = decide(p('affirm', 0.99), 'ow', { previousAgent: AgentType.ACTION }, cfg);
    assert.ok(d.path === 'rasa' && d.agent === 'action_agent');
  });
});

describe('normalizeForNlu', () => {
  test('collapses whitespace, keeps Sinhala intact, caps length', () => {
    assert.equal(normalizeForNlu('  අද   විකුණුම්\n කීයද?  '), 'අද විකුණුම් කීයද?');
    assert.equal(normalizeForNlu('a'.repeat(900)).length, 500);
  });
});
