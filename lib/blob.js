// Vercel Blob over plain fetch — no SDK, so the service has no dependencies to install or keep
// current. Two operations, both append-only:
//
//   put(pathname, body)   write once, never overwrite
//   list(prefix)          enumerate pathnames
//
// Nothing here ever reads a blob's CONTENT. Everything the app needs is encoded in the
// pathname, because Blob is eventually consistent and a read-back can return stale or missing
// data seconds after a write. Pathnames come back from `list` immediately and completely.

const API = 'https://blob.vercel-storage.com';

function token() {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  return t;
}

export async function put(pathname, body) {
  const res = await fetch(`${API}/${pathname}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token()}`,
      'x-api-version': '7',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-cache-control-max-age': '0',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`blob put ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Every pathname under `prefix`, following pagination. */
export async function list(prefix, { limit = 1000 } = {}) {
  const out = [];
  let cursor;
  do {
    const url = new URL(API);
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token()}`, 'x-api-version': '7' },
    });
    if (!res.ok) throw new Error(`blob list ${res.status}: ${await res.text()}`);
    const body = await res.json();
    out.push(...(body.blobs || []));
    cursor = body.hasMore ? body.cursor : null;
  } while (cursor);
  return out;
}
