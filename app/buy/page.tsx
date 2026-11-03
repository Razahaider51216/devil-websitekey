"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Crown, KeyRound, Loader2, ShieldCheck, ShoppingBag, RefreshCw } from "lucide-react";
import { Header, Footer, api, date } from "../components";
import { DiscordAccess } from "../discord-access";
import { useLanguage } from "../language";
import { duration, money, orderStatus, type ShopOrder, type ShopProduct } from "./shop-ui";

export default function Buy() { return <DiscordAccess><Shop/></DiscordAccess>; }
function Shop() {
  const { language } = useLanguage(), th = language === "th";
  const [products, setProducts] = useState<ShopProduct[] | null>(null), [available, setAvailable] = useState(false);
  const [orders, setOrders] = useState<ShopOrder[]>([]), [busy, setBusy] = useState(""), [error, setError] = useState("");
  const load = useCallback(async () => {
    const [catalog, history] = await Promise.all([api("shop/products"), api("shop/orders")]);
    setProducts(catalog.products);setAvailable(catalog.available);setOrders(history.orders);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function buy(product: ShopProduct) {
    if (busy) return;setBusy(product.id);setError("");
    const cacheKey = "devil-purchase-request:" + product.id;
    let clientId = sessionStorage.getItem(cacheKey);
    if (!clientId) { clientId = crypto.randomUUID();sessionStorage.setItem(cacheKey,clientId); }
    try {
      const order = await api("shop/orders", { method: "POST", body: JSON.stringify({ productId: product.id, clientId }) });
      sessionStorage.removeItem(cacheKey);window.location.assign(`/buy/${order.id}`);
    } catch (e) { setError((e as Error).message);setBusy(""); }
  }
  return <><Header active="buy"/><main className="site-main shop-main"><section className="shop-heading">
    <span className="eyebrow"><Crown size={15}/> PREMIUM ACCESS</span><h1>UPGRADE YOUR<br/><span>DEVIL HUB.</span></h1>
    <p>{th ? "เลือกคีย์พรีเมียมที่เหมาะกับคุณ โอนด้วยพร้อมเพย์ แล้วแนบสลิปเพื่อรับคีย์อัตโนมัติ" : "Choose your premium key, pay with PromptPay and upload your transfer slip to receive your key."}</p>
    <div className="shop-trust"><span><ShieldCheck size={15}/> {th ? "ตรวจสลิปกับ SlipOK" : "SlipOK verification"}</span><span><KeyRound size={15}/> {th ? "คีย์พรีเมียมผูกกับบัญชี" : "Account-owned premium key"}</span></div>
  </section>
  {error && <div className="notice error" role="alert">{error}<button onClick={() => { setError("");load().catch(e => setError(e.message)); }}>{th ? "ลองอีกครั้ง" : "Retry"}</button></div>}
  {products === null ? <div className="shop-empty"><Loader2 className="spin"/> {th ? "กำลังโหลดสินค้า" : "Loading products"}</div>
    : products.length === 0 ? <section className="shop-empty"><ShoppingBag size={32}/><h2>{th ? "กำลังเตรียมสินค้าพรีเมียม" : "Premium products are coming soon"}</h2><p>{th ? "แอดมินกำลังจัดเตรียมแพ็กเกจ กลับมาตรวจสอบได้อีกครั้ง" : "The administrator is preparing the available packages. Please check back soon."}</p></section>
    : <>{!available && <p className="notice">{th ? "ร้านค้ายังไม่พร้อมรับชำระเงิน กรุณารอแอดมินเปิดใช้งาน" : "Checkout is temporarily unavailable. Please wait for the administrator to enable payments."}</p>}
    <section className="shop-grid" aria-label={th ? "สินค้า Key พรีเมียม" : "Premium key products"}>{products.map(product => <article className="shop-card" key={product.id}>
      <div className="shop-card-top"><Crown size={22}/><span className="eyebrow">DEVIL PREMIUM</span></div><h2>{product.name}</h2><p className="shop-description">{product.description || (th ? "เข้าถึงฟังก์ชันพรีเมียมของ DEVIL HUB" : "Access DEVIL HUB premium features")}</p>
      <div className="shop-duration"><KeyRound size={15}/> {duration(product,th)}</div><strong className="shop-price">{money(product.priceSatang)}</strong>
      <small>{th ? "หนึ่งคำสั่งซื้อได้รับคีย์พรีเมียม 1 คีย์" : "One premium key per order"}</small>
      <button className="primary-button" disabled={!available || !!busy} onClick={() => buy(product)}>{busy === product.id ? <Loader2 className="spin" size={17}/> : <ShoppingBag size={17}/>} {th ? "ซื้อพรีเมียม" : "Buy premium"}<ArrowRight size={16}/></button>
    </article>)}</section></>}
  <section className="shop-history"><div className="manager-top"><div><span className="eyebrow muted">YOUR PURCHASES</span><h2>{th ? "คำสั่งซื้อของฉัน" : "My orders"}</h2></div><button className="quiet-button" onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={15}/>{th ? "รีเฟรช" : "Refresh"}</button></div>
    {!orders.length ? <p className="muted">{th ? "ยังไม่มีคำสั่งซื้อ" : "No orders yet"}</p> : <div className="shop-order-list">{orders.map(order => <a href={`/buy/${order.id}`} className="shop-order-row" key={order.id}><div><strong>{order.productName}</strong><small>{date(order.createdAt,language)}</small></div><span>{money(order.priceSatang)}</span><span className={`pill ${order.status === "paid" ? "success" : "muted-pill"}`}>{orderStatus(order.status,th)}</span><ArrowRight size={16}/></a>)}</div>}
  </section><p className="shop-help">{th ? "โอนแล้วแต่ยังไม่ได้รับคีย์? แจ้งเลขคำสั่งซื้อผ่านแชทด้านขวาล่าง ไม่ต้องโอนซ้ำ" : "Paid but haven’t received your key? Send your order ID using the support chat. Do not pay again."}</p></main><Footer/></>;
}
