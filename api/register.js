// POST /register  {token, recipient, subject, sentAt, source, links?}
// Called by MailMate, the Chrome extension, or the outreach builder before a message goes out.

import { dayOf, updateDay, newToken } from '../lib/store.js';
import { clientIp, authorized } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const token = body.token || newToken();
  const day = dayOf(token);
  if (!day) return res.status(400).json({ error: 'token must start with YYYYMMDD-' });

  const record = {
    token,
    recipient: body.recipient || null,
    subject: body.subject || null,
    sentAt: body.sentAt || new Date().toISOString(),
    source: body.source || 'unknown',
    // The IP that registered is Daniel's own machine. Every later fetch from this IP is his
    // compose window loading the pixel, not a recipient — see lib/classify.js.
    registerIp: clientIp(req),
    links: Array.isArray(body.links) ? body.links : [],
    events: [],
  };

  try {
    await updateDay(day, (messages) => {
      if (messages.some((m) => m.token === token)) return false; // idempotent re-register
      messages.push(record);
      return true;
    }, `register: ${token}`);
  } catch (err) {
    console.error('[register] failed', err);
    return res.status(503).json({ error: 'store unavailable' });
  }

  return res.status(200).json({ token, pixel: `https://t.danielkelleghan.com/p/${token}.gif` });
}
