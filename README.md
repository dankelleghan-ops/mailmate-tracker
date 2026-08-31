# MailMate tracker

The open- and click-tracking service behind MailMate's "someone opened your email" panel.

**Every person who uses MailMate runs their own copy.** That is the point: the tracker sees who
you email and when they read it, so it should belong to you and nobody else. Two people sharing
one tracker share that data, and the secret below is a master key — so don't.

Free to run. It fits inside Vercel's free tier for ordinary email volumes.

## Setting up your own — start to finish

You need a Vercel account (free) and about ten minutes. You do not need to know how to code.

1. **Create a Vercel account** at [vercel.com](https://vercel.com).
2. **Deploy this code.** In Vercel choose **Add New… ▸ Project**, pick this repository, and
   press **Deploy**. Wait for it to finish.
3. **Add storage.** Open your new project's **Storage** tab and create a **Blob** store. Vercel
   connects it and sets `BLOB_READ_WRITE_TOKEN` for you.
4. **Add your secret.** Go to **Settings ▸ Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `TRACKER_SECRET` | A long random password you invent. Keep a copy — you need it in step 6. |

   Then **Redeploy** so it takes effect.
5. **Copy your project's address.** It looks like `https://something.vercel.app`.
6. **Tell MailMate.** Open MailMate ▸ Settings ▸ **Email Tracking**, paste the address and the
   secret, press **Test connection**, and Save.

If "Test connection" complains, it tells you which of the two is wrong.

## Environment

| Var | Required | Meaning |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | yes | Set for you when you create the Blob store. |
| `TRACKER_SECRET` | yes | Shared secret for `/register` and `/events`. Empty = the whole service refuses to run, which is the safe default. |
| `TRACKER_BASE_URL` | no | Only needed if the pixel should be served from a custom domain. |
| `TRACKER_FALLBACK_URL` | no | Where a click goes if its destination is unreadable. Defaults to `https://example.com/`. |

## Endpoints

| Route | Purpose |
|---|---|
| `GET /p/<token>.gif` | The pixel. Always 200, always a valid GIF, even when logging fails. |
| `GET /l/<token>/<dest>` | Click redirect to the registered destination. |
| `POST /register` | Register a message (or an array) before it goes out. Auth: `x-tracker-secret`. |
| `GET /events?since=ISO` | Read messages and events back. Auth: `x-tracker-secret`. |

## Where the data lives

In **your** Vercel Blob store, and nowhere else. Nothing is written to any repository, and no
recipient's IP address is ever stored in the clear — see `lib/fingerprint.js` and
`lib/selfips.js`, which hash them.

## What an "open" actually means

Very little on its own, and the code is deliberately conservative about it. See
`lib/classify.js`: fetches from your own network (`self`), inside 60 seconds of sending
(`scanner`), from Apple's Mail Privacy Protection relay (`privacy-proxy`) and from named
security scanners are all recorded but never counted as a person reading the email. Only
`human` counts.

**The absence of events is never evidence that a message went unread.** Plenty of mail clients
never load images at all.

## Tests

```
npm test
```
