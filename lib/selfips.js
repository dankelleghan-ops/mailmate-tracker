// The set of networks that are provably Daniel's.
//
// Any request to /register carries the tracker secret, so the IP it came from is by definition
// one of Daniel's own machines. Remembering those means a later fetch of the same pixel from
// the same network — him reading his own sent mail in Apple Mail, hours or days after sending —
// is recognised as him and never counted as the recipient opening it.
//
// Stored as a one-way hash: the store never holds Daniel's IP addresses in the clear.
//
// Reading these back is safe despite the store's eventual consistency: a self-IP is written the
// first time a machine registers anything, long before any later pixel fetch needs it. The
// per-message signed tag (lib/selftag.js) covers the one case this cannot — the very first
// fetch from a brand-new network, which is Mail's own compose window seconds after registering.

import { createHmac } from 'node:crypto';
import { put, list } from './blob.js';

const PREFIX = 'self/';
let cache = { at: 0, hashes: new Set() };
const TTL_MS = 60_000;

export function ipHash(ip, secret = process.env.TRACKER_SECRET || '') {
  return createHmac('sha256', secret).update(String(ip || '')).digest('hex').slice(0, 24);
}

/** Called on every register. Idempotent — the pathname is the hash. */
export async function rememberSelfIp(ip) {
  if (!ip) return;
  const h = ipHash(ip);
  if (cache.hashes.has(h)) return;
  await put(`${PREFIX}${h}.json`, { firstSeen: new Date().toISOString() });
  cache.hashes.add(h);
}

export async function knownSelfHashes() {
  if (Date.now() - cache.at < TTL_MS && cache.hashes.size) return cache.hashes;
  try {
    const blobs = await list(PREFIX);
    const hashes = new Set(
      blobs.map((b) => /^self\/([0-9a-f]{24})\.json$/.exec(b.pathname)?.[1]).filter(Boolean)
    );
    cache = { at: Date.now(), hashes };
  } catch {
    // A failed lookup must not turn Daniel into a recipient; keep whatever we already knew.
  }
  return cache.hashes;
}

export async function isKnownSelfIp(ip) {
  if (!ip) return false;
  return (await knownSelfHashes()).has(ipHash(ip));
}
