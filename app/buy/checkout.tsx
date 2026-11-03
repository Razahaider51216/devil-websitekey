"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, ArrowRight, Check, Crown, Download, ImagePlus, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Header, Footer, CopyButton, api, date } from "../components";
import { DiscordAccess } from "../discord-access";
import { useLanguage } from "../language";
import { KeyOutput } from "../key-output";
import { KeyCountdown } from "../key-countdown";
import { duration, money, orderStatus, type ShopOrder } from "./shop-ui";

export function Checkout({ id }: { id: string }) { return <DiscordAccess><Payment id={id}/></DiscordAccess>; }
function Payment({ id }: { id: string }) {
  const { language } = useLanguage(), th = language === "th";
  const [order,setOrder] = useState<ShopOrder | null>(null), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const [stage,setStage] = useState<"transfer" | "slip">("transfer"), [qr,setQr] = useState(""), [file,setFile] = useState<File | null>(null), [preview,setPreview] = useState("");
  const [clock,setClock] = useState(Date.now());const offset = useRef(0), request = useRef(false);
  const apply = useCallback((value: ShopOrder) => { offset.current = value.serverNow - Date.now();setOrder(value);setClock(Date.now()); }, []);
  const load = useCallback(async () => { const value = await api(`shop/orders/${id}`);apply(value);return value as ShopOrder; }, [id,apply]);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => { const tick = setInterval(() => setClock(Date.now()),1000);return () => clearInterval(tick); }, []);
  useEffect(() => { let active = true;setQr("");if (order?.qrPayload) QRCode.toDataURL(order.qrPayload,{ width: 420, margin: 4, errorCorrectionLevel: "M", color: { dark: "#001621", light: "#ffffff" } }).then(value => { if (active) setQr(value); }).catch(() => setError(th ? "สร้าง QR ไม่สำเร็จ กรุณารีเฟรช" : "Could not generate the QR. Please refresh."));return () => { active = false; }; }, [order?.qrPayload,th]);
  useEffect(() => { if (!file) { setPreview("");return; }const url = URL.createObjectURL(file);setPreview(url);return () => URL.revokeObjectURL(url); }, [file]);
  useEffect(() => {
    const verifying=order?.status === "verifying", awaitingReview=!!order && order.status !== "paid";
    if (!verifying && !awaitingReview) return;
    const timer = setInterval(() => { if (!request.current && !document.hidden) load().catch(() => {}); },verifying ? 3000 : 10000);return () => clearInterval(timer);
  }, [order?.status,order?.lastError,load]);
  const remaining = order ? Math.max(0,Math.ceil((order.expiresAt - (clock + offset.current)) / 1000)) : 0;
  const retry = order?.retryAt ? Math.max(0,Math.ceil((order.retryAt - clock - offset.current) / 1000)) : 0;
  useEffect(() => { if (remaining === 0 && order?.canVerify) setStage("slip"); }, [remaining,order?.canVerify]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();if (!file || request.current) return;request.current=true;setBusy(true);setError("");
    try {
      const form = new FormData();form.set("slip",file);
      const response = await fetch(`/api/shop/orders/${id}/verify`,{ method: "POST", body: form, cache: "no-store" });
      const data = await response.json() as ShopOrder & { error?: string };if (!response.ok) throw new Error(data.error || (th ? "ตรวจสลิปไม่สำเร็จ" : "Slip verification failed"));apply(data);
    } catch (e) { setError((e as Error).message);try { await load(); } catch {} }
    finally { request.current=false;setBusy(false); }
  }
  function choose(value?: File) {
    setError("");if (!value) { setFile(null);return; }
    if (!["image/png","image/jpeg","image/webp"].includes(value.type) || value.size > 4 * 1024 * 1024) { setError(th ? "ใช้รูป PNG, JPG หรือ WebP ขนาดไม่เกิน 4 MiB" : "Use a PNG, JPG or WebP image up to 4 MiB");return; }setFile(value);
  }
  return <><Header active="buy"/><main className="site-main shop-main"><a href="/buy" className="shop-back"><ArrowLeft size={16}/>{th ? "กลับไปหน้าสินค้า" : "Back to products"}</a>
    <div className="shop-heading compact"><span className="eyebrow"><LockKeyhole size={14}/> SECURE CHECKOUT</span><h1>{order?.status === "paid" ? "ACCESS GRANTED." : "YOUR PREMIUM."}</h1><p>{order?.productName || (th ? "กำลังโหลดคำสั่งซื้อ" : "Loading order")}</p></div>
    {error && <div className="notice error" role="alert">{error}<button onClick={() => load().catch(e => setError(e.message))}>{th ? "รีเฟรช" : "Refresh"}</button></div>}
    {!order ? <section className="shop-empty"><Loader2 className="spin"/></section> : order.status === "paid" && order.key ? <section className="checkout-success"><div className="success-badge"><Check size={30}/></div><span className="eyebrow"><Crown size={16}/> PREMIUM KEY</span><h2>{th ? "รับคีย์พรีเมียมเรียบร้อย" : "Your premium key is ready"}</h2><p>{th ? "ใช้คีย์นี้ใน DEVIL HUB ตัวรันหลักได้เลย" : "Use this key with the main DEVIL HUB loader."}</p><KeyOutput value={order.key.key}/><KeyCountdown expiresAt={order.key.expiresAt} status={order.key.status} now={clock + offset.current}/><div className="checkout-facts"><span>{th ? "อายุคีย์" : "Duration"}<strong>{duration(order,th)}</strong></span><span>{th ? "หมดอายุ" : "Expires"}<strong>{date(order.key.expiresAt,language)}</strong></span><span>{th ? "ยอดชำระ" : "Paid"}<strong>{money(order.priceSatang)}</strong></span></div><a className="quiet-button" href="/buy">{th ? "ดูคำสั่งซื้อของฉัน" : "My orders"}<ArrowRight size={15}/></a></section>
    : <div className="checkout-layout"><section className="checkout-payment"><div className="checkout-tabs"><button className={stage === "transfer" ? "selected" : ""} onClick={() => setStage("transfer")}>01 {th ? "โอนเงิน" : "Transfer"}</button><button className={stage === "slip" ? "selected" : ""} onClick={() => setStage("slip")}>02 {th ? "แนบสลิป" : "Upload slip"}</button></div>
      {remaining === 0 && !order.canVerify && order.status !== "verifying" ? <div className="shop-empty"><h2>{th ? "หมดเวลาชำระเงิน" : "Payment window expired"}</h2><p>{th ? "หากโอนเงินแล้ว แจ้งเลขคำสั่งซื้อกับแอดมินผ่านแชท ห้ามโอนซ้ำ" : "If you already paid, send your order ID to support. Do not pay again."}</p><a href="/buy" className="quiet-button">{th ? "กลับหน้าสินค้า" : "Back to products"}</a></div>
      : stage === "transfer" && remaining > 0 ? <div className="qr-payment"><span className="eyebrow">PROMPTPAY / พร้อมเพย์</span><div className="payment-qr">{qr ? <img src={qr} width={280} height={280} alt={th ? "QR พร้อมเพย์ตามยอดคำสั่งซื้อ" : "PromptPay QR for this order amount"}/> : <Loader2 className="spin"/>}</div><strong className="payment-total">{money(order.priceSatang)}</strong><p>{order.payment.receiverName}</p><div className="promptpay-number"><code>{order.payment.promptpayId}</code><CopyButton value={order.payment.promptpayId} label={th ? "คัดลอก" : "Copy"}/></div><p className="muted">{th ? "ตรวจชื่อผู้รับและโอนตามยอดนี้เท่านั้น" : "Check the receiver’s name and pay this exact amount."}</p>{qr && <a className="quiet-button" download={`DEVIL-HUB-${order.id.slice(0,8)}.png`} href={qr}><Download size={15}/>{th ? "บันทึก QR" : "Save QR"}</a>}<button className="primary-button" onClick={() => setStage("slip")}>{th ? "โอนแล้ว · แนบสลิป" : "I’ve paid · Upload slip"}<ArrowRight size={17}/></button></div>
      : <form className="slip-form" onSubmit={submit}>{remaining === 0 && <p className="notice" role="status">{th ? "หมดเวลาโอนแล้ว แต่ยังส่งสลิปของยอดที่โอนภายในเวลาคำสั่งซื้อนี้ได้ ห้ามโอนซ้ำ" : "The payment window has closed. You can still submit a slip for a transfer made within this order's payment window. Do not pay again."}</p>}<div className="eyebrow"><ShieldCheck size={15}/> SLIP VERIFICATION</div><h2>{th ? "อัปโหลดสลิปโอนเงิน" : "Upload your transfer slip"}</h2><p>{th ? "ใช้สลิปจากแอปธนาคารที่เห็น QR ชัดเจน หลังตรวจผ่านคีย์จะปรากฏในหน้านี้" : "Upload a bank slip with a clear QR code. Your key will appear here after successful verification."}</p><label className="slip-picker"><ImagePlus size={28}/><strong>{file?.name || (th ? "เลือกรูปสลิป" : "Choose slip image")}</strong><span>PNG / JPG / WEBP · MAX 4 MiB</span><input type="file" accept="image/png,image/jpeg,image/webp" aria-label={th ? "รูปสลิปโอนเงิน" : "Transfer slip image"} disabled={busy} onChange={e => choose(e.target.files?.[0])}/></label>{preview && <div className="slip-preview"><img src={preview} alt={th ? "ตัวอย่างสลิปที่เลือก" : "Selected slip preview"}/></div>}{order.lastError && !error && <p className="notice" role="status">{order.lastError}</p>}<button className="primary-button" disabled={!file || busy || order.status === "verifying" || retry > 0}>{busy || order.status === "verifying" ? <Loader2 size={17} className="spin"/> : <ShieldCheck size={17}/>} {retry > 0 ? `${th ? "ลองใหม่ใน" : "Retry in"} ${retry}s` : busy || order.status === "verifying" ? th ? "กำลังตรวจสอบสลิป…" : "Verifying your slip…" : th ? "ตรวจสลิปและรับคีย์" : "Verify slip & get key"}</button><p className="shop-help">{th ? "หากมีปัญหา ให้ส่งสลิปเดิมอีกครั้งหลังเวลาที่แจ้ง ไม่ต้องโอนซ้ำ" : "If verification fails, retry the same slip after the stated delay. Do not pay again."}</p></form>}
    </section><aside className="checkout-summary"><span className="eyebrow"><Crown size={15}/> ORDER SUMMARY</span><h2>{order.productName}</h2><div className="checkout-facts"><span>{th ? "สิทธิ์ใช้งาน" : "Access"}<strong>PREMIUM</strong></span><span>{th ? "อายุคีย์" : "Duration"}<strong>{duration(order,th)}</strong></span><span>{th ? "ยอดชำระทั้งหมด" : "Total amount"}<strong>{money(order.priceSatang)}</strong></span><span>{th ? "สถานะ" : "Status"}<strong>{orderStatus(order.status,th)}</strong></span></div><div className="payment-timer"><span>{th ? "เวลาที่เหลือ" : "Time remaining"}</span><strong>{Math.floor(remaining / 60).toString().padStart(2,"0")}:{(remaining % 60).toString().padStart(2,"0")}</strong></div><div className="order-reference"><span>{th ? "เลขคำสั่งซื้อ" : "Order ID"}</span><code>{order.id}</code><CopyButton value={order.id} label={th ? "คัดลอกเลขคำสั่งซื้อ" : "Copy order ID"}/></div><p className="muted">{th ? "นับอายุคีย์หลังระบบยืนยันการชำระเงิน" : "Your key duration starts after payment is confirmed."}</p></aside></div>}
  </main><Footer/></>;
}
