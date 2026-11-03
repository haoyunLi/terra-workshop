class HotkeyManager{
 constructor(api,execute,notice){this.api=api;this.execute=execute;this.notice=notice;this.registered=[];}
 update(profile){for(const key of this.registered)this.api.unregister(key);this.registered=[];const failed=[];if(profile.hotkeysEnabled)profile.quick.forEach((q,index)=>{const key='Control+Alt+'+(index+1);let ok=false;try{ok=this.api.register(key,()=>{Promise.resolve(this.execute(q)).then(r=>this.notice({kind:'success',message:r?.message||q.name+'已完成。'}),e=>this.notice({kind:'error',message:e.message}));});}catch{}if(ok)this.registered.push(key);else failed.push(key);});return{enabled:profile.hotkeysEnabled,registered:[...this.registered],failed};}
 close(){for(const key of this.registered)this.api.unregister(key);this.registered=[];}
}
module.exports={HotkeyManager};
