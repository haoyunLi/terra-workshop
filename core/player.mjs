// Binary format adapted from the MIT-licensed Terraria-Progress-Tracker player reader
// and Terraria-Plr-Editor. See THIRD_PARTY_NOTICES.txt. Unknown bytes are preserved.
const KEY = new TextEncoder().encode('h\0'+'3\0'+'y\0'+'_\0'+'g\0'+'U\0'+'y\0'+'Z\0');
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export const SUPPORTED=[269,270,271,272,273,274,275,276,277,278,279,315,316,317,318,319,325,326];
export const GROUPS={inventory:'主背包',coins:'钱币',ammo:'弹药',equipment:'装备与时装',dyes:'装备染料',misc:'宠物与坐骑',miscDyes:'宠物与坐骑染料',piggyBank:'猪猪存钱罐',safe:'保险箱',defendersForge:'护卫熔炉',voidVault:'虚空保险库',loadout0:'备用配装 1',loadout1:'备用配装 2',loadout2:'备用配装 3'};
class Reader{
  constructor(bytes){this.b=bytes;this.v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.p=0;}
  need(n){if(!Number.isInteger(n)||n<0||this.p+n>this.b.length)throw Error(`存档不完整（字节 ${this.p}）`);}
  skip(n){this.need(n);this.p+=n;}
  byte(){this.need(1);return this.b[this.p++];}
  bool(){const b=this.byte();if(b>1)throw Error(`布尔字段无效（字节 ${this.p-1}）`);return !!b;}
  int(){this.need(4);const v=this.v.getInt32(this.p,true);this.p+=4;return v;}
  short(){this.need(2);const v=this.v.getUint16(this.p,true);this.p+=2;return v;}
  str(){let n=0,shift=0;for(;;){if(shift>28)throw Error('字符串长度无效');let b=this.byte();n+=(b&127)*2**shift;if(!(b&128))break;shift+=7;}this.need(n);const s=decoder.decode(this.b.subarray(this.p,this.p+n));this.p+=n;return s;}
}
function encodedString(s){const b=encoder.encode(s),a=[];let n=b.length;while(n>=128){a.push((n&127)|128);n>>>=7;}a.push(n);return concat(new Uint8Array(a),b);}
function intBytes(v){const a=new Uint8Array(4);new DataView(a.buffer).setInt32(0,v,true);return a;}
function concat(...arrays){const b=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){b.set(a,p);p+=a.length;}return b;}
export async function decrypt(bytes){if(!bytes.length||bytes.length%16||bytes.length>10*1024*1024)throw Error('请选择完整的 .plr 角色存档（最大 10 MB），不要选择 .wld 或 .tplr。');try{const k=await crypto.subtle.importKey('raw',KEY,'AES-CBC',false,['decrypt']);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC',iv:KEY},k,bytes));}catch{throw Error('无法解密角色存档：文件可能损坏，或不是原版 .plr 文件。');}}
export async function encrypt(bytes){const k=await crypto.subtle.importKey('raw',KEY,'AES-CBC',false,['encrypt']);return new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv:KEY},k,bytes));}
export async function openPlayer(bytes){const plain=await decrypt(bytes);return parsePlayer(plain);}
export function parsePlayer(plain){
  const version=new DataView(plain.buffer,plain.byteOffset,plain.byteLength).getInt32(0,true);
  if(!SUPPORTED.includes(version))throw Error(`已识别存档版本 ${version}，此版尚未支持编辑。当前支持原版 1.4.4–1.4.4.9、1.4.5–1.4.5.8；未知版本会被拦截。`);
  // Earlier 1.4.5 builds have a conditional flag; accept only a fully validated layout.
  const candidates=version>=315&&version<325?[0,1]:[version>=325?1:0];
  let error;
  for(const extra of candidates){try{return parseLayout(plain,version,extra);}catch(e){error=e;}}
  throw Error(`存档结构校验未通过（版本 ${version}）：${error.message}。原文件未修改。`);
}
function parseLayout(plain,version,extra){
  const r=new Reader(plain),offsets={stats:{},flags:{},groups:{}};
  r.skip(4);const magic=decoder.decode(plain.subarray(4,11));r.skip(7);if(magic!=='relogic'||r.byte()!==3)throw Error('文件类型不匹配');r.skip(12);
  offsets.nameStart=r.p;const name=r.str();offsets.nameEnd=r.p;
  if(!name||name.length>100)throw Error('角色名称无效');
  offsets.stats.difficulty=r.p;const difficulty=r.byte();if(difficulty>3)throw Error('角色模式无效');
  r.need(8);const playTime=Number(r.v.getBigInt64(r.p,true))/1e7;r.skip(8);
  r.skip(5);if(version>=283)r.skip(1);r.skip(4);
  const player={version,name,difficulty,playTime,stats:{},flags:{},groups:{},buffs:[],research:{},journey:{}};
  const stat=n=>{offsets.stats[n]=r.p;player.stats[n]=r.int();};
  for(const n of ['life','maxLife','mana','maxMana']){stat(n);if(player.stats[n]<0||player.stats[n]>1000000)throw Error('生命或魔力字段无效');}
  const flag=n=>{offsets.flags[n]=r.p;player.flags[n]=r.bool();};
  for(const n of ['demonHeart','torchGod','biomeTorch','artisanBread','vitalCrystal','aegisFruit','arcaneCrystal','galaxyPearl','gummyWorm','ambrosia','dd2Downed'])flag(n);
  r.skip(extra);stat('taxMoney');stat('deathsPve');stat('deathsPvp');r.skip(21);
  function group(name,count,shape){
    const list=[],locations=[];
    for(let i=0;i<count;i++){
      const at=r.p,id=r.int();let stack=id?1:0;
      if(shape==='full'||shape==='bank')stack=r.int();
      const prefix=r.byte();let favorite=false;
      if(shape==='full')favorite=r.bool();
      if(shape==='equip'&&version>=325)r.skip(1);
      if(id<0||id>6195||stack<0||stack>2147483647||prefix>97)throw Error(`物品记录异常（${name}，槽位 ${i+1}，字节 ${at}）`);
      list.push({id,stack,prefix,favorite});locations.push({at,shape});
    }
    player.groups[name]=list;offsets.groups[name]=locations;
  }
  group('equipment',20,'equip');group('dyes',10,'equip');
  group('inventory',50,'full');group('coins',4,'full');group('ammo',4,'full');group('misc',10,'small');
  group('piggyBank',40,'bank');group('safe',40,'bank');group('defendersForge',40,'bank');group('voidVault',40,'full');r.skip(1);
  offsets.buffs=r.p;
  for(let i=0;i<44;i++){const id=r.int(),time=r.int();if(id<0||id>1000||time<0)throw Error('增益数据无效');player.buffs.push({id,time});}
  for(let i=0;;i++){if(i>200)throw Error('重生点数据无效');const x=r.int();if(x===-1)break;r.skip(8);r.str();}
  r.bool();r.skip(13);stat('anglerQuests');r.skip(16+48+4);if(r.bool())r.skip(4);r.skip(8);stat('golfScore');if(version>=282)r.skip(1);
  offsets.researchStart=r.p;const count=r.int();if(count<0||count>20000)throw Error('旅途研究数量异常');
  for(let i=0;i<count;i++){const key=r.str();if(!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(key))throw Error('旅途研究条目异常');const amount=r.int();if(amount<0||amount>1000000)throw Error('旅途研究进度异常');player.research[key]=amount;}
  offsets.researchEnd=r.p;
  const temporary=r.byte();for(let bit=0;bit<8;bit++)if(temporary&(1<<bit))group(`held${bit}`,1,'bank');
  for(let i=0;r.bool();i++){
    if(i>30)throw Error('旅途能力记录过多');const id=r.short();
    if(id===5||id===11){offsets[`power${id}`]=r.p;player.journey[id]=r.bool();}
    else if(id===14){offsets.power14=r.p;r.need(4);player.journey[14]=r.v.getFloat32(r.p,true);r.skip(4);}
    else throw Error(`无法识别旅途能力 ${id}`);
  }
  r.skip(1);player.selectedLoadout=r.int();if(player.selectedLoadout<0||player.selectedLoadout>2)throw Error('配装编号无效');
  for(let i=0;i<3;i++){group(`loadout${i}`,30,version>=325?'full':'bank');r.skip(10);}
  if(version>=280)r.skip(1);if(version>=281)r.skip(4);
  if(version>=300){const n=r.int();if(n<0||n>10000)throw Error('退回物品记录异常');if(n)group('refunds',n,'bank');}
  if(version>=310){const n=r.int();if(n<0||n>10000)throw Error('对话记录异常');for(let i=0;i<n;i++)r.str();}
  if(r.p!==plain.length)throw Error(`存在 ${plain.length-r.p} 字节的未识别数据`);
  return {plain:new Uint8Array(plain),offsets,player};
}
export const emptyItem=()=>({id:0,stack:0,prefix:0,favorite:false});
export function ownedCounts(player){const counts=new Map();if(player)for(const list of Object.values(player.groups))for(const i of list)if(i.id&&i.stack)counts.set(i.id,(counts.get(i.id)||0)+i.stack);return counts;}
export function addItem(player,group,item,quantity,prefix=0,oversize=false){
  if(!Number.isInteger(quantity)||quantity<1||quantity>2147483647)throw Error('物品数量应为 1–2147483647 的整数。');
  if(!Number.isInteger(prefix)||prefix<0||prefix>97)throw Error('词缀编号无效。');
  if(player.version<315&&item.id>5455)throw Error('该物品属于 1.4.5，无法写入 1.4.4 存档。');
  const list=player.groups[group];if(!list)throw Error('目标仓储不可用。');
  if(['equipment','dyes','misc'].includes(group))throw Error('请在背包与仓储页面选择具体装备槽。');
  const limit=oversize?2147483647:item.maxStack||9999;
  let remaining=quantity;
  // Work on a copy so a full inventory cannot leave a partial addition behind.
  const slots=list.map(x=>({...x}));
  for(const slot of slots)if(slot.id===item.id&&slot.prefix===prefix&&slot.stack<limit){const n=Math.min(limit-slot.stack,remaining);slot.stack+=n;remaining-=n;if(!remaining)break;}
  for(let i=0;remaining&&i<slots.length;i++)if(!slots[i].id||!slots[i].stack){const n=Math.min(limit,remaining);slots[i]={id:item.id,stack:n,prefix,favorite:false};remaining-=n;}
  if(remaining)throw Error(`空间不足：还缺少 ${Math.ceil(remaining/limit)} 个空槽位。可切换仓储或减少数量。`);
  player.groups[group]=slots;
}
function bounded(v,min,max,label){if(!Number.isInteger(v)||v<min||v>max)throw Error(`${label}应为 ${min}–${max} 的整数。`);}
export async function savePlayer(session,player){
  const out=new Uint8Array(session.plain),view=new DataView(out.buffer),o=session.offsets;
  if(player.version!==session.player.version)throw Error('不能改变存档格式版本。');
  if(!player.name.trim()||[...player.name].length>30)throw Error('角色名称应为 1–30 个字符。');
  bounded(player.difficulty,0,3,'模式');out[o.stats.difficulty]=player.difficulty;
  for(const [name,at]of Object.entries(o.stats))if(name!=='difficulty'){
    const value=player.stats[name];bounded(value,0,2147483647,name);view.setInt32(at,value,true);
  }
  for(const [name,at]of Object.entries(o.flags))out[at]=player.flags[name]?1:0;
  for(const [name,slots]of Object.entries(o.groups)){
    if(player.groups[name]?.length!==slots.length)throw Error('仓储槽位数量发生变化。');
    for(let i=0;i<slots.length;i++){
      const {at,shape}=slots[i],s=player.groups[name][i];bounded(s.id,0,6195,'物品 ID');bounded(s.stack,0,2147483647,'数量');bounded(s.prefix,0,player.version<315?84:97,'词缀');
      if(player.version<315&&s.id>5455)throw Error('此角色版本不支持 1.4.5 的物品。');
      view.setInt32(at,s.id,true);
      if(shape==='full'||shape==='bank'){view.setInt32(at+4,s.stack,true);out[at+8]=s.prefix;if(shape==='full')out[at+9]=s.favorite?1:0;}
      else out[at+4]=s.prefix;
    }
  }
  for(let i=0;i<44;i++){bounded(player.buffs[i].id,0,1000,'增益 ID');bounded(player.buffs[i].time,0,2147483647,'持续时间');view.setInt32(o.buffs+i*8,player.buffs[i].id,true);view.setInt32(o.buffs+i*8+4,player.buffs[i].time,true);}
  for(const id of [5,11])if(o[`power${id}`]!==undefined)out[o[`power${id}`]]=player.journey[id]?1:0;
  if(o.power14!==undefined){const n=player.journey[14];if(!Number.isFinite(n)||n<0||n>10)throw Error('刷怪倍率应在 0–10 之间。');view.setFloat32(o.power14,n,true);}
  // Variable-length changes are applied from the end of the file to preserve offsets.
  const entries=Object.entries(player.research);
  if(entries.length>20000)throw Error('研究条目过多。');
  const chunks=[intBytes(entries.length)];
  for(const[k,v]of entries){if(!/^[A-Za-z][A-Za-z0-9_]{0,199}$/.test(k))throw Error('研究物品名称无效。');bounded(v,0,1000000,'研究进度');chunks.push(encodedString(k),intBytes(v));}
  let updated=concat(out.subarray(0,o.researchStart),...chunks,out.subarray(o.researchEnd));
  updated=concat(updated.subarray(0,o.nameStart),encodedString(player.name),updated.subarray(o.nameEnd));
  const encrypted=await encrypt(updated);
  // Verify the actual encrypted export, including all mutable fields, before returning it.
  const check=await openPlayer(encrypted);
  for(const key of ['name','difficulty','stats','flags','groups','buffs','research','journey'])if(JSON.stringify(check.player[key])!==JSON.stringify(player[key]))throw Error(`导出后校验失败：${key}。文件未写入。`);
  return encrypted;
}
