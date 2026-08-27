// POST /register  {token, recipient, subject, sentAt, source, links?}
// Called by MailMate, the Chrome extension, or the outreach builder before a message goes out.

import { dayOf, updateDay, newToken } from '../lib/store.js';
import { clientIp, authorized } from '../lib/http.js';

const BASE = process.env.TRACKER_BASE_URL || 'https://t.danielkelleghan.com';
export const pixelURL = (token) => `${BASE}/p/${token}.gif`;

export function buildRecord(body = {}, registerIp = '') {
  return {
    token: body.token || newToken(),
    recipient: body.recipient || null,
    subject: body.subject || null,
    sentAt: body.sentAt || new Date().toISOString(),
    source: body.source || 'unknown',
    // The IP that registered is Daniel's own machine. Every later fetch from this IP is his
    // compose window loading the pixel, not a recipient — see lib/classify.js.
    registerIp,
    links: Array.isArray(body.links) ? body.links : [],
    events: [],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const parsed = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  // A single message or a batch. The outreach run registers 50 at once; sending those as one
  // call keeps it to a single store write instead of 50 racing ones.
  const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.messages) ? parsed.messages : [parsed]);
  if (!items.length) return res.status(400).json({ error: 'nothing to register' });

  const ip = clientIp(req);
  const records = items.map((body) => buildRecord(body, ip));
  const bad = records.find((r) => !dayOf(r.token));
  if (bad) return res.status(400).json({ error: 'token must start with YYYYMMDD-' });

  // Group by day file so a batch spanning midnight still writes correctly.
  const byDay = new Map();
  for (const r of records) {
    const day = dayOf(r.token);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(r);
  }

  try {
    for (const [day, group] of byDay) {
      await updateDay(day, (messages) => {
        let changed = false;
        for (const r of group) {
          if (messages.some((m) => m.token === r.token)) continue; // idempotent re-register
          messages.push(r);
          changed = true;
        }
        return changed;
      }, `register: ${group.length} message(s)`);
    }
  } catch (err) {
    console.error('[register] failed', err);
    return res.status(503).json({ error: 'store unavailable' });
  }

  const out = records.map((r) => ({ token: r.token, pixel: pixelURL(r.token) }));
  return res.status(200).json(Array.isArray(parsed) || parsed.messages ? { registered: out } : out[0]);
}
