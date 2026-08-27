// Durable store: a private GitHub repo, one JSON file per day.
//
// Why GitHub and not a database: this is the same relay-plus-GitHub shape already proven by
// MailMate's suggestion box, it costs nothing, it needs no dashboard provisioning, and the
// data is trivially inspectable and backed up. Volume is ~80 messages and a few hundred
// events a day — a day file stays well under 200KB.
//
// Why one file per DAY and not per message: the panel needs to read a month of history in a
// handful of requests, not a thousand. The send date is encoded in the token itself, so the
// pixel endpoint knows which day file to open without a lookup.

const API = 'https://api.github.com';

function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
}

const repo = () => env('TRACKER_REPO', 'dankelleghan-ops/mailmate-tracking');
const token = () => env('GITHUB_TOKEN');

/** Token shape: YYYYMMDD-<12 url-safe chars>. The date prefix is the shard key. */
export function newToken(now = new Date()) {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  const bytes = new Uint8Array(12);
  (globalThis.crypto ?? require('node:crypto').webcrypto).getRandomValues(bytes);
  for (const b of bytes) rand += alphabet[b % alphabet.length];
  return `${day}-${rand}`;
}

export function dayOf(tok) {
  const m = /^(\d{4})(\d{2})(\d{2})-/.exec(tok || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function gh(path, init = {}) {
  const res = await fetch(`${API}/repos/${repo()}/contents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'mailmate-tracker',
      ...(init.headers || {}),
    },
  });
  return res;
}

async function readDay(day) {
  const res = await gh(`index/${day}.json`);
  if (res.status === 404) return { sha: null, messages: [] };
  if (!res.ok) throw new Error(`GitHub read ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const json = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
  return { sha: body.sha, messages: json.messages || [] };
}

async function writeDay(day, messages, sha, message) {
  const content = Buffer.from(JSON.stringify({ messages }, null, 2)).toString('base64');
  const res = await gh(`index/${day}.json`, {
    method: 'PUT',
    body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || res.status === 422) return false; // someone else wrote first
  if (!res.ok) throw new Error(`GitHub write ${res.status}: ${await res.text()}`);
  return true;
}

/**
 * Read-modify-write one day file with conflict retries. `mutate(messages)` edits in place and
 * returns true if anything changed. Concurrent writes are real here — the outreach run
 * registers 50 messages in a burst — so a 409 is expected, not exceptional.
 */
export async function updateDay(day, mutate, commitMessage) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { sha, messages } = await readDay(day);
    if (!mutate(messages)) return false;
    if (await writeDay(day, messages, sha, commitMessage)) return true;
    await new Promise((r) => setTimeout(r, 120 * (attempt + 1) + Math.floor(Math.random() * 120)));
  }
  throw new Error(`Could not write index/${day}.json after 6 attempts`);
}

export async function readRange(sinceISO) {
  const since = new Date(sinceISO);
  const out = [];
  const cursor = new Date(since);
  const today = new Date();
  while (cursor <= today) {
    const day = cursor.toISOString().slice(0, 10);
    try {
      const { messages } = await readDay(day);
      out.push(...messages);
    } catch { /* a missing or unreadable day is not fatal to the rest of the range */ }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
