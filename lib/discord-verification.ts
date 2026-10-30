import { env } from "cloudflare:workers";
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { getDb } from "../db";
import { discordVerifications as records } from "../db/schema";
import { hash } from "./domain";
import { botAuthorized } from "./discord-hwid-reset";
import { discordUser } from "./discord-auth";
import { readJson, RequestError, requireOrigin } from "./security";
import { verifyTurnstile } from "./turnstile";

const vars = () => env as unknown as Record<string,string>;
const snowflake = /^\d{17,22}$/;
const json = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
function fail(status:number,message:string):never { throw new RequestError(status,message); }
type Rate = (req:Request,kind:string,max:number)=>Promise<void>;
type Row = typeof records.$inferSelect;
function publicState(row:Row) {
  return { status: row.status === "pending" || row.status === "approved" ? (row.expiresAt <= Date.now() ? "expired" : row.status) : row.status,
    guildName:row.guildName,roleName:row.roleName,expiresAt:row.expiresAt,
    returnUrl:`https://discord.com/channels/${row.guildId}/${row.channelId}` };
}
export async function handleDiscordVerification(req:Request,route:string,rate:Rate) {
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const db=getDb(),v=vars(),now=Date.now();
  if(route.startsWith("bot/verify/")) {
    if(!await botAuthorized(req,v.DISCORD_BOT_API_SECRET||""))return json({error:"Unauthorized"},401);
    const input=await readJson(req);
    if(route==="bot/verify/start") {
      for(const field of ["userId","guildId","channelId","roleId","interactionId"])if(typeof input[field]!=="string"||!snowflake.test(input[field] as string))fail(400,"Invalid Discord identity");
      for(const field of ["guildName","roleName"])if(typeof input[field]!=="string"||!(input[field] as string).trim()||(input[field] as string).length>100)fail(400,"Invalid Discord display name");
      await rate(req,"discord-verify-start:"+input.userId,5);
      const ticket=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,"0")).join("");
      const row={id:await hash(ticket),interactionId:input.interactionId as string,userId:input.userId as string,guildId:input.guildId as string,channelId:input.channelId as string,
        roleId:input.roleId as string,roleName:(input.roleName as string).trim(),guildName:(input.guildName as string).trim(),createdAt:now,expiresAt:now+600_000};
      const created=await db.insert(records).values(row).onConflictDoNothing().returning({id:records.id}).get();
      if(!created)fail(409,"This interaction has already been processed");
      if(Math.random()<.05)await db.delete(records).where(lt(records.expiresAt,now-86_400_000));
      return json({id:row.id,ticket,expiresAt:row.expiresAt});
    }
    if(route==="bot/verify/poll") {
      if(!Array.isArray(input.ids)||input.ids.length>50||input.ids.some(id=>typeof id!=="string"||!/^\w{64}$/.test(id)))fail(400,"Invalid verification IDs");
      const rows=input.ids.length?await db.select().from(records).where(inArray(records.id,input.ids as string[])):[];
      return json({jobs:rows.map(row=>({id:row.id,userId:row.userId,guildId:row.guildId,roleId:row.roleId,...publicState(row)}))});
    }
    if(route==="bot/verify/finish") {
      if(typeof input.id!=="string"||!/^[a-f0-9]{64}$/.test(input.id)||typeof input.ok!=="boolean")fail(400,"Invalid verification result");
      const error=input.ok?null:"ROLE_ASSIGNMENT_FAILED";
      const eligible=input.ok?eq(records.status,"approved"):inArray(records.status,["pending","approved"]);
      await db.update(records).set({status:input.ok?"done":"failed",error,completedAt:now}).where(and(eq(records.id,input.id),eligible));
      const row=await db.select().from(records).where(eq(records.id,input.id)).get();
      if(!row)fail(404,"Verification not found");
      return json(publicState(row));
    }
    fail(404,"Not found");
  }
  requireOrigin(req);
  const input=await readJson(req);
  if(typeof input.ticket!=="string"||!/^[a-f0-9]{64}$/.test(input.ticket))fail(400,"Open your private verification link from Discord.");
  const user=await discordUser(req);if(!user)fail(401,"Sign in with Discord to continue.");
  const id=await hash(input.ticket);
  const row=await db.select().from(records).where(eq(records.id,id)).get();
  if(!row||row.userId!==user.id)fail(403,"This verification link belongs to a different Discord account or is invalid.");
  await rate(req,"discord-verify:"+user.id,90);
  const challenge=await hash("discord-verify:"+id);
  if(route==="discord-verify/session")return json({...publicState(row),user:{id:user.id,name:user.name},siteKey:v.TURNSTILE_SITE_KEY||"",challenge});
  if(route!=="discord-verify/confirm")fail(404,"Not found");
  if(row.expiresAt<=now)fail(410,"Your verification link expired. Press Verify in Discord to try again.");
  if(row.status!=="pending")return json(publicState(row));
  if(!v.TURNSTILE_SITE_KEY||!v.TURNSTILE_SECRET_KEY)fail(503,"Human verification is unavailable. Please contact an administrator.");
  let passed=false;
  try { passed=await verifyTurnstile(v.TURNSTILE_SECRET_KEY,input.token,new URL(req.url).hostname,challenge,fetch,"devil-discord-verify"); }
  catch { fail(503,"Human verification is temporarily unavailable. Please try again."); }
  if(!passed)fail(400,"Please complete the human verification again.");
  const approvedAt=Date.now();
  await db.update(records).set({status:"approved",approvedAt}).where(and(eq(records.id,id),eq(records.status,"pending"),gt(records.expiresAt,approvedAt)));
  const updated=await db.select().from(records).where(eq(records.id,id)).get();
  return json(publicState(updated!));
}
