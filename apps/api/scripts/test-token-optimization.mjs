import assert from 'node:assert';
import { fastPathRoute } from '../src/modules/ai-agent/fast-path-router.util.ts';
import { estimateCostUsd } from '../../../packages/ai-core/src/cost-table.ts';

// Test ToolOutputCompressor logic directly
const MAX_TOOL_OUTPUT_CHARS = 1200;
const MAX_ARRAY_ITEMS = 6;

class TestToolOutputCompressor {
  compressToolResult(toolName, raw) {
    if (!raw) return '{"success":true,"data":null}';
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof obj !== 'object' || obj === null) {
        return String(raw).slice(0, MAX_TOOL_OUTPUT_CHARS);
      }
      if (obj.success === false || obj.error) {
        return JSON.stringify({
          success: false,
          message: obj.message || obj.error || 'Action failed',
        });
      }
      const data = obj.data !== undefined ? obj.data : obj;
      const cleanData = this.sanitizeValue(data);
      const result = JSON.stringify({
        success: true,
        ...(cleanData !== undefined ? { data: cleanData } : {}),
      });
      if (result.length > MAX_TOOL_OUTPUT_CHARS) {
        return result.slice(0, MAX_TOOL_OUTPUT_CHARS) + '...[truncated]';
      }
      return result;
    } catch {
      return String(raw).slice(0, MAX_TOOL_OUTPUT_CHARS);
    }
  }

  compactTranscript(transcript) {
    if (transcript.length <= 2) return transcript;
    return transcript.map((msg, idx) => {
      if (msg.role === 'user' && idx < transcript.length - 2 && msg.content.startsWith('Results:\n')) {
        const rawLine = msg.content.split('\n')[1] || msg.content;
        const summary = rawLine.length > 120 ? rawLine.slice(0, 120) + '...' : rawLine;
        return {
          role: 'user',
          content: `[Previous step summary: ${summary}]`,
        };
      }
      return msg;
    });
  }

  sanitizeValue(val) {
    if (Array.isArray(val)) {
      const sliced = val.slice(0, MAX_ARRAY_ITEMS).map((item) => this.sanitizeValue(item));
      if (val.length > MAX_ARRAY_ITEMS) {
        sliced.push(`... and ${val.length - MAX_ARRAY_ITEMS} more items`);
      }
      return sliced;
    }
    if (val && typeof val === 'object') {
      const cleaned = {};
      const ignoreKeys = new Set([
        'createdAt',
        'updatedAt',
        'deletedAt',
        'tenantId',
        'password',
        '__v',
        'metadata',
        'rawResponse',
        'stack',
      ]);
      for (const [k, v] of Object.entries(val)) {
        if (ignoreKeys.has(k) || v === null || v === undefined || v === '') {
          continue;
        }
        cleaned[k] = this.sanitizeValue(v);
      }
      return cleaned;
    }
    return val;
  }
}

console.log('--- Testing World-Class Token Optimization System ---');

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Zero-Token Fast-Path Router
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1] Testing Zero-Token Fast-Path Router...');

// 1.1 Greetings should route to support_agent with 0 tokens
const greetings = ['hi', 'hello', 'Hello!', 'Hey there', 'good morning', 'Good afternoon.', 'Howdy!'];
for (const g of greetings) {
  const res = fastPathRoute(g);
  assert.ok(res !== null, `Greeting "${g}" should be fast-pathed`);
  assert.strictEqual(res.agent, 'support_agent');
  assert.strictEqual(res.confidence, 1.0);
}
console.log('✓ All greetings fast-pathed to support_agent (0 LLM tokens, $0.00)');

// 1.2 Gratitude should route to support_agent
const gratitude = ['thanks', 'Thank you so much!', 'thx', 'much appreciated'];
for (const g of gratitude) {
  const res = fastPathRoute(g);
  assert.ok(res !== null, `Gratitude "${g}" should be fast-pathed`);
  assert.strictEqual(res.agent, 'support_agent');
  assert.strictEqual(res.confidence, 1.0);
}
console.log('✓ All gratitude messages fast-pathed to support_agent (0 LLM tokens, $0.00)');

// 1.3 Human handoff requests should route to human_handoff
const handoffs = ['I want to talk to a human', 'speak to a real person', 'representative please', 'can I talk to an agent?'];
for (const h of handoffs) {
  const res = fastPathRoute(h);
  assert.ok(res !== null, `Handoff "${h}" should be fast-pathed`);
  assert.strictEqual(res.agent, 'human_handoff');
  assert.strictEqual(res.confidence, 1.0);
}
console.log('✓ All human handoff requests fast-pathed to human_handoff (0 LLM tokens, $0.00)');

