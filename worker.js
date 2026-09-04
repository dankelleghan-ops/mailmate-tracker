// The tracker, as a Cloudflare Worker.
//
// On Vercel each endpoint was its own file and the routing lived in vercel.json's `rewrites`.
// A Worker is one script with one entry point, so the rewrites are these four lines instead.
// The URL shapes are unchanged, because they are already embedded in emails that have been
// sent — a pixel in a message from two weeks ago has to keep resolving.

import { pixel } from './handlers/pixel.js';
import { click } from './handlers/click.js';
import { register } from './handlers/register.js';
import { events } from './handlers/events.js';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // /p/<token>.<tag>.gif — was: { "source": "/p/:token", "destination": "/api/pixel?token=:token" }
    const p = /^\/p\/(.+)$/.exec(pathname);
    if (p) return pixel(request, env, ctx, p[1]);

    // /l/<token>.<tag>/<base64url dest> — was: "/l/:token/:dest"
    const l = /^\/l\/([^/]+)\/(.*)$/.exec(pathname);
    if (l) return click(request, env, ctx, l[1], l[2]);

    if (pathname === '/register') return register(request, env);
    if (pathname === '/events') return events(request, env);

    // Anything else says nothing about what this service is or whether a path exists.
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  },
};
