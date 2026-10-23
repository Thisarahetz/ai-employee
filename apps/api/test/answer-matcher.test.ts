import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_MATCH_SCORE,
  HINT_MATCH_SCORE,
  answerInLanguage,
  findBestAnswer,
  looksLikeActionRequest,
  phoneticKey,
  quickReplyKind,
  scoreQuestion,
  wordsMatch,
} from '../src/common/reply/answer-matcher';

// A small salon's saved answers, written the way owners actually write them.
const ANSWERS = [
  {
    id: 'hours',
    questions: ['What are your opening hours?', 'When are you open?', 'විවෘත වේලාවන් මොනවද?', 'kiyatada open karanne'],
    answerEn: 'We are open 9am to 7pm, Monday to Saturday.',
    answerSi: 'අපි සඳුදා සිට සෙනසුරාදා දක්වා උදේ 9 සිට රෑ 7 දක්වා විවෘතයි.',
    answerSiLatn: 'Api Sandudha idan Senasurada wenakan ude 9 idan ra 7 wenakan open.',
  },
  {
    id: 'haircut-price',
    questions: ['How much is a haircut?', 'haircut price', 'hair cut එකක් කීයද?', 'haircut ekak kiyada'],
    answerEn: 'A haircut is Rs. 1500.',
    answerSi: 'Hair cut එකක් රු. 1500යි.',
    answerSiLatn: '',
  },
  {
    id: 'location',
    questions: ['Where are you located?', 'What is your address?', 'ලිපිනය මොකක්ද?', 'koheda thiyenne'],
    answerEn: 'No. 12, Galle Road, Colombo 3.',
    answerSi: '',
    answerSiLatn: '',
  },
  {
    id: 'parking',
    questions: ['Do you have parking?'],
    answerEn: 'Yes, free parking behind the salon.',
    answerSi: '',
    answerSiLatn: '',
  },
];

function best(message: string) {
  return findBestAnswer(message, ANSWERS);
}

test('matches the same question asked in different words, cases and with typos', () => {
  const cases: [string, string][] = [
    ['what are your opening hours', 'hours'],
    ['What are ur opening hours??', 'hours'],
    ['wat are your openning hours', 'hours'],
    ['when r u open', 'hours'],
    ['Hi! When are you open?', 'hours'],
    ['how much is a hair cut', 'haircut-price'],
    ['haircut prices?', 'haircut-price'],
    ['where are you located', 'location'],
    ['whats your address', 'location'],
    ['do u have parking', 'parking'],
  ];
  for (const [message, id] of cases) {
    const m = best(message);
    assert.equal(m?.answer.id, id, `"${message}" should match ${id}, got ${m?.answer.id} (${m?.score.toFixed(2)})`);
    assert.ok(m!.score >= DIRECT_MATCH_SCORE, `"${message}" score ${m!.score.toFixed(2)} is below the direct-reply score`);
  }
});

test('matches Sinhala script, including word endings and missing joiners', () => {
  const cases: [string, string][] = [
    ['විවෘත වේලාවන් මොනවද', 'hours'],
    ['විවෘත වේලාව මොනවද?', 'hours'],
    ['hair cut එකක් කීයද', 'haircut-price'],
    ['ලිපිනය මොකක්ද', 'location'],
  ];
  for (const [message, id] of cases) {
    const m = best(message);
    assert.equal(m?.answer.id, id, `"${message}" → ${m?.answer.id} (${m?.score.toFixed(2)})`);
    assert.ok(m!.score >= DIRECT_MATCH_SCORE, `"${message}" score ${m!.score.toFixed(2)}`);
  }
});

test('matches Singlish spelled different ways', () => {
  const cases: [string, string][] = [
    ['kiyatada open karanne', 'hours'],
    ['kiyatada open karanney', 'hours'],
    ['kiyatada open krnne', 'hours'],
    ['haircut ekak kiyada', 'haircut-price'],
    ['hair cut ekak kiyada?', 'haircut-price'],
    ['koheda thiyenne', 'location'],
    ['kohedha tiyenne', 'location'],
  ];
  for (const [message, id] of cases) {
    const m = best(message);
    assert.equal(m?.answer.id, id, `"${message}" → ${m?.answer.id} (${m?.score.toFixed(2)})`);
    assert.ok(m!.score >= DIRECT_MATCH_SCORE, `"${message}" score ${m!.score.toFixed(2)}`);
  }
});

