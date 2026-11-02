const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('terraDesktop',Object.freeze({status:()=>ipcRenderer.invoke('live:status'),info:()=>ipcRenderer.invoke('live:info'),chooseGame:()=>ipcRenderer.invoke('live:choose'),launchGame:()=>ipcRenderer.invoke('live:launch'),command:(action,args)=>ipcRenderer.invoke('live:command',{action,args})}));
