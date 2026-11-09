import { env } from "cloudflare:workers";
import { and, eq, gt, desc, asc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { scriptLogLinks as links, scriptLogSessions as sessions, scriptLogEvents as events } from "../db/schema";
import { discordUser } from "./discord-auth";
import { googleUser } from "./google-auth";
import { hash, keyFor } from "./domain";
import { readJson, requireOrigin, RequestError } from "./security";
import { imageAsset, logGames, logImageURL, parseLog } from "./script-log-domain";
type Rate = (req: Request, name: string, max: number) => Promise<void>;
const reply = (value: unknown, status = 200) => Response.json(value, {status, headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});
function fail(status: number, message: string): never { throw new RequestError(status,message); }
const secret = () => (env as unknown as { KEY_SECRET: string }).KEY_SECRET;
async function token(id: string) { return (await keyFor("script-log-ingest:"+id,secret())).replaceAll("-", "").slice(5).toLowerCase(); }
async function member(req: Request) {
  const user = await discordUser(req) || await googleUser(req);
  if (!user) fail(401,"Please sign in with Google or Discord to view your LOG.");
  return `${user.provider}:${user.id}`;
}
export async function handleScriptLogs(req: Request, path: string[], rate: Rate) {
  const db=getDb(), route=path.join("/"), url=new URL(req.url), now=Date.now();
  if (path[1]==="ingest") {
    if (req.method!=="POST" || path.length!==4) fail(404,"LOG endpoint not found");
    const [, , id, given]=path;
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{32}$/.test(given)) fail(403,"Invalid LOG link");
    await rate(req,"log-ingest:"+id,90);
    const link=await db.select().from(links).where(eq(links.linkId,id)).get();
    if (!link || link.tokenHash!==await hash(given)) fail(403,"LOG link expired. Copy the current link from your account.");
    let input: ReturnType<typeof parseLog>;
    try {input=parseLog(await readJson(req,48_000));} catch(e) { if(e instanceof RequestError)throw e;fail(400,(e as Error).message); }
    const sessionId=await hash(link.ownerId+":"+input.sessionId);
    const prior=await db.select({game:sessions.game}).from(sessions).where(eq(sessions.id,sessionId)).get();
    if (prior && prior.game!==input.game) fail(409,"Start a new LOG session when changing games");
    await db.batch([
      db.insert(sessions).values({id:sessionId,ownerId:link.ownerId,game:input.game,player:input.player,balance:input.balance,startedAt:now,lastSeenAt:now})
        .onConflictDoUpdate({target:sessions.id,set:{player:input.player,balance:input.balance,lastSeenAt:now}}),
      ...input.events.map(item=>db.insert(events).values({ownerId:link.ownerId,eventId:input.sessionId+":"+item.id,sessionId,game:input.game,
        player:input.player,item:JSON.stringify(item),balance:input.balance,createdAt:now}).onConflictDoNothing()),
    ]);
    if(input.events.length) await db.run(sql`DELETE FROM script_log_events WHERE owner_id=${link.ownerId} AND id < COALESCE((SELECT id FROM script_log_events WHERE owner_id=${link.ownerId} ORDER BY id DESC LIMIT 1 OFFSET 999),0)`);
    await db.run(sql`DELETE FROM script_log_sessions WHERE owner_id=${link.ownerId} AND last_seen_at < ${now-7*86400_000}`);
    return reply({ok:true,accepted:input.events.map(v=>v.id),serverNow:now});
  }
  const ownerId=await member(req);
  // Polling is read-only: do not spend a persistent D1 rate-limit write on
  // every live refresh/image. Mutations still have the ordinary request limit.
  if(req.method!=="GET")await rate(req,"log-manage:"+await hash(ownerId),20);
  if (route==="log/link" && req.method==="POST") {
    requireOrigin(req);const input=await readJson(req);const id=crypto.randomUUID();
    const values={ownerId,linkId:id,tokenHash:await hash(await token(id)),createdAt:now};
    if(input.rotate===true) await db.insert(links).values(values).onConflictDoUpdate({target:links.ownerId,set:values});
    else await db.insert(links).values(values).onConflictDoNothing({target:links.ownerId});
    const row=(await db.select().from(links).where(eq(links.ownerId,ownerId)).get())!;
    return reply({url:`${url.origin}/api/log/ingest/${row.linkId}/${await token(row.linkId)}`});
  }
  if(route==="log/image" && req.method==="GET") {
    let asset: string | null;try{asset=imageAsset(url.searchParams.get("asset"));}catch{fail(400,"Invalid Roblox image");}
    if(!asset)fail(400,"Image asset required");
    const response=await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${asset}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)fail(502,"Roblox image unavailable");
    const result=await response.json() as {data?:{imageUrl?:string;state?:string}[]};
    let image: string | null;try{image=logImageURL(result.data?.[0]?.imageUrl);}catch{image=null;}
    if(!image)fail(404,"Image not ready");
    return new Response(null,{status:302,headers:{Location:image,"Cache-Control":"private, max-age=3600","Referrer-Policy":"no-referrer"}});
  }
  if(route==="log" && req.method==="GET") {
    const after=Number(url.searchParams.get("after")||0);
    if(!Number.isSafeInteger(after)||after<0)fail(400,"Invalid log cursor");
    const rows=await db.select().from(events).where(and(eq(events.ownerId,ownerId),after?gt(events.id,after):undefined))
      .orderBy(after?asc(events.id):desc(events.id)).limit(101);
    const selected=rows.slice(0,100), list=after?selected:selected.reverse();
    const active=await db.select().from(sessions).where(eq(sessions.ownerId,ownerId)).orderBy(desc(sessions.lastSeenAt)).limit(30);
    return reply({events:list.map(row=>({...row,item:JSON.parse(row.item),ownerId:undefined,eventId:undefined})),
      sessions:active.map(row=>({id:row.id,game:row.game,player:row.player,balance:row.balance,startedAt:row.startedAt,lastSeenAt:row.lastSeenAt,online:now-row.lastSeenAt<45000})),
      cursor:list.length?list[list.length-1].id:after,hasMore:after>0&&rows.length>100,games:logGames,serverNow:now});
  }
  fail(404,"LOG endpoint not found");
}
