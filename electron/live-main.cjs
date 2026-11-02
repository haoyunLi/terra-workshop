const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const path=require('node:path');
const {LiveClient}=require('./connection.cjs');
let window,live;
app.setName('泰拉工坊');
if(process.env.TERRA_WORKSHOP_APP_DATA)app.setPath('userData',path.resolve(process.env.TERRA_WORKSHOP_APP_DATA));
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
function trusted(event){if(!window||event.sender!==window.webContents||!event.senderFrame.url.startsWith('file://'))throw Error('无效的请求来源。');}
async function makeWindow(){
  window=new BrowserWindow({width:1536,height:1024,minWidth:860,minHeight:650,backgroundColor:'#0e1520',title:'泰拉工坊 · Terraria 实时修改器',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'live-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
  live=new LiveClient(app,dialog,window);
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\/(terraria\.wiki\.gg|github\.com|docs\.tmodloader\.net)\//.test(url))shell.openExternal(url);return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(url!==window.webContents.getURL())event.preventDefault();});
  window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  await window.loadFile(path.join(__dirname,'../dist/index.html'));
}
ipcMain.handle('live:status',async event=>{trusted(event);return live.status();});
ipcMain.handle('live:info',async event=>{trusted(event);return live.detect();});
ipcMain.handle('live:choose',async event=>{trusted(event);return live.choose();});
ipcMain.handle('live:launch',async event=>{trusted(event);return live.launch();});
ipcMain.handle('live:command',async(event,payload)=>{trusted(event);if(!payload||typeof payload.action!=='string')throw Error('操作参数无效。');return live.command(payload.action,payload.args||{});});
app.whenReady().then(makeWindow);
app.on('window-all-closed',()=>app.quit());
