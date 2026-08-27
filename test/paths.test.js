import { test } from 'node:test';
import assert from 'node:assert';
import { messagePath, parseMessagePath, eventPath, parseEventPath, enc, dec } from '../lib/paths.js';

test('a message round-trips through its pathname', () => {
  const p = messagePath({ day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                          recipient: 'Kate.Lee@ventana.com', subject: 'Re: Shoot dates — June?', source: 'mailmate' });
  const back = parseMessagePath(p);
  assert.deepEqual(back, { day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                           recipient: 'Kate.Lee@ventana.com', subject: 'Re: Shoot dates — June?', source: 'mailmate' });
});

test('a subject full of punctuation and emoji survives', () => {
  const subject = 'Quote: 3 days @ $4,500/day — "final"? 📸 #shoot';
  const back = parseMessagePath(messagePath({ day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                                              recipient: 'a@b.com', subject, source: 'gmail-web' }));
  assert.equal(back.subject, subject);
});

test('an empty subject does not break the path', () => {
  const back = parseMessagePath(messagePath({ day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                                              recipient: 'a@b.com', subject: '', source: 'mailmate' }));
  assert.equal(back.subject, '');
  assert.equal(back.recipient, 'a@b.com');
});

test('a very long subject is truncated, not dropped', () => {
  const subject = 'x'.repeat(400);
  const back = parseMessagePath(messagePath({ day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                                              recipient: 'a@b.com', subject, source: 'mailmate' }));
  assert.equal(back.subject.length, 120);
});

test('an event round-trips, so listing a day needs no content fetches', () => {
  const p = eventPath({ day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                        at: '2026-08-27T18:04:12.123Z', kind: 'open', classification: 'human', nonce: 'q7' });
  const back = parseEventPath(p);
  assert.equal(back.token, '20260827T173455-abcdefghijkm');
  assert.equal(back.kind, 'open');
  assert.equal(back.classification, 'human');
  assert.equal(back.at, '2026-08-27T18:04:12Z');
});

test('every classification survives the pathname, hyphen included', () => {
  for (const c of ['human', 'scanner', 'privacy-proxy', 'self', 'unknown']) {
    const p = eventPath({ day: '2026-08-27', token: '20260827T173455-abcdefghijkm',
                          at: '2026-08-27T18:04:12.000Z', kind: 'click', classification: c, nonce: 'z1' });
    assert.equal(parseEventPath(p).classification, c, `failed for ${c}`);
  }
});

test('rubbish pathnames parse to null rather than half a record', () => {
  assert.equal(parseMessagePath('nonsense'), null);
  assert.equal(parseEventPath('ev/broken'), null);
});

test('base64url encoding leaves nothing that breaks a URL path', () => {
  const round = dec(enc('a/b+c=d?e#f'));
  assert.equal(round, 'a/b+c=d?e#f');
  assert.ok(!/[/+=]/.test(enc('a/b+c=d')));
});
