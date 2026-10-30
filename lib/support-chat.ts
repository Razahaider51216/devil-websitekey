import { env } from "cloudflare:workers";
import { and, eq, gt, lt, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { supportMessages as messages, supportThreads as threads } from "../db/schema";
import { discordUser, requireDiscordAdmin } from "./discord-auth";
import { discordMedia } from "./discord-domain";
import { googleUser } from "./google-auth";
import { hash } from "./domain";
import { readJson, requireOrigin, RequestError } from "./security";

const MAX_IMAGE = 4 * 1024 * 1024, MAX_BODY = MAX_IMAGE + 32_768;
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
type Rate = (req: Request, kind: string, maximum: number) => Promise<void>;
function fail(code: number, message: string): never { throw new RequestError(code, message); }
function store() { return (env as unknown as { SCRIPT_FILES?: R2Bucket }).SCRIPT_FILES || fail(503, "Image storage unavailable"); }
async function member(req: Request) {
  const user = await discordUser(req) || await googleUser(req);
  if (!user) fail(401, "Please sign in with Google or Discord first");
  return user;
}
function idValue(value: string) { if (!/^[a-f0-9]{64}$/.test(value)) fail(404, "Conversation not found");return value; }
function messageView(row: typeof messages.$inferSelect, thread: typeof threads.$inferSelect) {
  return { id: row.id, role: row.role, text: row.text, createdAt: row.createdAt,
    author: { name: row.authorName || (row.role === "user" ? thread.ownerName : "DEVIL HUB"),
      avatarUrl: row.authorAvatar || (row.role === "user" ? thread.ownerAvatar : null),
      provider: row.authorProvider || (row.role === "user" ? thread.ownerProvider : null) },
    imageUrl: row.imageKey ? `/api/support/images/${row.id}` : null };
}
function threadView(row: typeof threads.$inferSelect, admin: boolean) {
  return { id: row.id, name: row.ownerName, updatedAt: row.updatedAt, preview: row.preview,
    avatarUrl: row.ownerAvatar, provider: row.ownerProvider,
    unread: admin ? row.lastUserId > row.adminReadId : row.lastAdminId > row.userReadId };
}
export async function chatInput(req: Request) {
  if (!/^multipart\/form-data;\s*boundary=/i.test(req.headers.get("content-type") || "")) fail(415, "Send a message or image");
  if (Number(req.headers.get("content-length")) > MAX_BODY) fail(413, "Image exceeds 4 MiB");
  const reader = req.body?.getReader();if (!reader) fail(400, "Message is empty");
  const chunks: Uint8Array[] = [];let size = 0, timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    reject(new RequestError(408, "Upload timed out"));void reader.cancel().catch(() => {});
  }, 20_000); });
  try {
    while (true) {
      const item = await Promise.race([reader.read(), timeout]);if (item.done) break;
      size += item.value.byteLength;if (size > MAX_BODY) { void reader.cancel().catch(() => {});fail(413, "Image exceeds 4 MiB"); }
      chunks.push(item.value);
    }
  } finally { clearTimeout(timer!);reader.releaseLock(); }
  const data = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { data.set(chunk, offset);offset += chunk.length; }
  let form: FormData;try { form = await new Response(data, { headers: { "Content-Type": req.headers.get("content-type")! } }).formData(); }
  catch { fail(400, "Invalid message upload"); }
  const value = form.get("text"), clientId = form.get("clientId"), file = form.get("image");
  if (value !== null && typeof value !== "string") fail(400, "Invalid message");
  const text = (value || "").trim();if (text.length > 2000) fail(400, "Message exceeds 2000 characters");
  if (typeof clientId !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(clientId)) fail(400, "Invalid message ID");
  let image: { bytes: Uint8Array; type: string } | null = null;
  if (file !== null) {
    if (typeof file === "string" || !file.size) fail(400, "Image is empty");
    if (file.size > MAX_IMAGE) fail(413, "Image exceeds 4 MiB");
    const bytes = new Uint8Array(await file.arrayBuffer()), type = file.type;
    const png = type === "image/png" && bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
    const jpeg = type === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
    const webp = type === "image/webp" && bytes.length >= 20 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
    if (!png && !jpeg && !webp) fail(415, "Use a PNG, JPEG or WebP image");
    image = { bytes, type };
  }
  if (!text && !image) fail(400, "Message is empty");
  return { text, clientId, image };
}
export async function handleSupport(req: Request, path: string[], rate: Rate) {
  const admin = path[0] === "admin";
  const user = admin ? await requireDiscordAdmin(req) : await member(req);
  const ownerId = `${user.provider}:${user.id}`;
  const profile = { name:user.name.slice(0,120), provider:user.provider,
    avatarUrl:user.provider === "discord" ? discordMedia(user.id,user.avatar,user.decoration,user.discriminator).avatarUrl : user.avatarUrl || null };
  await rate(req, "support-read:" + await hash(ownerId), 90);
  const db = getDb(), route = path.join("/"), url = new URL(req.url);
  if (route === "admin/support/threads" && req.method === "GET") {
    const before = Number(url.searchParams.get("before"));
    const rows = await db.select().from(threads).where(and(gt(threads.lastMessageId, 0),
      before > 0 ? lt(threads.lastMessageId, before) : undefined)).orderBy(desc(threads.lastMessageId)).limit(51);
    return reply({ threads: rows.slice(0,50).map(row => threadView(row,true)), next: rows.length > 50 ? rows[49].lastMessageId : null });
  }
  if (path[1] === "images" && !admin && req.method === "GET") {
    const id = Number(path[2]);if (!Number.isSafeInteger(id) || id < 1) fail(404, "Image not found");
    const message = await db.select().from(messages).where(eq(messages.id, id)).get();
    if (!message?.imageKey) fail(404, "Image not found");
    const thread = await db.select().from(threads).where(eq(threads.id, message.threadId)).get();
    if (!thread) fail(404, "Image not found");
    if (thread.ownerId !== ownerId) await requireDiscordAdmin(req);
    const object = await store().get(message.imageKey);if (!object) fail(404, "Image not found");
    return new Response(object.body, { headers: { "Content-Type": message.imageType!, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=support-image", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  }
  if (!admin && !["support/thread","support/read"].includes(route) || admin && !/^admin\/support\/threads\/[a-f0-9]{64}(\/read)?$/.test(route)) fail(404,"Conversation not found");
  const id = admin ? idValue(path[3] || "") : await hash("support:" + ownerId);
  let thread = await db.select().from(threads).where(eq(threads.id, id)).get();
  if (admin && !thread) fail(404, "Conversation not found");
  if (!admin && thread && (thread.ownerName !== profile.name || thread.ownerAvatar !== profile.avatarUrl || thread.ownerProvider !== profile.provider)) {
    const fields = { ownerName:profile.name,ownerAvatar:profile.avatarUrl,ownerProvider:profile.provider };
    await db.update(threads).set(fields).where(eq(threads.id,id));thread = { ...thread,...fields };
  }
  const read = admin ? path[4] === "read" : path[1] === "read";
  if (req.method === "POST") {
    requireOrigin(req);
    if (read) {
      const input = await readJson(req);if (!Number.isSafeInteger(input.through) || Number(input.through) < 0) fail(400, "Invalid read position");
      if (thread) {
        const through = Math.min(Number(input.through), thread.lastMessageId);
        await db.update(threads).set(admin ? { adminReadId: sql`max(${threads.adminReadId}, ${through})` } : { userReadId: sql`max(${threads.userReadId}, ${through})` }).where(eq(threads.id,id));
      }
      return reply({ ok:true });
    }
    await rate(req, "support-send:" + await hash(ownerId), 10);
    const input = await chatInput(req);
    if (!thread) {
      await db.insert(threads).values({ id, ownerId, ownerName:profile.name,ownerAvatar:profile.avatarUrl,ownerProvider:profile.provider, updatedAt:Date.now() }).onConflictDoNothing();
      thread = await db.select().from(threads).where(eq(threads.id,id)).get();
    }
    if (!thread) fail(503,"Conversation unavailable");
    const identity = and(eq(messages.threadId,id),eq(messages.authorId,ownerId),eq(messages.clientId,input.clientId));
    let row = await db.select().from(messages).where(identity).get();
    if (!row) {
      const key = input.image ? `support/${id}/${crypto.randomUUID()}` : null;
      if (key) await store().put(key,input.image!.bytes,{ httpMetadata:{ contentType:input.image!.type } });
      row = await db.insert(messages).values({ threadId:id, authorId:ownerId, clientId:input.clientId, role:admin?"admin":"user",
        authorName:profile.name,authorAvatar:profile.avatarUrl,authorProvider:profile.provider,
        text:input.text, imageKey:key, imageType:input.image?.type, imageBytes:input.image?.bytes.length, createdAt:Date.now() }).onConflictDoNothing().returning().get();
      if (!row) { if (key) await store().delete(key);row = await db.select().from(messages).where(identity).get(); }
    }
    if (!row) fail(503,"Message could not be saved");
    await db.update(threads).set({ updatedAt:sql`max(${threads.updatedAt}, ${row.createdAt})`,
      lastMessageId:sql`max(${threads.lastMessageId}, ${row.id})`,
      preview:sql`CASE WHEN ${threads.lastMessageId} <= ${row.id} THEN ${(row.text || "Image").slice(0,160)} ELSE ${threads.preview} END`,
      ...(admin ? { lastAdminId:sql`max(${threads.lastAdminId}, ${row.id})` } : { lastUserId:sql`max(${threads.lastUserId}, ${row.id})` }),
    }).where(eq(threads.id,id));
    return reply({ message:messageView(row,thread) });
  }
  if (req.method !== "GET" || read) fail(405,"Method not allowed");
  const after = Number(url.searchParams.get("after") || 0);
  const before = Number(url.searchParams.get("before") || 0);
  if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(before) || before < 0 || after && before) fail(400,"Invalid message cursor");
  const rows = thread ? await db.select().from(messages).where(and(eq(messages.threadId,id),after ? gt(messages.id,after) : undefined,before ? lt(messages.id,before) : undefined))
    .orderBy(after ? asc(messages.id) : desc(messages.id)).limit(51) : [];
  const page = rows.slice(0,50);if (!after) page.reverse();
  return reply({ thread:thread ? threadView(thread,admin) : null,messages:page.map(row => messageView(row,thread!)),hasMore:after>0 && rows.length>50,hasOlder:!after && rows.length>50 });
}
