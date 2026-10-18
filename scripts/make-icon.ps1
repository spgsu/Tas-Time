# Render the app mark into Windows icon sizes. Uses built-in Windows drawing APIs.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '../src/assets'

function RoundRect($x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
  $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
  $path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}
function FillRound($g, $color, $x, $y, $w, $h, $r) {
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($color))
  $path = RoundRect $x $y $w $h $r
  $g.FillPath($brush, $path)
  $brush.Dispose(); $path.Dispose()
}

$images = @()
foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
  $bmp = New-Object System.Drawing.Bitmap ($size * 4), ($size * 4)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.ScaleTransform(($size * 4 / 256), ($size * 4 / 256))
  $cover = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(16, 16)), ([System.Drawing.Point]::new(240, 240)), ([System.Drawing.ColorTranslator]::FromHtml('#398466')), ([System.Drawing.ColorTranslator]::FromHtml('#184c3b'))
  $path = RoundRect 16 16 224 224 52
  $g.FillPath($cover, $path)
  $cover.Dispose(); $path.Dispose()
  FillRound $g '#24513e' 62 51 139 164 17
  $paper = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 44)), ([System.Drawing.Point]::new(0, 208)), ([System.Drawing.ColorTranslator]::FromHtml('#fffdf4')), ([System.Drawing.ColorTranslator]::FromHtml('#e8efdf'))
  $path = RoundRect 56 44 144 164 17
  $g.FillPath($paper, $path)
  $paper.Dispose(); $path.Dispose()
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#d1ddc8')), 3
  $g.DrawLine($pen, 79, 44, 79, 208); $pen.Dispose()
  foreach ($y in @(76, 112, 148, 184)) { FillRound $g '#acd0b5' 47.5 ($y - 3.5) 23 7 3.5 }
  FillRound $g '#347a58' 96 76 59 14 7
  FillRound $g '#347a58' 112 111 64 14 7
  FillRound $g '#347a58' 132 146 44 14 7
  FillRound $g '#dba54a' 143 155 70 70 35
  $pen = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml('#fffdf4')), 7
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $g.DrawLines($pen, [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(178, 170), [System.Drawing.PointF]::new(178, 191), [System.Drawing.PointF]::new(191, 199)))
  $pen.Dispose(); $g.Dispose()
  $small = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($small)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.DrawImage($bmp, 0, 0, $size, $size)
  $stream = New-Object System.IO.MemoryStream
  $small.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $images += ,$stream.ToArray()
  if ($size -eq 256) { $small.Save((Join-Path $assetDir 'tas-time.png'), [System.Drawing.Imaging.ImageFormat]::Png) }
  $stream.Dispose(); $g.Dispose(); $small.Dispose(); $bmp.Dispose()
}
$output = [System.IO.File]::Create((Join-Path $assetDir 'tas-time.ico'))
$writer = New-Object System.IO.BinaryWriter $output
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
$offset = 6 + 16 * $images.Count
$sizes = @(16, 24, 32, 48, 64, 128, 0)
for ($i = 0; $i -lt $images.Count; $i++) {
  $writer.Write([byte]$sizes[$i]); $writer.Write([byte]$sizes[$i])
  $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
  $offset += $images[$i].Length
}
foreach ($data in $images) { $writer.Write([byte[]]$data) }
$writer.Dispose()
Write-Output 'Created src/assets/tas-time.ico and tas-time.png'
