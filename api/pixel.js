// GET /p/<token>.gif  →  the invisible pixel.
//
// Non-negotiable: this ALWAYS returns 200 and a valid GIF, for any token, even if logging
// blows up. A broken tracker must never put a broken-image icon in someone's inbox.

import { classify } from '../lib/classify.js';
import { dayOf, updateDay } from '../lib/store.js';
import { clientIp } from '../lib/http.js';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

export default async function handler(req, res) {
  const token = String(req.query.token || '').replace(/\.gif$/i, '');

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', String(GIF.length));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, private');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).end(GIF);

  try {
    await logOpen(token, req);
  } catch (err) {
    console.error('[pixel] logging failed for', token, err);
  }
}

async function logOpen(token, req) {
  const day = dayOf(token);
  if (!day) { console.warn('[pixel] unparseable token', token); return; }

  const at = new Date().toISOString();
  const ip = clientIp(req);
  const userAgent = String(req.headers['user-agent'] || '');

  await updateDay(day, (messages) => {
    const msg = messages.find((m) => m.token === token);
    if (!msg) {
      // Orphan: a pixel we never registered. Keep it — it is evidence, not noise.
      messages.push({
        token, recipient: null, subject: null, sentAt: at, source: 'orphan',
        events: [{ at, ip, userAgent, kind: 'open', classification: 'unknown' }],
      });
      return true;
    }
    const classification = classify({
      sentAt: msg.sentAt, at, userAgent, ip, registerIp: msg.registerIp || '',
    });
    msg.events = msg.events || [];
    msg.events.push({ at, ip, userAgent, kind: 'open', classification });
    return true;
  }, `open: ${token}`);
}
