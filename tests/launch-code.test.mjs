import test from 'node:test';
import assert from 'node:assert/strict';
import { launchCode, MAIN_LOADER_URL } from '../lib/launch-code.ts';
test('copy format embeds the same issued key into the main launcher', () => {
  const key = 'DEVIL-12345678-ABCDEF12-12345678-ABCDEF12';
  assert.equal(MAIN_LOADER_URL, 'https://devil-hub.dev/loader');
  assert.equal(launchCode(key), `script_key = "${key}";\nloadstring(game:HttpGet("${MAIN_LOADER_URL}"))()`);
  for (const bad of ['"; malicious()', '', 'DEVIL-not-a-key']) assert.throws(() => launchCode(bad));
});
