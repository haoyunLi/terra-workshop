const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const GROUPS=new Set(['inventory','piggyBank','safe','defendersForge','voidVault']);
const QUICK=new Set(['give','heal','returnHome','refill','ability','spawnBoss','event','preset','bookmark']);
const label=(v,max=60)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('名称长度不正确。');return v.trim();};
const integer=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error('数值超出范围。');return v;};
function item(v){if(!v||typeof v!=='object')throw Error('物品项目无效。');const group=v.group||'inventory';if(!GROUPS.has(group))throw Error('仓储无效。');return{type:integer(v.type,1,100000),stack:integer(v.stack,1,2147483647),prefix:integer(v.prefix||0,0,97),group};}
function normalize(value={}){
 if(!value||typeof value!=='object')throw Error('配置无效。');for(const[key,limit]of[['presets',40],['bookmarks',100],['quick',8]])if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>limit))throw Error(key+' 超过允许数量。');if(value.presets?.some(p=>!Array.isArray(p.items)||p.items.length<1||p.items.length>100))throw Error('每个预设需要 1–100 项物品。');
 const presets=(value.presets||[]).slice(0,40).map(p=>({id:label(p.id,80),name:label(p.name),items:(p.items||[]).slice(0,100).map(item)}));if(presets.some(p=>!p.items.length))throw Error('预设不能为空。');
 const bookmarks=(value.bookmarks||[]).slice(0,100).map(b=>({id:label(b.id,80),name:label(b.name),worldId:integer(b.worldId,-2147483648,2147483647),worldName:label(b.worldName||'世界'),x:integer(b.x,10,100000),y:integer(b.y,10,100000)}));
 const quick=(value.quick||[]).slice(0,8).map(q=>{if(!QUICK.has(q.action))throw Error('不支持这个快捷操作。');let args={};const a=q.args||{};if(q.action==='give')args=item(a);else if(q.action==='ability'){if(!['godMode','infiniteMana','noFall'].includes(a.key))throw Error('能力无效。');args={key:a.key,toggle:true};}else if(['preset','bookmark'].includes(q.action))args={id:label(a.id,80)};else if(['spawnBoss','event'].includes(q.action))args={key:label(a.key,40),prepareTime:!!a.prepareTime};else if(q.action==='refill')args={stack:9999};return{id:label(q.id,80),name:label(q.name),action:q.action,args};});
 for(const list of[presets,bookmarks,quick])if(new Set(list.map(x=>x.id)).size!==list.length)throw Error('项目 ID 重复。');
 return{version:2,presets,bookmarks,quick,hotkeysEnabled:!!value.hotkeysEnabled,autoBackup:!!value.autoBackup};
}
const defaults=()=>normalize({quick:[{id:'heal',name:'恢复状态',action:'heal'},{id:'home',name:'返回出生点',action:'returnHome'},{id:'refill',name:'补满药水弹药',action:'refill'}]});
class ProfileStore{
 constructor(folder){this.file=path.join(folder,'workshop-profile-v2.json');this.value=null;this.chain=Promise.resolve();}
 async load(){if(this.value)return structuredClone(this.value);try{this.value=normalize(JSON.parse(await fs.readFile(this.file,'utf8')));}catch(e){if(e.code!=='ENOENT'){try{await fs.copyFile(this.file,this.file+'.recovery-'+Date.now());}catch{}}this.value=defaults();}return structuredClone(this.value);}
 save(value){const next=normalize(value);this.chain=this.chain.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';await fs.writeFile(temp,JSON.stringify(next));await fs.rename(temp,this.file);this.value=next;return structuredClone(next);});return this.chain;}
}
module.exports={ProfileStore,normalize,item,defaults};
