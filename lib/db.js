// The store, as SQL. This file replaces lib/blob.js.
//
// The old file had two operations, `put` and `list`, and no way to ask a question — so the
// reader asked the only question it could: "give me the names of everything filed under this
// day", once per day per kind. Thirty days of history cost sixty-two of those, every single
// request, and each one was billed. This file exists so that same question costs two queries.
//
// Everything here takes the D1 binding as its first argument rather than reaching for a global.
// That is what lets the whole store be tested against a real SQLite database in `wrangler dev`
// without an account, and it is why none of these functions read `env` themselves.

/**
 * Every message registered at or after `sinceISO`, newest last.
 *
 * One indexed range scan over messages_registered_at. This single query is the entire reason
 * for the port.
 */
export async function messagesSince(db, sinceISO) {
  const { results } = await db
    .prepare(
      `SELECT token, day, recipient, recipients_json, subject, source,
              recipient_count, registered_at
         FROM messages
        WHERE registered_at >= ?1
        ORDER BY registered_at`,
    )
    .bind(sinceISO)
    .all();
  return (results || []).map(rowToMessage);
}

/**
 * Every event belonging to those same messages.
 *
 * Deliberately a JOIN rather than `WHERE token IN (...)`. An IN-list would need one bound
 * parameter per message and D1 caps a query at 100 of them — with ~250 tracked messages in a
 * thirty-day window that limit is not theoretical, it is the normal case. The join asks the
 * same question with one parameter and no ceiling.
 */
export async function eventsSince(db, sinceISO) {
  const { results } = await db
    .prepare(
      `SELECT e.token, e.at, e.kind, e.classification, e.fingerprint, e.device
         FROM events e
         JOIN messages m ON m.token = e.token
        WHERE m.registered_at >= ?1
        ORDER BY e.at`,
    )
    .bind(sinceISO)
    .all();
  return results || [];
}

/**
 * Register a message, or complete one already registered.
 *
 * An AMEND is real and routine: the Mac watcher stamps a hand-written email the moment the
 * cursor reaches the body, which can be before the subject exists, then registers again once
 * the subject settles. The Blob version wrote a second file and left the reader to prefer
 * whichever record knew more. Here that preference is the ON CONFLICT clause, so there is only
 * ever one row and no reader has to know the rule.
 *
 * The rule, unchanged from the old reader: a non-empty value beats an empty one, a larger
 * stated audience beats a smaller one, and `registered_at` keeps the EARLIEST of the two —
 * that is when the message was actually sent, which is what the quoted-open logic sorts on.
 */
export async function upsertMessage(db, m) {
  return db
    .prepare(
      `INSERT INTO messages
         (token, day, recipient, recipients_json, subject, source,
          recipient_count, registered_at, self_tag, links_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(token) DO UPDATE SET
         recipient       = CASE WHEN excluded.recipient != '' THEN excluded.recipient ELSE messages.recipient END,
         recipients_json = COALESCE(excluded.recipients_json, messages.recipients_json),
         subject         = CASE WHEN excluded.subject   != '' THEN excluded.subject   ELSE messages.subject   END,
         source          = CASE WHEN excluded.source != 'unknown' THEN excluded.source ELSE messages.source END,
         recipient_count = MAX(messages.recipient_count, excluded.recipient_count),
         registered_at   = MIN(messages.registered_at, excluded.registered_at),
         links_json      = CASE WHEN excluded.links_json != '[]' THEN excluded.links_json ELSE messages.links_json END`,
    )
    .bind(
      m.token,
      m.day,
      m.recipient || '',
      m.recipients ? JSON.stringify(m.recipients) : null,
      m.subject || '',
      m.source || 'unknown',
      Number(m.recipientCount || 0),
      m.registeredAt,
      m.selfTag || '',
      JSON.stringify(Array.isArray(m.links) ? m.links : []),
    )
    .run();
}

/**
 * Record one pixel fetch or link click.
 *
 * Nothing is filtered on the way in — a scanner fetch, Apple's pre-fetch and the sender's own
 * compose window are all written, each carrying its classification. The difference between
 * "recorded" and "counted" is the whole value of this service.
 */
export async function insertEvent(db, e) {
  return db
    .prepare(
      `INSERT INTO events (token, at, kind, classification, fingerprint, device, destination, device_hint)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      e.token,
      e.at,
      e.kind,
      e.classification,
      e.fingerprint || null,
      e.device || null,
      e.destination || null,
      e.deviceHint || null,
    )
    .run();
}

/** Remember a network as the sender's own. Idempotent — the hash is the key. */
export async function rememberSelfHash(db, hash, at = new Date().toISOString()) {
  return db
    .prepare(`INSERT INTO self_ips (hash, first_seen) VALUES (?1, ?2) ON CONFLICT(hash) DO NOTHING`)
    .bind(hash, at)
    .run();
}

/** True if this hash has ever registered a message. */
export async function isKnownSelfHash(db, hash) {
  const row = await db.prepare(`SELECT 1 AS hit FROM self_ips WHERE hash = ?1`).bind(hash).first();
  return Boolean(row);
}

/**
 * A D1 row in the shape the rest of the codebase already speaks.
 *
 * lib/readers.js and lib/quoted-opens.js are untouched by this port, which is only true because
 * what comes out of here is identical to what the Blob reader used to assemble out of pathnames.
 */
function rowToMessage(r) {
  return {
    token: r.token,
    day: r.day,
    recipient: r.recipient || '',
    subject: r.subject || '',
    source: r.source || 'unknown',
    recipientCount: Number(r.recipient_count || 0),
    recipients: parseJSON(r.recipients_json, null),
    sentAt: r.registered_at,
    events: [],
  };
}

function parseJSON(s, fallback) {
  if (s == null) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}
