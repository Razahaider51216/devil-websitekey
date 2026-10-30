import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

// A loopback-only OS lock is released even if Windows force-stops the process.
// No tokens, files, HTTP routes or publicly reachable ports are involved.
export async function acquireBotLock(applicationId){
  const port=42000+createHash('sha256').update('DEVIL-HUB-BOT:'+applicationId).digest().readUInt16BE(0)%15000;
  const server=createServer(socket=>socket.destroy());
  await new Promise((resolve,reject)=>{
    server.once('error',error=>reject(new Error(error.code==='EADDRINUSE'?'Another bot process is already running for this application. Close it before starting a second copy.':'Could not acquire the bot process lock.')));
    server.listen({host:'127.0.0.1',port,exclusive:true},resolve);
  });
  return {close:()=>new Promise(resolve=>server.close(resolve))};
}
export function createInteractionGate(clock=Date.now){
  const seen=new Map();
  return id=>{
    if(!id)return true;
    const now=clock();for(const [key,deadline]of seen)if(deadline<=now)seen.delete(key);
    if(seen.has(id))return false;seen.set(id,now+900000);return true;
  };
}
