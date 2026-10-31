import {access,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const run=promisify(execFile);
export async function generateLua(config,input,signal,send=fetch){
  let response;
  try{response=await send(config.website+'/api/bot/scripts/generate',{method:'POST',redirect:'error',signal,
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.apiSecret},body:JSON.stringify(input)});}
  catch(error){if(signal?.aborted)throw new Error('Script generation timed out or was cancelled. Please try again.');throw new Error('The generator could not be reached. Please try again later.');}
  let data;try{data=await response.json();}catch{throw new Error('The generator returned an invalid response. Please try again later.');}
  if(!response.ok||data?.ok!==true)throw new Error(typeof data?.error==='string'?data.error.slice(0,250):'Script generation is unavailable.');
  for(const key of['name','placement','notes','code','refusal'])if(typeof data[key]!=='string')throw new Error('The generator returned an incomplete script. Please try a smaller request.');
  if(data.code.length>64_000||data.name.length>96||data.placement.length>500||data.notes.length>700||data.refusal.length>700)throw new Error('The generated script is too large. Please request a smaller system.');
  return data;
}
export async function checkLua(code,compiler=process.env.LUAU_COMPILER_PATH||fileURLToPath(new URL('../../../luau-tools/'+(process.platform==='win32'?'luau-compile.exe':'luau-compile'),import.meta.url))){
  try{await access(compiler);}catch{return{checked:false,valid:true};}
  const directory=await mkdtemp(join(tmpdir(),'devil-lua-'));
  try{
    const target=join(directory,'generated.luau');await writeFile(target,code,'utf8');
    // Compile only. Generated code is never run and never interpolated into a shell.
    try{await run(compiler,['--null',target],{windowsHide:true,timeout:5000,maxBuffer:64*1024});return{checked:true,valid:true};}
    catch{return{checked:true,valid:false};}
  }finally{await rm(directory,{recursive:true,force:true});}
}
