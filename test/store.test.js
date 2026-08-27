import { test } from 'node:test';
import assert from 'node:assert';
import { newToken, dayOf } from '../lib/store.js';

test('a token carries its own send date, so the pixel needs no lookup to find its day file', () => {
  const tok = newToken(new Date('2026-08-27T15:00:00Z'));
  assert.match(tok, /^20260827-[A-Za-z2-9]{12}$/);
  assert.equal(dayOf(tok), '2026-08-27');
});

test('tokens do not repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(newToken());
  assert.equal(seen.size, 500);
});

test('a token with no date prefix is rejected rather than guessed at', () => {
  assert.equal(dayOf('garbage'), null);
  assert.equal(dayOf(''), null);
  assert.equal(dayOf(undefined), null);
});

test('the ambiguous characters are absent, so a token can be read aloud or retyped', () => {
  const tok = newToken().split('-')[1];
  assert.ok(!/[0O1lI]/.test(tok), `token ${tok} contains a look-alike character`);
});
