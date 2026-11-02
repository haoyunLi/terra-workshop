// Development-only contract adapter. Production builds remove this entire branch.
if(import.meta.env.DEV&&import.meta.env.VITE_WORKSHOP_QA==='1'){
  const request=async(method,route,value)=>{const r=await fetch('/__qa/'+route,{method,headers:{'Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});const v=await r.json();if(!r.ok)throw Error(v.error||'QA request failed');return v;};
  window.terraDesktop={status:()=>request('GET','status'),info:()=>request('GET','info'),chooseGame:()=>request('GET','info'),launchGame:()=>Promise.resolve({message:'自动化测试环境（模拟游戏）'}),command:(action,args)=>request('POST','command',{action,args})};
}
