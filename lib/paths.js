// Everything the reader needs lives in the pathname, so listing a day is one request instead of
// hundreds of content fetches. The blob body still holds the full record for debugging.
//
// Encoding is url-safe base64 with no padding, because pathnames must survive URL routing and
// subjects contain anything a human can type.

export function enc(s) {
  return Buffer.from(String(s ?? ''), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function dec(s) {
  try {
    return Buffer.from(String(s ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch { return ''; }
}

const SUBJECT_LIMIT = 120;   // keeps pathnames well inside Vercel Blob's 1024-char ceiling

export function messagePath({ day, token, recipient, subject, source }) {
  return `msg/${day}/${token}/${enc(recipient)}/${enc(String(subject).slice(0, SUBJECT_LIMIT))}/${enc(source)}.json`;
}

export function parseMessagePath(pathname) {
  const m = /^msg\/([\d-]{10})\/([^/]+)\/([^/]*)\/([^/]*)\/([^/]*)\.json$/.exec(pathname);
  if (!m) return null;
  return { day: m[1], token: m[2], recipient: dec(m[3]), subject: dec(m[4]), source: dec(m[5]) };
}

export function eventPath({ day, token, at, kind, classification, nonce }) {
  const stamp = at.replace(/[-:.]/g, '');
  return `ev/${day}/${token}/${stamp}__${kind}__${classification}__${nonce}.json`;
}

export function parseEventPath(pathname) {
  const m = /^ev\/([\d-]{10})\/([^/]+)\/(\d{8}T\d{6})(\d*)Z?__([a-z]+)__([a-z-]+)__[^/]+\.json$/.exec(pathname);
  if (!m) return null;
  const s = m[3];
  const at = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
  return { day: m[1], token: m[2], at, kind: m[5], classification: m[6] };
}
