// Integration-test fixture only. This is not game code and is not shipped with the App.
using System;
using System.Linq;
using System.IO;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading;
namespace Terraria {
  public struct Vec {public float X,Y;public Vec(float x,float y){X=x;Y=y;}}
  public class Item {public int type,stack,prefix,maxStack=9999,healLife,healMana,ammo,buffType;public bool favorited,potion,consumable;public void SetDefaults(int id){type=id;stack=id==0?0:1;maxStack=9999;prefix=0;consumable=id==28||id==40;potion=id==28;healLife=id==28?100:0;ammo=id==40?1:0;}public bool Prefix(int p){prefix=p;return p<98;}}
  public class Chest {public Item[] item=Enumerable.Range(0,40).Select(_=>new Item()).ToArray();}
  public class Player {
    public bool active=true,dead,immune,immuneNoBlink,noFallDmg;public int statLife=120,statLifeMax=120,statLifeMax2=120,statMana=20,statManaMax=20,statManaMax2=20,immuneTime,fallStart,SpawnX=100,SpawnY=100,height=42,difficulty,CurrentLoadoutIndex;
    public string name="自动化测试角色（模拟）";public Vec position=new Vec(1600,1600),lastDeathPostion=new Vec(2400,2400);public int width=20,whoAmI;public bool ZoneJungle=true,ZoneHallow=true,ZoneBeach=true,ZoneUnderworldHeight=true,ZoneLihzhardTemple=true,ZoneCorrupt=true,ZoneCrimson=true;
    public Item[] inventory=Enumerable.Range(0,58).Select(_=>new Item()).ToArray(),armor=Enumerable.Range(0,20).Select(_=>new Item()).ToArray(),dye=Enumerable.Range(0,10).Select(_=>new Item()).ToArray(),miscEquips=Enumerable.Range(0,5).Select(_=>new Item()).ToArray(),miscDyes=Enumerable.Range(0,5).Select(_=>new Item()).ToArray();
    public Chest bank=new Chest(),bank2=new Chest(),bank3=new Chest(),bank4=new Chest();
    public Player(){inventory[0].SetDefaults(3507);inventory[1].SetDefaults(3509);inventory[2].SetDefaults(3506);}
    public void AddBuff(int type,int time,bool quiet=false){}
    public void Teleport(Vec to,int style=0,int extra=0){position=to;}
    public static void SavePlayer(IO.PlayerFileData file,bool skipMapSave=false,bool canBeSkipped=false){Directory.CreateDirectory(Path.GetDirectoryName(file.Path));File.WriteAllText(file.Path,"player:"+Main.player[0].statLife+":"+string.Join(",",Main.player[0].inventory.Select(i=>i.type+"x"+i.stack)));}
    [MethodImpl(MethodImplOptions.NoInlining)]public double Hurt(){statLife-=50;return 50;}
    [MethodImpl(MethodImplOptions.NoInlining)]public void KillMe(){dead=true;}
  }
  public class NPC {
    public int type,whoAmI,homeTileX,homeTileY,life=250,lifeMax=250;public bool active,townNPC,homeless=true,netUpdate,boss;public string GivenName="测试居民";public Vec position;public static int defaultSpawnRate=600,defaultMaxSpawns=5,waveNumber,spawnCounter;
    public string TypeName{get{return type==17?"Merchant":type==22?"Guide":"Other";}}public string FullName{get{return GivenName+" "+TypeName;}}
    public void SetDefaults(int id){type=id;townNPC=id==17||id==22;boss=new[]{50,4,13,266,222,35,668,113,657,125,126,134,127,262,245,370,636,439,398}.Contains(id);}
    public static void SpawnOnPlayer(int player,int type,float a=0,float b=0,float c=0,float d=0){NewNPC(new DataStructures.EntitySource_SpawnNPC(),1600,1600,type);}
    public static void SpawnWOF(Vec position){SpawnOnPlayer(0,113);}
    [MethodImpl(MethodImplOptions.NoInlining)]public static void SpawnNPC(){spawnCounter++;File.WriteAllText(Path.Combine(Main.FixtureRoot,Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE")=="server"?"server-natural-spawns.txt":"natural-spawns.txt"),spawnCounter+"|"+defaultSpawnRate+"|"+defaultMaxSpawns);}
    public static int NewNPC(DataStructures.EntitySource_SpawnNPC source,int x,int y,int type,int start=0,float ai0=0,float ai1=0,float ai2=0,float ai3=0,int Target=255){for(int n=0;n<Main.npc.Length;n++)if(!Main.npc[n].active){var npc=Main.npc[n];npc.SetDefaults(type);npc.active=true;npc.whoAmI=n;npc.position=new Vec(x,y);return n;}return 200;}
  }
  public class Main {
    public static bool gameMenu=false,dayTime=true,raining=false,hardMode=true,bloodMoon,eclipse,pumpkinMoon,snowMoon,slimeRain;public static double time,worldSurface=50;public static int netMode,myPlayer,worldID=98765,maxTilesX=2000,maxTilesY=800,spawnTileX=100,spawnTileY=100,rainTime,invasionType,invasionSize,invasionSizeStart,invasionProgress,invasionProgressWave;public static float maxRaining;
    public static string FixtureRoot=AppDomain.CurrentDomain.BaseDirectory;
    public static IO.PlayerFileData ActivePlayerFileData=new IO.PlayerFileData(Path.Combine(FixtureRoot,"Saves","fixture.plr"));public static IO.WorldFileData ActiveWorldFileData=new IO.WorldFileData(Path.Combine(FixtureRoot,"Saves","fixture.wld"));
    public static string versionNumber="Terraria 1.4.5.8 [Test Harness]",worldName="自动化测试世界（模拟）";
    public static Player[] player={new Player()};public static NPC[] npc=Enumerable.Range(0,200).Select(_=>new NPC()).ToArray();
    [MethodImpl(MethodImplOptions.NoInlining)]protected void Initialize(){using(var s=Microsoft.Xna.Framework.TitleContainer.OpenStream("Content/PixelShader.xnb")){if(s.ReadByte()!=1)throw new Exception("Shader regression fixture did not load");}}
    [MethodImpl(MethodImplOptions.NoInlining)]protected void LoadContent(){}
    [MethodImpl(MethodImplOptions.NoInlining)]protected void Update(object gameTime){player[0].statLifeMax2=player[0].statLifeMax;player[0].statManaMax2=player[0].statManaMax;NPC.SpawnNPC();var control=Path.Combine(FixtureRoot,Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE")=="server"?"server-fixture-control.txt":"fixture-control.txt");if(File.Exists(control)){var action=File.ReadAllText(control);File.Delete(control);if(action=="clearBosses")foreach(var n in npc)if(n.boss)n.active=false;if(action=="menu")gameMenu=true;if(action=="world")gameMenu=false;if(action=="hurt")player[0].Hurt();}}
    [MethodImpl(MethodImplOptions.NoInlining)]private static void DrawVersionNumber(){}
    [MethodImpl(MethodImplOptions.NoInlining)]protected void Main_Exiting(object sender,EventArgs e){}
    public static void SavePlayers(){}public static void StopRain(){raining=false;}
    public static void StartInvasion(int type=1){invasionType=type;invasionSize=invasionSizeStart=100;}
    public static void startPumpkinMoon(){pumpkinMoon=true;NPC.waveNumber=1;}
    public static void startSnowMoon(){snowMoon=true;NPC.waveNumber=1;}
    public static void stopMoonEvent(){pumpkinMoon=snowMoon=false;}
    public static void StartSlimeRain(bool announce=true){slimeRain=true;}
    public static void StopSlimeRain(bool announce=true){slimeRain=false;}
    public static void SyncAnInvasion(int toWho){NetMessage.SendData(78);}
    public void Run(){netMode=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE")=="server"?2:Environment.GetEnvironmentVariable("TERRA_WORKSHOP_TEST_MULTIPLAYER")=="1"?1:0;myPlayer=netMode==2?255:0;Initialize();LoadContent();if(netMode==1&&Environment.GetEnvironmentVariable("TERRA_WORKSHOP_TEST_HOST")=="1"){var process=new Process{StartInfo=new ProcessStartInfo(Path.Combine(FixtureRoot,"TerrariaServer.exe")){UseShellExecute=false,CreateNoWindow=true}};process.Start();File.WriteAllText(Path.Combine(FixtureRoot,"server-process.txt"),process.Id+"|"+process.StartInfo.FileName);}var end=DateTime.UtcNow.AddMinutes(20);while(DateTime.UtcNow<end){Update(null);Thread.Sleep(16);}Main_Exiting(null,EventArgs.Empty);}
  }
  public static class WorldGen {
    public static void QuickFindHome(int n){}
    public static bool MoveTownNPC(int x,int y,int n){if(x<90||x>110||y<90||y>110)return false;var npc=Main.npc[n];npc.homeTileX=x;npc.homeTileY=y;npc.homeless=false;return true;}
    public static void saveWorld(bool useCloud=false,bool resetTime=false){}
  }
  public static class Program {public static string SavePath;[STAThread]public static void Main(string[] args){new Terraria.Main().Run();}}
}
namespace Terraria.IO {public class FileData{public string Path{get;set;}public bool IsCloudSave{get;set;}public FileData(string path){Path=path;}}public class PlayerFileData:FileData{public PlayerFileData(string p):base(p){}}public class WorldFileData:FileData{public WorldFileData(string p):base(p){}}public static class WorldFile{public static void SaveWorld(bool resetTime=false,bool useTemps=false,bool canBeSkipped=false){Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Terraria.Main.ActiveWorldFileData.Path));File.WriteAllText(Terraria.Main.ActiveWorldFileData.Path,"world:"+Terraria.Main.time+":"+Terraria.Main.invasionType);}}}
namespace Terraria {public static class NetMessage {public static void SendData(int type,int remote=-1,int ignore=-1,object text=null,int number=0,float number2=0,float number3=0,float number4=0,int number5=0,int number6=0,int number7=0){File.AppendAllText(Path.Combine(Main.FixtureRoot,Environment.GetEnvironmentVariable("TERRA_WORKSHOP_ROLE")=="server"?"server-packets.log":"client-packets.log"),type+"|"+number+"|"+number2+Environment.NewLine);}}public static class Collision{public static bool SolidCollision(Vec p,int w,int h,bool acceptTop=false){return p.X/16>=1900;}}}
namespace Terraria.ID {public static class ItemID{public const int Count=6196;}public static class NPCID{public const int Count=700;}}
namespace Terraria.DataStructures {public class EntitySource_SpawnNPC{}}
namespace Microsoft.Xna.Framework {public static class TitleContainer{[MethodImpl(MethodImplOptions.NoInlining)]public static System.IO.Stream OpenStream(string name){return System.IO.File.OpenRead(System.IO.Path.Combine("intentionally-wrong-launcher-base",name));}}}
