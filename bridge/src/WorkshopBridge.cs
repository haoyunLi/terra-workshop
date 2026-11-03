// Terra Workshop live bridge. Game mutations run only on Terraria's update thread.
// No game assembly is redistributed; types are resolved from the user's running game.
using System;
using System.Collections;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using HarmonyLib;

namespace TerraWorkshop {
  public static class R {
    public const BindingFlags All=BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance|BindingFlags.Static;
    public static Type T(string name) { foreach(var a in AppDomain.CurrentDomain.GetAssemblies()){var t=a.GetType(name,false);if(t!=null)return t;}throw new InvalidOperationException("游戏类型不可用："+name); }
    public static object Get(object obj,string name,object fallback=null) {var t=obj as Type??obj.GetType();var f=t.GetField(name,All);if(f!=null)return f.GetValue(obj is Type?null:obj);var p=t.GetProperty(name,All);return p!=null?p.GetValue(obj is Type?null:obj,null):fallback;}
    public static bool Has(object obj,string name){var t=obj as Type??obj.GetType();return t.GetField(name,All)!=null||t.GetProperty(name,All)!=null;}
    public static int I(object obj,string name,int fallback=0){var value=Get(obj,name);return value==null?fallback:Convert.ToInt32(value,CultureInfo.InvariantCulture);}
    public static bool B(object obj,string name,bool fallback=false){var value=Get(obj,name);return value==null?fallback:Convert.ToBoolean(value,CultureInfo.InvariantCulture);}
    public static double D(object obj,string name,double fallback=0){var v=Get(obj,name);return v==null?fallback:Convert.ToDouble(v,CultureInfo.InvariantCulture);}
    public static void Set(object obj,string name,object value){var t=obj as Type??obj.GetType();var f=t.GetField(name,All);if(f!=null){f.SetValue(obj is Type?null:obj,ConvertValue(value,f.FieldType));return;}var p=t.GetProperty(name,All);if(p!=null&&p.CanWrite){p.SetValue(obj is Type?null:obj,ConvertValue(value,p.PropertyType),null);return;}throw new InvalidOperationException("当前版本没有可写字段："+name);}
    public static object ConvertValue(object value,Type type){if(value==null||type.IsInstanceOfType(value))return value;if(type.IsEnum)return Enum.ToObject(type,value);return Convert.ChangeType(value,type,CultureInfo.InvariantCulture);}
    public static void TrySet(object obj,string name,object value){if(Has(obj,name))Set(obj,name,value);}
    public static object Call(object obj,string name,params object[] supplied){var t=obj as Type??obj.GetType();var methods=t.GetMethods(All).Where(m=>m.Name==name&&m.IsStatic==(obj is Type)&&m.GetParameters().Length>=supplied.Length).OrderBy(m=>m.GetParameters().Length);foreach(var m in methods){var pars=m.GetParameters();bool good=true;var args=new object[pars.Length];for(int i=0;i<pars.Length;i++){if(i<supplied.Length){try{args[i]=ConvertValue(supplied[i],pars[i].ParameterType);}catch{good=false;break;}}else args[i]=pars[i].HasDefaultValue?pars[i].DefaultValue:pars[i].ParameterType.IsValueType?Activator.CreateInstance(pars[i].ParameterType):null;}if(!good)continue;try{return m.Invoke(obj is Type?null:obj,args);}catch(TargetInvocationException e){throw e.InnerException??e;}}throw new InvalidOperationException("当前游戏版本不支持："+name);}
    public static bool Method(object obj,string name){var t=obj as Type??obj.GetType();return t.GetMethods(All).Any(m=>m.Name==name);}
    public static object Vec(object example,float x,float y){return Activator.CreateInstance(example.GetType(),new object[]{x,y});}
    public static Dictionary<string,object> Dict(params object[] pairs){var d=new Dictionary<string,object>();for(int i=0;i<pairs.Length;i+=2)d[(string)pairs[i]]=pairs[i+1];return d;}
  }
  [HarmonyPatch]
  public static class WorkshopTickPatch {
    public static MethodBase TargetMethod(){return R.T("Terraria.Main").GetMethods(R.All).First(m=>m.Name=="Update"&&!m.IsStatic&&m.GetParameters().Length==1);}
    public static void Postfix(){Bridge.Tick();}
  }
  [HarmonyPatch]
  public static class WorkshopDamagePatch {
    public static IEnumerable<MethodBase> TargetMethods(){return R.T("Terraria.Player").GetMethods(R.All).Where(m=>!m.IsStatic&&(m.Name=="Hurt"||m.Name=="KillMe")).Cast<MethodBase>();}
    public static bool Prefix(object __instance){return !Bridge.BlockDamage(__instance);}
  }
  // XNA resolves TitleContainer paths from the launcher image location. A companion
  // launcher lives elsewhere, so route only Content assets to the selected game root.
  [HarmonyPatch]
  public static class WorkshopContentPathPatch {
    private static int logged;
    public static bool Prepare(){try{return R.T("Microsoft.Xna.Framework.TitleContainer").GetMethod("OpenStream",BindingFlags.Public|BindingFlags.Static,null,new[]{typeof(string)},null)!=null;}catch{return false;}}
    public static MethodBase TargetMethod(){return R.T("Microsoft.Xna.Framework.TitleContainer").GetMethod("OpenStream",BindingFlags.Public|BindingFlags.Static,null,new[]{typeof(string)},null);}
    public static bool Prefix(string __0,ref Stream __result){
      if(string.IsNullOrWhiteSpace(__0)||Path.IsPathRooted(__0))return true;
      var relative=__0.Replace('/',Path.DirectorySeparatorChar).Replace('\\',Path.DirectorySeparatorChar);
      if(!relative.StartsWith("Content"+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))return true;
      var game=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_GAME");if(string.IsNullOrWhiteSpace(game))return true;
      var root=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(game),"Content"))+Path.DirectorySeparatorChar;
      var file=Path.GetFullPath(Path.Combine(Path.GetDirectoryName(game),relative));
      if(!file.StartsWith(root,StringComparison.OrdinalIgnoreCase)||!File.Exists(file))return true;
      __result=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read);
      if(Interlocked.Exchange(ref logged,1)==0){try{var logs=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_LOGS");if(!string.IsNullOrEmpty(logs))File.AppendAllText(Path.Combine(logs,"content-path.log"),"Game content resolved: "+file+Environment.NewLine);}catch{}}
      return false;
    }
  }
  [HarmonyPatch(typeof(Process),"Start",new Type[]{})]
  public static class WorkshopHostServerPatch {
    public static void Prefix(Process __instance){
      if(Bridge.IsServer||string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TERRA_WORKSHOP_SERVER_PORT")))return;
      var info=__instance.StartInfo;var name=Path.GetFileNameWithoutExtension(info.FileName);
      if(!string.Equals(name,"TerrariaServer",StringComparison.OrdinalIgnoreCase))return;
      var game=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_GAME");if(string.IsNullOrEmpty(game))return;
      var server=Path.IsPathRooted(info.FileName)?info.FileName:Path.Combine(Path.GetDirectoryName(game),info.FileName);
      var runtime=Path.GetDirectoryName(Path.GetDirectoryName(typeof(Bridge).Assembly.Location));
      var launcher=Path.Combine(runtime,"WorkshopServerLauncher.exe");if(!File.Exists(server)||!File.Exists(launcher))return;
      info.FileName=launcher;info.UseShellExecute=false;if(string.IsNullOrEmpty(info.WorkingDirectory))info.WorkingDirectory=Path.GetDirectoryName(game);
      info.EnvironmentVariables["TERRA_WORKSHOP_GAME"]=server;
      info.EnvironmentVariables["TERRA_WORKSHOP_ROLE"]="server";
      info.EnvironmentVariables["TERRA_WORKSHOP_PORT"]=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_SERVER_PORT");
      var logs=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_LOGS");if(!string.IsNullOrEmpty(logs)){var serverLogs=Path.Combine(logs,"server");Directory.CreateDirectory(serverLogs);info.EnvironmentVariables["TERRA_WORKSHOP_LOGS"]=serverLogs;}
    }
  }
  public static partial class Bridge {
    public const string Protocol="terra-workshop-live/1";
    private static TcpListener listener;
    private static volatile bool running;
    private static string token;
    private static readonly ConcurrentQueue<Job> jobs=new ConcurrentQueue<Job>();
    private static int queueCount;
    private static bool godMode,infiniteMana,noFall;
    private static bool wasInWorld;
    private static readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=2*1024*1024,RecursionLimit=64};
    private static readonly object jsonLock=new object();
    private static List<object> npcCatalog;
    private static Dictionary<string,object> lastUndo;
    private static string undoPlayer;
    private static string undoWorld;
    private static int actorIndex=-1;
    public static bool IsServer {get{return Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE")=="server";}}
    private static bool InWorld {get{var m=MainType;return IsServer?R.I(m,"netMode")==2&&!string.IsNullOrEmpty(Convert.ToString(R.Get(m,"worldName",""))):!R.B(m,"gameMenu",true);}}
    private static Type MainType {get{return R.T("Terraria.Main");}}
    public static bool BlockDamage(object player){try{return godMode&&!IsServer&&R.I(MainType,"netMode")!=2&&Object.ReferenceEquals(player,Player());}catch{return false;}}
    private sealed class Job {public string Action;public Dictionary<string,object> Args;public string Result;public Exception Error;public ManualResetEvent Done=new ManualResetEvent(false);public int State;}
    public static void OnGameReady(){
      if(running)return;token=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_TOKEN");
      int port;if(token==null||token.Length!=64||!int.TryParse(Environment.GetEnvironmentVariable("TERRA_WORKSHOP_PORT"),out port)||port<1024||port>65535)return;
      listener=new TcpListener(IPAddress.Loopback,port);listener.Start(8);running=true;
      var thread=new Thread(Listen){IsBackground=true,Name="Terra Workshop Loopback"};thread.Start();
    }
    public static void Init(){if(IsServer)OnGameReady();}
    public static void OnShutdown(){running=false;if(listener!=null)listener.Stop();}
    public static string Serialize(object value){lock(jsonLock)return json.Serialize(value);}
    private static Dictionary<string,object> Deserialize(string value){lock(jsonLock)return json.Deserialize<Dictionary<string,object>>(value);}
    private static void Listen(){while(running){try{var client=listener.AcceptTcpClient();ThreadPool.QueueUserWorkItem(_=>Handle(client));}catch{if(!running)break;}}}
    private static bool Authorized(string supplied){var expected="Bearer "+token;if(supplied==null||supplied.Length!=expected.Length)return false;int diff=0;for(int i=0;i<expected.Length;i++)diff|=expected[i]^supplied[i];return diff==0;}
    private static string Line(Stream s){var b=new List<byte>();while(b.Count<8192){int v=s.ReadByte();if(v<0)throw new IOException("Connection closed");if(v==10)return Encoding.ASCII.GetString(b.ToArray()).TrimEnd('\r');b.Add((byte)v);}throw new IOException("Header too long");}
    private static void Reply(Stream stream,int code,string body){var data=Encoding.UTF8.GetBytes(body);var header=Encoding.ASCII.GetBytes("HTTP/1.1 "+code+" "+(code==200?"OK":"Error")+"\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "+data.Length+"\r\n\r\n");stream.Write(header,0,header.Length);stream.Write(data,0,data.Length);}
    private static void Handle(TcpClient client){using(client){client.ReceiveTimeout=5000;client.SendTimeout=5000;try{using(var stream=client.GetStream()){
      var request=Line(stream).Split(' ');if(request.Length!=3){Reply(stream,400,"{}");return;}
      var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);for(int n=0;;n++){if(n>40)throw new IOException("Too many headers");var line=Line(stream);if(line.Length==0)break;int colon=line.IndexOf(':');if(colon<=0)throw new IOException("Bad header");headers[line.Substring(0,colon)]=line.Substring(colon+1).Trim();}
      string auth;headers.TryGetValue("Authorization",out auth);if(headers.ContainsKey("Origin")||!Authorized(auth)){Reply(stream,403,Serialize(R.Dict("ok",false,"error","未授权的本机请求")));return;}
      string host;if(!headers.TryGetValue("Host",out host)||!(host.StartsWith("127.0.0.1:")||host.StartsWith("localhost:"))||headers.ContainsKey("Transfer-Encoding")){Reply(stream,400,"{}");return;}
      string action;var args=new Dictionary<string,object>();
      if(request[0]=="GET"&&request[1]=="/status"){action="state";string actor;if(IsServer&&headers.TryGetValue("X-Workshop-Actor",out actor))args["actor"]=actor;}
      else if(request[0]=="POST"&&request[1]=="/command"){
        string lengthText;int length;if(!headers.TryGetValue("Content-Length",out lengthText)||!int.TryParse(lengthText,out length)||length<2||length>65536){Reply(stream,413,"{}");return;}
        var bytes=new byte[length];int read=0;while(read<length){int n=stream.Read(bytes,read,length-read);if(n<=0)throw new IOException("Incomplete body");read+=n;}
        args=Deserialize(Encoding.UTF8.GetString(bytes));action=Text(args,"action");
      }else{Reply(stream,404,"{}");return;}
      if(Interlocked.Increment(ref queueCount)>32){Interlocked.Decrement(ref queueCount);Reply(stream,429,Serialize(R.Dict("ok",false,"error","操作过于频繁，请稍后重试。")));return;}
      var job=new Job{Action=action,Args=args};jobs.Enqueue(job);
      if(!job.Done.WaitOne(action=="saveGame"?30000:4500)){Interlocked.CompareExchange(ref job.State,2,0);Reply(stream,503,Serialize(R.Dict("ok",false,"error","游戏暂未处理操作，请返回游戏或等待加载完成。")));return;}
      Reply(stream,job.Error==null?200:400,job.Error==null?job.Result:Serialize(R.Dict("ok",false,"error",job.Error.Message)));
    }}catch{/* A malformed or closed request never executes game code. */}}}
    public static void Tick(){
      AdventureTick();
      try{
        var m=MainType;bool inWorld=InWorld;if(!inWorld){godMode=infiniteMana=noFall=false;if(wasInWorld){lastUndo=null;npcCatalog=null;}wasInWorld=false;}else{wasInWorld=true;if(!IsServer){var p=Player();if(R.I(m,"netMode")!=2){if(godMode){R.TrySet(p,"statLife",R.I(p,"statLifeMax2",R.I(p,"statLifeMax")));R.TrySet(p,"immune",true);R.TrySet(p,"immuneTime",60);R.TrySet(p,"immuneNoBlink",true);}if(infiniteMana)R.TrySet(p,"statMana",R.I(p,"statManaMax2",R.I(p,"statManaMax")));if(noFall){R.TrySet(p,"noFallDmg",true);R.TrySet(p,"fallStart",(int)(R.D(R.Get(p,"position"),"Y")/16));}}}}
      }catch{/* Menus and world transitions may temporarily have no player. */}
      Job job;for(int processed=0;processed<8&&jobs.TryDequeue(out job);processed++){
        Interlocked.Decrement(ref queueCount);if(Interlocked.CompareExchange(ref job.State,1,0)!=0){job.Done.Set();continue;}
        try{if(IsServer&&job.Args.ContainsKey("actor"))actorIndex=Number(job.Args,"actor",0,0,254);var result=Execute(job.Action,job.Args);job.Result=Serialize(R.Dict("ok",true,"result",result,"state",Snapshot()));}catch(Exception e){job.Error=e is TargetInvocationException?e.InnerException??e:e;}finally{job.Done.Set();}
      }
    }
    public static object Player(){var list=(Array)R.Get(MainType,"player");int index=IsServer?actorIndex:R.I(MainType,"myPlayer");if(IsServer&&list!=null&&(index<0||index>=list.Length)){for(int n=0;n<Math.Min(255,list.Length);n++)if(list.GetValue(n)!=null&&R.B(list.GetValue(n),"active")){index=n;break;}}if(list==null||index<0||index>=list.Length)throw new InvalidOperationException("请先进入游戏中的角色与世界。");var p=list.GetValue(index);if(p==null||!R.B(p,"active"))throw new InvalidOperationException("角色尚未进入世界。");return p;}
    private static void RequireWorld(){if(!InWorld)throw new InvalidOperationException("请先进入游戏世界。");if(R.B(Player(),"dead"))throw new InvalidOperationException("角色正在死亡或重生，请等待重生后再操作。");}
    private static void RequireWorldControl(){if(R.I(MainType,"netMode")==1&&!IsServer)throw new InvalidOperationException("此操作需要连接你本机房间的主机。");}
    private static void Send(int message,int number=0,float number2=0){if(R.I(MainType,"netMode")==0)return;R.Call(R.T("Terraria.NetMessage"),"SendData",message,-1,-1,null,number,number2);}
    private static void SyncSlot(string group,int slot){if(R.I(MainType,"netMode")!=1)return;var arrays=Arrays(Player());int index=slot;if(group=="coins")index=50+slot;else if(group=="ammo")index=54+slot;else if(group!="inventory"){int start=arrays["inventory"].Length;foreach(var name in new[]{"equipment","dyes","misc","miscDyes"}){if(name==group){index=start+slot;Send(5,R.I(MainType,"myPlayer"),index);return;}Array a;if(arrays.TryGetValue(name,out a))start+=a.Length;}return;}Send(5,R.I(MainType,"myPlayer"),index);}
    private static string Text(Dictionary<string,object>d,string key,string fallback=""){object v;return d.TryGetValue(key,out v)&&v!=null?Convert.ToString(v,CultureInfo.InvariantCulture):fallback;}
    private static int Number(Dictionary<string,object>d,string key,int fallback,int min,int max){object v;long n;if(!d.TryGetValue(key,out v)){if(fallback<min||fallback>max)throw new InvalidOperationException("缺少参数："+key);return fallback;}if(!long.TryParse(Convert.ToString(v,CultureInfo.InvariantCulture),NumberStyles.Integer,CultureInfo.InvariantCulture,out n)||n<min||n>max)throw new InvalidOperationException(key+" 超出允许范围。");return (int)n;}
    private static bool Bool(Dictionary<string,object>d,string key,bool fallback=false){object v;return d.TryGetValue(key,out v)?Convert.ToBoolean(v,CultureInfo.InvariantCulture):fallback;}
    private static int ItemCount(){try{return R.I(R.T("Terraria.ID.ItemID"),"Count",6196);}catch{return 6196;}}
    private static object NewItem(int id,int stack,int prefix,bool favorite=false){
      if(id<0||id>=ItemCount())throw new InvalidOperationException("此游戏版本没有这个物品 ID。");
      var i=Activator.CreateInstance(R.T("Terraria.Item"));if(id!=0){R.Call(i,"SetDefaults",id);if(R.I(i,"type")!=id)throw new InvalidOperationException("这是内部或旧版占位物品，游戏不允许直接放进背包。");if(R.I(MainType,"netMode")!=0&&stack>Math.Min(32767,Math.Max(1,R.I(i,"maxStack",9999))))throw new InvalidOperationException("多人模式单槽数量不能超过原生堆叠上限。");if(prefix!=0){var ok=R.Call(i,"Prefix",prefix);if(ok is bool&&!(bool)ok)throw new InvalidOperationException("该物品不支持所选词缀，请更换词缀。");}R.Set(i,"stack",stack);R.TrySet(i,"favorited",favorite);}return i;
    }
    private static Dictionary<string,Array> Arrays(object p){var groups=new Dictionary<string,Array>();foreach(var key in new[]{"inventory","armor","dye","miscEquips","miscDyes"}){var a=R.Get(p,key) as Array;if(a!=null)groups[key=="armor"?"equipment":key=="dye"?"dyes":key=="miscEquips"?"misc":key]=a;}foreach(var pair in new[]{new[]{"piggyBank","bank"},new[]{"safe","bank2"},new[]{"defendersForge","bank3"},new[]{"voidVault","bank4"}}){var bank=R.Get(p,pair[1]);var a=bank==null?null:R.Get(bank,"item") as Array;if(a!=null)groups[pair[0]]=a;}return groups;}
    private static object ItemInfo(object item){return R.Dict("id",R.I(item,"type"),"stack",R.I(item,"stack"),"prefix",R.I(item,"prefix"),"favorite",R.B(item,"favorited"));}
    private static List<object> ItemList(Array array,int start=0,int count=-1){var list=new List<object>();if(count<0)count=array.Length-start;for(int n=start;n<Math.Min(array.Length,start+count);n++)list.Add(ItemInfo(array.GetValue(n)));return list;}
    private static Dictionary<string,object> Inventory(object p){var all=Arrays(p);var d=new Dictionary<string,object>();foreach(var g in all)d[g.Key]=ItemList(g.Value,0,g.Key=="inventory"?50:-1);var inv=all["inventory"];d["coins"]=ItemList(inv,50,4);d["ammo"]=ItemList(inv,54,4);return d;}
    private static Array TargetArray(object p,string group,out int offset,out int length){var all=Arrays(p);offset=group=="coins"?50:group=="ammo"?54:0;if(offset>0){length=4;return all["inventory"];}Array a;if(!all.TryGetValue(group,out a))throw new InvalidOperationException("当前版本不支持这个仓储。");length=group=="inventory"?Math.Min(50,a.Length):a.Length;return a;}
    private static void Remember(object p){lastUndo=Inventory(p);undoPlayer=Convert.ToString(R.Get(p,"name"));undoWorld=Convert.ToString(R.Get(MainType,"worldID"));}
    private static void Undo(object p){if(lastUndo==null||undoPlayer!=Convert.ToString(R.Get(p,"name"))||undoWorld!=Convert.ToString(R.Get(MainType,"worldID")))throw new InvalidOperationException("没有可撤销的背包修改。");var restore=lastUndo;lastUndo=null;foreach(var pair in restore){int offset,length;var a=TargetArray(p,pair.Key,out offset,out length);var values=(List<object>)pair.Value;for(int n=0;n<Math.Min(values.Count,length);n++){var i=(Dictionary<string,object>)values[n];a.SetValue(NewItem(Convert.ToInt32(i["id"]),Convert.ToInt32(i["stack"]),Convert.ToInt32(i["prefix"]),Convert.ToBoolean(i["favorite"])),n+offset);SyncSlot(pair.Key,n);}}}
    private static object Give(Dictionary<string,object> args){
      var p=Player();string group=Text(args,"group","inventory");if(!new[]{"inventory","piggyBank","safe","defendersForge","voidVault"}.Contains(group))throw new InvalidOperationException("请选择背包或仓储。");
      int id=Number(args,"type",0,1,ItemCount()-1),amount=Number(args,"stack",1,1,int.MaxValue),prefix=Number(args,"prefix",0,0,97);bool oversize=Bool(args,"oversize");
      var sample=NewItem(id,1,prefix);int limit=oversize&&R.I(MainType,"netMode")==0?int.MaxValue:Math.Max(1,R.I(sample,"maxStack",9999));int offset,length;var a=TargetArray(p,group,out offset,out length);long remaining=amount;var plan=new List<KeyValuePair<int,object>>();
      for(int n=0;n<length&&remaining>0;n++){var old=a.GetValue(n);int oldStack=R.I(old,"stack");if(R.I(old,"type")!=id||R.I(old,"prefix")!=prefix||oldStack>=limit)continue;int add=(int)Math.Min((long)limit-oldStack,remaining);plan.Add(new KeyValuePair<int,object>(n,NewItem(id,oldStack+add,prefix,R.B(old,"favorited"))));remaining-=add;}
      for(int n=0;n<length&&remaining>0;n++){var old=a.GetValue(n);if(R.I(old,"type")!=0&&R.I(old,"stack")>0)continue;int add=(int)Math.Min(limit,remaining);plan.Add(new KeyValuePair<int,object>(n,NewItem(id,add,prefix)));remaining-=add;}
      if(remaining>0)throw new InvalidOperationException("目标背包空间不足。请腾出空槽、切换仓储或减少数量。");Remember(p);foreach(var change in plan){a.SetValue(change.Value,change.Key);SyncSlot(group,change.Key);}string label=group=="inventory"?"主背包":group=="piggyBank"?"猪猪存钱罐":group=="safe"?"保险箱":group=="defendersForge"?"护卫熔炉":"虚空保险库";return R.Dict("message","物品已实时放入"+label,"quantity",amount,"type",id);
    }
    private static List<object> ActiveNpcs(){var list=new List<object>();var npcs=R.Get(MainType,"npc") as Array;if(npcs==null)return list;for(int n=0;n<npcs.Length;n++){var npc=npcs.GetValue(n);if(npc==null||!R.B(npc,"active"))continue;if(!R.B(npc,"townNPC"))continue;var pos=R.Get(npc,"position");list.Add(R.Dict("index",n,"type",R.I(npc,"type"),"name",Convert.ToString(R.Get(npc,"FullName",R.Get(npc,"GivenName",""))),"homeless",R.B(npc,"homeless"),"homeX",R.I(npc,"homeTileX"),"homeY",R.I(npc,"homeTileY"),"x",(int)(R.D(pos,"X")/16),"y",(int)(R.D(pos,"Y")/16),"life",R.I(npc,"life"),"maxLife",R.I(npc,"lifeMax")));}return list;}
    private static List<object> TownCatalog(){if(npcCatalog!=null)return npcCatalog;var list=new List<object>();int count=R.I(R.T("Terraria.ID.NPCID"),"Count",700);for(int id=1;id<Math.Min(count,2000);id++){try{var sample=Activator.CreateInstance(R.T("Terraria.NPC"));R.Call(sample,"SetDefaults",id);if(R.B(sample,"townNPC"))list.Add(R.Dict("id",id,"name",Convert.ToString(R.Get(sample,"TypeName",R.Get(sample,"FullName","NPC #"+id)))));}catch{}}npcCatalog=list;return list;}
    private static int NpcByIndex(Dictionary<string,object> args,out object npc){int n=Number(args,"index",-1,0,1999);var a=(Array)R.Get(MainType,"npc");if(n>=a.Length)throw new InvalidOperationException("NPC 已离开。");npc=a.GetValue(n);if(!R.B(npc,"active")||!R.B(npc,"townNPC"))throw new InvalidOperationException("该居民已离开，请刷新列表。");return n;}
    private static object NpcAction(string action,Dictionary<string,object> args){
      var m=MainType;var player=Player();var pos=R.Get(player,"position");object npc;int index;
      if(action=="spawnNpc"){
        int type=Number(args,"type",0,1,R.I(R.T("Terraria.ID.NPCID"),"Count",700)-1);
        if(!TownCatalog().Any(entry=>Convert.ToInt32(((Dictionary<string,object>)entry)["id"])==type))throw new InvalidOperationException("该 NPC 不是可入住的城镇居民。");
        var all=(Array)R.Get(m,"npc");for(int n=0;n<all.Length;n++){var existing=all.GetValue(n);if(R.B(existing,"active")&&R.I(existing,"type")==type)throw new InvalidOperationException("这位居民已经在世界中，可使用「移到身边」或「安排住房」。");}
        var source=Activator.CreateInstance(R.T("Terraria.DataStructures.EntitySource_SpawnNPC"));
        index=Convert.ToInt32(R.Call(R.T("Terraria.NPC"),"NewNPC",source,(int)R.D(pos,"X")+64,(int)R.D(pos,"Y"),type));
        if(index<0||index>=all.Length)throw new InvalidOperationException("世界 NPC 数量已满。");npc=all.GetValue(index);R.TrySet(npc,"homeless",true);R.TrySet(npc,"netUpdate",true);
        if(Bool(args,"findHome",true)&&R.Method(R.T("Terraria.WorldGen"),"QuickFindHome"))R.Call(R.T("Terraria.WorldGen"),"QuickFindHome",index);
        Send(23,index);SendHousing(index,npc);return R.Dict("message",R.B(npc,"homeless")?"居民已出现，目前没有找到合格空房。":"居民已出现并安排住房。","index",index);
      }
      index=NpcByIndex(args,out npc);
      if(action=="moveNpc"){var np=R.Get(npc,"position");R.Set(npc,"position",R.Vec(np,(float)R.D(pos,"X")+64,(float)R.D(pos,"Y")));R.TrySet(npc,"netUpdate",true);Send(23,index);return R.Dict("message","居民已移动到角色附近。");}
      if(action=="healNpc"){R.Set(npc,"life",R.I(npc,"lifeMax"));Send(23,index);return R.Dict("message","居民生命已恢复。");}
      if(action=="findHome"){R.Call(R.T("Terraria.WorldGen"),"QuickFindHome",index);SendHousing(index,npc);return R.Dict("message",R.B(npc,"homeless")?"未找到合格的空房，请先建造住房。":"已安排合格住房。");}
      if(action=="houseNpc"){
        int x=Number(args,"x",(int)(R.D(pos,"X")/16),10,R.I(m,"maxTilesX",8400)-10),y=Number(args,"y",(int)(R.D(pos,"Y")/16),10,R.I(m,"maxTilesY",2400)-10);
        var world=R.T("Terraria.WorldGen");if(!R.Method(world,"MoveTownNPC"))throw new InvalidOperationException("此游戏版本未提供住房分配接口。");
        bool ok=Convert.ToBoolean(R.Call(world,"MoveTownNPC",x,y,index));if(!ok||R.B(npc,"homeless"))throw new InvalidOperationException("这里不是适合该居民的空房。请站进合格的房间，或检查墙、照明、桌椅与房间占用。");
        SendHousing(index,npc);return R.Dict("message","已分配该房间，居民将按游戏规则回家。","homeX",R.I(npc,"homeTileX"),"homeY",R.I(npc,"homeTileY"));
      }
      throw new InvalidOperationException("未知居民操作。");
    }
    public static object Execute(string action,Dictionary<string,object> args){
      if(action=="state")return R.Dict("message","connected");RequireWorld();var p=Player();
      object adventureResult;if(AdventureAction(action,args,out adventureResult))return adventureResult;
      if(new[]{"spawnNpc","moveNpc","healNpc","findHome","houseNpc","time","stopRain"}.Contains(action))RequireWorldControl();
      if(action=="give")return Give(args);
      if(action=="setSlot"){
        string group=Text(args,"group","inventory");int offset,length;var a=TargetArray(p,group,out offset,out length);int slot=Number(args,"slot",-1,0,length-1),type=Number(args,"type",0,0,ItemCount()-1),stack=type==0?0:Number(args,"stack",1,1,int.MaxValue),prefix=Number(args,"prefix",0,0,97);
        if(new[]{"equipment","dyes","misc","miscDyes"}.Contains(group)&&type>0)stack=1;
        var item=NewItem(type,stack,prefix,Bool(args,"favorite"));Remember(p);a.SetValue(item,offset+slot);SyncSlot(group,slot);return R.Dict("message","槽位已实时更新。");
      }
      if(action=="removeItem"){int id=Number(args,"type",0,1,ItemCount()-1);Remember(p);int removed=0;foreach(var pair in Arrays(p))for(int n=0;n<pair.Value.Length;n++)if(R.I(pair.Value.GetValue(n),"type")==id){pair.Value.SetValue(NewItem(0,0,0),n);SyncSlot(pair.Key,n);removed++;}return R.Dict("message","已移除 "+removed+" 个槽位中的物品。");}
      if(action=="undoInventory"){Undo(p);return R.Dict("message","已撤销上一次背包修改。");}
      if(action=="heal"){R.Set(p,"statLife",R.I(p,"statLifeMax2",R.I(p,"statLifeMax")));R.Set(p,"statMana",R.I(p,"statManaMax2",R.I(p,"statManaMax")));SyncVitals();return R.Dict("message","生命与魔力已恢复。");}
      if(action=="maxStats"){R.Set(p,"statLifeMax",500);R.Set(p,"statManaMax",200);R.TrySet(p,"statLifeMax2",500);R.TrySet(p,"statManaMax2",200);R.Set(p,"statLife",500);R.Set(p,"statMana",200);SyncVitals();return R.Dict("message","永久基础生命与魔力已设为 500 / 200。");}
      if(action=="ability"){
        string key=Text(args,"key");bool enabled=Bool(args,"enabled");if(key=="godMode")godMode=enabled;else if(key=="infiniteMana")infiniteMana=enabled;else if(key=="noFall")noFall=enabled;else throw new InvalidOperationException("未知能力。");
        if(!godMode){R.TrySet(p,"immune",false);R.TrySet(p,"immuneTime",0);R.TrySet(p,"immuneNoBlink",false);}return R.Dict("message",enabled?"能力已开启。":"能力已关闭。");
      }
      if(action=="buff"){int id=Number(args,"type",0,1,1000),seconds=Number(args,"seconds",600,1,86400);R.Call(p,"AddBuff",id,seconds*60,false);return R.Dict("message","增益已生效。");}
      if(action=="time"){string time=Text(args,"value");bool day=time=="dawn"||time=="noon";if(!new[]{"dawn","noon","dusk","midnight"}.Contains(time))throw new InvalidOperationException("时间选项无效。");R.Set(MainType,"dayTime",day);R.Set(MainType,"time",time=="noon"?27000.0:time=="midnight"?16200.0:0.0);Send(7);return R.Dict("message","世界时间已更新。");}
      if(action=="stopRain"){if(R.Method(MainType,"StopRain"))R.Call(MainType,"StopRain");else{R.Set(MainType,"raining",false);R.TrySet(MainType,"rainTime",0);R.TrySet(MainType,"maxRaining",0f);}Send(7);return R.Dict("message","降雨已停止。");}
      if(action=="returnHome"){
        int x=R.I(p,"SpawnX",-1),y=R.I(p,"SpawnY",-1);if(x<0||y<0){x=R.I(MainType,"spawnTileX");y=R.I(MainType,"spawnTileY");}
        var pos=R.Get(p,"position");R.Call(p,"Teleport",R.Vec(pos,x*16f,y*16f-R.I(p,"height",42)),0,0);R.TrySet(p,"fallStart",y);Send(13,R.I(MainType,"myPlayer"));return R.Dict("message","已返回出生点。");
      }
      if(action=="saveGame"){if(!IsServer){var file=R.Get(MainType,"ActivePlayerFileData");if(file==null)throw new InvalidOperationException("角色保存数据暂不可用，请等待游戏完成加载。");R.Call(R.T("Terraria.Player"),"SavePlayer",file,false,false);}if(IsServer||R.I(MainType,"netMode")==0)R.Call(R.T("Terraria.IO.WorldFile"),"SaveWorld");return R.Dict("message",IsServer?"本机房间已调用原生保存。":"角色已调用原生保存。");}
      if(new[]{"spawnNpc","moveNpc","healNpc","findHome","houseNpc"}.Contains(action))return NpcAction(action,args);
      throw new InvalidOperationException("不支持的操作。");
    }
    public static object Snapshot(){
      var m=MainType;bool menu=!InWorld;int mode=R.I(m,"netMode");
      var state=R.Dict("protocol",Protocol,"role",IsServer?"server":"client","gameVersion",Convert.ToString(R.Get(m,"versionNumber","Terraria")),"inWorld",!menu,"netMode",mode,"localPlayerIndex",R.I(m,"myPlayer"),"itemCount",ItemCount(),"abilities",R.Dict("godMode",godMode,"infiniteMana",infiniteMana,"noFall",noFall),"undoAvailable",lastUndo!=null);
      if(menu)return state;
      var p=Player();var pos=R.Get(p,"position");
      var player=R.Dict("name",Convert.ToString(R.Get(p,"name","冒险者")),"difficulty",R.I(p,"difficulty"),"version",Convert.ToString(R.Get(m,"versionNumber","")).Contains("1.4.4")?279:326,"playTime",0,"selectedLoadout",R.I(p,"CurrentLoadoutIndex"),"stats",R.Dict("life",R.I(p,"statLife"),"maxLife",R.I(p,"statLifeMax2",R.I(p,"statLifeMax")),"mana",R.I(p,"statMana"),"maxMana",R.I(p,"statManaMax2",R.I(p,"statManaMax"))),"groups",Inventory(p),"dead",R.B(p,"dead"),"x",(int)(R.D(pos,"X")/16),"y",(int)(R.D(pos,"Y")/16),"flags",new Dictionary<string,object>(),"journey",new Dictionary<string,object>());
      state["player"]=player;state["world"]=R.Dict("name",Convert.ToString(R.Get(m,"worldName","")),"id",R.I(m,"worldID"),"day",R.B(m,"dayTime"),"time",R.D(m,"time"),"raining",R.B(m,"raining"),"hardmode",R.B(m,"hardMode"));
      state["npcs"]=ActiveNpcs();state["townCatalog"]=TownCatalog();
      state["capabilities"]=R.Dict("housing",R.Method(R.T("Terraria.WorldGen"),"MoveTownNPC"),"findHome",R.Method(R.T("Terraria.WorldGen"),"QuickFindHome"));ExtendSnapshot(state,p);return state;
    }
  }
}
