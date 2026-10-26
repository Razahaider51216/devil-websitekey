import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceErrorCode } from '../lib/service-errors.ts';
test('database diagnostics inspect nested Drizzle causes without exposing SQL or secrets', () => {
  assert.equal(serviceErrorCode(new Error('Failed query: private SQL', {cause:new Error('D1_ERROR: no such table: site_settings')})), 'DB_SCHEMA_MISSING');
  assert.equal(serviceErrorCode(new Error('Cloudflare D1 binding `DB` is unavailable.')), 'DB_BINDING_MISSING');
  assert.equal(serviceErrorCode(new Error('D1_ERROR: database unavailable')), 'DB_UNAVAILABLE');
  assert.equal(serviceErrorCode(new Error('KEY_SECRET must contain at least 32 characters')), 'KEY_SECRET_MISSING');
  const cycle = new Error('private value'); cycle.cause = cycle;
  assert.equal(serviceErrorCode(cycle), 'SERVICE_UNAVAILABLE');
});
