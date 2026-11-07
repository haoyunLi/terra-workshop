import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{LiveClient}=require('../electron/connection.cjs');
const root=process.cwd(),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,message){for(let i=0;i<80;i++){const value=await check();if(value)return value;await delay(100);}throw Error(message);}
for(const multiplayer of[false,true]){
 const base=path.join(root,'.work',multiplayer?'adventure-mp':'adventure-single'),game=path.join(base,'game');await fs.mkdir(path.join(game,'Content'),{recursive:true});for(const name of['Terraria.exe','TerrariaServer.exe'])await fs.copyFile(path.join(root,'.work/tests/game/Terraria.exe'),path.join(game,name));await fs.writeFile(path.join(game,'Content/PixelShader.xnb'),Buffer.from([1,3,3,7]));
 const live=new LiveClient({getPath:()=>path.join(base,'app-data'),getAppPath:()=>root},{showOpenDialog:async()=>({canceled:true})},null);await live.load();live.settings.gameFolder=game;await live.persist();let serverPid;
 const previousMode=process.env.TERRA_WORKSHOP_TEST_MULTIPLAYER,previousHost=process.env.TERRA_WORKSHOP_TEST_HOST;process.env.TERRA_WORKSHOP_TEST_MULTIPLAYER=multiplayer?'1':'0';process.env.TERRA_WORKSHOP_TEST_HOST=multiplayer?'1':'0';await live.launch();if(previousMode===undefined)delete process.env.TERRA_WORKSHOP_TEST_MULTIPLAYER;else process.env.TERRA_WORKSHOP_TEST_MULTIPLAYER=previousMode;if(previousHost===undefined)delete process.env.TERRA_WORKSHOP_TEST_HOST;else process.env.TERRA_WORKSHOP_TEST_HOST=previousHost;
 try{
  const state=await until(async()=>{const s=await live.status();return s.connected&&s.inWorld&&(!multiplayer||s.serverConnected)?s:null;},'Bridge did not connect');assert.equal(state.bridgeVersion,'2.1.0');assert.equal(state.worldControl,true);assert.equal(state.bossCatalog.length,18);
  if(multiplayer){assert.equal(state.netMode,1);const spawned=(await fs.readFile(path.join(game,'server-process.txt'),'utf8')).split('|');serverPid=Number(spawned[0]);assert.equal(path.basename(spawned[1]),'WorkshopServerLauncher.exe');assert.ok(state.saves.player.path.endsWith('.plr'));assert.ok(state.saves.world.path.endsWith('.wld'));}
  let r=await live.command('spawnBoss',{key:'eye',prepareTime:true});assert.equal(r.state.world.day,false);assert.ok(r.state.bosses.some(b=>b.type===4));await assert.rejects(live.command('spawnBoss',{key:'eye',prepareTime:true}),/已有首领/);if(multiplayer){assert.equal((await live.request('state')).state.bosses.length,0);assert.ok((await live.request('state',{actor:0},'server')).state.bosses.length>0);}
  await fs.writeFile(path.join(game,multiplayer?'server-fixture-control.txt':'fixture-control.txt'),'clearBosses');await until(async()=>(await live.status()).bosses.length===0,'Boss fixture did not clear');
  for(const key of['twins','wall','moonLord']){r=await live.command('spawnBoss',{key,prepareTime:true});assert.ok(r.state.bosses.length>0);if(key==='twins'){assert.ok(r.state.bosses.some(x=>x.type===125));assert.ok(r.state.bosses.some(x=>x.type===126));}await fs.writeFile(path.join(game,multiplayer?'server-fixture-control.txt':'fixture-control.txt'),'clearBosses');await until(async()=>(await live.status()).bosses.length===0,'Special boss did not clear');}
  for(const key of['bloodMoon','eclipse','goblins','snowLegion','pirates','martians','pumpkin','frost','slimeRain']){r=await live.command('event',{key});const invasions={goblins:1,snowLegion:2,pirates:3,martians:4};if(invasions[key])assert.equal(r.state.events.invasion,invasions[key]);else assert.equal(r.state.events[key],true);await assert.rejects(live.command('event',{key:'bloodMoon'}),/已有事件/);r=await live.command('event',{key:'stop'});assert.equal(r.state.events.invasion,0);assert.equal(r.state.events.bloodMoon,false);assert.equal(r.state.events.pumpkin,false);}
  await assert.rejects(live.command('spawnBoss',{key:'no-such-boss'}),/未知/);await assert.rejects(live.command('event',{key:'no-such-event'}),/未知/);
  assert.equal(state.capabilities.lunarEvents,true);
  assert.deepEqual(state.events.lunar.pillars.map(p=>p.key),['solar','vortex','nebula','stardust']);
  const fixtureControl=path.join(game,multiplayer?'server-fixture-control.txt':'fixture-control.txt');
  async function fixture(action,check){await fs.writeFile(fixtureControl,action);await until(check,'Lunar fixture change not observed: '+action);}
  await fixture('normalMode',async()=>!(await live.status()).world.hardmode);
  await assert.rejects(live.command('event',{key:'lunar'}),/困难模式/);
  await fixture('hardmode',async()=>(await live.status()).world.hardmode);
  await live.command('event',{key:'goblins'});
  await assert.rejects(live.command('event',{key:'lunar'}),/已有事件/);
  await live.command('event',{key:'stop'});
  await live.command('spawnBoss',{key:'eye',prepareTime:true});
  await assert.rejects(live.command('event',{key:'lunar'}),/已有首领/);
  await fixture('clearBosses',async()=>(await live.status()).bosses.length===0);
  for(const control of ['fillNpcSlots','protectNpcSlots']) {
    await fixture(control,async()=>{try{await fs.access(fixtureControl);return false;}catch{return true;}});
    await assert.rejects(live.command('event',{key:'lunar'}),/足够位置/);
    assert.equal((await live.status()).events.lunar.active,false);
    await fixture('clearNpcSlots',async()=>{try{await fs.access(fixtureControl);return false;}catch{return true;}});
  }
  r=await live.command('event',{key:'lunar'});
  assert.equal(r.state.events.lunar.active,true);
  assert.ok(r.state.events.lunar.pillars.every(p=>p.active&&p.shield===100&&p.maxShield===100&&p.life===20000&&p.maxLife===20000));
  assert.deepEqual(r.state.events.lunar.pillars.map(p=>p.type),[517,422,507,493]);
  assert.ok(r.state.events.lunar.pillars.every(p=>p.x>0&&p.y>0&&!p.defeated));
  await assert.rejects(live.command('event',{key:'lunar'}),/天界事件/);
  await assert.rejects(live.command('event',{key:'bloodMoon'}),/已有事件/);
  await assert.rejects(live.command('spawnBoss',{key:'moonLord'}),/天界事件正在进行/);
  r=await live.command('event',{key:'stop'});
  assert.ok(r.state.events.lunar.pillars.every(p=>p.active&&p.shield===100));
  if(multiplayer){assert.equal((await live.request('state')).state.events.lunar.active,false);assert.equal((await live.request('state',{actor:0},'server')).state.events.lunar.active,true);}
  await fixture('lunarDamageSolar',async()=>(await live.status()).events.lunar.pillars[0].shield===0);
  assert.equal((await live.status()).events.lunar.pillars[0].life,12345);
  await fixture('lunarDefeatSolar',async()=>(await live.status()).events.lunar.pillars[0].defeated);
  assert.equal((await live.status()).events.lunar.pillars[0].active,false);
  await fixture('lunarCountdown',async()=>(await live.status()).events.lunar.countdown===60);
  assert.ok((await live.status()).events.lunar.pillars.every(p=>!p.active&&p.defeated));
  await assert.rejects(live.command('event',{key:'lunar'}),/倒计时/);
  await fixture('lunarComplete',async()=>!(await live.status()).events.lunar.active);
  r=await live.command('event',{key:'lunar'});
  assert.ok(r.state.events.lunar.pillars.every(p=>p.active&&!p.defeated&&p.shield===50&&p.maxShield===50));
  await fixture('lunarCountdown',async()=>(await live.status()).events.lunar.countdown===60);
  await fixture('lunarComplete',async()=>!(await live.status()).events.lunar.active);
  const inventory=(await live.status()).player.groups;await assert.rejects(live.command('giveBatch',{items:[{type:8,stack:10},{type:99999,stack:1}]}),/范围/);assert.deepEqual((await live.status()).player.groups,inventory);
  r=await live.command('giveBatch',{items:[{type:28,stack:3},{type:40,stack:4}]});assert.ok(r.state.player.groups.inventory.some(i=>i.id===28&&i.stack===3));r=await live.command('refill',{stack:999});assert.ok(r.state.player.groups.inventory.some(i=>i.id===28&&i.stack===999));assert.ok(r.state.player.groups.inventory.some(i=>i.id===40&&i.stack===999));if(multiplayer){await assert.rejects(live.command('setSlot',{group:'inventory',slot:0,type:8,stack:12345}),/多人/);assert.match(await fs.readFile(path.join(game,'client-packets.log'),'utf8'),/^5\|/m);}
  r=await live.command('teleport',{x:200,y:210,worldId:state.world.id});assert.equal(r.state.player.x,200);assert.equal(r.state.player.y,210);await assert.rejects(live.command('teleport',{x:200,y:210,worldId:123}),/另一个世界/);await assert.rejects(live.command('teleport',{x:1950,y:210,worldId:state.world.id}),/实心/);r=await live.command('teleport',{destination:'death'});assert.equal(r.state.player.x,150);
  await live.command('spawnControl',{rate:2,max:2,paused:false});const spawnFile=path.join(game,multiplayer?'server-natural-spawns.txt':'natural-spawns.txt');await until(async()=>{try{return(await fs.readFile(spawnFile,'utf8')).endsWith('|300|10');}catch{return false;}},'Spawn multiplier not applied');await live.command('spawnControl',{rate:2,max:2,paused:true});await delay(80);const paused=await fs.readFile(spawnFile,'utf8');await delay(120);assert.equal(await fs.readFile(spawnFile,'utf8'),paused);await live.command('spawnControl',{rate:1,max:1,paused:false});
  const config=await live.profile.load();config.presets=[{id:'test-kit',name:'测试预设',items:[{type:8,stack:10,prefix:0,group:'inventory'}]}];config.quick=[{id:'test-quick',name:'测试快捷',action:'preset',args:{id:'test-kit'}}];await live.profile.save(config);await live.runQuick('test-quick');assert.ok((await live.status()).player.groups.inventory.some(i=>i.id===8&&i.stack===10));
  const backup=await live.backupCreate('集成验证备份');assert.equal(backup.files.length,2);await assert.rejects(live.backupRestore(backup.id),/退出/);config.autoBackup=true;await live.profile.save(config);const count=(await live.backups.list()).length;await live.command('event',{key:'bloodMoon'});assert.equal((await live.backups.list()).length,count+1);await live.command('event',{key:'stop'});
  if(multiplayer){const packets=await fs.readFile(path.join(game,'server-packets.log'),'utf8');assert.match(packets,/^7\|/m);assert.match(packets,/^78\|/m);assert.match(packets,/^101\|/m);}
  console.log(JSON.stringify({passed:true,environment:'Compiled launcher and C# bridge with simulated '+(multiplayer?'host/client processes':'single-player API'),checks:['18 boss definitions and duplicate guard','9 ordinary events and native lunar event lifecycle','four pillars, shield and health progress','countdown and repeated lunar-event guard','server-authoritative lunar sync','atomic preset rollback','refill existing consumables','network item limits and slot packets','world-scoped and collision-checked teleport','natural spawn rates and pause patch','persistent quick presets','save-before-backup','restore refused while game runs','automatic challenge backup',...(multiplayer?['local-host process interception','server-authoritative boss and event state','merged player/world backup paths']:[])]}));
 }finally{if(multiplayer&&!serverPid){try{serverPid=Number((await fs.readFile(path.join(game,'server-process.txt'),'utf8')).split('|')[0]);}catch{}}if(serverPid)try{process.kill(serverPid);}catch{}if(live.child?.pid)live.child.kill();await delay(100);}
}
