# MailMate tracker

Serves the invisible tracking pixel for Daniel's email, classifies every fetch, and appends the
event to a private GitHub repo (`dankelleghan-ops/mailmate-tracking`).

## Endpoints

| Route | Purpose |
|---|---|
| `GET /p/<token>.gif` | The pixel. Always 200, always a valid GIF, even when logging fails. |
| `GET /l/<token>/<linkId>` | Click redirect to the registered destination. |
| `POST /register` | Register a message (or an array of them) before it goes out. Auth: `x-tracker-secret`. |
| `GET /events?since=ISO` | Read messages + events back. Auth: `x-tracker-secret`. |

## Environment

| Var | Meaning |
|---|---|
| `GITHUB_TOKEN` | Write access to the data repo. **Use a fine-grained token scoped to `mailmate-tracking` only** — never a broad classic token. |
| `TRACKER_REPO` | Defaults to `dankelleghan-ops/mailmate-tracking`. |
| `TRACKER_SECRET` | Shared secret for `/register` and `/events`. |

## What an "open" means here

Very little on its own. See `lib/classify.js`: fetches from Daniel's own IP (`self`), inside 60
seconds of send (`scanner`), from Apple's privacy relay (`privacy-proxy`) and from named
security scanners are all recorded but never counted as a person reading the email. Only
`human` counts, and the absence of events is never evidence that a message went unread.

## Tests

```
npm test
```
