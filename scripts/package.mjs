import {packager} from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
for(const file of ['dist/index.html','runtime-current/WorkshopLauncher.exe','runtime-current/WorkshopServerLauncher.exe','runtime-current/Mods/WorkshopBridge.dll']){
  if(!fs.existsSync(file))throw Error(`Missing ${file}; build the frontend and bridge first.`);
}
const electronVersion=JSON.parse(fs.readFileSync('node_modules/electron/package.json','utf8')).version;
const result=await packager({dir:'.',name:'TerraWorkshop',platform:'win32',arch:'x64',out:'out',electronVersion,download:{cacheRoot:path.resolve('../electron-cache')},overwrite:true,asar:{unpackDir:'runtime-current'},prune:false,
  ignore:[/^\/(?:node_modules|src|tests|public|scripts|core|vendor|bridge|out|\.work|\.git|\.github)(?:\/|$)/,/^\/runtime(?:\/|$)/,/^\/game-location\.json$/],
  win32metadata:{CompanyName:'Terra Workshop',FileDescription:'泰拉工坊 · Terraria 实时修改器',ProductName:'泰拉工坊',InternalName:'TerraWorkshop'},
  appCopyright:'Terra Workshop contributors. Terraria © Re-Logic. See THIRD_PARTY_NOTICES.md.'});
console.log(result.join('\n'));
