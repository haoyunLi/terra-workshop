import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runProgressChecks} from './progress.integration.mjs';
import {runResidentChecks} from './residents.integration.mjs';
import {runStorageChecks} from './storage.integration.mjs';
const require=createRequire(import.meta.url),{LiveClient}=require('../electron/connection.cjs');
const root=process.cwd(),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,message){for(let i=0;i<150;i++){const value=await check();if(value)return value;await delay(100);}throw Error(message);}
for(const multiplayer of [false,true]){
  const base=path.join(root,'.work',multiplayer?'qol-mp':'qol-single'),game=path.join(base,'game');
  await fs.mkdir(path.join(game,'Content'),{recursive:true});
  for(const name of ['Terraria.exe','TerrariaServer.exe'])await fs.copyFile(path.join(root,'.work/tests/game/Terraria.exe'),path.join(game,name));
  await fs.writeFile(path.join(game,'Content/PixelShader.xnb'),Buffer.from([1,3,3,7]));
  const control=path.join(game,multiplayer?'server-fixture-control.txt':'fixture-control.txt');
  await fs.rm(control,{force:true});
  const live=new LiveClient({getPath:()=>path.join(base,'app-data'),getAppPath:()=>root},{showOpenDialog:async()=>({canceled:true})},null);
  await live.load();live.settings.gameFolder=game;await live.persist();let serverPid;
  const envNames=['TERRA_WORKSHOP_TEST_MULTIPLAYER','TERRA_WORKSHOP_TEST_HOST'],previous=envNames.map(k=>process.env[k]);
  try{
    for(const key of envNames)process.env[key]=multiplayer?'1':'0';
    await live.launch();
  }finally{envNames.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
  try{
    const state=await until(async()=>{const s=await live.status();return s.connected&&s.inWorld&&(!multiplayer||s.serverConnected)?s:null;},'QoL bridge did not connect');
    assert.equal(state.bridgeVersion,'2.3.0');assert.equal(state.worldControl,true);
    if(multiplayer){serverPid=Number((await fs.readFile(path.join(game,'server-process.txt'),'utf8')).split('|')[0]);assert.equal(state.netMode,1);}
    async function fixture(action,check=async()=>true,options={}){
      const controls=multiplayer&&options.both?[path.join(game,'fixture-control.txt'),control]:[control];
      for(const target of controls){const pending=target+'.pending';await fs.writeFile(pending,action);await fs.rename(pending,target);}
      await until(async()=>{for(const target of controls){try{await fs.access(target);return false;}catch{}}return true;},'Fixture action not consumed: '+action);
      await until(async()=>check(await live.status()),'Fixture state not observed: '+action);
    }
    await runProgressChecks(live,fixture);
    await runResidentChecks(live,fixture);
    await runStorageChecks(live,fixture);
    console.log(JSON.stringify({passed:true,environment:'Compiled C# bridge with simulated '+(multiplayer?'own-host multiplayer':'single-player'),checks:['world progress and shared flags','NPC arrival conditions and explicit uncertainty','personal and world storage search','bounded pagination and world guards',...(multiplayer?['server-authoritative progress, conditions and chests']:[])]}));
  }finally{
    if(multiplayer&&!serverPid){try{serverPid=Number((await fs.readFile(path.join(game,'server-process.txt'),'utf8')).split('|')[0]);}catch{}}
    if(serverPid)try{process.kill(serverPid);}catch{}
    if(live.child?.pid)live.child.kill();await delay(150);
  }
}
