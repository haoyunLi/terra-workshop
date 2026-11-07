import {useCallback,useEffect,useState} from 'react';
const initial={version:2,presets:[],bookmarks:[],quick:[],warehouses:[],craftingGoals:[],hotkeysEnabled:false,autoBackup:false};
export function useWorkshop({onError,onNotice}){
 const [config,setConfig]=useState({profile:initial,hotkeys:{registered:[],failed:[]}}),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;const api=window.terraDesktop;if(api?.getConfig)api.getConfig().then(v=>{if(active){setConfig(v);setReady(true);}}).catch(onError);else setReady(true);const stop=api?.onNotice?.(notice=>notice.kind==='error'?onError(Error(notice.message)):onNotice(notice.message));return()=>{active=false;stop?.();};},[]);
 const save=useCallback(async profile=>{if(!window.terraDesktop?.saveConfig)throw Error('请在桌面 App 中保存配置。');const value=await window.terraDesktop.saveConfig(profile);setConfig(value);return value;},[]);
 return{...config,ready,save};
}
