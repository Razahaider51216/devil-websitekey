import test from 'node:test';
import assert from 'node:assert/strict';
import { english, translate } from '../lib/translations.ts';

test('Thai and English translations keep the requested language', () => {
  assert.equal(translate('th', 'บันทึกลิงก์'), 'บันทึกลิงก์');
  assert.equal(translate('en', 'บันทึกลิงก์'), 'Save links');
  assert.equal(translate('en', 'เข้าร่วม Discord'), 'Join Discord');
  assert.equal(translate('en', 'รหัสแอดมินไม่ถูกต้อง'), 'Incorrect admin password');
  assert.equal(translate('en', 'DEVIL HUB'), 'DEVIL HUB');
});
test('dynamic labels interpolate after translation', () => {
  assert.equal(translate('en', 'นับอายุ {amount} {unit} ตั้งแต่สร้างคีย์', {amount:7,unit:'days'}), 'Valid for 7 days from creation');
  assert.equal(translate('th', 'ยกเลิกคีย์ {label}', {label:'VIP'}), 'ยกเลิกคีย์ VIP');
  assert.equal(translate('en', 'ยกเลิกคีย์ {label}', {label:'VIP$&'}), 'Revoke key VIP$&');
});
test('English catalog contains no untranslated Thai text or empty translations', () => {
  for (const [source, translated] of Object.entries(english)) {
    assert.ok(translated.trim(), source);
    assert.doesNotMatch(translated, /[\u0e00-\u0e7f]/, source);
  }
});
