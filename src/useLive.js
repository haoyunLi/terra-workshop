import { useState,useEffect,useRef,useCallback } from 'react';
export function useLive(){
  const [state,setState]=useState({connected:false,inWorld:false}),[info,setInfo]=useState({gameFolder:''}),[busy,setBusy]=useState(false);
  const mounted=useRef(true),pending=useRef(false),desktop=!!window.terraDesktop?.status;
  useEffect(()=>{mounted.current=true;let timer;const poll=async()=>{if(desktop&&!pending.current){try{const result=await window.terraDesktop.status();if(mounted.current)setState(result);}catch(e){if(mounted.current)setState({connected:false,message:e.message});}}if(mounted.current)timer=setTimeout(poll,1500);};
    if(desktop)window.terraDesktop.info().then(value=>{if(mounted.current)setInfo(value);}).catch(()=>{});poll();return()=>{mounted.current=false;clearTimeout(timer);};},[desktop]);
  const command=useCallback(async(action,args={})=>{if(!desktop)throw Error('请运行桌面 App 来连接游戏，当前是界面预览。');if(pending.current)throw Error('上一次操作正在处理中。');pending.current=true;setBusy(true);try{const reply=await window.terraDesktop.command(action,args);if(mounted.current)setState({connected:true,...reply.state});return reply.result;}finally{pending.current=false;if(mounted.current)setBusy(false);}},[desktop]);
  const choose=async()=>{if(!desktop)throw Error('请运行解压目录中的 TerraWorkshop.exe，再选择游戏安装目录。');const value=await window.terraDesktop.chooseGame();setInfo(value);return value;};
  const launch=async()=>{if(!desktop)throw Error('请运行桌面 App，点击「启动游戏」即可开始实时修改。');setBusy(true);try{const value=await window.terraDesktop.launchGame();setInfo(await window.terraDesktop.info());return value;}finally{setBusy(false);}};
  const quickRun=async id=>{if(!window.terraDesktop?.runQuick)throw Error('请使用新版桌面 App。');if(pending.current)throw Error('上一次操作正在处理中。');pending.current=true;setBusy(true);try{const reply=await window.terraDesktop.runQuick(id);if(mounted.current)setState({connected:true,...reply.state});return reply.result;}finally{pending.current=false;if(mounted.current)setBusy(false);}};
  return{state,info,desktop,busy,command,choose,launch,quickRun};
}
