import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{LiveClient}=require('../electron/connection.cjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),userdata=path.resolve(root,'.work/tests/app-data');
const app={getPath:()=>userdata,getAppPath:()=>root};
const client=new LiveClient(app,{showOpenDialog:async()=>({canceled:true})},null);
await client.load();client.settings.gameFolder=path.resolve(root,'.work/tests/game');await client.persist();
const started=await client.launch();console.log(started.message);
if(client.child)await fs.writeFile(path.resolve(root,'.work/tests/launcher-pid.txt'),String(client.child.pid||''));
try{
let status;for(let n=0;n<80;n++){status=await client.status();if(status.connected)break;await new Promise(r=>setTimeout(r,150));}
assert.equal(status.connected,true,status.message);assert.equal(status.protocol,'terra-workshop-live/1');assert.ok(status.player.name.includes('模拟'));
const command=async(action,args={})=>client.command(action,args);
let r=await command('give',{type:4956,stack:9999,prefix:81,group:'inventory'});
assert.ok(r.state.player.groups.inventory.some(i=>i.id===4956&&i.stack===9999&&i.prefix===81));
r=await command('setSlot',{group:'inventory',slot:3,type:4956,stack:12345,prefix:81,favorite:true});
assert.equal(r.state.player.groups.inventory[3].stack,12345);assert.equal(r.state.player.groups.inventory[3].favorite,true);
r=await command('undoInventory');assert.equal(r.state.player.groups.inventory[3].stack,9999);
r=await command('removeItem',{type:4956});assert.ok(!r.state.player.groups.inventory.some(i=>i.id===4956));
r=await command('ability',{key:'godMode',enabled:true});assert.equal(r.state.abilities.godMode,true);
r=await command('maxStats');assert.equal(r.state.player.stats.maxLife,500);assert.equal(r.state.player.stats.maxMana,200);
r=await command('time',{value:'midnight'});assert.equal(r.state.world.day,false);assert.equal(r.state.world.time,16200);
r=await command('spawnNpc',{type:17});const merchant=r.state.npcs.find(n=>n.type===17);assert.ok(merchant);assert.equal(merchant.homeless,true);
await assert.rejects(command('spawnNpc',{type:17}),/已经在世界/);
await assert.rejects(command('houseNpc',{index:merchant.index,x:200,y:200}),/不是适合/);
r=await command('houseNpc',{index:merchant.index,x:100,y:100});assert.equal(r.state.npcs.find(n=>n.type===17).homeless,false);
r=await command('moveNpc',{index:merchant.index});assert.ok(r.state.npcs.find(n=>n.type===17).x>=100);
await assert.rejects(command('give',{type:90000,stack:1}),/范围/);await assert.rejects(command('give',{type:4956,stack:-1}),/范围/);
await assert.rejects(client.request('eval',{code:'arbitrary'}),/不支持/);
const denied=await new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:client.settings.port,path:'/status',headers:{Origin:'https://example.com'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(denied,403);
console.log(JSON.stringify({passed:true,environment:'Compiled C# bridge + launcher + simulated Terraria API fixture',checks:['authenticated loopback connection','real command dispatch','give 9999 legendary Zenith','edit slot and undo','remove all matching items','ability toggles','health and mana','world time','NPC spawn with duplicate prevention','invalid housing rejected','valid housing assigned','move resident','invalid IDs/counts rejected','arbitrary commands rejected','browser-origin requests rejected'],gameVersion:status.gameVersion},null,2));

}finally{if(client.child?.pid)client.child.kill();}
