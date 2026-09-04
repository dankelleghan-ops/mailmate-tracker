-- The tracker's store, as a database rather than a pile of files.
--
-- What this replaces, and why it is the whole point of the port:
--
-- The Vercel Blob version had no database. It encoded every fact it needed into a FILE PATH,
-- one file per message and one per event, filed in a folder per day. Answering "what has
-- happened in the last thirty days" therefore meant listing sixty-two folders — thirty-one
-- days of messages plus thirty-one of events — and every one of those listings was a billed
-- storage operation. Vercel's free tier allows two thousand a month. A client polling that
-- endpoint spent the entire monthly allowance in about half an hour.
--
-- Here the same question is two indexed queries, no matter how wide the window.

-- One row per tracked message.
--
-- The token is the identity, which makes an AMEND a plain upsert. Amends are real: the Mac
-- watcher stamps a hand-written email the moment the cursor reaches the body, which can be
-- before the subject exists, then re-registers once the subject settles. The Blob version wrote
-- a second file and had the reader prefer whichever record knew more; here the same rule lives
-- in the ON CONFLICT clause in lib/db.js, so there is only ever one row to reason about.
CREATE TABLE IF NOT EXISTS messages (
  token           TEXT PRIMARY KEY,
  day             TEXT NOT NULL,
  recipient       TEXT NOT NULL DEFAULT '',
  -- The FULL audience as JSON, when the client knows it. Attribution refuses to learn a
  -- fingerprint without this — see lib/readers.js for why the `recipient` field alone is not
  -- good enough. NULL means "the client did not say".
  recipients_json TEXT,
  subject         TEXT NOT NULL DEFAULT '',
  source          TEXT NOT NULL DEFAULT 'unknown',
  -- Audience SIZE, which is all the learning rule needs. 0 means "not stated", which makes the
  -- message ineligible to teach.
  recipient_count INTEGER NOT NULL DEFAULT 0,
  registered_at   TEXT NOT NULL,
  self_tag        TEXT NOT NULL DEFAULT '',
  links_json      TEXT NOT NULL DEFAULT '[]'
);

-- The index that replaces sixty-two folder listings with one range scan. /events always asks
-- "every message registered at or after <timestamp>", so this is the access path that matters.
CREATE INDEX IF NOT EXISTS messages_registered_at ON messages (registered_at);

-- Every pixel fetch and every link click, including the ones that are not opens.
--
-- Nothing is filtered on the way in. A scanner fetch, Apple's pre-fetch and Daniel's own
-- compose window are all recorded and all carry their classification, because the difference
-- between "recorded" and "counted" is the entire value of this service — see lib/classify.js.
CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  token          TEXT NOT NULL,
  at             TEXT NOT NULL,
  kind           TEXT NOT NULL,           -- 'open' | 'click'
  classification TEXT NOT NULL,           -- 'human' | 'self' | 'scanner' | 'privacy-proxy' | 'unknown'
  -- One-way hash of network + device family. The raw address is never stored, here or anywhere.
  fingerprint    TEXT,
  device         TEXT,                    -- 'os|client', e.g. 'ios|safari'
  destination    TEXT,                    -- clicks only
  device_hint    TEXT
);

-- Events are always fetched for a known set of tokens, ordered by time.
CREATE INDEX IF NOT EXISTS events_token_at ON events (token, at);

-- Networks that are provably the sender's own.
--
-- Any request to /register carried the tracker secret, so the address it came from is by
-- definition one of his machines. Remembering them means him re-reading his own sent mail days
-- later is recognised as him rather than counted as the recipient opening it. Stored as a
-- one-way hash so the database never holds his addresses in the clear.
CREATE TABLE IF NOT EXISTS self_ips (
  hash       TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL
);
