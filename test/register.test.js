import { test } from 'node:test';
import assert from 'node:assert';
import { buildRecord, pixelURL } from '../api/register.js';
import { dayOf } from '../lib/store.js';

test('a record with no token gets a valid, dated one', () => {
  const r = buildRecord({ recipient: 'a@b.com', subject: 'Hi' }, '73.9.1.2');
  assert.ok(dayOf(r.token), 'token should carry a parseable day');
  assert.equal(r.recipient, 'a@b.com');
  assert.equal(r.registerIp, '73.9.1.2');
  assert.deepEqual(r.events, []);
});

test('the registering IP is stored, because that is how Daniel\'s own compose-window fetch is recognised later', () => {
  assert.equal(buildRecord({}, '10.0.0.9').registerIp, '10.0.0.9');
});

test('an unknown source is labelled, never guessed', () => {
  assert.equal(buildRecord({}).source, 'unknown');
});

test('the pixel URL is built from the token', () => {
  assert.match(pixelURL('20260827-abcdefghijkm'), /\/p\/20260827-abcdefghijkm\.gif$/);
});
