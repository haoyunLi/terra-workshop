const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const net=require('node:net');
const {spawn,execFile}=require('node:child_process');
const {ProfileStore}=require('./profile.cjs');
const {BackupManager}=require('./backups.cjs');
const ACTIONS=new Set(['warehouseScan','warehousePreview','warehouseApply','warehouseUndo','searchStorage','give','giveBatch','refill','teleport','spawnBoss','event','spawnControl','setSlot','removeItem','undoInventory','heal','maxStats','ability','buff','time','stopRain','returnHome','saveGame','spawnNpc','moveNpc','healNpc','findHome','houseNpc']);
const WORLD_ACTIONS=new Set(['warehouseScan','warehousePreview','warehouseApply','warehouseUndo','searchStorage','spawnBoss','event','spawnControl','spawnNpc','moveNpc','healNpc','findHome','houseNpc','time','stopRain']);
class LiveClient{
  constructor(app,dialog,window){this.app=app;this.dialog=dialog;this.window=window;this.settings=null;this.loading=null;this.starting=false;this.child=null;this.lastLaunchError='';this.operations=Promise.resolve();this.profile=new ProfileStore(app.getPath('userData'));this.backups=new BackupManager({folder:app.getPath('userData'),secret:async()=>(await this.load()).token,getState:()=>this.status(),saveGame:()=>this.executeCommand('saveGame'),isRunning:()=>this.gameRunning()});}
  queue(operation){const result=this.operations.then(operation,operation);this.operations=result.catch(()=>{});return result;}
  backupCreate(label){return this.queue(()=>this.backups.create(label));}
  backupRestore(id){return this.queue(()=>this.backups.restore(id));}
  async runQuick(id){const profile=await this.profile.load(),q=profile.quick.find(x=>x.id===id);if(!q)throw Error('快捷操作已删除。');return this.executeQuick(q);}
  async executeQuick(q){const profile=await this.profile.load();if(q.action==='preset'){const p=profile.presets.find(p=>p.id===q.args.id);if(!p)throw Error('预设已删除。');return(await this.command('giveBatch',{items:p.items})).result;}if(q.action==='bookmark'){const b=profile.bookmarks.find(b=>b.id===q.args.id);if(!b)throw Error('书签已删除。');return(await this.command('teleport',{x:b.x,y:b.y,worldId:b.worldId})).result;}const args={...q.args};if(q.action==='ability'&&args.toggle){const state=await this.status();args.enabled=!state.abilities?.[args.key];delete args.toggle;}return(await this.command(q.action,args)).result;}
  async freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
  async load(){if(this.settings)return this.settings;if(!this.loading)this.loading=this.initialize();try{return await this.loading;}finally{this.loading=null;}}
  async initialize(){
    try{const value=JSON.parse(await fs.readFile(path.join(this.app.getPath('userData'),'connection.json'),'utf8'));if(!/^[a-f0-9]{64}$/.test(value.token)||!Number.isInteger(value.port)||value.port<1024||value.port>65535)throw Error('Invalid config');this.settings=value;}
    catch{this.settings={gameFolder:'',token:crypto.randomBytes(32).toString('hex'),port:await this.freePort()};}
    if(!Number.isInteger(this.settings.serverPort)||this.settings.serverPort<1024||this.settings.serverPort>65535||this.settings.serverPort===this.settings.port){do{this.settings.serverPort=await this.freePort();}while(this.settings.serverPort===this.settings.port);}
    await this.persist();return this.settings;
  }
  async persist(){const dir=this.app.getPath('userData');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'connection.json');await fs.writeFile(file+'.tmp',JSON.stringify(this.settings),{mode:0o600});await fs.rename(file+'.tmp',file);}
  async info(){const s=await this.load();return{gameFolder:s.gameFolder,desktop:true,starting:this.starting,lastLaunchError:this.lastLaunchError};}
  async choose(){const result=await this.dialog.showOpenDialog(this.window,{title:'选择包含 Terraria.exe 的游戏安装目录',properties:['openDirectory']});if(result.canceled)return this.info();const folder=await fs.realpath(result.filePaths[0]);const stat=await fs.stat(path.join(folder,'Terraria.exe')).catch(()=>null);if(!stat?.isFile())throw Error('所选目录没有 Terraria.exe，请选择游戏安装目录。');await this.load();this.settings.gameFolder=folder;await this.persist();return this.info();}
  async detect(){
    const s=await this.load();if(s.gameFolder)return this.info();const folders=[];
    try{const hint=JSON.parse(await fs.readFile(path.join(this.app.getAppPath(),'game-location.json'),'utf8'));if(typeof hint.gameFolder==='string')folders.push(hint.gameFolder);}catch{}
    for(const root of[process.env['ProgramFiles(x86)'],process.env.ProgramFiles].filter(Boolean)){const steam=path.join(root,'Steam');folders.push(path.join(steam,'steamapps','common','Terraria'));try{const vdf=await fs.readFile(path.join(steam,'steamapps','libraryfolders.vdf'),'utf8');for(const match of vdf.matchAll(/"path"\s+"([^"]+)"/g))folders.push(path.join(match[1].replaceAll('\\\\','\\'),'steamapps','common','Terraria'));}catch{}}
    for(const folder of new Set(folders)){try{if((await fs.stat(path.join(folder,'Terraria.exe'))).isFile()){s.gameFolder=folder;await this.persist();break;}}catch{}}return this.info();
  }
  async request(action,args={},target='client'){
    const s=await this.load(),isStatus=action==='state';if(!isStatus&&!ACTIONS.has(action))throw Error('不支持的实时操作。');
    const body=isStatus?null:JSON.stringify({...args,action});if(body&&Buffer.byteLength(body)>(action.startsWith('warehouse')?524288:65536))throw Error('操作内容过长。');
    return new Promise((resolve,reject)=>{
      const req=http.request({hostname:'127.0.0.1',port:target==='server'?s.serverPort:s.port,path:isStatus?'/status':'/command',method:isStatus?'GET':'POST',headers:{Authorization:`Bearer ${s.token}`,...(Number.isInteger(args.actor)?{'X-Workshop-Actor':String(args.actor)}:{}),...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})},timeout:action==='saveGame'||action.startsWith('warehouse')?35000:target==='server'&&isStatus?1800:6500},res=>{
        let length=0;const chunks=[];res.on('data',chunk=>{length+=chunk.length;if(length>2*1024*1024){req.destroy(Error('游戏响应过长。'));return;}chunks.push(chunk);});
        res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value.ok)throw Error(value.error||'游戏未完成这次操作。');if(value.state?.protocol!=='terra-workshop-live/1'||target==='server'&&value.state.role!=='server')throw Error('连接组件身份校验失败。');resolve(value);}catch(error){reject(error);}});
      });
      req.on('timeout',()=>req.destroy(Error('游戏响应超时，请等待加载完成。')));req.on('error',error=>reject(error.code==='ECONNREFUSED'?Error('等待从工坊启动游戏'):error));if(body)req.write(body);req.end();
    });
  }
  async status(){
    let client;try{client=(await this.request('state')).state;}catch(error){return{connected:false,message:this.lastLaunchError||error.message,...await this.info()};}
    const state={connected:true,...client,serverConnected:false,worldControl:client.netMode===0};
    if(client.netMode===1&&client.inWorld){try{const server=(await this.request('state',{actor:client.localPlayerIndex},'server')).state;if(server.inWorld&&server.world?.id===client.world?.id){state.serverConnected=true;state.worldControl=true;for(const key of['world','npcs','townCatalog','bosses','bossCatalog','events','spawns','progress','residentConditions'])state[key]=server[key];state.saves={...client.saves,world:server.saves?.world};state.capabilities={...client.capabilities,...server.capabilities};}}catch{}}
    return state;
  }
  command(action,args={}){return this.queue(()=>this.executeCommand(action,args));}
  async executeCommand(action,args={}){
    if(!ACTIONS.has(action))throw Error('不支持的实时操作。');const state=await this.status();if(!state.connected||!state.inWorld)throw Error('请先通过工坊启动游戏，并进入角色与世界。');
    const needsServer=state.netMode===1&&WORLD_ACTIONS.has(action);
    if(needsServer&&!state.serverConnected)throw Error('人物端已连接，本机房间主机尚未接入。下次从工坊启动游戏，再用「主持并开始」开房，NPC 与世界操作即可同步到你的房间。');
    const profile=await this.profile.load();if(profile.autoBackup&&(action==='spawnBoss'||action==='event'&&args.key!=='stop'))await this.backups.create('自动备份 · '+action);
    let warehouseBackup=null;
    if(action==='warehouseApply'){warehouseBackup=await this.backups.create('仓库整理前');if(!['player','world'].every(kind=>warehouseBackup.files.some(file=>file.kind===kind)))throw Error('仓库整理需要完整备份角色与世界；请先在游戏中将云端角色或世界移出 Steam 云端。');}
    const reply=await this.request(action,{...args,...(needsServer?{actor:state.localPlayerIndex}:{})},needsServer?'server':'client');
    if(warehouseBackup){reply.result.backupId=warehouseBackup.id;reply.result.backupMessage='整理前的存档已备份，可在「存档备份」中恢复。';}
    if(action==='saveGame'&&state.netMode===1&&state.serverConnected){await this.request('saveGame',{actor:state.localPlayerIndex},'server');reply.result.message='角色与本机房间已调用原生保存。';}
    return{...reply,state:await this.status()};
  }
  async vanillaRunning(){return new Promise(resolve=>{execFile('tasklist.exe',['/FI','IMAGENAME eq Terraria.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:3000},(error,stdout)=>resolve(!error&&/^"Terraria\.exe",/im.test(stdout)));});}
  async gameRunning(){if((await this.status()).connected)return true;return new Promise((resolve,reject)=>{execFile('tasklist.exe',['/FO','CSV','/NH'],{windowsHide:true,timeout:5000},(error,stdout)=>{if(error)return reject(Error('无法检查游戏是否退出，已停止恢复。'));resolve(/^"(?:Terraria|TerrariaServer|WorkshopLauncher|WorkshopServerLauncher)\.exe",/im.test(stdout));});});}
  async launch(){
    if(this.starting)throw Error('游戏正在启动，请稍候。');const current=await this.status();if(current.connected)return{message:'游戏已连接。'};
    if(this.app.isPackaged&&await this.vanillaRunning())throw Error('检测到普通启动的泰拉瑞亚仍在运行。请先正常保存并退出，再从工坊点击「启动游戏」。你自己的多人存档也可以使用，在游戏里选择「主持并开始」即可。');
    await this.detect();if(!this.settings.gameFolder)await this.choose();if(!this.settings.gameFolder)return{canceled:true};
    const game=path.join(this.settings.gameFolder,'Terraria.exe');await fs.access(game);
    const runtime=path.join(this.app.getAppPath().replace(/app\.asar$/,'app.asar.unpacked'),'runtime-current');
    const launcher=path.join(runtime,'WorkshopLauncher.exe');await fs.access(launcher);await fs.access(path.join(runtime,'WorkshopServerLauncher.exe'));
    const logs=path.join(this.app.getPath('userData'),'game-logs');await fs.mkdir(logs,{recursive:true});this.starting=true;this.lastLaunchError='';
    const child=spawn(launcher,['-logfile',logs,'-logerrors'],{cwd:this.settings.gameFolder,env:{...process.env,SteamAppId:'105600',SteamGameId:'105600',TERRA_WORKSHOP_GAME:game,TERRA_WORKSHOP_TOKEN:this.settings.token,TERRA_WORKSHOP_PORT:String(this.settings.port),TERRA_WORKSHOP_SERVER_PORT:String(this.settings.serverPort),TERRA_WORKSHOP_ROLE:'client',TERRA_WORKSHOP_LOGS:logs},windowsHide:false,detached:true,stdio:'ignore'});
    this.child=child;child.on('error',error=>{this.starting=false;this.lastLaunchError=`启动失败：${error.message}`;});child.on('exit',code=>{this.starting=false;if(code)this.lastLaunchError=`游戏启动器已退出（${code}），请查看启动日志。`;});child.unref();setTimeout(()=>{this.starting=false;},30000).unref();return{message:'游戏启动中。单人进入世界即可；本机多人房间请选择「主持并开始」。'};
  }
}
module.exports={LiveClient,ACTIONS,WORLD_ACTIONS};
