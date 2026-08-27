// Classify a single pixel/click fetch.
//
// The whole point of this file: an "open" event is NOT the same thing as a person reading the
// email. Apple pre-fetches images on delivery, corporate mail scanners fetch them within
// seconds, and Daniel's own Mail compose window fetches the pixel while he is still writing.
// Every one of those looks identical to a real open unless it is named and set aside.
//
// Verified by the 2026-08-27 spike: Apple Mail's compose window really does fetch the pixel
// before the message is sent, which is why `self` exists and why it wins over every other rule.

const SCANNER_UA = /barracuda|mimecast|proofpoint|symantec|forcepoint|messagelabs|trendmicro|python-requests|curl\/|wget|Go-http-client|okhttp|HeadlessChrome|bot\b|crawler|spider/i;
const GOOGLE_PROXY_UA = /GoogleImageProxy/i;
const APPLE_PROXY_UA = /AppleMail-ImageProxy/i;

// Apple owns 17.0.0.0/8 outright; iCloud Private Relay and Mail Privacy Protection egress
// from it. This is a heuristic, not a guarantee — Apple also uses partner egress ranges that
// are indistinguishable from an ordinary residential client. Under-detection here means an
// Apple pre-fetch occasionally shows as `human`, which is the honest failure direction:
// we would rather understate certainty than invent a read.
const APPLE_IP = /^17\./;

const SCANNER_WINDOW_SECONDS = 60;

/**
 * @param {object} e
 * @param {string} e.sentAt      ISO timestamp the message was registered/sent
 * @param {string} e.at          ISO timestamp of this fetch
 * @param {string} [e.userAgent]
 * @param {string} [e.ip]
 * @param {string} [e.registerIp] IP that called /register for this token (Daniel's own machine)
 * @returns {"self"|"privacy-proxy"|"scanner"|"human"|"unknown"}
 */
export function classify({ sentAt, at, userAgent = '', ip = '', registerIp = '' }) {
  // 1. Daniel's own machine. Wins over everything — including the 60s rule, because his
  //    compose window fetches the pixel the instant he pastes the draft in.
  if (ip && registerIp && ip === registerIp) return 'self';

  // 2. Apple's privacy proxy. Real delivery, but it tells us nothing about a human.
  if (APPLE_PROXY_UA.test(userAgent) || APPLE_IP.test(ip)) return 'privacy-proxy';

  // 3. Anything that fetches within a minute of send is machinery, not a reader.
  const gapSeconds = (new Date(at).getTime() - new Date(sentAt).getTime()) / 1000;
  if (Number.isFinite(gapSeconds) && gapSeconds < SCANNER_WINDOW_SECONDS) return 'scanner';

  // 4. Named security scanners and scripted fetchers, at any distance from send.
  if (SCANNER_UA.test(userAgent)) return 'scanner';

  // 5. Gmail proxies images for its users; the fetch is triggered by a real open.
  //    (Location is Google's, not the reader's — the caller suppresses location for these.)
  if (GOOGLE_PROXY_UA.test(userAgent)) return 'human';

  // 6. No user agent at all is not evidence of a person.
  if (!userAgent) return 'unknown';

  return 'human';
}

/** True for the events the UI is allowed to call an open. */
export function countsAsOpen(classification) {
  return classification === 'human';
}
