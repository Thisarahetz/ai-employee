import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twilioSignature, verifyTwilioSignature } from '../src/modules/voice/twilio-signature';
import {
  connectTwiml,
  dialTwiml,
  parseRelayMessage,
  signStreamToken,
  speechLanguage,
  toSpeech,
  verifyStreamToken,
} from '../src/modules/voice/voice-protocol';
import { VoiceSessionRegistry, speakingMs } from '../src/modules/voice/voice-session.registry';

test('Twilio signature matches the documented algorithm and rejects tampering', () => {
  // Example from Twilio's request-validation docs.
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
  const params = { CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212' };
  assert.equal(twilioSignature(url, params, '12345'), 'GvWf1cFY/Q7PnoempGyD5oXAezc=');
  assert.ok(verifyTwilioSignature(url, params, 'GvWf1cFY/Q7PnoempGyD5oXAezc=', '12345'));
  assert.ok(!verifyTwilioSignature(url, { ...params, Digits: '9999' }, 'GvWf1cFY/Q7PnoempGyD5oXAezc=', '12345'));
  assert.ok(!verifyTwilioSignature(url, params, undefined, '12345'));
  assert.ok(!verifyTwilioSignature(url, params, 'GvWf1cFY/Q7PnoempGyD5oXAezc=', ''));
});

test('stream token: valid, expired, forged and for another secret', () => {
  const t = signStreamToken('ch_1', 'secret', 1000, 0);
  assert.equal(verifyStreamToken(t, 'secret', 500), 'ch_1');
  assert.equal(verifyStreamToken(t, 'secret', 1001), null);
  assert.equal(verifyStreamToken(t, 'other', 500), null);
  assert.equal(verifyStreamToken('x.y', 'secret', 0), null);
  assert.equal(verifyStreamToken('', 'secret', 0), null);
  const forged = `${Buffer.from('ch_2.9999999999999').toString('base64url')}.${t.split('.')[1]}`;
  assert.equal(verifyStreamToken(forged, 'secret', 0), null);
});

test('relay messages are parsed defensively', () => {
  assert.deepEqual(parseRelayMessage('{"type":"setup","callSid":"CA1","from":"+94771234567","to":"+1","customParameters":{"token":"tk"}}'), {
    type: 'setup', callSid: 'CA1', from: '+94771234567', to: '+1', token: 'tk',
  });
  assert.deepEqual(parseRelayMessage('{"type":"prompt","voicePrompt":"  hello ","last":true}'), { type: 'prompt', text: 'hello', last: true });
  assert.deepEqual(parseRelayMessage('{"type":"prompt","voicePrompt":"hel","last":false}'), { type: 'prompt', text: 'hel', last: false });
  assert.equal(parseRelayMessage('not json'), null);
  assert.equal(parseRelayMessage('{"type":"bogus"}'), null);
  assert.equal(parseRelayMessage('null'), null);
  assert.deepEqual(parseRelayMessage('{"type":"prompt"}'), { type: 'prompt', text: '', last: true });
});

test('chat text becomes speakable', () => {
  assert.equal(toSpeech('**Hair cut** is Rs. 2,500 😊\n- Mon-Fri 9-5\n- Sat 10-2'), 'Hair cut is Rs. 2,500. Mon-Fri 9-5. Sat 10-2');
  assert.equal(toSpeech('See [our menu](https://x.test/menu) or https://x.test for more'), 'See our menu or for more');
  assert.equal(toSpeech('```code```ok'), 'ok');
  const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i}.`).join(' ');
  const cut = toSpeech(long);
  assert.ok(cut.length <= 600 && cut.endsWith('.'), cut.slice(-30));
  assert.equal(toSpeech('සුභ දවසක්! 🌸'), 'සුභ දවසක්!');
});

test('speech language: Sinhala is spoken Sinhala, Singlish and English are spoken English', () => {
  assert.equal(speechLanguage('si', {}), 'si-LK');
  assert.equal(speechLanguage('si-Latn', {}), 'en-US');
  assert.equal(speechLanguage('en', {}), 'en-US');
  assert.equal(speechLanguage('si', { VOICE_LANG_SI: 'si-LK-x' }), 'si-LK-x');
});

test('TwiML escapes everything it is given', () => {
  const x = connectTwiml({ streamUrl: 'wss://a.test/voice/stream', actionUrl: 'https://a.test/a?x=1&y=2', token: 't', language: 'en-US', greeting: 'Hi "you" <b> & co', ttsProvider: 'Google', transcriptionProvider: 'Google' });
  assert.ok(x.includes('welcomeGreeting="Hi &quot;you&quot; &lt;b&gt; &amp; co"'));
  assert.ok(x.includes('x=1&amp;y=2'));
  assert.ok(!x.includes('voice='));
  assert.equal(dialTwiml('+94771234567', '+15551234567'), '<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="+15551234567">+94771234567</Dial></Response>');
  assert.ok(!dialTwiml('+94771234567', 'x"><Hangup/>').includes('callerId'));
});

function fakeSession(registry: VoiceSessionRegistry, over: Record<string, unknown> = {}) {
  const sent: any[] = [];
  const session: any = {
    callSid: 'CA1', channelId: 'ch', tenantId: 't', caller: '+94771234567', tag: 'en', speechLang: 'en-US',
    socket: { send: (d: string) => sent.push(JSON.parse(d)), close: () => sent.push({ closed: true }) },
    ...over,
  };
  registry.register(session);
  return { session, sent };
}

test('registry: speaks a reply, switches language first, and ignores calls that ended', () => {
  const r = new VoiceSessionRegistry();
  const { sent } = fakeSession(r);
  assert.equal(r.deliver({ channelId: 'ch', destination: '+94000', content: 'hi' }), false);
  assert.equal(r.deliver({ channelId: 'ch', destination: '+94771234567', content: 'ඔබට ස්තූතියි', language: 'si' }), true);
  assert.deepEqual(sent, [
    { type: 'language', ttsLanguage: 'si-LK', transcriptionLanguage: 'si-LK' },
    { type: 'text', token: 'ඔබට ස්තූතියි', last: true },
  ]);
  r.deliver({ channelId: 'ch', destination: '+94771234567', content: 'ok', language: 'si' });
  assert.equal(sent.filter((m) => m.type === 'language').length, 1, 'no repeat language message');
});

test('registry: a handoff ends the call after the reply is spoken; without a transfer number it does not claim one', async () => {
  const r = new VoiceSessionRegistry();
  const a = fakeSession(r, { conversationId: 'cv' });
  r.deliver({ channelId: 'ch', destination: '+94771234567', content: "I've connected you with our team.", replySource: 'handoff', canTransfer: true });
  assert.equal(a.sent[0].token, "I've connected you with our team.");
  assert.equal(a.sent.length, 1, 'not ended while the sentence is still playing');
  assert.ok(speakingMs('x') > 1000);
  clearTimeout(a.session.endTimer);
  assert.equal(r.deliver({ channelId: 'ch', destination: '+94771234567', content: 'again' }), false, 'ended sessions take no more replies');

  const r2 = new VoiceSessionRegistry();
  const b = fakeSession(r2);
  r2.deliver({ channelId: 'ch', destination: '+94771234567', content: "I've connected you with our team.", replySource: 'handoff', canTransfer: false });
  assert.match(b.sent[0].token, /someone will get back to you/);
  clearTimeout(b.session.endTimer);
});
