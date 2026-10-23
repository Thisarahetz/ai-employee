import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimsBooking,
  customerMessage,
  detectLanguage,
  nextConversationLanguage,
  replyLanguageInstruction,
  resolveReplyLanguage,
  wantsRollback,
} from '../src/common/language/language';
import { fastPathRoute } from '../src/modules/ai-agent/fast-path-router.util';
import { extractPriority, parseCommand } from '../src/modules/ai-workforce/command-interpreter';

test('detects Sinhala script, Singlish and English', () => {
  const cases: [string, string | null][] = [
    ['හෙට උදේ 10ට hair cut එකක් වෙන් කරගන්න පුළුවන්ද?', 'si'],
    ['ඔබගේ විවෘත වේලාවන් මොනවද?', 'si'],
    ['booking එකක් ඕන', 'si'],
    ['heta booking ekak danna puluwanda?', 'si-Latn'],
    ['kohomada', 'si-Latn'],
    ['mata facial ekak ona', 'si-Latn'],
    ['gana kiyada?', 'si-Latn'],
    ['Can I book a haircut tomorrow at 10?', 'en'],
    ['What are your opening hours?', 'en'],
    ['+94 77 123 4567', null],
    ['🙂', null],
    ['', null],
  ];
  for (const [text, expected] of cases) {
    assert.equal(detectLanguage(text)?.language ?? null, expected, text);
  }
});

test('short replies do not switch a known conversation language', () => {
  assert.equal(nextConversationLanguage('si', 'ok'), 'si');
  assert.equal(nextConversationLanguage('si', 'thanks'), 'si');
  assert.equal(nextConversationLanguage('si-Latn', '0771234567'), 'si-Latn');
  assert.equal(nextConversationLanguage('si', 'ow'), 'si');
  // A clear switch does.
  assert.equal(nextConversationLanguage('si', 'Actually can you reply in English please?'), 'en');
  assert.equal(nextConversationLanguage('en', 'මට සිංහලෙන් කියන්න'), 'si');
  // Nothing known yet: even a weak hint fills it in.
  assert.equal(nextConversationLanguage(null, 'hi'), 'en');
  assert.equal(nextConversationLanguage(null, '12345'), null);
  assert.equal(nextConversationLanguage('garbage', 'ok'), 'en');
});

test('reply language follows the customer unless the business says otherwise', () => {
  assert.equal(resolveReplyLanguage('si', { defaultLanguage: 'en', matchCustomerLanguage: true }), 'si');
  assert.equal(resolveReplyLanguage(null, { defaultLanguage: 'si', matchCustomerLanguage: true }), 'si');
  assert.equal(resolveReplyLanguage('si-Latn', { defaultLanguage: 'en', matchCustomerLanguage: false }), 'en');
  assert.equal(resolveReplyLanguage('en', { defaultLanguage: 'si', matchCustomerLanguage: false }), 'si');
  assert.equal(resolveReplyLanguage(undefined, undefined), 'en');
  assert.match(replyLanguageInstruction('si'), /Sinhala script/);
  assert.match(replyLanguageInstruction('si-Latn'), /English letters/);
});

test('fixed customer messages exist in every language', () => {
  for (const key of ['handoff_connected', 'pipeline_error', 'request_rolled_back', 'action_fallback', 'ask_phone', 'ask_time'] as const) {
    assert.match(customerMessage(key, 'en'), /[a-z]/);
    assert.match(customerMessage(key, 'si'), /[඀-෿]/);
    assert.doesNotMatch(customerMessage(key, 'si-Latn'), /[඀-෿]/);
  }
  assert.equal(customerMessage('ask_phone', null), customerMessage('ask_phone', 'en'));
});

