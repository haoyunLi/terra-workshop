// Part of the GPL-3.0 launcher adaptation. Keep game content resolution in the
// user's installation while the loader files remain beside the companion App.
using System;
using System.IO;
using System.Reflection;
namespace TerraWorkshop {
  public static class LauncherBootstrap {
    [STAThread]public static void Main(string[] args){
      try{
        var game=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_GAME");
        if(string.IsNullOrEmpty(game)||!File.Exists(game))throw new FileNotFoundException("请选择包含 Terraria.exe 的游戏安装目录。");
        var folder=Path.GetDirectoryName(Path.GetFullPath(game));
        Directory.SetCurrentDirectory(folder);
        var setup=new AppDomainSetup{ApplicationBase=folder,ConfigurationFile=game+".config"};
        var domain=AppDomain.CreateDomain("Terra Workshop Game",null,setup);
        var runner=(GameRunner)domain.CreateInstanceFromAndUnwrap(Assembly.GetExecutingAssembly().Location,typeof(GameRunner).FullName);
        runner.Run(args);
      }catch(Exception error){var dir=Environment.GetEnvironmentVariable("TERRA_WORKSHOP_LOGS");if(!string.IsNullOrEmpty(dir)){Directory.CreateDirectory(dir);File.AppendAllText(Path.Combine(dir,"launch-error.log"),DateTime.Now+" "+error+Environment.NewLine);}}
    }
  }
  public sealed class GameRunner:MarshalByRefObject {
    public override object InitializeLifetimeService(){return null;}
    public void Run(string[] args){
      var loaderFolder=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
      AppDomain.CurrentDomain.AssemblyResolve+=(sender,e)=>{
        var name=new AssemblyName(e.Name).Name+".dll";
        foreach(var folder in new[]{Path.Combine(loaderFolder,"Mods","Libs"),loaderFolder}){var file=Path.Combine(folder,name);if(File.Exists(file))return Assembly.LoadFrom(file);}return null;
      };
      TerrariaInjector.Program.Main(args);
    }
  }
}