test('does not answer unrelated questions with a saved answer', () => {
  const unrelated = [
    'Do you do bridal makeup?',
    'Can I pay by card?',
    'Is the owner available today?',
    'my hair is damaged what should I do',
    'do you sell gift vouchers',
    'මට complaint එකක් තියෙනවා',
    'mata complain ekak thiyenawa',
  ];
  for (const message of unrelated) {
    const m = best(message);
    assert.ok(!m || m.score < DIRECT_MATCH_SCORE, `"${message}" wrongly matched ${m?.answer.id} (${m?.score.toFixed(2)})`);
  }
});

test('a related but different question is at most a hint, not a reply', () => {
  // About hours, but asks something the saved answer may not cover.
  const m = best('are you open on poya day');
  assert.ok(m && m.score < DIRECT_MATCH_SCORE, `scored ${m?.score.toFixed(2)}`);
});

test('a short saved question does not swallow a long message about other things', () => {
  const s = scoreQuestion('I want to know the haircut price and also if you do keratin and bridal packages for my wedding', 'haircut price');
  assert.ok(s < DIRECT_MATCH_SCORE, `scored ${s.toFixed(2)}`);
  assert.ok(s >= HINT_MATCH_SCORE, `scored ${s.toFixed(2)} — should still be a hint`);
});

test('phonetic keys merge common Singlish spellings', () => {
  assert.equal(phoneticKey('kohomada'), phoneticKey('kohomadha'));
  assert.equal(phoneticKey('thiyenne'), phoneticKey('tiyenne'));
  assert.equal(phoneticKey('welawa'), phoneticKey('velava'));
  assert.ok(wordsMatch('openning', 'opening'));
  assert.ok(wordsMatch('prices', 'price'));
  assert.ok(wordsMatch('මිලද', 'මිල'));
  assert.ok(!wordsMatch('hair', 'pair'));
  assert.ok(!wordsMatch('card', 'cut'));
});

test('answer comes in the customer language, with a sensible fallback', () => {
  const hours = ANSWERS[0]!;
  assert.deepEqual(answerInLanguage(hours, 'si'), { text: hours.answerSi, exact: true });
  assert.deepEqual(answerInLanguage(hours, 'si-Latn'), { text: hours.answerSiLatn, exact: true });
  const price = ANSWERS[1]!;
  // No Singlish written: a Singlish speaker gets the Sinhala version first.
  assert.deepEqual(answerInLanguage(price, 'si-Latn'), { text: price.answerSi, exact: false });
  const location = ANSWERS[2]!;
  assert.deepEqual(answerInLanguage(location, 'si'), { text: location.answerEn, exact: false });
  assert.deepEqual(answerInLanguage({ answerEn: ' ', answerSi: '', answerSiLatn: '' }, 'en'), { text: '', exact: false });
});

test('spots booking-type requests that a saved answer cannot complete', () => {
  for (const m of ['Can I book a haircut tomorrow?', 'I need to cancel my appointment', 'හෙට වෙලාවක් වෙන් කරන්න', 'heta appointment ekak book karanna ona']) {
    assert.ok(looksLikeActionRequest(m), m);
  }
  for (const m of ['How much is a haircut?', 'When are you open?', 'koheda thiyenne']) {
    assert.ok(!looksLikeActionRequest(m), m);
  }
});

test('recognises greeting-only and thanks-only messages in all three languages', () => {
  for (const m of ['hi', 'Hello!', 'good morning', 'ayubowan', 'ආයුබෝවන්', 'hey there 👋']) assert.equal(quickReplyKind(m), 'greeting', m);
  for (const m of ['thanks', 'Thank you so much!', 'isthuthiyi', 'bohoma sthuthi', 'ස්තූතියි', 'බොහොම ස්තුතියි 🙏']) {
    assert.equal(quickReplyKind(m), 'thanks', m);
  }
  for (const m of ['hi, when are you open?', 'thanks, can I also book?', 'hello how much is a haircut']) assert.equal(quickReplyKind(m), null, m);
});
