export async function resetHwid(config, key, userId, interactionId, send = fetch) {
  const response = await send(config.website + '/api/bot/reset-hwid', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiSecret },
    body: JSON.stringify({ key, discordUserId: userId, interactionId }),
  });
  let data;
  try { data = await response.json(); } catch { return 'ระบบเว็บยังไม่พร้อม กรุณาลองอีกครั้งภายหลัง'; }
  if (response.ok && data.ok === true) return data.status === 'already_unbound'
    ? 'คีย์นี้ยังไม่ได้ผูกเครื่อง สามารถนำไปใช้เครื่องใหม่ได้เลยครับ'
    : 'รีเซ็ต HWID สำเร็จแล้วครับ ใช้คีย์เดิมบนเครื่องใหม่ได้เลย วันหมดอายุยังเท่าเดิม';
  if (data.error === 'premium_required') return 'รีเซ็ตได้เฉพาะคีย์ Premium ที่แอดมินสร้างและยังใช้งานได้เท่านั้น';
  if (['cooldown', 'rate_limited', 'reset_not_available'].includes(data.error)) return `กรุณารอ ${Math.max(1, Math.ceil(Number(data.retryAfter) || 60))} วินาที แล้วลองอีกครั้ง`;
  return 'ระบบรีเซ็ตยังไม่พร้อม กรุณาติดต่อแอดมิน';
}
