// Integration-test fixture only. This is not game code and is not shipped with the App.
using System;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
namespace Terraria {
  public struct Vec {public float X,Y;public Vec(float x,float y){X=x;Y=y;}}
  public class Item {public int type,stack,prefix,maxStack=9999;public bool favorited;public void SetDefaults(int id){type=id;stack=id==0?0:1;maxStack=9999;prefix=0;}public bool Prefix(int p){prefix=p;return true;}}
  public class Chest {public Item[] item=Enumerable.Range(0,40).Select(_=>new Item()).ToArray();}
  public class Player {
    public bool active=true,dead,immune,immuneNoBlink,noFallDmg;public int statLife=120,statLifeMax=120,statLifeMax2=120,statMana=20,statManaMax=20,statManaMax2=20,immuneTime,fallStart,SpawnX=100,SpawnY=100,height=42,difficulty,CurrentLoadoutIndex;
    public string name="自动化测试角色（模拟）";public Vec position=new Vec(1600,1600);
    public Item[] inventory=Enumerable.Range(0,58).Select(_=>new Item()).ToArray(),armor=Enumerable.Range(0,20).Select(_=>new Item()).ToArray(),dye=Enumerable.Range(0,10).Select(_=>new Item()).ToArray(),miscEquips=Enumerable.Range(0,5).Select(_=>new Item()).ToArray(),miscDyes=Enumerable.Range(0,5).Select(_=>new Item()).ToArray();
    public Chest bank=new Chest(),bank2=new Chest(),bank3=new Chest(),bank4=new Chest();
    public Player(){inventory[0].SetDefaults(3507);inventory[1].SetDefaults(3509);inventory[2].SetDefaults(3506);}
    public void AddBuff(int type,int time,bool quiet=false){}
    public void Teleport(Vec to,int style=0,int extra=0){position=to;}
    [MethodImpl(MethodImplOptions.NoInlining)]public double Hurt(){statLife-=50;return 50;}
    [MethodImpl(MethodImplOptions.NoInlining)]public void KillMe(){dead=true;}
  }
  public class NPC {
    public int type,whoAmI,homeTileX,homeTileY,life=250,lifeMax=250;public bool active,townNPC,homeless=true,netUpdate;public string GivenName="测试居民";public Vec position;
    public string TypeName{get{return type==17?"Merchant":type==22?"Guide":"Other";}}public string FullName{get{return GivenName+" "+TypeName;}}
    public void SetDefaults(int id){type=id;townNPC=id==17||id==22;}
    public static int NewNPC(DataStructures.EntitySource_SpawnNPC source,int x,int y,int type,int start=0,float ai0=0,float ai1=0,float ai2=0,float ai3=0,int Target=255){for(int n=0;n<Main.npc.Length;n++)if(!Main.npc[n].active){var npc=Main.npc[n];npc.SetDefaults(type);npc.active=true;npc.whoAmI=n;npc.position=new Vec(x,y);return n;}return 200;}
  }
  public class Main {
    public static bool gameMenu=false,dayTime=true,raining=false,hardMode;public static double time;public static int netMode,myPlayer,worldID=98765,maxTilesX=2000,maxTilesY=800,spawnTileX=100,spawnTileY=100,rainTime;public static float maxRaining;
    public static string versionNumber="Terraria 1.4.5.8 [Test Harness]",worldName="自动化测试世界（模拟）";
    public static Player[] player={new Player()};public static NPC[] npc=Enumerable.Range(0,200).Select(_=>new NPC()).ToArray();
    [MethodImpl(MethodImplOptions.NoInlining)]protected void Initialize(){using(var s=Microsoft.Xna.Framework.TitleContainer.OpenStream("Content/PixelShader.xnb")){if(s.ReadByte()!=1)throw new Exception("Shader regression fixture did not load");}}
    [MethodImpl(MethodImplOptions.NoInlining)]protected void LoadContent(){}
    [MethodImpl(MethodImplOptions.NoInlining)]protected void Update(object gameTime){player[0].statLifeMax2=player[0].statLifeMax;player[0].statManaMax2=player[0].statManaMax;}
    [MethodImpl(MethodImplOptions.NoInlining)]private static void DrawVersionNumber(){}
    [MethodImpl(MethodImplOptions.NoInlining)]protected void Main_Exiting(object sender,EventArgs e){}
    public static void SavePlayers(){}public static void StopRain(){raining=false;}
    public void Run(){Initialize();LoadContent();var end=DateTime.UtcNow.AddMinutes(20);while(DateTime.UtcNow<end){Update(null);Thread.Sleep(16);}Main_Exiting(null,EventArgs.Empty);}
  }
  public static class WorldGen {
    public static void QuickFindHome(int n){}
    public static bool MoveTownNPC(int x,int y,int n){if(x<90||x>110||y<90||y>110)return false;var npc=Main.npc[n];npc.homeTileX=x;npc.homeTileY=y;npc.homeless=false;return true;}
    public static void saveWorld(bool useCloud=false,bool resetTime=false){}
  }
  public static class Program {public static string SavePath;[STAThread]public static void Main(string[] args){new Terraria.Main().Run();}}
}
namespace Terraria.ID {public static class ItemID{public const int Count=6196;}public static class NPCID{public const int Count=700;}}
namespace Terraria.DataStructures {public class EntitySource_SpawnNPC{}}
namespace Microsoft.Xna.Framework {public static class TitleContainer{[MethodImpl(MethodImplOptions.NoInlining)]public static System.IO.Stream OpenStream(string name){return System.IO.File.OpenRead(System.IO.Path.Combine("intentionally-wrong-launcher-base",name));}}}
