import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingKeyTime } from '../lib/countdown.ts';
import { translate } from '../lib/translations.ts';

test('existing issued keys count down from their absolute expiry across refresh and sleeping tabs', () => {
  const key = { expiresAt: 86400000, status: 'active' };
  const at = now => remainingKeyTime(key.expiresAt, key.status, now);
  assert.deepEqual(at(0), {state:'active', seconds:86400});
  assert.deepEqual(at(3600000), {state:'active', seconds:82800});
  assert.deepEqual(at(86339000), {state:'active', seconds:61});
  assert.deepEqual(at(86399001), {state:'active', seconds:1});
  assert.deepEqual(at(86400000), {state:'expired', seconds:0});
  assert.deepEqual(at(90000000), {state:'expired', seconds:0});
  assert.equal(key.expiresAt, 86400000);
});
test('permanent, expired and revoked keys do not show a running timer', () => {
  assert.equal(remainingKeyTime(null, 'active', 1).state, 'permanent');
  assert.equal(remainingKeyTime(9999, 'revoked', 1).state, 'revoked');
  assert.equal(remainingKeyTime(null, 'revoked', 1).state, 'revoked');
  assert.equal(remainingKeyTime(9999, 'expired', 1).state, 'expired');
});
test('remaining time has Thai and English hours, minutes and seconds', () => {
  const template = '{hours} ชม. {minutes} นาที {seconds} วินาที';
  const values = {hours:23, minutes:'09', seconds:'01'};
  assert.equal(translate('th', template, values), '23 ชม. 09 นาที 01 วินาที');
  assert.equal(translate('en', template, values), '23 hr 09 min 01 sec');
});
