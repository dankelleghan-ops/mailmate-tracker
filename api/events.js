// GET /events?since=ISO  →  everything registered since that date, with its events.

import { readRange } from '../lib/store.js';
import { authorized } from '../lib/http.js';

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const since = String(req.query.since || '');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 864e5);
  if (Number.isNaN(sinceDate.getTime())) return res.status(400).json({ error: 'bad since' });

  try {
    const messages = await readRange(sinceDate.toISOString());
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ since: sinceDate.toISOString(), count: messages.length, messages });
  } catch (err) {
    console.error('[events] failed', err);
    return res.status(503).json({ error: 'store unavailable' });
  }
}
