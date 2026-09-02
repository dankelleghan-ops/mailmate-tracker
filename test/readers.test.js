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

test('a fingerprint that was ever SELF is never learned, and its human opens become self', () => {
  const msgs = [
    // his own Mac, seen as self on one message...
    { recipientCount: 1, recipient: 'marshall@x.com',
      events: [{ kind: 'open', classification: 'self', fingerprint: 'mac1' }] },
    // ...counted human on a one-to-one email after his IP changed (2026-09-02)
    { recipientCount: 1, recipient: 'caleb@y.com',
      events: [{ kind: 'open', classification: 'human', fingerprint: 'mac1' }] },
    // ...and then "named" as Caleb on somebody else's thread
    { recipientCount: 3, recipient: 'sara@z.com',
      events: [{ kind: 'open', classification: 'human', fingerprint: 'mac1' }] },
  ];
  const out = annotate(msgs);
  assert.deepEqual(learnProfiles(msgs), {});
  assert.deepEqual(out[2].readers, { named: [], unnamed: 0 });
  assert.equal(out[1].events[0].classification, 'self');
  assert.equal(out[2].events[0].classification, 'self');
});

test('a fingerprint that opens one-to-one mail to two different people is nobody', () => {
  const msgs = [
    { recipientCount: 1, recipient: 'a@x.com',
      events: [{ kind: 'open', classification: 'human', fingerprint: 'relay' }] },
    { recipientCount: 1, recipient: 'b@y.com',
      events: [{ kind: 'open', classification: 'human', fingerprint: 'relay' }] },
    { recipientCount: 2, recipient: 'c@z.com',
      events: [{ kind: 'open', classification: 'human', fingerprint: 'relay' }] },
  ];
  const out = annotate(msgs);
  assert.deepEqual(learnProfiles(msgs), {});
  assert.deepEqual(out[2].readers, { named: [], unnamed: 1 });
  assert.equal(out[2].events[0].classification, 'human', 'a relay is unnamed, not self');
});
