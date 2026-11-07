const {app,BrowserWindow,ipcMain,dialog,shell,globalShortcut}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {LiveClient}=require('./connection.cjs');
const {HotkeyManager}=require('./hotkeys.cjs');
let window,live,hotkeys,hotkeyState={enabled:false,registered:[],failed:[]};
let windowPreferences={alwaysOnTop:false};
app.setName('泰拉工坊');
if(process.env.TERRA_WORKSHOP_APP_DATA)app.setPath('userData',path.resolve(process.env.TERRA_WORKSHOP_APP_DATA));
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
function trusted(event){if(!window||event.sender!==window.webContents||!event.senderFrame.url.startsWith('file://'))throw Error('无效的请求来源。');}
function startupLog(message){try{const folder=app.getPath('userData');fs.mkdirSync(folder,{recursive:true});fs.appendFileSync(path.join(folder,'app-startup.log'),new Date().toISOString()+' '+message+'\n');}catch{}}
async function makeWindow(){
  startupLog('Creating desktop window');
  try {
    const saved=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'window-preferences.json'),'utf8'));
    windowPreferences.alwaysOnTop=saved.alwaysOnTop===true;
  } catch {}
  window=new BrowserWindow({width:1440,height:960,minWidth:860,minHeight:650,show:false,backgroundColor:'#101a20',title:'泰拉工坊 2.2 · Terraria 实时修改器',icon:path.join(__dirname,'../dist/workshop-icon.png'),alwaysOnTop:windowPreferences.alwaysOnTop,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'live-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.once('ready-to-show',()=>window.show());
  live=new LiveClient(app,dialog,window);
  startupLog('Loading local profile');
  hotkeys=new HotkeyManager(globalShortcut,q=>live.executeQuick(q),notice=>{if(window&&!window.isDestroyed())window.webContents.send('live:notice',notice);});
  hotkeyState=hotkeys.update(await live.profile.load());
  startupLog('Profile loaded; shortcuts configured');
  window.webContents.on('console-message',details=>{if(details.level==='error')startupLog('Renderer: '+details.message);});
  window.webContents.on('preload-error',(_event,_file,error)=>startupLog('Preload failed: '+error.message));
  window.webContents.on('render-process-gone',(_event,details)=>startupLog('Renderer exited: '+details.reason));
  window.webContents.on('did-fail-load',(_event,code,description)=>startupLog('Document load failed: '+code+' '+description));
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\/(terraria\.wiki\.gg|github\.com|docs\.tmodloader\.net|creativecommons\.org)\//.test(url))shell.openExternal(url);return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(url!==window.webContents.getURL())event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  await window.loadFile(path.join(__dirname,'../dist/index.html'));
  startupLog('Desktop document loaded');
}
ipcMain.handle('live:status',async event=>{trusted(event);return live.status();});
ipcMain.handle('view:ready',async event=>{trusted(event);startupLog('Renderer ready: item catalogue loaded');return true;});
ipcMain.handle('view:preferences',event=>{trusted(event);return windowPreferences;});
ipcMain.handle('view:always-on-top',(event,enabled)=>{
  trusted(event);
  if(typeof enabled!=='boolean')throw Error('窗口置顶参数无效。');
  const next={alwaysOnTop:enabled};
  const file=path.join(app.getPath('userData'),'window-preferences.json');
  fs.writeFileSync(file+'.tmp',JSON.stringify(next));
  fs.renameSync(file+'.tmp',file);
  window.setAlwaysOnTop(enabled);
  windowPreferences=next;
  return next;
});
ipcMain.handle('live:info',async event=>{trusted(event);return live.detect();});
ipcMain.handle('live:choose',async event=>{trusted(event);return live.choose();});
ipcMain.handle('live:launch',async event=>{trusted(event);return live.launch();});
ipcMain.handle('live:command',async(event,payload)=>{trusted(event);if(!payload||typeof payload.action!=='string')throw Error('操作参数无效。');return live.command(payload.action,payload.args||{});});
ipcMain.handle('config:get',async event=>{trusted(event);return{profile:await live.profile.load(),hotkeys:hotkeyState};});
ipcMain.handle('config:save',async(event,value)=>{trusted(event);const profile=await live.profile.save(value);hotkeyState=hotkeys.update(profile);return{profile,hotkeys:hotkeyState};});
ipcMain.handle('quick:run',async(event,id)=>{trusted(event);const result=await live.runQuick(id);return{result,state:await live.status()};});
ipcMain.handle('backup:list',async event=>{trusted(event);return live.backups.list();});
ipcMain.handle('backup:create',async(event,label)=>{trusted(event);return live.backupCreate(typeof label==='string'?label:'手动备份');});
ipcMain.handle('backup:restore',async(event,id)=>{trusted(event);return live.backupRestore(id);});
ipcMain.handle('backup:folder',async event=>{trusted(event);await live.backups.list();return shell.openPath(live.backups.folder);});
app.whenReady().then(makeWindow).catch(error=>{startupLog(error.stack||error.message);if(app.isPackaged)dialog.showErrorBox('泰拉工坊启动失败',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>hotkeys?.close());
