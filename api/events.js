// GET /events?since=ISO  →  messages and their events.
//
// One list call per day per kind, and zero content fetches: everything the reader needs is in
// the pathnames. A month of history is ~60 requests instead of ~10,000.

import { list } from '../lib/blob.js';
import { parseMessagePath, parseEventPath } from '../lib/paths.js';
import { authorized } from '../lib/http.js';

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const since = String(req.query.since || '');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 864e5);
  if (Number.isNaN(sinceDate.getTime())) return res.status(400).json({ error: 'bad since' });

  const days = [];
  for (const d = new Date(sinceDate); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  try {
    const byToken = new Map();

    const messageLists = await Promise.all(days.map((day) => list(`msg/${day}/`).catch(() => [])));
    for (const blobs of messageLists) {
      for (const b of blobs) {
        const m = parseMessagePath(b.pathname);
        if (!m) continue;
        byToken.set(m.token, { ...m, sentAt: b.uploadedAt, events: [] });
      }
    }

    const eventLists = await Promise.all(days.map((day) => list(`ev/${day}/`).catch(() => [])));
    for (const blobs of eventLists) {
      for (const b of blobs) {
        const e = parseEventPath(b.pathname);
        if (!e) continue;
        const msg = byToken.get(e.token);
        if (msg) msg.events.push({ at: e.at, kind: e.kind, classification: e.classification });
      }
    }

    const messages = [...byToken.values()];
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ since: sinceDate.toISOString(), count: messages.length, messages });
  } catch (err) {
    console.error('[events] failed', err);
    return res.status(503).json({ error: 'store unavailable' });
  }
}
