using System;

namespace Terraria {
  public partial class NPC {
    public static bool downedSlimeKing,downedBoss1,downedBoss2,downedBoss3,downedQueenBee,downedDeerclops;
    public static bool downedQueenSlime,downedMechBoss1,downedMechBoss2,downedMechBoss3,downedMechBossAny;
    public static bool downedPlantBoss,downedGolemBoss,downedFishron,downedEmpressOfLight,downedAncientCultist;
    public static bool downedFrost,downedPirates,downedGoblins;
  }
  public static class ProgressFixture {
    public static void ApplyControl(string action) {
      if(action=="progressReset") {
        NPC.downedBoss1=NPC.downedBoss2=NPC.downedSlimeKing=NPC.downedQueenBee=false;
        NPC.downedTowerSolar=false;Main.hardMode=false;
      }
      if(action=="progressEye")NPC.downedBoss1=true;
      if(action=="progressEvil")NPC.downedBoss2=true;
      if(action=="progressSolar")NPC.downedTowerSolar=true;
      if(action=="progressHardmode")Main.hardMode=true;
      if(action=="progressRestore") {
        NPC.downedBoss1=NPC.downedBoss2=NPC.downedSlimeKing=NPC.downedQueenBee=false;
        NPC.downedTowerSolar=false;Main.hardMode=true;
      }
    }
  }
}