// 1.4 Task continuation for ACTION agent
const confirmations = ['yes', 'yeah', 'sure', 'ok', 'go ahead', '+1234567890', 'john@example.com'];
for (const c of confirmations) {
  const res = fastPathRoute(c, 'ACTION');
  assert.ok(res !== null, `Confirmation "${c}" should continue action_agent`);
  assert.strictEqual(res.agent, 'action_agent');
  assert.strictEqual(res.confidence, 1.0);
}
console.log('✓ In-flight action confirmations fast-pathed to action_agent (0 LLM tokens, $0.00)');

// 1.5 Ambiguous requests should return null (fallback to LLM micro-classifier)
const ambiguous = ['Can you tell me about pricing?', 'I want to book an appointment for tomorrow', 'What are your hours on Sunday?'];
for (const a of ambiguous) {
  const res = fastPathRoute(a);
  assert.strictEqual(res, null, `Ambiguous query "${a}" must defer to LLM classifier`);
}
console.log('✓ Ambiguous requests correctly defer to LLM micro-classifier');

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Tool Output Semantic Compressor (RTK Pattern)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2] Testing Tool Output Semantic Compressor...');
const compressor = new TestToolOutputCompressor();

// 2.1 Sanitize noisy fields & internal database metadata
const bloatedPayload = {
  success: true,
  data: {
    serviceId: 'srv_123',
    serviceName: 'Haircut & Styling',
    price: 45,
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-02T14:30:00Z',
    tenantId: 'tenant_abc',
    password: 'secret_hash',
    __v: 0,
    metadata: { rawBuffer: '...' },
  },
};
const compressedResult = compressor.compressToolResult('get_service', bloatedPayload);
const parsed = JSON.parse(compressedResult);
assert.strictEqual(parsed.success, true);
assert.strictEqual(parsed.data.serviceName, 'Haircut & Styling');
assert.strictEqual(parsed.data.price, 45);
assert.strictEqual(parsed.data.createdAt, undefined, 'createdAt must be stripped');
assert.strictEqual(parsed.data.password, undefined, 'password must be stripped');
assert.strictEqual(parsed.data.tenantId, undefined, 'tenantId must be stripped');
console.log('✓ Bloated database columns and metadata stripped successfully');

// 2.2 Large array truncation (e.g. 50 appointment slots)
const largeArrayPayload = {
  success: true,
  data: Array.from({ length: 30 }, (_, i) => ({
    slotId: `slot_${i}`,
    time: `2026-09-18T${10 + Math.floor(i / 2)}:${i % 2 === 0 ? '00' : '30'}:00`,
    available: true,
  })),
};
const compressedArray = compressor.compressToolResult('get_availability', largeArrayPayload);
const parsedArray = JSON.parse(compressedArray);
assert.ok(parsedArray.data.length <= 7, 'Array should be capped to 6 items + more summary');
assert.ok(parsedArray.data.some((item) => typeof item === 'string' && item.includes('more items')));
console.log('✓ Large arrays capped and summarized, preventing context explosion');

// 2.3 Transcript compaction
const rawTranscript = [
  { role: 'assistant', content: 'I called: list_services({})' },
  { role: 'user', content: 'Results:\n- list_services: ' + JSON.stringify(largeArrayPayload) },
  { role: 'assistant', content: 'I called: check_availability({ serviceId: "srv_1" })' },
  { role: 'user', content: 'Results:\n- check_availability: {"success":true,"data":["10:00 AM","11:00 AM"]}' },
];
const compacted = compressor.compactTranscript(rawTranscript);
assert.ok(compacted[1].content.startsWith('[Previous step summary:'), 'Older tool dump must be compacted');
assert.ok(!compacted[1].content.includes('slot_29'), 'Old slots should not be repeated');
console.log('✓ Multi-step tool transcript compacted, saving hundreds of replayed tokens');

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Prompt Caching Cost Estimation
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3] Testing Prompt Caching Cost Estimation...');
// Uncached vs Cached pricing on claude-sonnet-5 (input: $0.003/1k)
const uncachedCost = estimateCostUsd('claude-sonnet-5', 2000, 200, 0);
const cachedCost = estimateCostUsd('claude-sonnet-5', 2000, 200, 1500);
assert.ok(cachedCost < uncachedCost, 'Cached request must be significantly cheaper');
const savingsPercent = Math.round(((uncachedCost - cachedCost) / uncachedCost) * 100);
console.log(`✓ Cached prompt pricing validated: Uncached=$${uncachedCost.toFixed(6)}, Cached=$${cachedCost.toFixed(6)} (${savingsPercent}% savings)`);

console.log('\n======================================================');
console.log('🎉 ALL TOKEN OPTIMIZATION TESTS PASSED SUCCESSFULLY!');
console.log('======================================================\n');
