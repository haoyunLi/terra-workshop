#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $appRoot '.work/tools'
New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
$packages = @(
    @{Name='compiler';Id='microsoft.net.compilers.toolset';Version='4.12.0';Sha='FE24EF31A6FFCB7C49383D2FD362763DEE291AD9B9D98CC0C19EF80203B99EBC'},
    @{Name='harmony';Id='lib.harmony';Version='2.4.2';Sha='D64592E53090464559FCE48612C9CA7C8DC73113841376B7AA3455F46FC5D579'},
    @{Name='cecil';Id='mono.cecil';Version='0.11.6';Sha='D2A23832AAA948BA9A01ACC42B5726E34C5F995958F1B30D45C0E7C70B3A72D5'}
)
foreach ($package in $packages) {
    $archive = Join-Path $toolRoot ($package.Name + '.zip')
    if (-not (Test-Path -LiteralPath $archive)) {
        $url = 'https://api.nuget.org/v3-flatcontainer/{0}/{1}/{0}.{1}.nupkg' -f $package.Id,$package.Version
        Invoke-WebRequest -Uri $url -OutFile $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $package.Sha) {throw ('Dependency checksum mismatch: ' + $package.Name)}
    $destination = Join-Path $toolRoot $package.Name
    if (-not (Test-Path -LiteralPath $destination)) {Expand-Archive -LiteralPath $archive -DestinationPath $destination}
    Write-Output ('Restored ' + $package.Id + ' ' + $package.Version)
}
