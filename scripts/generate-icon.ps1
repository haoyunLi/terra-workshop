$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../public'
$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect x="8" y="8" width="240" height="240" rx="56" fill="#101f28"/>
  <rect x="9" y="9" width="238" height="238" rx="55" fill="none" stroke="#31494e" stroke-width="2"/>
  <path d="M128 38 190 78 128 120 66 78Z" fill="#87e2c0"/>
  <path d="M66 78 128 120 128 160 66 118Z" fill="#3c9c89"/>
  <path d="M128 120 190 78 190 118 128 160Z" fill="#56bfa0"/>
  <path d="M128 38 128 120 66 78Z" fill="#b5f4d8"/>
  <path d="M50 154 103 154 128 171 153 154 210 154 194 177 164 177 155 194 173 207 83 207 101 194 92 177 66 177Z" fill="#d9ae77"/>
  <path d="M210 48 214 59 225 63 214 67 210 78 206 67 195 63 206 59Z" fill="#d9ae77"/>
</svg>
'@
[IO.File]::WriteAllText((Join-Path $destination 'workshop-mark.svg'), $svg, [Text.UTF8Encoding]::new($false))
$polygons = @(
    @('#87e2c0', @(128,38,190,78,128,120,66,78)),
    @('#3c9c89', @(66,78,128,120,128,160,66,118)),
    @('#56bfa0', @(128,120,190,78,190,118,128,160)),
    @('#b5f4d8', @(128,38,128,120,66,78)),
    @('#d9ae77', @(50,154,103,154,128,171,153,154,210,154,194,177,164,177,155,194,173,207,83,207,101,194,92,177,66,177)),
    @('#d9ae77', @(210,48,214,59,225,63,214,67,210,78,206,67,195,63,206,59))
)
$frames = [Collections.Generic.List[byte[]]]::new()
$sizes = @(16,24,32,48,64,128,256)
foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform($size / 256.0, $size / 256.0)
    $outline = [Drawing.Drawing2D.GraphicsPath]::new()
    $outline.AddArc(8,8,112,112,180,90)
    $outline.AddArc(136,8,112,112,270,90)
    $outline.AddArc(136,136,112,112,0,90)
    $outline.AddArc(8,136,112,112,90,90)
    $outline.CloseFigure()
    $background = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#101f28'))
    $border = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#31494e'),2)
    $graphics.FillPath($background,$outline)
    $graphics.DrawPath($border,$outline)
    foreach ($polygon in $polygons) {
        $coordinates = $polygon[1]
        $points = for ($i=0; $i -lt $coordinates.Count; $i+=2) {
            [Drawing.PointF]::new($coordinates[$i],$coordinates[$i+1])
        }
        $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($polygon[0]))
        $graphics.FillPolygon($brush,[Drawing.PointF[]]$points)
        $brush.Dispose()
    }
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
    $frames.Add($stream.ToArray())
    if ($size -eq 256) {
        [IO.File]::WriteAllBytes((Join-Path $destination 'workshop-icon.png'),$stream.ToArray())
    }
    $stream.Dispose()
    $outline.Dispose()
    $border.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
$iconStream = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($iconStream)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i=0; $i -lt $sizes.Count; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frames[$i].Length)
    $writer.Write([uint32]$offset)
    $offset += $frames[$i].Length
}
foreach ($frame in $frames) { $writer.Write($frame) }
[IO.File]::WriteAllBytes((Join-Path $destination 'workshop-icon.ico'),$iconStream.ToArray())
$writer.Dispose()
$iconStream.Dispose()
Write-Output 'Created SVG, PNG and seven-size Windows ICO.'