test('zero-cost routing understands Sinhala and Singlish', () => {
  const route = (m: string, prev?: 'ACTION' | 'KNOWLEDGE') => fastPathRoute(m, prev)?.agent ?? null;
  assert.equal(route('ආයුබෝවන්'), 'support_agent');
  assert.equal(route('සුභ උදෑසනක්!'), 'support_agent');
  assert.equal(route('ayubowan'), 'support_agent');
  assert.equal(route('බොහොම ස්තූතියි'), 'support_agent');
  assert.equal(route('ස්තුතියි'), 'support_agent');
  assert.equal(route('sthuthi'), 'support_agent');
  assert.equal(route('මට කෙනෙක් එක්ක කතා කරන්න ඕන'), 'human_handoff');
  assert.equal(route('manager ට කතා කරන්න පුළුවන්ද'), 'human_handoff');
  assert.equal(route('manussayek ekka katha karanna ona'), 'human_handoff');
  assert.equal(route('ඔව්', 'ACTION'), 'action_agent');
  assert.equal(route('hari', 'ACTION'), 'action_agent');
  assert.equal(route('ow', 'ACTION'), 'action_agent');
  assert.equal(route('තව', 'KNOWLEDGE'), 'knowledge_agent');
  // Real questions still go to the model.
  assert.equal(route('කොහොමද booking එකක් කරන්නේ?'), null);
  assert.equal(route('ඔව්'), null);
});

test('booking-claim guard works in all three languages', () => {
  // Claims that a booking was made → must be backed by a real tool result.
  for (const reply of [
    'Your appointment has been booked for 3 PM.',
    'ඔබගේ appointment එක හෙට ප.ව. 3.00ට වෙන් කළා.',
    'ඔබගේ booking එක තහවුරු කරන ලදී.',
    'Booking එක confirm කළා!',
    'වෙන් කර ඇත. ඔබව බලාපොරොත්තු වෙනවා.',
    'Heta 3.00 PM ta book kala.',
    'Booking eka confirm kala, sthuthi!',
  ]) {
    assert.equal(claimsBooking(reply), true, reply);
  }
  // Offers and questions are not claims.
  for (const reply of [
    'හෙට ප.ව. 3.00ට වෙන් කරන්න පුළුවන්. ඔබගේ දුරකථන අංකය දෙන්න.',
    'මම booking එක confirm කරන්නද?',
    'Book karanna phone number eka denna puluwanda?',
    'Book karala denna kamathida?',
    'What time would you like?',
  ]) {
    assert.equal(claimsBooking(reply), false, reply);
  }
});

test('cancel/undo requests are understood in Sinhala and Singlish', () => {
  assert.equal(wantsRollback('cancel that'), true);
  assert.equal(wantsRollback('කරුණාකර එක අවලංගු කරන්න'), true);
  assert.equal(wantsRollback('booking එක cancel කරන්න'), true);
  assert.equal(wantsRollback('booking eka cancel karanna'), true);
  assert.equal(wantsRollback('cancel policy eka mokakda?'), false);
  assert.equal(wantsRollback('අවලංගු කිරීමේ නීති මොනවද?'), false);
});

test('owner commands in Sinhala and Singlish', () => {
  const employees = [{ id: 'e1', name: 'Ops', role: 'Analyst', department: 'Operations', status: 'ACTIVE' }];
  const parse = (t: string) => parseCommand(t, { employees, tasks: [] });
  assert.equal(parse('අද කළ වැඩ වල සාරාංශයක් දෙන්න').intent, 'DAILY_SUMMARY');
  assert.equal(parse('මේ සතියේ කරපු වැඩ මොනවද?').period, 'week');
  assert.equal(parse('ada karapu wada wala summary ekak denna').intent, 'DAILY_SUMMARY');
  assert.equal(parse('ඔයාලා දැන් මොනවද කරන්නේ?').intent, 'STATUS_QUERY');
  assert.equal(parse('කණ්ඩායමේ තත්ත්වය කොහොමද').intent, 'TEAM_STATUS');
  const task = parse('ලබන සතියට Facebook post 3ක් හදන්න');
  assert.equal(task.intent, 'NEW_TASK');
  assert.equal(task.title, 'ලබන සතියට Facebook post 3ක් හදන්න');
  assert.equal(extractPriority('හදිසියෙන් customer list එක හදන්න'), 'URGENT');
  assert.equal(extractPriority('ikmanata karanna'), 'HIGH');
});
