// GET /events?since=ISO  →  messages and their events.
//
// One list call per day per kind, and zero content fetches: everything the reader needs is in
// the pathnames. A month of history is ~60 requests instead of ~10,000.

import { list } from '../lib/blob.js';
import { parseMessagePath, parseEventPath } from '../lib/paths.js';
import { annotate } from '../lib/readers.js';
import { demoteQuotedOpens } from '../lib/quoted-opens.js';
import { authorized } from '../lib/http.js';

// Two caches, both living in the warm serverless instance.
//
// MESSAGE lists for past days are immutable: a registration is always written under the day in
// its own token, so once a day is over no new msg/ blob can appear under it. Listing them again
// on every request was most of the 550-770ms this endpoint took.
//
// EVENT lists are NOT cacheable that way, and it is worth writing down why: an event is filed
// under the TOKEN's day, so a message sent yesterday and opened today writes into yesterday's
// folder. Past event days keep changing, so they are always re-listed.
const messageDayCache = new Map();   // day → parsed message records
const RESPONSE_TTL_MS = 15_000;
let lastResponse = { key: '', at: 0, body: null };

function isPastDay(day) {
  return day < new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const since = String(req.query.since || '');
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 864e5);
  if (Number.isNaN(sinceDate.getTime())) return res.status(400).json({ error: 'bad since' });

  const days = [];
  for (const d = new Date(sinceDate); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const cacheKey = days.join(',');
  if (lastResponse.key === cacheKey && Date.now() - lastResponse.at < RESPONSE_TTL_MS) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(lastResponse.body);
  }

  try {
    const byToken = new Map();

    const messageLists = await Promise.all(days.map(async (day) => {
      const cached = messageDayCache.get(day);
      if (cached) return cached;
      const blobs = await list(`msg/${day}/`).catch(() => []);
      const parsed = blobs
        .map((b) => { const m = parseMessagePath(b.pathname); return m ? { ...m, sentAt: b.uploadedAt } : null; })
        .filter(Boolean);
      if (isPastDay(day)) messageDayCache.set(day, parsed);   // a finished day cannot gain messages
      return parsed;
    }));
    for (const records of messageLists) {
      for (const m of records) {
        // The same token can carry several records: an amend (subject registered before it was
        // fully typed, corrected once it settled) writes a second blob. Keep whichever record
        // knows more — a non-empty subject beats an empty one, then a larger audience.
        const prev = byToken.get(m.token);
        if (prev) {
          const better =
            (m.subject && !prev.subject) ? m :
            (!m.subject && prev.subject) ? prev :
            (m.recipientCount || 0) >= (prev.recipientCount || 0) ? m : prev;
          byToken.set(m.token, { ...better, events: [] });
        } else {
          byToken.set(m.token, { ...m, events: [] });
        }
      }
    }

    const eventLists = await Promise.all(days.map((day) => list(`ev/${day}/`).catch(() => [])));
    for (const blobs of eventLists) {
      for (const b of blobs) {
        const e = parseEventPath(b.pathname);
        if (!e) continue;
        const msg = byToken.get(e.token);
        if (msg) msg.events.push({ at: e.at, kind: e.kind, classification: e.classification,
                                   fingerprint: e.fingerprint, device: e.device });
      }
    }

    // Attribution is computed HERE, once, so the Mac app and the Chrome extension can never
    // disagree about who opened something.
    // Demote quoted pixels BEFORE attribution, so a reader who only ever appears via a quoted
    // pixel is never learned as that older message's reader.
    const messages = annotate(demoteQuotedOpens([...byToken.values()]));
    const body = { since: sinceDate.toISOString(), count: messages.length, messages };
    lastResponse = { key: cacheKey, at: Date.now(), body };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(body);
  } catch (err) {
    console.error('[events] failed', err);
    return res.status(503).json({ error: 'store unavailable' });
  }
}
