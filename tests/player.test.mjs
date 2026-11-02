import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openPlayer,savePlayer,parsePlayer,encrypt,addItem,emptyItem,ownedCounts} from '../core/player.mjs';
import {readPlayerFile as independentReader} from '../vendor/player-reader/index.js';
const fixture=name=>fs.readFileSync(new URL(`../public/examples/${name}.plr`,import.meta.url));
const data=JSON.parse(fs.readFileSync(new URL('../public/data/game.json',import.meta.url)));
test('Real game fixtures: known inventory, storage, stats and byte-identical round trip',async()=>{
  const s=await openPlayer(fixture('journey'));
  assert.equal(s.player.version,326);assert.equal(s.player.name,'test_char_journey');assert.equal(s.player.stats.maxLife,140);
  assert.equal(s.player.groups.inventory[9].id,8);assert.equal(s.player.groups.inventory[9].stack,37);
  assert.equal(s.player.groups.inventory[49].id,2);assert.equal(s.player.groups.inventory[49].favorite,true);
  assert.equal(s.player.groups.piggyBank[0].id,9);assert.equal(s.player.groups.safe[0].id,2);
  assert.equal(s.player.groups.ammo[0].stack,123);assert.equal(s.player.research.Wood,30);
  for(const n of ['classic','journey']){const raw=fixture(n),a=await openPlayer(raw);assert.deepEqual(Buffer.from(await savePlayer(a,a.player)),raw);}
});
test('Edits survive encrypted export and an independent upstream reader',async()=>{
  const s=await openPlayer(fixture('journey')),p=structuredClone(s.player);
  p.name='星光·测试冒险者';p.stats.maxLife=p.stats.life=500;p.stats.maxMana=p.stats.mana=200;p.flags.demonHeart=true;
  addItem(p,'inventory',data.items[4955],9999,81);
  addItem(p,'piggyBank',data.items[10],19998);
  addItem(p,'voidVault',data.items[5455],9999,0);
  p.groups.safe[0]=emptyItem();p.groups.inventory[49].favorite=false;
  p.journey[5]=true;p.journey[14]=0;
  const bytes=await savePlayer(s,p),independent=await independentReader(bytes);
  assert.equal(independent.name,p.name);assert.equal(independent.maxLife,500);assert.equal(independent.maxMana,200);assert.equal(independent.upgrades.demonHeart,true);
  assert.ok(independent.inventory.some(i=>i.id===4956&&i.stack===9999&&i.prefix===81));
  assert.equal(independent.piggyBank.filter(i=>i.id===11).reduce((a,b)=>a+b.stack,0),19998);
  assert.ok(!independent.safe.some(i=>i.slot===0));
  assert.deepEqual((await openPlayer(bytes)).player,p);
});
test('Every item ID 1–6195 is written and independently read with the correct identity',async()=>{
  const s=await openPlayer(fixture('classic'));
  for(let start=1;start<=6195;start+=50){const p=structuredClone(s.player);p.groups.inventory=Array.from({length:50},(_,i)=>start+i<=6195?{id:start+i,stack:37,prefix:0,favorite:false}:emptyItem());const bytes=await savePlayer(s,p),parsed=await independentReader(bytes);for(const i of parsed.inventory){assert.equal(i.id,start+i.slot);assert.equal(i.stack,37);}}
});
test('Only the targeted bytes change for a fixed-length inventory edit',async()=>{
  const s=await openPlayer(fixture('classic')),p=structuredClone(s.player);p.groups.inventory[4]={id:4956,stack:1234,prefix:81,favorite:true};
  const result=await openPlayer(await savePlayer(s,p)),at=s.offsets.groups.inventory[4].at;
  assert.deepEqual(result.plain.subarray(0,at),s.plain.subarray(0,at));assert.deepEqual(result.plain.subarray(at+10),s.plain.subarray(at+10));
});
test('Complete research unlock survives independent parsing, with unknown tail bytes retained',async()=>{
  const s=await openPlayer(fixture('journey')),p=structuredClone(s.player);
  for(const i of data.items)if(!i.unobtainable)p.research[i.key]=i.research;
  const result=await savePlayer(s,p),check=await independentReader(result);
  assert.deepEqual(check.research,p.research);const reopened=await openPlayer(result);assert.deepEqual(reopened.plain.subarray(-13),s.plain.subarray(-13));
});
test('Adding to a full inventory fails atomically; oversize and invalid quantities are handled',async()=>{
  const s=await openPlayer(fixture('classic')),p=structuredClone(s.player);p.groups.inventory=Array.from({length:50},()=>({id:1,stack:9999,prefix:0,favorite:false}));
  const original=structuredClone(p);assert.throws(()=>addItem(p,'inventory',data.items[4955],10),/空间不足/);assert.deepEqual(p,original);
  for(const n of [0,-1,NaN,1.5,2147483648])assert.throws(()=>addItem(p,'inventory',data.items[0],n));
  p.groups.inventory[0]=emptyItem();addItem(p,'inventory',data.items[4955],2147483647,81,true);const b=await savePlayer(s,p),reopened=await openPlayer(b);assert.equal(new DataView(reopened.plain.buffer).getInt32(s.offsets.groups.inventory[0].at+4,true),2147483647);
});
test('Unknown, corrupt and incomplete files are rejected before editing',async()=>{
  await assert.rejects(openPlayer(new Uint8Array(0)));await assert.rejects(openPlayer(new Uint8Array(3)));
  const s=await openPlayer(fixture('classic')),newer=new Uint8Array(s.plain);new DataView(newer.buffer).setInt32(0,999,true);assert.throws(()=>parsePlayer(newer),/尚未支持/);
  const corrupt=new Uint8Array(s.plain);corrupt[4]=0;await assert.rejects(openPlayer(await encrypt(corrupt)),/文件类型不匹配/);
  await assert.rejects(openPlayer(await encrypt(s.plain.subarray(0,200))),/结构校验/);
});
test('Catalogue coverage: unique IDs, matching desktop identity, locally available icons and descriptions',()=>{
  assert.equal(data.items.length,6195);assert.equal(new Set(data.items.map(i=>i.id)).size,6195);
  for(let id=1;id<=6195;id++){const i=data.items[id-1];assert.equal(i.id,id);assert.ok(i.name&&i.description&&i.search);if(i.sprite)assert.ok(fs.existsSync(new URL(`../public/${data.sheets[i.sprite[0]].file}`,import.meta.url)));if(i.iconFile)assert.ok(fs.existsSync(new URL(`../public/${i.iconFile}`,import.meta.url)));}
  assert.equal(data.items.filter(i=>i.sprite||i.iconFile).length,6194);assert.equal(data.items[5035].key,'MusicBoxOWMoonLord');
});
