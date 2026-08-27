import { test } from 'node:test';
import assert from 'node:assert';
import { addressesIn, learnProfiles, readersOf, annotate } from '../lib/readers.js';

const open = (fp, at = '2026-08-27T18:00:00Z') =>
  ({ at, kind: 'open', classification: 'human', fingerprint: fp });

test('addresses come out of any recipient format', () => {
  assert.deepEqual(addressesIn('Lisa Fuentes <lfuentes@hotelzaza.com>'), ['lfuentes@hotelzaza.com']);
  assert.deepEqual(addressesIn('a@b.com, Rick <r@d.com>'), ['a@b.com', 'r@d.com']);
  assert.deepEqual(addressesIn(''), []);
});

test('a one-to-one email teaches that person’s fingerprint', () => {
  const p = learnProfiles([{ recipient: 'lisa@zaza.com', recipientCount: 1, events: [open('fp-lisa')] }]);
  assert.equal(p['fp-lisa'], 'lisa@zaza.com');
});

test('a GROUP email teaches nothing — the whole point of the design', () => {
  const p = learnProfiles([{ recipient: 'a@b.com', recipientCount: 9, events: [open('fp-someone')] }]);
  assert.deepEqual(p, {}, 'group mail must never bind a fingerprint to a person');
});

test('a message whose audience was NOT reported teaches nothing', () => {
  // The bug this guards: a reply to one person cc'd to eight arrives with only the To address,
  // so it looks one-to-one and would teach a fingerprint that belongs to any of the nine.
  const p = learnProfiles([{ recipient: 'lisa@zaza.com', events: [open('fp-maybe-lisa')] }]);
  assert.deepEqual(p, {}, 'without a reported audience size, nothing may be learned');
  const p2 = learnProfiles([{ recipient: 'lisa@zaza.com', recipientCount: 0, events: [open('fp')] }]);
  assert.deepEqual(p2, {});
});

test('shared buckets are never bound to a person', () => {
  const p = learnProfiles([{ recipient: 'lisa@zaza.com', recipientCount: 1, events: [open('gmail-proxy'), open('apple-proxy')] }]);
  assert.deepEqual(p, {});
});

test('scanner and self opens teach nothing', () => {
  const p = learnProfiles([{ recipient: 'lisa@zaza.com', recipientCount: 1, events: [
    { at: '2026-08-27T18:00:00Z', kind: 'open', classification: 'scanner', fingerprint: 'fp-x' },
    { at: '2026-08-27T18:00:00Z', kind: 'open', classification: 'self', fingerprint: 'fp-y' },
  ] }]);
  assert.deepEqual(p, {});
});

test('a learned fingerprint names a reader on a later group email', () => {
  const messages = [
    { recipient: 'lisa@zaza.com', recipientCount: 1, events: [open('fp-lisa')] },
    { recipient: 'lisa@zaza.com', recipientCount: 3, events: [open('fp-lisa'), open('fp-stranger')] },
  ];
  annotate(messages);
  assert.deepEqual(messages[1].readers.named, ['lisa@zaza.com']);
  assert.equal(messages[1].readers.unnamed, 1);
});

test('one person opening five times is one reader', () => {
  const m = { recipient: 'a@b.com, c@d.com', events: [open('fp1'), open('fp1'), open('fp1')] };
  assert.equal(readersOf(m, {}).unnamed, 1);
});

test('every Gmail reader counts as exactly one unnamed reader, never a number we invented', () => {
  const m = { recipient: 'a@b.com, c@d.com, e@f.com', events: [open('gmail-proxy'), open('gmail-proxy')] };
  const r = readersOf(m, {});
  assert.deepEqual(r.named, []);
  assert.equal(r.unnamed, 1);
});

test('a message nobody opened has no readers', () => {
  assert.deepEqual(readersOf({ recipient: 'a@b.com', events: [] }, {}), { named: [], unnamed: 0 });
});
