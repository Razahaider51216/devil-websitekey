import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { siteSettings } from "../db/schema";
import { hash } from "./domain";
import { RequestError } from "./security";
import { knownMissionTitles,titleLanguage,type MissionTitles } from "./mission-titles";
type Translator={run:(model:string,input:{text:string;source_lang:string;target_lang:string})=>Promise<unknown>};
const pending=new Map<string,Promise<MissionTitles>>();
export async function translateMissionTitle(input:unknown):Promise<MissionTitles>{
  if(typeof input!=="string"||!input.trim()||input.length>160)throw new RequestError(400,"Enter a mission title up to 160 characters.");
  const title=input.trim(),known=knownMissionTitles(title);if(known)return known;
  const source=titleLanguage(title),id="mission-title:v1:"+await hash(source+":"+title);
  const cached=await getDb().select().from(siteSettings).where(eq(siteSettings.id,id)).get();
  if(cached){const pair=JSON.parse(cached.value) as MissionTitles;if(pair.titleTh&&pair.titleEn)return pair;}
  const existing=pending.get(id);if(existing)return existing;
  const task=(async()=>{
    const ai=(env as unknown as {AI?:Translator}).AI;
    if(!ai)throw new RequestError(503,"Automatic translation is unavailable. Enter the other language manually or retry.");
    let result:unknown;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{result=await Promise.race([ai.run("@cf/meta/m2m100-1.2b",{text:title,source_lang:source,target_lang:source==="th"?"en":"th"}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Translation timed out")),20000);})]);}
    catch{throw new RequestError(503,"Automatic translation is unavailable. Enter the other language manually or retry.");}
    finally{if(timer)clearTimeout(timer);}
    const translated=(result as {translated_text?:unknown})?.translated_text;
    if(typeof translated!=="string"||!translated.trim()||translated.trim().length>320)throw new RequestError(502,"Translation could not be completed. Enter the other language manually or retry.");
    const pair=source==="th"?{titleTh:title,titleEn:translated.trim()}:{titleTh:translated.trim(),titleEn:title};
    await getDb().insert(siteSettings).values({id,value:JSON.stringify(pair),updatedAt:Date.now()}).onConflictDoNothing();return pair;
  })();
  pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
