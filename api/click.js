// GET /l/<token>/<base64url destination>  →  302 to the destination, click logged.
//
// The destination travels in the URL rather than in the store, so a click redirect never waits
// on a lookup and never breaks if the store is slow or unreachable.

import { classify } from '../lib/classify.js';
import { isSelfFetch } from '../lib/selftag.js';
import { isKnownSelfIp } from '../lib/selfips.js';
import { put } from '../lib/blob.js';
import { eventPath, dec } from '../lib/paths.js';
import { dayOf, sentAtOf, isValidToken } from '../lib/token.js';
import { clientIp } from '../lib/http.js';

const FALLBACK = 'https://www.danielkelleghan.com/';

export default async function handler(req, res) {
  const raw = String(req.query.token || '');
  const lastDot = raw.lastIndexOf('.');
  const token = lastDot === -1 ? raw : raw.slice(0, lastDot);
  const tag = lastDot === -1 ? '' : raw.slice(lastDot + 1);

  let destination = FALLBACK;
  const decoded = dec(String(req.query.dest || ''));
  if (/^https?:\/\//i.test(decoded)) destination = decoded;

  // Logged before redirecting, for the same reason as the pixel: work left running after the
  // response may never execute. The deadline is tighter here because a person is waiting.
  try {
    await Promise.race([
      logClick({ req, token, tag, destination }),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
  } catch (err) {
    console.error('[click] logging failed', err);
  }

  res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
  res.end();
}

async function logClick({ req, token, tag, destination }) {
  {
    if (!isValidToken(token)) return;
    const at = new Date().toISOString();
    const ip = clientIp(req);
    const userAgent = String(req.headers['user-agent'] || '');
    const isSelf = isSelfFetch(tag, ip) || await isKnownSelfIp(ip);
    const classification = classify({
      sentAt: sentAtOf(token).toISOString(), at, userAgent, ip, isSelf,
    });
    const nonce = Math.abs((Date.now() ^ destination.length) % 0xffffff).toString(36);
    await put(eventPath({ day: dayOf(token), token, at, kind: 'click', classification, nonce }),
              { token, at, kind: 'click', classification, destination, userAgent });
  }
}
