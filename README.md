# MailMate tracker

The open- and click-tracking service behind MailMate's "someone opened your email" panel — the
Chrome/Gmail extension uses the same service.

**Everyone runs their own copy.** That's the whole design: this service sees who you email and
when they read it, so it belongs to you and nobody else. Two people sharing one tracker share
that data, and the secret it uses is a master key to all of it — so don't share it, and don't
share a deployment.

Free to run, on Cloudflare's own free tier (a Worker plus a small D1 database) at ordinary email
volumes.

## Deploy your own

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dankelleghan-ops/mailmate-tracker)

Click it, sign in to (or create) a free Cloudflare account, and follow the prompts — Cloudflare
provisions your own Worker and your own database and asks you for one thing: a secret. If you
don't have one yet, generate one first:

```
openssl rand -hex 24
```

Paste that in when asked. When it finishes, you'll have an address that looks like
`https://mailmate-tracker.<your-subdomain>.workers.dev`.

Then:

1. **Open that address.** It should say "Your MailMate tracker is running" and "Secret: set ✓".
2. **Paste the address and the secret into MailMate** — Settings → Email Tracking → "Test
   connection".
3. **Using the Gmail extension too?** Paste the same two values into its options page.

That's it — no database to create by hand, no schema to run, no environment variables to hunt
down afterward. The Worker sets up its own tables on its first real request.

### If the button can't ask for your secret

Occasionally Cloudflare's deploy flow finishes without prompting for `TRACKER_SECRET` (it
depends on how you're deployed). If your new tracker's landing page says **"Secret: NOT SET"**,
open your Worker in the [Cloudflare dashboard](https://dash.cloudflare.com/) → your Worker →
**Settings → Variables and Secrets** → **Add** → name it `TRACKER_SECRET`, type **Secret** (not
Text), paste the value, and save. Reload the landing page to confirm it now says "set ✓".

## Set it up with Claude instead

If you'd rather have an AI agent do the command-line parts, this repository includes
[`CLAUDE.md`](./CLAUDE.md) — a step-by-step guide written for exactly that. Open a chat with
Claude (Claude Code on your own computer, or a claude.ai chat with file/computer access) in this
project's folder and paste:

> Read CLAUDE.md in this repository and deploy this tracker for me on Cloudflare. I'll approve
> the Cloudflare login in my browser when you ask; generate a random secret if I don't already
> have one. When you're done, tell me the tracker address and the secret so I can paste them
> into MailMate.

It walks through logging into your own Cloudflare account (you approve that step yourself — no
agent can or should do it for you), creating your database, deploying, and setting your secret.

## Doing it entirely by hand

See [`CLAUDE.md`](./CLAUDE.md) — the same seven steps, written to be followed by a person
directly rather than by an agent. It assumes nothing beyond a terminal and Node.js 20+.

## Privacy

Everything this tracker records lives in **your own** Cloudflare account, in a database only you
control — not on any shared server, not in this repository, and not visible to Daniel or to
anyone else's tracker. No recipient's IP address is ever stored in readable form; see
`lib/fingerprint.js` and `lib/selfips.js`, which one-way hash them before anything touches the
database.

## What an "open" actually means

Very little on its own, and the code is deliberately conservative about it — see
`lib/classify.js`. Fetches from your own network (`self`), inside 60 seconds of sending
(`scanner`), from Apple's Mail Privacy Protection relay (`privacy-proxy`), and from named
security scanners are all recorded but never counted as a person reading the email. Only
`human` counts, and even that is a fetch of an image, not proof anyone read a word.

**The absence of events is never evidence that a message went unread.** Plenty of mail clients
never load images at all.

## Environment variables

| Var | Required | Meaning |
|---|---|---|
| `TRACKER_SECRET` | yes | Shared secret for `/register` and `/events`. Unset = the whole service refuses to run, which is the safe default. Set with `wrangler secret put TRACKER_SECRET` — never written to a file in this repo. |
| `TRACKER_BASE_URL` | no | Only needed if the pixel should be served from a custom domain. Unset, `/register` builds pixel URLs from whichever origin the request actually arrived on. |
| `TRACKER_FALLBACK_URL` | no | Where a click redirect goes if its destination is unreadable. Defaults to `https://example.com/` — deliberately inert rather than someone else's website. |

## Endpoints

| Route | Purpose |
|---|---|
| `GET /` | Status page. No auth. Confirms the deploy worked and whether a secret is set — never reveals the secret's value. |
| `GET /p/<token>.<tag>.gif` | The pixel. Always 200, always a valid GIF, even when logging fails. |
| `GET /l/<token>.<tag>/<base64url dest>` | Click redirect to the registered destination. |
| `POST /register` | Register a message (or a batch) before it goes out. Auth: `x-tracker-secret` header. |
| `GET /events?since=ISO` | Read messages and events back. Auth: `x-tracker-secret` header. |

## Troubleshooting

**"Secret: NOT SET" on the landing page.** See "If the button can't ask for your secret" above.

**MailMate's "Test connection" fails.** It tells you which of the address or the secret is
wrong. The most common cause is a typo in one of the two, or copying the address with a trailing
slash — either is fine, but make sure both MailMate and the landing page agree on what's set.

**"D1 binding 'DB' references database '00000000-…' which was not found."** You (or your agent)
deployed straight from a clone without creating your own D1 database first, so `wrangler.jsonc`
still has its committed placeholder id. Use the Deploy button above instead, or follow
`CLAUDE.md`'s manual steps — step 2 creates your database and step 3 puts its real id in.

**You lost your secret.** There's no way to look it up — Cloudflare stores it, not this repo.
Generate a new one and run `wrangler secret put TRACKER_SECRET` again; the old one stops working
the moment you do. Update MailMate and the Gmail extension with the new value.

**You want to see what changed recently, or read the code.** Start at `worker.js` — it's the
whole routing table in about a dozen lines — then follow into `handlers/` and `lib/`. Every file
carries a comment explaining the real bug or platform constraint that shaped it.

## Tests

```
npm test
```
