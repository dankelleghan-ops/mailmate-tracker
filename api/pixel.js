// GET /p/<token>.<selfTag>.gif  →  the invisible pixel.
//
// ALWAYS 200 with a valid GIF, for any input, even when logging fails. A broken tracker must
// never put a broken-image icon in someone's inbox.
//
// No reads. The send time comes out of the token and "is this Daniel's own machine" comes out
// of the signed tag in the URL, so the eventual consistency of the store cannot affect a
// classification.

import { classify } from '../lib/classify.js';
import { isSelfFetch } from '../lib/selftag.js';
import { isKnownSelfIp } from '../lib/selfips.js';
import { put } from '../lib/blob.js';
import { eventPath } from '../lib/paths.js';
import { dayOf, sentAtOf, isValidToken } from '../lib/token.js';
import { clientIp } from '../lib/http.js';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

// The event is written BEFORE the response is sent. On Vercel the function can be frozen the
// moment it responds, so anything left running after `res.end()` may simply never happen —
// which is exactly how the first version of this silently recorded nothing. The write is raced
// against a short deadline so a slow store costs a fraction of a second, never a hung image.
const LOG_DEADLINE_MS = 2500;

export default async function handler(req, res) {
  try {
    await Promise.race([
      log(req),
      new Promise((resolve) => setTimeout(resolve, LOG_DEADLINE_MS)),
    ]);
  } catch (err) {
    console.error('[pixel] logging failed', err);
  }

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(GIF.length));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).end(GIF);
}

async function log(req) {
  // Path shape: <token>.<tag>.gif
  const raw = String(req.query.token || '').replace(/\.gif$/i, '');
  const lastDot = raw.lastIndexOf('.');
  const token = lastDot === -1 ? raw : raw.slice(0, lastDot);
  const tag = lastDot === -1 ? '' : raw.slice(lastDot + 1);

  if (!isValidToken(token)) { console.warn('[pixel] unrecognised token', token); return; }

  const at = new Date().toISOString();
  const ip = clientIp(req);
  const userAgent = String(req.headers['user-agent'] || '');
  // Two independent ways of recognising Daniel: the tag minted for THIS message (covers the
  // compose window fetching the pixel as he writes), and the set of networks that have ever
  // registered a message (covers him re-reading his own sent mail days later).
  const isSelf = isSelfFetch(tag, ip) || await isKnownSelfIp(ip);
  const classification = classify({
    sentAt: sentAtOf(token).toISOString(), at, userAgent, ip, isSelf,
  });

  const nonce = Math.abs((Date.now() ^ (userAgent.length * 2654435761)) % 0xffffff).toString(36);
  const path = eventPath({ day: dayOf(token), token, at, kind: 'open', classification, nonce });
  await put(path, { token, at, kind: 'open', classification, userAgent, ipPrefix: ip.split('.').slice(0, 2).join('.') });
}
