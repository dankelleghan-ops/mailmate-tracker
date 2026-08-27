// GET /l/<token>/<linkId>  →  302 to the real destination, click logged.

import { classify } from '../lib/classify.js';
import { dayOf, updateDay } from '../lib/store.js';
import { clientIp } from '../lib/http.js';

export default async function handler(req, res) {
  const token = String(req.query.token || '');
  const linkId = String(req.query.linkId || '');
  const day = dayOf(token);

  let destination = 'https://www.danielkelleghan.com/';
  let msg = null;

  try {
    if (day) {
      await updateDay(day, (messages) => {
        msg = messages.find((m) => m.token === token);
        if (!msg) return false;
        const link = (msg.links || []).find((l) => l.id === linkId);
        if (link) destination = link.url;
        const at = new Date().toISOString();
        msg.events = msg.events || [];
        msg.events.push({
          at, ip: clientIp(req), userAgent: String(req.headers['user-agent'] || ''),
          kind: 'click', linkId,
          classification: classify({
            sentAt: msg.sentAt, at, userAgent: String(req.headers['user-agent'] || ''),
            ip: clientIp(req), registerIp: msg.registerIp || '',
          }),
        });
        return true;
      }, `click: ${token}/${linkId}`);
    }
  } catch (err) {
    console.error('[click] logging failed', err);
  }

  // Whatever happened above, the human gets where they were going.
  res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' });
  res.end();
}
