import test from 'node:test';
import assert from 'node:assert/strict';
import { expiry, stepState, keyFor, hash, status, safeLink } from '../lib/domain.ts';

test('countdown starts on return and completes at exactly 30 seconds', () => {
  assert.equal(stepState({ openedAt: null, returnedAt: null }, 90000), 'ready');
  assert.equal(stepState({ openedAt: 100, returnedAt: null }, 90000), 'opened');
  assert.equal(stepState({ openedAt: 100, returnedAt: 10000 }, 39999), 'waiting');
  assert.equal(stepState({ openedAt: 100, returnedAt: 10000 }, 40000), 'done');
});
test('permanent and day durations', () => {
  assert.equal(expiry(1000, { kind: 'permanent', amount: 0 }), null);
  assert.equal(expiry(1000, { kind: 'days', amount: 7 }), 604801000);
  for (const amount of [0, -1, 1.5, 3651, NaN]) assert.throws(() => expiry(0, {kind:'days', amount}));
});
test('calendar months clamp at month end including leap years', () => {
  assert.equal(new Date(expiry(Date.UTC(2026,0,31,14), {kind:'months',amount:1})).toISOString(), '2026-02-28T14:00:00.000Z');
  assert.equal(new Date(expiry(Date.UTC(2024,0,31), {kind:'months',amount:1})).toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(new Date(expiry(Date.UTC(2026,11,31), {kind:'months',amount:2})).toISOString(), '2027-02-28T00:00:00.000Z');
  assert.throws(() => expiry(0, {kind:'months', amount:121}));
});
test('keys can be recovered with server secret but differ across ids and secrets', async () => {
  const secret = 'a'.repeat(48), key = await keyFor('first', secret);
  assert.match(key, /^DEVIL-(?:[A-F0-9]{8}-){3}[A-F0-9]{8}$/);
  assert.equal(key, await keyFor('first', secret));
  assert.notEqual(key, await keyFor('second', secret));
  assert.notEqual(key, await keyFor('first', 'b'.repeat(48)));
  assert.notEqual(await hash(key), key);
  await assert.rejects(() => keyFor('first','short'));
});
test('revocation takes priority and expiry boundary is enforced', () => {
  assert.equal(status({revokedAt:null, expiresAt:null}, 100), 'active');
  assert.equal(status({revokedAt:null, expiresAt:100}, 99), 'active');
  assert.equal(status({revokedAt:null, expiresAt:100}, 100), 'expired');
  assert.equal(status({revokedAt:1, expiresAt:100}, 200), 'revoked');
});
test('step links allow HTTPS only and reject embedded credentials', () => {
  assert.equal(safeLink('https://youtube.com/watch?v=123'), 'https://youtube.com/watch?v=123');
  for (const value of ['', 'invalid', 'javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']) assert.equal(safeLink(value), '');
});
