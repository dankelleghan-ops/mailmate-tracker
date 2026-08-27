// POST /register  {recipient, subject, source, links?}  — one message or an array of them.
//
// Returns the pixel URL to embed. The URL carries a signed tag identifying the registering
// machine, so the pixel endpoint can spot Daniel's own compose-window fetch without a lookup.

import { put } from '../lib/blob.js';
import { messagePath } from '../lib/paths.js';
import { newToken, dayOf } from '../lib/token.js';
import { selfTag } from '../lib/selftag.js';
import { rememberSelfIp } from '../lib/selfips.js';
import { clientIp, authorized } from '../lib/http.js';

const BASE = process.env.TRACKER_BASE_URL || 'https://tracker-chi-orpin.vercel.app';

export function pixelURL(token, tag) {
  return `${BASE}/p/${token}.${tag}.gif`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });

  const parsed = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const isBatch = Array.isArray(parsed) || Array.isArray(parsed.messages);
  const items = Array.isArray(parsed) ? parsed : (parsed.messages || [parsed]);
  if (!items.length) return res.status(400).json({ error: 'nothing to register' });

  const ip = clientIp(req);
  const tag = selfTag(ip);

  try {
    // This request carried the secret, so this network is Daniel's. Remember it, so a later
    // fetch of any pixel from here is recognised as him rather than as a recipient.
    await rememberSelfIp(ip).catch(() => {});

    const out = await Promise.all(items.map(async (item) => {
      const token = newToken();
      const day = dayOf(token);
      const record = {
        token, day,
        recipient: item.recipient || '',
        // The FULL audience, when the client knows it. Attribution refuses to learn without
        // this — see lib/readers.js. Stored in the blob body, not the pathname: it can be long,
        // and only the learning pass needs it.
        recipients: Array.isArray(item.recipients) ? item.recipients : null,
        subject: item.subject || '',
        source: item.source || 'unknown',
        registeredAt: new Date().toISOString(),
        selfTag: tag,
        links: Array.isArray(item.links) ? item.links : [],
      };
      // Written once, never updated. Blob is eventually consistent, so nothing downstream is
      // allowed to depend on reading this back promptly — the pathname carries what matters.
      const audience = Array.isArray(item.recipients)
        ? new Set(item.recipients.flatMap((r) => String(r).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)))
        : null;
      await put(messagePath({ day, token, recipient: record.recipient,
                             subject: record.subject, source: record.source,
                             recipientCount: audience ? audience.size : 0 }), record);
      // `tag` is returned so callers can also build tracked LINK urls, which is how outreach
      // is tracked: the Gmail connector strips externally-hosted images (re-confirmed
      // 2026-08-27) but leaves hrefs alone.
      return { token, tag, pixel: pixelURL(token, tag), linkBase: `${BASE}/l/${token}.${tag}` };
    }));
    return res.status(200).json(isBatch ? { registered: out } : out[0]);
  } catch (err) {
    console.error('[register] failed', err);
    return res.status(503).json({ error: 'store unavailable' });
  }
}
