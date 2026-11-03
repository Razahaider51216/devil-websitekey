import { env } from "cloudflare:workers";
import { discordUser } from "./discord-auth";
import { googleUser } from "./google-auth";
import { expiry, hash, keyFor, status } from "./domain";
import { readJson, requireOrigin, RequestError } from "./security";
import { emptyShopSettings, paymentQr, shopSettingId, validateProduct, validateShopSettings, verifyPaymentData,
  type PaymentConfig, type Product, type ShopSettings, type VerifiedPayment } from "./shop-domain";
import { checkSlip, readSlipUpload, SlipError } from "./slipok";

type Dependencies = { admin: (req: Request) => Promise<void>; rate: (req: Request, kind: string, max: number) => Promise<void> };
type ProductRow = { id: string; name: string; description: string; price_satang: number; duration_kind: Product["durationKind"];
  duration_amount: number; enabled: number; sort_order: number; updated_at: number; deleted_at: number | null };
type Order = { id: string; owner_id: string; owner_name: string; client_id: string; product_id: string; product_name: string;
  price_satang: number; duration_kind: Product["durationKind"]; duration_amount: number; payment_config: string;
  status: "pending" | "verifying" | "paid"; created_at: number; expires_at: number; verify_token: string | null;
  verify_started_at: number | null; verify_attempts: number; retry_at: number | null; last_error: string | null;
  slip_key: string | null; slip_sha256: string | null; transaction_id: string | null; paid_at: number | null; key_id: string };
