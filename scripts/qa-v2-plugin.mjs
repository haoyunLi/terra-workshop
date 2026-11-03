import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{LiveClient}=require('../electron/connection.cjs');
export default function qaPlugin(){return{name:'workshop-test-harness',configureServer(server){
 if(process.env.VITE_WORKSHOP_QA!=='1')return;
 const data=path.resolve(process.env.TERRA_WORKSHOP_QA_DIR||'.work/qa/app-data'),client=new LiveClient({getPath:()=>data,getAppPath:()=>process.cwd()},{},null);
 server.middlewares.use('/__qa',async(req,res,next)=>{try{
  const send=(code,v)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(v));};
  if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))return send(403,{});
  if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)return send(403,{});
  const state=await client.status();if(state.connected&&!state.gameVersion.includes('[Test Harness]'))return send(403,{error:'QA only supports the simulated game fixture'});
  let p={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>524288)return send(413,{});}p=JSON.parse(body||'{}');}
  if(req.url==='/status')return send(200,state);
  if(req.url==='/info')return send(200,{gameFolder:'自动化测试 · 模拟游戏 API',desktop:false});
  if(req.url==='/config'&&req.method==='GET')return send(200,{profile:await client.profile.load(),hotkeys:{registered:[],failed:[],available:false}});
  if(req.url==='/config'&&req.method==='POST')return send(200,{profile:await client.profile.save(p),hotkeys:{registered:[],failed:[],available:false}});
  if(req.url==='/backups')return send(200,await client.backups.list());
  if(req.url==='/backup-folder')return send(200,'');
  if(!state.connected)return send(503,{error:'Test fixture is not running'});
  if(req.url==='/command'&&req.method==='POST')return send(200,await client.command(p.action,p.args));
  if(req.url==='/quick'&&req.method==='POST')return send(200,{result:await client.runQuick(p.id),state:await client.status()});
  if(req.url==='/backup'&&req.method==='POST')return send(200,await client.backupCreate(p.label));
  if(req.url==='/restore'&&req.method==='POST')return send(200,await client.backupRestore(p.id));
  next();
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}});
}};}
