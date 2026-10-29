export async function resetHwid(config, key, userId, interactionId, send = fetch) {
  let response;
  try { response = await send(config.website + '/api/bot/reset-hwid', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiSecret },
    body: JSON.stringify({ key, discordUserId: userId, interactionId }),
  }); } catch { return { ok: false, message: 'เชื่อมต่อระบบเว็บไม่สำเร็จ กรุณาลองอีกครั้งภายหลัง' }; }
  let data;
  try { data = await response.json(); } catch { return { ok: false, message: 'ระบบเว็บยังไม่พร้อม กรุณาลองอีกครั้งภายหลัง' }; }
  if (!data || typeof data !== 'object') return { ok: false, message: 'ระบบเว็บยังไม่พร้อม กรุณาลองอีกครั้งภายหลัง' };
  if (response.ok && data.ok === true && ['reset', 'already_unbound', 'already_processed'].includes(data.status)) {
    const message = data.status === 'already_unbound'
      ? 'คีย์นี้ยังไม่ได้ผูกเครื่อง สามารถนำไปใช้เครื่องใหม่ได้เลยครับ'
      : data.status === 'already_processed'
        ? 'รายการนี้รีเซ็ตสำเร็จไปแล้วครับ วันหมดอายุคีย์ยังเท่าเดิม'
        : 'รีเซ็ต HWID สำเร็จแล้วครับ ใช้คีย์เดิมบนเครื่องใหม่ได้เลย วันหมดอายุยังเท่าเดิม';
    return { ok: true, message };
  }
  if (data.error === 'premium_required') return { ok: false, message: 'รีเซ็ตได้เฉพาะคีย์ Premium ที่แอดมินสร้างและยังใช้งานได้เท่านั้น' };
  if (['cooldown', 'rate_limited', 'reset_not_available'].includes(data.error)) return { ok: false, message: `กรุณารอ ${Math.max(1, Math.ceil(Number(data.retryAfter) || 60))} วินาที แล้วลองอีกครั้ง` };
  return { ok: false, message: 'ระบบรีเซ็ตยังไม่พร้อม กรุณาติดต่อแอดมิน' };
}
