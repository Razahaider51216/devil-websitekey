"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, Crown, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { api, date } from "../components";
import { useLanguage } from "../language";
import { duration, money, orderStatus, type ShopProduct } from "../buy/shop-ui";
import { PurchaseReview, type ReviewOrder } from "./purchase-review";

type Settings = { enabled: boolean; promptpayId: string; receiverName: string; receiverAliases: string[]; orderMinutes: number };
type Config = { products: ShopProduct[]; settings: Settings; revision: number; configured: boolean; apiKeyConfigured: boolean; branchId: string };
type AdminOrder = ReviewOrder & { ownerName: string; ownerId: string; productName: string; createdAt: number; paidAt: number | null; transactionId: string | null };
const blank = { name: "", description: "", price: "", durationKind: "days", durationAmount: 30, enabled: false, sortOrder: 0 };
export function ShopManager() {
  const { language } = useLanguage(), th = language === "th", text = (a: string,b: string) => th ? a : b;
  const [config,setConfig] = useState<Config | null>(null), [tab,setTab] = useState("products"), [draft,setDraft] = useState(blank);
  const [editing,setEditing] = useState<ShopProduct | null>(null), [error,setError] = useState(""), [busy,setBusy] = useState(false), [saved,setSaved] = useState(false);
  const [orders,setOrders] = useState<AdminOrder[]>([]), [next,setNext] = useState<number | null>(null), [orderLoading,setOrderLoading] = useState(false);
  const load = useCallback(async () => setConfig(await api("admin/shop")), []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  const loadOrders = useCallback(async (before?: number) => {
    setOrderLoading(true);
    try { const data = await api("admin/shop/orders" + (before ? `?before=${before}` : ""));setOrders(old => before ? [...old,...data.orders] : data.orders);setNext(data.next); }
    catch (e) { setError((e as Error).message); }finally { setOrderLoading(false); }
  }, []);
  useEffect(() => { if (tab === "orders") void loadOrders(); }, [tab,loadOrders]);
  function reset() { setEditing(null);setDraft(blank);setSaved(false); }
  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();setBusy(true);setError("");setSaved(false);
    try {
      const data = await api("admin/shop/products" + (editing ? `/${editing.id}` : ""), { method: editing ? "PUT" : "POST", body: JSON.stringify({ product: draft, ...(editing ? { revision: editing.updatedAt } : {}) }) });
      setConfig(value => value ? { ...value,products: data.products } : value);reset();setSaved(true);
    } catch (e) { setError((e as Error).message); }finally { setBusy(false); }
  }
  async function remove(product: ShopProduct) {
    if (!window.confirm(text(`ลบสินค้า “${product.name}”? คำสั่งซื้อเดิมจะยังคงอยู่`, `Delete “${product.name}”? Existing orders will be retained.`))) return;
    setBusy(true);setError("");try {
      const data = await api(`admin/shop/products/${product.id}`, { method: "DELETE", body: JSON.stringify({ revision: product.updatedAt }) });
      setConfig(value => value ? { ...value, products: data.products } : value);if (editing?.id === product.id) reset();
    } catch (e) { setError((e as Error).message); }finally { setBusy(false); }
  }
  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();if (!config) return;setBusy(true);setSaved(false);setError("");
    try { const data = await api("admin/shop/settings", { method: "PUT",body: JSON.stringify({ settings: { ...config.settings, receiverAliases: config.settings.receiverAliases.map(v => v.trim()).filter(Boolean) },revision: config.revision }) });setConfig({ ...config,...data });setSaved(true); }
    catch (e) { setError((e as Error).message); }finally { setBusy(false); }
  }
  function setting<K extends keyof Settings>(key: K,value: Settings[K]) { setSaved(false);setConfig(old => old ? { ...old,settings: { ...old.settings,[key]:value } } : old); }
  return <section className="shop-manager"><div className="manager-top"><div><span className="eyebrow"><Crown size={15}/> PREMIUM COMMERCE</span><h2>{text("ร้านค้าคีย์พรีเมียม","Premium key shop")}</h2></div><a href="/buy" className="quiet-button" target="_blank" rel="noreferrer">{text("ดูหน้าร้าน","View shop")}<ArrowUpRight size={15}/></a></div>
    <div className="shop-admin-tabs">{[["products",text("สินค้า","Products")],["orders",text("คำสั่งซื้อ","Orders")],["payment",text("ตั้งค่าการรับเงิน","Payment settings")]].map(([value,label]) => <button key={value} className={tab === value ? "selected" : ""} onClick={() => { setTab(value);setError("");setSaved(false); }}>{label}</button>)}</div>
    {error && <p className="notice error" role="alert">{error}<button onClick={() => { setError("");load().catch(e => setError(e.message)); }}>{text("รีเฟรช","Refresh")}</button></p>}{saved && <p className="shop-saved" role="status"><Check size={15}/>{text("บันทึกเรียบร้อย","Saved successfully")}</p>}
    {!config ? <div className="shop-empty"><Loader2 className="spin"/></div> : tab === "products" ? <div className="shop-admin-grid"><div><div className="manager-top"><h3>{text("สินค้าทั้งหมด","All products")} ({config.products.length})</h3><button className="quiet-button" onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={14}/>{text("รีเฟรช","Refresh")}</button></div>
      {!config.products.length && <p className="muted">{text("ยังไม่มีสินค้า เพิ่มชื่อ ราคา และอายุคีย์ในแบบฟอร์มได้เลย","No products yet. Add a name, price and key duration using the form.")}</p>}
      {config.products.map(product => <article className="shop-admin-product" key={product.id}><Crown size={20}/><div><strong>{product.name}</strong><small>{money(product.priceSatang)} · {duration(product,th)} · {product.enabled ? text("เปิดขาย","Published") : text("ซ่อน","Hidden")}</small></div><button className="quiet-button icon-only" disabled={busy} aria-label={text("แก้ไข ","Edit ") + product.name} onClick={() => { setEditing(product);setDraft({ name:product.name,description:product.description,price:(product.priceSatang / 100).toFixed(2),durationKind:product.durationKind,durationAmount:product.durationAmount,enabled:product.enabled,sortOrder:product.sortOrder });setSaved(false); }}><Pencil size={15}/></button><button className="revoke-button" disabled={busy} aria-label={text("ลบ ","Delete ") + product.name} onClick={() => remove(product)}><Trash2 size={15}/></button></article>)}
    </div><form className="create-card shop-product-form" onSubmit={saveProduct}><div className="manager-top"><h3>{editing ? text("แก้ไขสินค้า","Edit product") : text("เพิ่มสินค้า","Add product")}</h3>{editing && <button className="quiet-button" type="button" onClick={reset}><X size={15}/></button>}</div>
      <label><span className="field-label">{text("ชื่อสินค้า","Product name")}</span><input value={draft.name} required maxLength={100} disabled={busy} onChange={e => setDraft({ ...draft,name:e.target.value })}/></label>
      <label><span className="field-label">{text("รายละเอียดสินค้า","Product description")}</span><textarea value={draft.description} rows={3} maxLength={1000} disabled={busy} onChange={e => setDraft({ ...draft,description:e.target.value })}/></label>
      <label><span className="field-label">{text("ราคา (บาท)","Price (THB)")}</span><input value={draft.price} type="number" min="1" max="1000000" step="0.01" required disabled={busy} onChange={e => setDraft({ ...draft,price:e.target.value })}/></label>
      <label><span className="field-label">{text("รูปแบบอายุคีย์","Key duration type")}</span><select className="service-select" value={draft.durationKind} onChange={e => setDraft({ ...draft,durationKind:e.target.value,durationAmount:e.target.value === "months" ? 1 : e.target.value === "permanent" ? 0 : 30 })}>{[["days",text("วัน","Days")],["months",text("เดือน","Months")],["permanent",text("ถาวร","Lifetime")]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {draft.durationKind !== "permanent" && <label><span className="field-label">{text("จำนวนวัน / เดือน","Number of days / months")}</span><input value={draft.durationAmount} type="number" min={1} max={draft.durationKind === "days" ? 3650 : 120} required onChange={e => setDraft({ ...draft,durationAmount:Number(e.target.value) })}/></label>}
      <label><span className="field-label">{text("ลำดับแสดงผล","Display order")}</span><input value={draft.sortOrder} type="number" min={0} max={9999} required onChange={e => setDraft({ ...draft,sortOrder:Number(e.target.value) })}/></label>
      <label className="shop-checkbox"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft,enabled:e.target.checked })}/><span>{text("เปิดขายบนหน้าร้าน","Publish this product")}</span></label>
      <button className="primary-button" disabled={busy}>{busy ? <Loader2 className="spin" size={16}/> : editing ? <Save size={16}/> : <Plus size={16}/>} {editing ? text("บันทึกสินค้า","Save product") : text("เพิ่มสินค้า","Add product")}</button>
    </form></div>
    : tab === "payment" ? <form className="create-card shop-payment-settings" onSubmit={saveSettings}><h3>{text("บัญชีรับเงินพร้อมเพย์","PromptPay receiving account")}</h3><p className="muted">{text("ใช้บัญชีเดียวกับที่ผูกใน SlipOK สาขานี้ ระบบจะตรวจยอดและชื่อผู้รับก่อนออกคีย์","Use the account registered with this SlipOK branch. Payments must match the quoted amount and recipient.")}</p>
      <label><span className="field-label">{text("หมายเลขพร้อมเพย์","PromptPay ID")}</span><input value={config.settings.promptpayId} inputMode="numeric" required maxLength={20} onChange={e => setting("promptpayId",e.target.value)}/></label>
      <label><span className="field-label">{text("ชื่อผู้รับเงิน","Receiver name")}</span><input value={config.settings.receiverName} required maxLength={160} onChange={e => setting("receiverName",e.target.value)}/></label>
      <label><span className="field-label">{text("ชื่อผู้รับเพิ่มเติม เช่น ชื่อภาษาอังกฤษ (หนึ่งชื่อต่อบรรทัด)","Additional recipient names, e.g. English name (one per line)")}</span><textarea rows={3} value={config.settings.receiverAliases.join("\n")} onChange={e => setting("receiverAliases",e.target.value.split("\n").slice(0,5))}/></label>
      <label><span className="field-label">{text("เวลาชำระเงิน (นาที)","Payment window (minutes)")}</span><input type="number" min={15} max={60} value={config.settings.orderMinutes} required onChange={e => setting("orderMinutes",Number(e.target.value))}/></label>
      <label className="shop-checkbox"><input type="checkbox" checked={config.settings.enabled} onChange={e => setting("enabled",e.target.checked)}/><span>{text("เปิดรับคำสั่งซื้อใหม่","Enable new purchases")}</span></label>
      <div className="shop-integration-status"><span>SlipOK Branch<strong>{config.branchId || "—"}</strong></span><span>API Key<strong>{config.apiKeyConfigured ? text("ตั้งค่าแล้ว (ซ่อนค่า)","Configured (hidden)") : text("ยังไม่ตั้งค่า","Not configured")}</strong></span><span>{text("ความพร้อมระบบ","Checkout readiness")}<strong>{config.configured ? text("พร้อม","Ready") : text("ตรวจการตั้งค่า","Check configuration")}</strong></span></div><p className="muted">{text("API Key เก็บเป็น Cloudflare Secret ชื่อ SLIPOK_API_KEY ไม่ถูกส่งมายังเบราว์เซอร์","The API key is stored as the Cloudflare secret SLIPOK_API_KEY and is never sent to the browser.")}</p>
      <button className="primary-button" disabled={busy}>{busy ? <Loader2 className="spin" size={16}/> : <Save size={16}/>} {text("บันทึกการรับเงิน","Save payment settings")}</button>
    </form>
    : <div className="shop-admin-orders"><div className="manager-top"><h3>{text("รายการสั่งซื้อ","Purchase orders")}</h3><button className="quiet-button" disabled={orderLoading} onClick={() => loadOrders()}><RefreshCw size={15}/>{text("รีเฟรช","Refresh")}</button></div>{!orders.length && <p className="muted">{text("ยังไม่มีคำสั่งซื้อ","No orders yet")}</p>}{orders.map(order => <article className="shop-admin-order" key={order.id}><div><strong>{order.productName}</strong><small>{order.ownerName} · {date(order.createdAt,language)}</small><code>{order.id}</code></div><strong>{money(order.priceSatang)}</strong><span className={`pill ${order.status === "paid" ? "success" : "muted-pill"}`}>{orderStatus(order.status,th)}</span>{order.slipUrl && <a className="quiet-button" href={order.slipUrl} target="_blank" rel="noreferrer">{text("ดูสลิป","View slip")}<ArrowUpRight size={14}/></a>}{order.lastError && <p className="shop-order-error">{order.lastError}</p>}<PurchaseReview order={order} onApproved={() => { setSaved(true);void loadOrders(); }}/></article>)}{next && <button className="quiet-button" disabled={orderLoading} onClick={() => loadOrders(next)}>{orderLoading ? <Loader2 className="spin" size={15}/> : text("โหลดเพิ่มเติม","Load more")}</button>}</div>}
  </section>;
}
