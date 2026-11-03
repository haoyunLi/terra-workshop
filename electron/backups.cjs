const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const idOk=id=>typeof id==='string'&&/^[0-9a-f]{32}$/.test(id);
class BackupManager{
 constructor({folder,secret,getState,saveGame,isRunning}){this.folder=path.join(folder,'backups-v2');this.secret=secret;this.getState=getState;this.saveGame=saveGame;this.isRunning=isRunning;this.busy=false;}
 async key(){return typeof this.secret==='function'?await this.secret():this.secret;}
 async sign(record){return crypto.createHmac('sha256',await this.key()).update(JSON.stringify(record)).digest('hex');}
 async writeRecord(record){const envelope={record,signature:await this.sign(record)};await fs.writeFile(path.join(this.folder,record.id,'manifest.json'),JSON.stringify(envelope,null,2));}
 async readRecord(id){if(!idOk(id))throw Error('备份 ID 无效。');const envelope=JSON.parse(await fs.readFile(path.join(this.folder,id,'manifest.json'),'utf8'));const signature=await this.sign(envelope.record);if(typeof envelope.signature!=='string'||signature.length!==envelope.signature.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(envelope.signature)))throw Error('备份记录校验失败。');const r=envelope.record;if(r.id!==id||!Array.isArray(r.files)||!r.files.length||r.files.length>2)throw Error('备份记录无效。');for(const f of r.files){if(!['player','world'].includes(f.kind)||!path.isAbsolute(f.target)||path.extname(f.target).toLowerCase()!==(f.kind==='player'?'.plr':'.wld')||f.file!==(f.kind==='player'?'player.plr':'world.wld')||!/^[a-f0-9]{64}$/.test(f.hash))throw Error('备份路径校验失败。');}return r;}
 summary(r){return{id:r.id,date:r.date,label:r.label,player:r.player,world:r.world,files:r.files.map(f=>({kind:f.kind,bytes:f.bytes})),bytes:r.files.reduce((a,f)=>a+f.bytes,0)};}
 async list(){await fs.mkdir(this.folder,{recursive:true});const entries=await fs.readdir(this.folder,{withFileTypes:true});const result=[];for(const entry of entries)if(entry.isDirectory()&&idOk(entry.name)){try{result.push(this.summary(await this.readRecord(entry.name)));}catch{}}return result.sort((a,b)=>b.date.localeCompare(a.date));}
 async stableRead(file){for(let i=0;i<3;i++){const a=await fs.stat(file);if(!a.isFile()||a.size>512*1024*1024)throw Error('存档文件大小异常。');const bytes=await fs.readFile(file);const b=await fs.stat(file);if(a.size===b.size&&a.mtimeMs===b.mtimeMs&&bytes.length===b.size)return bytes;}throw Error('游戏正在写入存档，请稍后再备份。');}
 async create(label='手动备份'){
  if(this.busy)throw Error('备份操作正在进行。');this.busy=true;try{
   let state=await this.getState();if(!state.connected||!state.inWorld)throw Error('请先进入世界，才能备份当前角色与世界。');await this.saveGame();state=await this.getState();
   const sources=[];let cloud=false;for(const kind of['player','world']){const info=state.saves?.[kind];if(!info)continue;if(info.cloud){cloud=true;continue;}if(typeof info.path!=='string'||!path.isAbsolute(info.path)||path.extname(info.path).toLowerCase()!==(kind==='player'?'.plr':'.wld'))throw Error('游戏没有返回有效的存档位置。');sources.push({kind,target:path.resolve(info.path)});}
   if(!sources.length)throw Error(cloud?'当前存档在 Steam 云端。请先在游戏中移出云端，再使用本地备份。':'尚未获取到存档位置，请等待游戏保存完成。');
   const id=crypto.randomBytes(16).toString('hex'),dir=path.join(this.folder,id);await fs.mkdir(dir,{recursive:true});const files=[];for(const source of sources){const bytes=await this.stableRead(source.target),file=source.kind==='player'?'player.plr':'world.wld';await fs.writeFile(path.join(dir,file),bytes);files.push({...source,file,hash:digest(bytes),bytes:bytes.length});}
   const record={version:2,id,date:new Date().toISOString(),label:String(label).slice(0,80),player:state.player?.name||'',world:state.world?.name||'',files};await this.writeRecord(record);return{...this.summary(record),message:cloud?'本地存档已备份；云端部分未包含。':'当前角色与世界的本地存档已备份。'};
  }finally{this.busy=false;}
 }
 async restore(id){
  if(this.busy)throw Error('备份操作正在进行。');this.busy=true;try{
   if(await this.isRunning())throw Error('请先正常保存并退出泰拉瑞亚和本地主机，再恢复备份。');const record=await this.readRecord(id),staged=[];
   for(const f of record.files){const bytes=await fs.readFile(path.join(this.folder,id,f.file));if(digest(bytes)!==f.hash)throw Error('备份文件校验失败，已停止恢复。');staged.push({...f,bytes});}
   const safetyId=crypto.randomBytes(16).toString('hex'),safetyDir=path.join(this.folder,safetyId);await fs.mkdir(safetyDir,{recursive:true});const originals=[];
   for(const f of staged){let bytes=null;try{bytes=await this.stableRead(f.target);}catch(e){if(e.code!=='ENOENT')throw e;}if(bytes){await fs.writeFile(path.join(safetyDir,f.file),bytes);originals.push({...f,hash:digest(bytes),bytes:bytes.length});}}
   if(originals.length)await this.writeRecord({...record,id:safetyId,date:new Date().toISOString(),label:'恢复前自动保护备份',files:originals.map(({kind,target,file,hash,bytes})=>({kind,target,file,hash,bytes}))});
   const written=[];try{for(const f of staged){await fs.mkdir(path.dirname(f.target),{recursive:true});const temp=f.target+'.workshop-restore-'+safetyId;await fs.writeFile(temp,f.bytes);await fs.rename(temp,f.target);written.push(f);}}catch(error){for(const f of written){const original=originals.find(o=>o.target===f.target);if(original)await fs.copyFile(path.join(safetyDir,original.file),f.target);else await fs.unlink(f.target);}throw Error('恢复未完成，已回滚写入的原存档：'+error.message);}
   return{message:'备份已恢复。覆盖前的存档已保留，现在可重新启动游戏。',safetyId:originals.length?safetyId:null};
  }finally{this.busy=false;}
 }
}
module.exports={BackupManager,digest};
