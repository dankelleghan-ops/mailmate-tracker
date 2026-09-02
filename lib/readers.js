// Who opened what — computed once, on the server, for every surface.
//
// This logic used to live only in the Mac app, which meant Gmail in the browser could never
// show it, and any second implementation would have drifted from the first. Daniel's rule is
// that a feature ships to BOTH surfaces, so the attribution lives here and the clients render.
//
// The method: attribution is CERTAIN only on a one-to-one email — one recipient, one reader.
// Those messages teach each person's fingerprint, and the learned fingerprints are then
// recognised on group emails, where the marker alone could never say who opened it.
//
// Group emails never teach. That is how you would invent a confident wrong answer.

import { isSharedBucket } from './fingerprint.js';

/** Bare addresses out of a recipient field, however it was written. */
export function addressesIn(recipient = '') {
  return String(recipient)
    .split(',')
    .map((part) => {
      const t = part.trim();
      const m = /<([^>]+)>/.exec(t);
      return (m ? m[1] : t).trim().toLowerCase();
    })
    .filter((a) => a.includes('@'));
}

/**
 * fingerprint → email, learned from every single-recipient message in the set.
 *
 * Learning requires an EXPLICIT recipient list from the client. The `recipient` field alone is
 * not enough and must never be used: it holds whoever the message was primarily addressed to,
 * so a reply sent to one person and cc'd to eight looks exactly like a one-to-one email. That
 * happened on 2026-08-27 — a nine-recipient thread taught a fingerprint as belonging to the
 * person in the To field, which could as easily have been any of the eight. Without the list,
 * we learn nothing, which is the right failure: a wrong name on a client's email is far worse
 * than no name.
 */
/**
 * Fingerprints that are the sender's OWN devices: anything that has ever produced a `self` open.
 *
 * The self-IP list only knows networks that have registered something. On 2026-09-02 Daniel's
 * IP changed; his Mac's first opens of the day came from an address the tracker had never seen,
 * were classified human, and one of them landed on a one-to-one email — so the tracker learned
 * that his own Mac was the recipient, then named that person as a reader on somebody else's
 * thread. The fingerprint is a hash of the device, not the address, and it stays the same when
 * the IP moves: once it has been seen as `self` even once, every open it ever produced was his.
 */
export function selfFingerprints(messages) {
  const fps = new Set();
  for (const m of messages) {
    for (const e of m.events || []) {
      if (e.classification === 'self' && e.fingerprint && !isSharedBucket(e.fingerprint)) {
        fps.add(e.fingerprint);
      }
    }
  }
  return fps;
}

/**
 * Fingerprints that opened one-to-one mail addressed to two DIFFERENT people. One device that
 * reads mail sent to two different recipients is a relay, a scanner, or the sender's own machine
 * — never a person. Naming it as either person would be wrong for at least one of them.
 */
export function ambiguousFingerprints(messages) {
  const seenFor = new Map(); // fingerprint → Set(recipient address)
  for (const m of messages) {
    if (m.recipientCount !== 1) continue;
    const to = addressesIn(m.recipient);
    if (to.length !== 1) continue;
    for (const e of m.events || []) {
      if (e.kind !== 'open' || e.classification !== 'human') continue;
      if (!e.fingerprint || isSharedBucket(e.fingerprint)) continue;
      if (!seenFor.has(e.fingerprint)) seenFor.set(e.fingerprint, new Set());
      seenFor.get(e.fingerprint).add(to[0]);
    }
  }
  const out = new Set();
  for (const [fp, people] of seenFor) if (people.size >= 2) out.add(fp);
  return out;
}

export function learnProfiles(messages) {
  const profiles = {};
  const self = selfFingerprints(messages);
  const ambiguous = ambiguousFingerprints(messages);
  for (const m of messages) {
    // recipientCount is 0 when the client did not report its audience — never teach then.
    if (m.recipientCount !== 1) continue;
    const to = addressesIn(m.recipient);
    if (to.length !== 1) continue;
    for (const e of m.events || []) {
      if (e.kind !== 'open' || e.classification !== 'human') continue;
      if (!e.fingerprint || isSharedBucket(e.fingerprint)) continue;
      if (self.has(e.fingerprint) || ambiguous.has(e.fingerprint)) continue;
      profiles[e.fingerprint] = to[0];
    }
  }
  return profiles;
}

/**
 * Readers of one message: the people we can name, and how many we cannot.
 *
 * Distinct readers are counted by fingerprint, so one person opening five times is one reader.
 * Each shared bucket counts as exactly ONE unnamed reader — there may be more people behind it,
 * and stating a number would be inventing one.
 */
export function readersOf(message, profiles) {
  const named = [];
  const unnamed = new Set();
  for (const e of message.events || []) {
    if (e.kind !== 'open' || e.classification !== 'human') continue;
    const person = e.fingerprint && !isSharedBucket(e.fingerprint) ? profiles[e.fingerprint] : null;
    if (person) {
      if (!named.includes(person)) named.push(person);
    } else {
      unnamed.add(e.fingerprint || 'unknown');
    }
  }
  return { named, unnamed: unnamed.size };
}

export function annotate(messages) {
  // A device that has ever been the sender's own is the sender's own everywhere: its "human"
  // opens are reclassified so no count, anywhere, includes him reading his own sent mail.
  const self = selfFingerprints(messages);
  for (const m of messages) {
    for (const e of m.events || []) {
      if (e.classification === 'human' && e.fingerprint && self.has(e.fingerprint)) {
        e.classification = 'self';
      }
    }
  }
  const profiles = learnProfiles(messages);
  for (const m of messages) m.readers = readersOf(m, profiles);
  return messages;
}
