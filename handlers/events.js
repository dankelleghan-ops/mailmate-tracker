// GET /events?since=ISO  →  messages and their events.
//
// This is the endpoint the whole port was for.
//
// It used to answer by listing one storage folder per day per kind — about sixty-two billed
// operations for a thirty-day window, on every single request, whether or not anything had
// changed. Two caches sat in front of it to make that affordable, and both were workarounds
// rather than features: a 15-second response cache, and a per-day message cache that only
// helped while a serverless instance stayed warm and could never cover event days at all,
// because an event is filed under the message's day and so a past day keeps changing.
//
// Two queries answer it now, no matter how wide the window, so both caches are gone and the
// data is always current.

import { messagesSince, eventsSince } from '../lib/db.js';
import { annotate } from '../lib/readers.js';
import { demoteQuotedOpens } from '../lib/quoted-opens.js';
import { authorized, json } from '../lib/http.js';

const DEFAULT_WINDOW_MS = 30 * 864e5;

export async function events(request, env) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);

  const since = new URL(request.url).searchParams.get('since') || '';
  const sinceDate = since ? new Date(since) : new Date(Date.now() - DEFAULT_WINDOW_MS);
  if (Number.isNaN(sinceDate.getTime())) return json({ error: 'bad since' }, 400);
  const sinceISO = sinceDate.toISOString();

  try {
    const messages = await messagesSince(env.DB, sinceISO);

    // One lookup table, then one pass over the events. The join in eventsSince already limits
    // these to the same messages, so every row lands somewhere.
    const byToken = new Map(messages.map((m) => [m.token, m]));
    for (const e of await eventsSince(env.DB, sinceISO)) {
      byToken.get(e.token)?.events.push({
        at: e.at,
        kind: e.kind,
        classification: e.classification,
        fingerprint: e.fingerprint,
        device: e.device,
      });
    }

    // Attribution is computed HERE, once, so the Mac app and the Chrome extension can never
    // disagree about who opened something.
    //
    // Quoted pixels are demoted BEFORE attribution, so a reader who only ever appears via a
    // pixel quoted inside a newer reply is never learned as the older message's reader.
    const annotated = annotate(demoteQuotedOpens(messages));

    return json({ since: sinceISO, count: annotated.length, messages: annotated });
  } catch (err) {
    console.error('[events] failed', err);
    return json({ error: 'store unavailable' }, 503);
  }
}
