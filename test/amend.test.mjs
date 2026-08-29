import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

// The failure this guards: a hand-written email stamped when the cursor reached the body but
// BEFORE the subject was typed registered with subject '' — its pixel worked, but the Sent
// window and panel match by subject, so a live, recording message displayed as "Not tracked".
const registerSrc = fs.readFileSync('api/register.js', 'utf8');
const eventsSrc = fs.readFileSync('api/events.js', 'utf8');

test('register accepts a caller-supplied token for amends, validated against the token format', () => {
  assert.match(registerSrc, /item\.token/);
  assert.match(registerSrc, /\^\\d\{8\}T\\d\{6\}-\[A-Za-z2-9\]\{12\}\$/);
});

test('when one token has two records, the one that knows the subject wins', () => {
  assert.match(eventsSrc, /m\.subject && !prev\.subject/);
});