type StoredProof = { orderId: string; slipSha256: string; paymentFingerprint: string; payment: VerifiedPayment; verifiedAt: number; imageType: string };
type ManualReview = { adminId: string; note: string };
type ReviewRecord = { adminId: string; note: string; approvedAt: number };
const vars = () => env as unknown as Record<string, string>;
// Bank delays must not force another payment. Only slip submission gets a grace
// period; verifyPaymentData still requires payment within the original invoice.
const slipGraceMs = 24 * 60 * 60_000;
function db() { if (!env.DB) throw new RequestError(503, "ฐานข้อมูลร้านค้ายังไม่พร้อม");return env.DB; }
function bucket() {
  const value = (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES;
  if (!value) throw new RequestError(503, "ระบบจัดเก็บหลักฐานยังไม่พร้อม กรุณาติดต่อแอดมิน");return value;
}
const reply = (data: unknown, code = 200, extra: Record<string,string> = {}) => Response.json(data, { status: code,
  headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extra } });
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value); }
async function member(req: Request) {
  const user = await discordUser(req) || await googleUser(req);
  if (!user) throw new RequestError(401, "กรุณาเข้าสู่ระบบด้วย Google หรือ Discord ก่อนซื้อคีย์");return user;
}
function product(row: ProductRow): Product {
  return { id: row.id, name: row.name, description: row.description, priceSatang: row.price_satang,
    durationKind: row.duration_kind, durationAmount: row.duration_amount, enabled: !!row.enabled, sortOrder: row.sort_order, updatedAt: row.updated_at };
}
async function settings() {
  const row = await db().prepare("SELECT value,updated_at FROM site_settings WHERE id=?").bind(shopSettingId).first<{ value: string; updated_at: number }>();
  return { settings: row ? validateShopSettings(JSON.parse(row.value)) : emptyShopSettings, revision: row?.updated_at ?? 0 };
}
function configured(config: ShopSettings) {
  return !!(config.promptpayId && config.receiverName && vars().SLIPOK_API_KEY && /^\d{1,12}$/.test(vars().SLIPOK_BRANCH_ID || "")
    && vars().KEY_SECRET?.length >= 32 && (env as unknown as { SCRIPT_FILES?: unknown }).SCRIPT_FILES);
}
async function catalog(admin = false) {
  const rows = await db().prepare(`SELECT * FROM shop_products WHERE deleted_at IS NULL ${admin ? "" : "AND enabled=1"} ORDER BY sort_order,updated_at,id`).all<ProductRow>();
  return rows.results.map(product);
}
async function getOrder(id: string, owner?: string) {
  if (!validId(id)) throw new RequestError(404, "ไม่พบคำสั่งซื้อ");
  const row = await db().prepare(`SELECT * FROM purchase_orders WHERE id=?${owner ? " AND owner_id=?" : ""}`).bind(...(owner ? [id, owner] : [id])).first<Order>();
  if (!row) throw new RequestError(404, "ไม่พบคำสั่งซื้อ");return row;
}
async function orderView(order: Order, admin = false, review?: ReviewRecord | null) {
  const now = Date.now(), payment = JSON.parse(order.payment_config) as PaymentConfig;
  const view = { id: order.id, productName: order.product_name, priceSatang: order.price_satang,
    durationKind: order.duration_kind, durationAmount: order.duration_amount, createdAt: order.created_at, expiresAt: order.expires_at,
    status: order.status === "paid" ? "paid" : order.status === "verifying" && (order.verify_started_at || 0) > now - 120_000 ? "verifying" : order.expires_at <= now ? "expired" : "pending",
    paidAt: order.paid_at, lastError: order.last_error, retryAt: order.retry_at, serverNow: now,
    canVerify: order.status !== "paid" && now < order.expires_at + slipGraceMs && order.verify_attempts < 12 };
  if (admin) return { ...view, ownerName: order.owner_name, ownerId: order.owner_id, attempts: order.verify_attempts,
    slipSha256: order.slip_sha256,
    review: review === undefined ? await db().prepare("SELECT admin_id AS adminId,note,approved_at AS approvedAt FROM purchase_reviews WHERE order_id=?").bind(order.id).first<ReviewRecord>() : review,
    transactionId: order.transaction_id, keyId: order.status === "paid" ? order.key_id : null,
    slipUrl: order.slip_key ? `/api/admin/shop/orders/${order.id}/slip` : null };
  const row = order.status === "paid" ? await db().prepare("SELECT id,created_at,expires_at,revoked_at FROM access_keys WHERE id=? AND owner_id=?")
    .bind(order.key_id, order.owner_id).first<{ id: string; created_at: number; expires_at: number | null; revoked_at: number | null }>() : null;
  return { ...view, payment: { promptpayId: payment.promptpayId, receiverName: payment.receiverName },
    qrPayload: view.status === "pending" || view.status === "verifying" ? paymentQr(payment, order.price_satang) : null,
    key: row ? { key: await keyFor(row.id, vars().KEY_SECRET || ""), createdAt: row.created_at, expiresAt: row.expires_at,
      status: status({ expiresAt: row.expires_at, revokedAt: row.revoked_at }, now), premium: true } : null };
}
function proofMatches(value: StoredProof, order: Order, sha: string, fingerprint: string) {
  return value.orderId === order.id && value.slipSha256 === sha && value.paymentFingerprint === fingerprint
    && value.payment?.amountSatang === order.price_satang && /^\d{3}:[A-Za-z0-9_-]{5,100}$/.test(value.payment.transactionId)
    && value.payment.transferredAt >= Math.floor(order.created_at / 1000) * 1000 && value.payment.transferredAt <= order.expires_at
    && Number.isSafeInteger(value.verifiedAt) && value.verifiedAt >= order.created_at && ["image/png","image/jpeg","image/webp"].includes(value.imageType);
}
async function finalize(order: Order, token: string, proof: StoredProof, slipKey: string | null, review?: ManualReview) {
  const database = db(), now = Date.now(), key = await keyFor(order.key_id, vars().KEY_SECRET || "");
  const ends = expiry(now, { kind: order.duration_kind, amount: order.duration_amount });
  // Receipt ownership, key issuance and Paid are one atomic D1 transaction.
  // A duplicate bank reference can never pay two orders, even concurrently.
  const statements = [
    database.prepare(`INSERT INTO payment_receipts(transaction_id,order_id,amount_satang,transferred_at,verified_at,receiving_bank,slip_sha256)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM purchase_orders WHERE id=? AND status='verifying' AND verify_token=?)
      ON CONFLICT DO NOTHING`).bind(proof.payment.transactionId, order.id, proof.payment.amountSatang, proof.payment.transferredAt,
        proof.verifiedAt, proof.payment.receivingBank, proof.slipSha256, order.id, token),
    database.prepare(`INSERT INTO access_keys(id,flow_id,key_hash,owner_id,label,source,created_at,expires_at,revoked_at,duration_kind,duration_amount)
      SELECT ?,NULL,?,?,?,'purchase',?,?,NULL,?,? WHERE EXISTS(SELECT 1 FROM payment_receipts WHERE transaction_id=? AND order_id=?)
      AND EXISTS(SELECT 1 FROM purchase_orders WHERE id=? AND status='verifying' AND verify_token=?) ON CONFLICT(id) DO NOTHING`)
      .bind(order.key_id, await hash(key), order.owner_id, order.product_name, now, ends, order.duration_kind, order.duration_amount,
        proof.payment.transactionId, order.id, order.id, token),
    database.prepare(`UPDATE purchase_orders SET status='paid',paid_at=?,transaction_id=?,slip_key=?,slip_sha256=?,
      last_error=NULL,retry_at=NULL,verify_token=NULL WHERE id=? AND status='verifying' AND verify_token=?
      AND EXISTS(SELECT 1 FROM payment_receipts WHERE transaction_id=? AND order_id=?)
      AND EXISTS(SELECT 1 FROM access_keys WHERE id=? AND owner_id=? AND source='purchase')`)
      .bind(now, proof.payment.transactionId, slipKey, proof.slipSha256, order.id, token, proof.payment.transactionId, order.id, order.key_id, order.owner_id),
  ];
  if (review) statements.push(database.prepare(`INSERT INTO purchase_reviews(order_id,admin_id,transaction_id,slip_sha256,note,approved_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM purchase_orders WHERE id=? AND status='paid' AND transaction_id=? AND paid_at=?)
    ON CONFLICT(order_id) DO NOTHING`).bind(order.id,review.adminId,proof.payment.transactionId,proof.slipSha256,review.note,now,
      order.id,proof.payment.transactionId,now));
  const results = await database.batch(statements);
  if (results.some(result => !result.success)) throw new Error("Shop payment transaction failed");
  const updated = await getOrder(order.id, order.owner_id);
  if (updated.status !== "paid") throw new SlipError(409, "PAYMENT_CONFLICT", "สลิปนี้ถูกใช้กับคำสั่งซื้ออื่นแล้ว หรือรายการกำลังตรวจสอบ กรุณาติดต่อแอดมิน");
  return updated;
}
async function verifyOrder(req: Request, order: Order) {
  if (order.status === "paid") return reply(await orderView(order));
  const now = Date.now();
  if (order.expires_at + slipGraceMs <= now) throw new RequestError(409, "คำสั่งซื้อหมดเวลาตรวจสลิปแล้ว หากโอนแล้วกรุณาแจ้งเลขคำสั่งซื้อกับแอดมิน ไม่ต้องโอนซ้ำ");
  if (order.retry_at && order.retry_at > now) throw new SlipError(429, "PAYMENT_RETRY", "กรุณารอตามเวลาที่แสดงแล้วส่งสลิปเดิมอีกครั้ง ไม่ต้องโอนซ้ำ", Math.ceil((order.retry_at - now) / 1000));
  if (order.verify_attempts >= 12) throw new RequestError(429, "ตรวจสลิปครบจำนวนครั้งแล้ว กรุณาติดต่อแอดมินพร้อมเลขคำสั่งซื้อ");
  const payment = JSON.parse(order.payment_config) as PaymentConfig;
  if (!configured(payment) || vars().SLIPOK_BRANCH_ID !== payment.branchId) throw new RequestError(503, "ระบบตรวจสลิปยังไม่พร้อม กรุณาติดต่อแอดมิน");
  const store = bucket(), upload = await readSlipUpload(req);
  const token = crypto.randomUUID();
  const claim = await db().prepare(`UPDATE purchase_orders SET status='verifying',verify_token=?,verify_started_at=?,verify_attempts=verify_attempts+1,last_error=NULL
    WHERE id=? AND owner_id=? AND status!='paid' AND expires_at>? AND(verify_token IS NULL OR verify_started_at<?)
    AND(retry_at IS NULL OR retry_at<=?) AND verify_attempts<12 RETURNING id`)
    .bind(token, now, order.id, order.owner_id, now - slipGraceMs, now - 120_000, now).first();
  if (!claim) {
    const updated = await getOrder(order.id, order.owner_id);
    if (updated.status === "paid") return reply(await orderView(updated));
    throw new RequestError(409, "รายการกำลังตรวจสอบ กรุณารอสักครู่");
  }
  try {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", upload.bytes)), b => b.toString(16).padStart(2,"0")).join("");
    const prefix = `shop/slips/${order.id}/${digest}`, fingerprint = await hash(order.payment_config);
    // Retain the submitted image even when the provider rejects or times out,
    // so an administrator can review it without asking for another payment.
    await store.put(prefix + ".image", upload.bytes, { httpMetadata: { contentType: upload.file.type } });
    await db().prepare("UPDATE purchase_orders SET slip_key=?,slip_sha256=? WHERE id=? AND verify_token=? AND status='verifying'")
      .bind(prefix + ".image",digest,order.id,token).run();
    const saved = await store.get(prefix + ".json");
    let proof: StoredProof;
    if (saved) {
      proof = await saved.json<StoredProof>();
      if (!proofMatches(proof, order, digest, fingerprint)) throw new RequestError(503, "หลักฐานที่บันทึกไม่สมบูรณ์ กรุณาติดต่อแอดมิน");
    } else {
      const data = await checkSlip(upload.file, order.price_satang, payment.branchId, vars().SLIPOK_API_KEY);
      const verified = verifyPaymentData(data, { priceSatang: order.price_satang, createdAt: order.created_at, expiresAt: order.expires_at, payment }, Date.now());
      proof = { orderId: order.id, slipSha256: digest, paymentFingerprint: fingerprint, payment: verified, verifiedAt: Date.now(), imageType: upload.file.type };
      // Durable verified proof lets the same order retry after a DB outage without
      // sending its already-logged slip to SlipOK a second time.
      await store.put(prefix + ".json", JSON.stringify(proof), { httpMetadata: { contentType: "application/json" } });
    }
    const paid = await finalize(order, token, proof, prefix + ".image");
    return reply(await orderView(paid));
  } catch (error) {
    // Diagnostics exclude the slip image, bank details, API secret and key.
    console.warn("Shop slip verification failed", { orderId: order.id,
      code: error instanceof SlipError ? error.code : error instanceof RequestError ? "PAYMENT_VALIDATION" : "PAYMENT_SAVE",
      status: error instanceof RequestError ? error.status : 503 });
    const message = error instanceof RequestError ? error.message : "บันทึกรายการไม่สำเร็จ กรุณาส่งสลิปเดิมอีกครั้ง ห้ามโอนซ้ำ";
    const retryAfter = error instanceof SlipError ? error.retryAfter : error instanceof RequestError ? 0 : 30;
    await db().prepare(`UPDATE purchase_orders SET status='pending',verify_token=NULL,last_error=?,retry_at=? WHERE id=? AND verify_token=? AND status='verifying'`)
      .bind(message, retryAfter ? Date.now() + retryAfter * 1000 : null, order.id, token).run();
    if (error instanceof RequestError) throw error;
    throw new SlipError(503, "PAYMENT_SAVE", message, retryAfter);
  }
}
async function adminRoutes(req: Request, path: string[], deps: Dependencies) {
  await deps.admin(req);if (req.method !== "GET") requireOrigin(req);
  const route = path.join("/"), database = db(), now = Date.now();
  if (route === "admin/shop" && req.method === "GET") {
    const config = await settings();
    return reply({ products: await catalog(true), ...config, configured: configured(config.settings), branchId: vars().SLIPOK_BRANCH_ID || "", apiKeyConfigured: !!vars().SLIPOK_API_KEY });
  }
  if (route === "admin/shop/settings" && req.method === "PUT") {
    const input = await readJson(req), value = validateShopSettings(input.settings);
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new RequestError(400, "รีเฟรชหน้าตั้งค่าแล้วลองใหม่");
    const revision = Number(input.revision), next = Math.max(now, revision + 1);
    const changed = revision === 0
      ? await database.prepare("INSERT INTO site_settings(id,value,updated_at)VALUES(?,?,?)ON CONFLICT(id)DO NOTHING RETURNING id").bind(shopSettingId, JSON.stringify(value), next).first()
      : await database.prepare("UPDATE site_settings SET value=?,updated_at=? WHERE id=? AND updated_at=? RETURNING id").bind(JSON.stringify(value), next, shopSettingId, revision).first();
    if (!changed) throw new RequestError(409, "ตั้งค่าถูกแก้ไขจากที่อื่น กรุณารีเฟรช");
    return reply({ settings: value, revision: next, configured: configured(value) });
  }
  if (route === "admin/shop/products" && req.method === "POST") {
    const input = await readJson(req), value = validateProduct(input.product, crypto.randomUUID(), now);
    const result = await database.prepare(`INSERT INTO shop_products(id,name,description,price_satang,duration_kind,duration_amount,enabled,sort_order,updated_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE(SELECT count(*) FROM shop_products WHERE deleted_at IS NULL)<100 RETURNING id`)
      .bind(value.id,value.name,value.description,value.priceSatang,value.durationKind,value.durationAmount,value.enabled?1:0,value.sortOrder,value.updatedAt).first();
    if (!result) throw new RequestError(400, "เพิ่มสินค้าได้สูงสุด 100 รายการ");
    return reply({ products: await catalog(true) }, 201);
  }
  if (path[2] === "products" && path.length === 4 && ["PUT","DELETE"].includes(req.method)) {
    if (!validId(path[3])) throw new RequestError(404, "ไม่พบสินค้า");
    const input = await readJson(req);if (!Number.isSafeInteger(input.revision)) throw new RequestError(400, "กรุณารีเฟรชรายการสินค้า");
    let changed;
    if (req.method === "DELETE") changed = await database.prepare("UPDATE shop_products SET deleted_at=?,enabled=0,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL RETURNING id")
      .bind(now, Math.max(now, Number(input.revision) + 1), path[3], input.revision).first();
    else {
      const value = validateProduct(input.product, path[3], Math.max(now, Number(input.revision) + 1));
      changed = await database.prepare("UPDATE shop_products SET name=?,description=?,price_satang=?,duration_kind=?,duration_amount=?,enabled=?,sort_order=?,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL RETURNING id")
        .bind(value.name,value.description,value.priceSatang,value.durationKind,value.durationAmount,value.enabled?1:0,value.sortOrder,value.updatedAt,path[3],input.revision).first();
    }
    if (!changed) throw new RequestError(409, "สินค้าเปลี่ยนแปลงแล้ว กรุณารีเฟรชก่อนแก้ไข");
    return reply({ products: await catalog(true) });
  }
  if (route === "admin/shop/orders" && req.method === "GET") {
    const cursor = new URL(req.url).searchParams.get("before");
    const before = cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(before) || before < 1) throw new RequestError(400, "หน้ารายการไม่ถูกต้อง");
    const rows = await database.prepare("SELECT * FROM purchase_orders WHERE created_at<? ORDER BY created_at DESC LIMIT 51").bind(before).all<Order>();
    const page=rows.results.slice(0,50);
    const reviews=page.length ? await database.prepare(`SELECT order_id,admin_id AS adminId,note,approved_at AS approvedAt FROM purchase_reviews WHERE order_id IN (${page.map(()=>"?").join(",")})`)
      .bind(...page.map(row=>row.id)).all<ReviewRecord & {order_id:string}>() : {results:[]};
    const byOrder=new Map(reviews.results.map(review=>[review.order_id,review]));
    return reply({ orders: await Promise.all(page.map(row => orderView(row,true,byOrder.get(row.id) || null))), next: rows.results.length > 50 ? rows.results[49].created_at : null });
  }
  if (path[2] === "orders" && path[4] === "approve" && path.length === 5 && req.method === "POST") {
    await deps.rate(req,"shop-manual-approval",20);
    const actor=await discordUser(req);if (!actor) throw new RequestError(401,"Admin login required");
    const order=await getOrder(path[3]);
    if (order.status === "paid") return reply(await orderView(order,true));
    const input=await readJson(req);
    if (input.confirmReceived !== true || typeof input.bankCode !== "string" || !/^\d{3}$/.test(input.bankCode)
        || typeof input.receivingBank !== "string" || !/^\d{3}$/.test(input.receivingBank)
        || typeof input.transactionRef !== "string" || !/^[A-Za-z0-9_-]{5,100}$/.test(input.transactionRef)
        || typeof input.note !== "string" || input.note.trim().length < 5 || input.note.length > 1000
        || typeof input.transferredAt !== "string" || !/(?:Z|[+-]\d\d:\d\d)$/.test(input.transferredAt))
      throw new RequestError(400,"Confirm receipt of funds and enter the sending bank code, transaction reference, transfer time and review note");
    const transferredAt=Date.parse(input.transferredAt);
    if (!Number.isFinite(transferredAt) || transferredAt < Math.floor(order.created_at/1000)*1000 || transferredAt > order.expires_at || transferredAt > now+60000)
      throw new RequestError(400,"Transfer time must fall within the original order payment window");
    if (input.slipSha256 !== order.slip_sha256 || input.attempts !== order.verify_attempts)
      throw new RequestError(409,"The submitted slip changed. Refresh and review the latest image");
    const file=order.slip_key ? await bucket().get(order.slip_key) : null;
    if (order.slip_key && !file) throw new RequestError(409,"Submitted slip image is unavailable");
    const transactionId=input.bankCode+":"+input.transactionRef,token=crypto.randomUUID();
    // The original invoice may have no uploaded image yet. This order-specific
    // marker identifies manual approval; it is not stored or served as a slip.
    const receiptHash=order.slip_sha256 || await hash("manual-approval:"+order.id);
    const claim=await database.prepare(`UPDATE purchase_orders SET status='verifying',verify_token=?,verify_started_at=?
      WHERE id=? AND status=? AND verify_token IS ? AND slip_sha256 IS ? AND verify_attempts=? RETURNING id`)
      .bind(token,now,order.id,order.status,order.verify_token,input.slipSha256,input.attempts).first();
    if (!claim) throw new RequestError(409,"Order changed or is already being reviewed. Refresh before retrying");
    try {
      const proof: StoredProof={orderId:order.id,slipSha256:receiptHash,paymentFingerprint:await hash(order.payment_config),
        verifiedAt:now,imageType:file?.httpMetadata?.contentType || "application/octet-stream",
        payment:{transactionId,amountSatang:order.price_satang,transferredAt,receivingBank:input.receivingBank}};
      const paid=await finalize(order,token,proof,order.slip_key,{adminId:actor.id,note:input.note.trim()});
      return reply(await orderView(paid,true));
    } catch(error) {
      await database.prepare("UPDATE purchase_orders SET status='pending',verify_token=NULL WHERE id=? AND verify_token=? AND status='verifying'")
        .bind(order.id,token).run();
      throw error;
    }
  }
  if (path[2] === "orders" && path[4] === "slip" && path.length === 5 && req.method === "GET") {
    const order = await getOrder(path[3]);if (!order.slip_key) throw new RequestError(404, "ไม่มีรูปสลิป");
    const file = await bucket().get(order.slip_key);if (!file) throw new RequestError(404, "ไม่พบรูปสลิป");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  }
  throw new RequestError(404, "ไม่พบรายการที่ต้องการ");
}
export async function handleShop(req: Request, path: string[], deps: Dependencies): Promise<Response> {
  try {
    if (path[0] === "admin") return await adminRoutes(req, path, deps);
    const route = path.join("/"), now = Date.now();
    if (route === "shop/products" && req.method === "GET") {
      await deps.rate(req,"shop-catalog",120);const config = await settings();
      return reply({ products: await catalog(), available: config.settings.enabled && configured(config.settings) });
    }
    const user = await member(req);
    await deps.rate(req,"shop-user:" + await hash(user.id),120);
    if (req.method !== "GET") requireOrigin(req);
    if (route === "shop/orders" && req.method === "GET") {
      const rows = await db().prepare("SELECT * FROM purchase_orders WHERE owner_id=? ORDER BY created_at DESC LIMIT 20").bind(user.id).all<Order>();
      return reply({ orders: await Promise.all(rows.results.map(row => orderView(row))) });
    }
    if (route === "shop/orders" && req.method === "POST") {
      await deps.rate(req,"shop-create:" + await hash(user.id),10);
      const input = await readJson(req);
      if (!validId(input.productId) || !validId(input.clientId)) throw new RequestError(400, "กรุณาเลือกสินค้าใหม่");
      const existing = await db().prepare("SELECT * FROM purchase_orders WHERE owner_id=? AND client_id=?").bind(user.id,input.clientId).first<Order>();
      if (existing) return reply(await orderView(existing));
      const { settings: config } = await settings();
      if (!config.enabled || !configured(config)) throw new RequestError(503, "ร้านค้ายังไม่พร้อมรับชำระเงิน กรุณาลองใหม่ภายหลัง");
      const item = await db().prepare("SELECT * FROM shop_products WHERE id=? AND enabled=1 AND deleted_at IS NULL").bind(input.productId).first<ProductRow>();
      if (!item) throw new RequestError(404, "สินค้านี้ยังไม่เปิดขาย");
      const payment: PaymentConfig = { ...config, branchId: vars().SLIPOK_BRANCH_ID };
      const id = crypto.randomUUID(), ends = now + config.orderMinutes * 60_000;
      await db().prepare(`INSERT INTO purchase_orders(id,owner_id,owner_name,client_id,product_id,product_name,price_satang,duration_kind,duration_amount,payment_config,created_at,expires_at,key_id)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM shop_products WHERE id=? AND updated_at=? AND enabled=1 AND deleted_at IS NULL)
        AND(SELECT count(*) FROM purchase_orders WHERE owner_id=? AND status!='paid' AND expires_at>?)<5 ON CONFLICT(owner_id,client_id)DO NOTHING`)
        .bind(id,user.id,user.name.slice(0,120),input.clientId,item.id,item.name,item.price_satang,item.duration_kind,item.duration_amount,JSON.stringify(payment),now,ends,crypto.randomUUID(),item.id,item.updated_at,user.id,now).run();
      const row = await db().prepare("SELECT * FROM purchase_orders WHERE owner_id=? AND client_id=?").bind(user.id,input.clientId).first<Order>();
      if (!row) throw new RequestError(409, "มีคำสั่งซื้อรอชำระมากเกินไป หรือสินค้าเปลี่ยนแปลง กรุณารีเฟรช");
      return reply(await orderView(row), 201);
    }
    if (path[1] === "orders" && path.length >= 3) {
      const order = await getOrder(path[2], user.id);
      if (path.length === 3 && req.method === "GET") return reply(await orderView(order));
      if (path.length === 4 && path[3] === "verify" && req.method === "POST") {
        await deps.rate(req,"shop-verify:" + await hash(user.id),6);
        return await verifyOrder(req, order);
      }
    }
    throw new RequestError(404, "ไม่พบรายการที่ต้องการ");
  } catch (error) {
    if (error instanceof SlipError) return reply({ error: error.message, code: error.code, retryAfter: error.retryAfter }, error.status,
      error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
    throw error;
  }
}
