#Requires -Version 7.0
param([string]$OutputFolder = 'runtime-current')
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $appRoot '.work/tools'
$compiler = Join-Path $tools 'compiler/tasks/net472/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {throw 'Run npm run restore:bridge first.'}
$output = [IO.Path]::GetFullPath((Join-Path $appRoot $OutputFolder))
if (-not $output.StartsWith($appRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {throw 'Build output must stay inside this project.'}
$harmony = Join-Path $tools 'harmony/lib/net48/0Harmony.dll'
$cecil = Join-Path $tools 'cecil/lib/net40/Mono.Cecil.dll'
New-Item -ItemType Directory -Path (Join-Path $output 'Mods/Libs') -Force | Out-Null
Copy-Item -LiteralPath $harmony,$cecil -Destination (Join-Path $output 'Mods/Libs') -Force
$sourceRoot = Join-Path $appRoot 'bridge/src'
$files = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'launcher') -Filter '*.cs' | ForEach-Object {$_.FullName})
$references = @('/r:System.dll','/r:System.Core.dll',"/r:$harmony","/r:$cecil")
& $compiler /nologo /target:winexe /main:TerraWorkshop.LauncherBootstrap /platform:anycpu32bitpreferred /optimize+ /langversion:latest "/out:$output/WorkshopLauncher.exe" @references @files
if ($LASTEXITCODE -ne 0) {throw 'Client launcher compilation failed.'}
& $compiler /nologo /target:exe /main:TerraWorkshop.LauncherBootstrap /platform:anycpu32bitpreferred /optimize+ /langversion:latest "/out:$output/WorkshopServerLauncher.exe" @references @files
if ($LASTEXITCODE -ne 0) {throw 'Server launcher compilation failed.'}
& $compiler /nologo /target:library /platform:anycpu /optimize+ /langversion:latest "/out:$output/Mods/WorkshopBridge.dll" /r:System.dll /r:System.Core.dll /r:System.Web.Extensions.dll "/r:$harmony" (Join-Path $sourceRoot 'WorkshopBridge.cs')
if ($LASTEXITCODE -ne 0) {throw 'Bridge compilation failed.'}
foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -File -Recurse)) {
    $relative = [IO.Path]::GetRelativePath($sourceRoot,$file.FullName)
    $destination = Join-Path (Join-Path $output 'src') $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $appRoot 'LICENSE') -Destination (Join-Path $output 'LAUNCHER-LICENSE-GPL-3.0.txt') -Force
Write-Output 'Built client launcher, host launcher, and bridge; included corresponding source.'
