import { test } from 'node:test';
import assert from 'node:assert';
import { ipHash } from '../lib/selfips.js';

process.env.TRACKER_SECRET = process.env.TRACKER_SECRET || 'test-secret';

test('the same network hashes the same way every time', () => {
  assert.equal(ipHash('73.9.1.2'), ipHash('73.9.1.2'));
});

test('different networks do not collide', () => {
  assert.notEqual(ipHash('73.9.1.2'), ipHash('73.9.1.3'));
});

test("Daniel's IP address is never stored in the clear", () => {
  const h = ipHash('73.9.1.2');
  assert.ok(!h.includes('73'), 'hash must not contain the address');
  assert.match(h, /^[0-9a-f]{24}$/);
});
