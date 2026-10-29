import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MessageFlags } from 'discord.js';
import { panel, resetModal, resetResult, info } from '../src/ui.js';
import { command } from '../src/commands.js';
import { resetHwid } from '../src/reset.js';

test('panel is Components V2 with top image, exact copy, separator and no accent color', () => {
  const payload = panel('https://devil-hub.dev');
  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  assert.equal(payload.embeds, undefined); assert.equal(payload.content, undefined);
  const container = payload.components[0].toJSON();
  assert.equal(container.type, 17); assert.equal(container.accent_color, undefined);
  assert.equal(container.components[0].type, 12);
  assert.equal(container.components[0].items[0].media.url, 'attachment://devilhub.png');
  assert.equal(container.components[1].content, '# DEVIL HUB');
  assert.equal(container.components[2].content, '> `Reset HWID` For Key Premium\n> `Get Key` Free to Website');
  assert.equal(container.components[3].divider, true);
  const buttons = container.components[4].components;
  assert.deepEqual(buttons.map(x => x.label), ['Reset Hwid', 'Get Key', 'Info']);
  assert.equal(buttons[0].style, 3);
  assert.equal(buttons[2].style, 2);
  assert.deepEqual(buttons[0].emoji, { id: '1565299333794889778', name: 'watergear', animated: false });
  assert.equal(buttons[1].emoji.name, '🔑');
  assert.deepEqual(buttons[2].emoji, { id: '1565299349099909120', name: 'jungwad_', animated: true });
  assert.equal(buttons[1].url, 'https://devil-hub.dev');
  assert.deepEqual(payload.allowedMentions.parse, []);
  assert.equal(readFileSync(new URL('../assets/devilhub.png', import.meta.url)).subarray(1, 4).toString(), 'PNG');
});
test('slash command targets a channel and defaults to guild manager permissions', () => {
  const data = command.toJSON();
  assert.equal(data.name, 'setdevilhub');
  assert.equal(data.options[0].name, 'channel'); assert.equal(data.options[0].required, true);
  assert.equal(data.default_member_permissions, '32');
});
test('modal contains a private key input, not a message or public key response', () => {
  const modal = resetModal().toJSON();
  assert.equal(modal.custom_id, 'devilhub:hwid:submit');
  assert.equal(modal.components[0].components[0].custom_id, 'premium_key');
  assert.match(info('https://devil-hub.dev'), /5 นาที/);
  const help = info('https://devil-hub.dev');
  assert.match(help, /ภาษาไทย/);
  assert.match(help, /English/);
  assert.match(help, /Free keys cannot reset/);
  assert.ok(help.length <= 2000, 'Help fits one ephemeral Discord message');
});
test('reset client sends one bounded authenticated POST and does not echo the key', async () => {
  const key = 'DEVIL-private-fixture';
  const config = { website: 'https://devil-hub.dev', apiSecret: 'test-secret' };
  let calls = 0;
  const result = await resetHwid(config, key, '123', '456', async (url, options) => {
    calls++; assert.equal(url, 'https://devil-hub.dev/api/bot/reset-hwid');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.equal(JSON.parse(options.body).key, key); assert.equal(options.redirect, 'error');
    return Response.json({ ok: true, status: 'reset' });
  });
  assert.equal(calls, 1); assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes(key));
});

test('reset results use the requested success/failure emoji and bot avatar only in a colorless result embed', () => {
  const avatar = 'https://cdn.discordapp.com/avatars/123/avatar.png';
  for (const ok of [true, false]) {
    const payload = resetResult({ ok, message: 'Fixture result' }, avatar);
    const embed = payload.embeds[0].toJSON();
    assert.equal(payload.components, undefined); assert.equal(payload.flags, undefined);
    assert.equal(payload.content, ''); assert.equal(embed.color, undefined);
    assert.equal(embed.thumbnail.url, avatar);
    assert.match(embed.description, ok ? /<a:emoji_25:1540658596487102464>/ : /<:ojic_018:1546638491478265946>/);
    assert.match(embed.description, /Fixture result/);
  }
  assert.ok(!JSON.stringify(panel('https://devil-hub.dev').components.map(x => x.toJSON())).includes(avatar));
  assert.ok(!info('https://devil-hub.dev').includes(avatar));
});

test('API rejection, cooldown, transport errors and malformed responses produce failure results', async () => {
  const config = { website: 'https://devil-hub.dev', apiSecret: 'fixture' };
  for (const send of [
    async () => Response.json({ error: 'premium_required' }, { status: 403 }),
    async () => Response.json({ error: 'cooldown', retryAfter: 300 }, { status: 429 }),
    async () => Response.json({ ok: true, status: 'unknown' }),
    async () => Response.json(null),
    async () => new Response('<html>Unavailable</html>', { status: 503 }),
    async () => { throw new Error('private transport details'); },
  ]) {
    const result = await resetHwid(config, 'private-key', '123', '456', send);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});
