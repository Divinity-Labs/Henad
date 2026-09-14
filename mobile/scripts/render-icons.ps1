# Regenerate mobile/assets/{icon,adaptive-icon,splash-icon}.png.
#
#   pwsh mobile/scripts/render-icons.ps1 -Font <InstrumentSans-SemiBold.ttf> -Assets mobile/assets
#
# Get the font as a static TTF (Google Fonts serves one to non-browser user agents):
#   curl -s -A "Wget/1.21" "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600"
# then download the .ttf URL it returns. Instrument Sans is SIL OFL.
#
# After changing the icons, rebuild the app. They are baked into the APK at build time.
param(
  [Parameter(Mandatory = $true)][string]$Font,
  [Parameter(Mandatory = $true)][string]$Assets
)
# Renders the Henad app icons from the same geometry as web/src/app/icon.svg (a 100-unit
# viewBox), in Instrument Sans SemiBold, using GDI+. resvg-js was tried first and fails to
# allocate a single 1024x1024 buffer on this machine; GDI+ does not.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Px = 1024
$Ink = [System.Drawing.Color]::FromArgb(255, 0x0E, 0x09, 0x1C)
$White = [System.Drawing.Color]::FromArgb(255, 0xFF, 0xFF, 0xFF)
$Purple = [System.Drawing.Color]::FromArgb(255, 0x6E, 0x54, 0xFF)

$fonts = New-Object System.Drawing.Text.PrivateFontCollection
$fonts.AddFontFile($Font)
$family = $fonts.Families[0]
# The static TTF is already the 600 instance; take whichever style GDI+ exposes for it.
$style = if ($family.IsStyleAvailable([System.Drawing.FontStyle]::Regular)) { [System.Drawing.FontStyle]::Regular } else { [System.Drawing.FontStyle]::Bold }

function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [single](2 * $r)
  $p.AddArc($x, $y, $d, $d, [single]180, [single]90)
  $p.AddArc([single]($x + $w - $d), $y, $d, $d, [single]270, [single]90)
  $p.AddArc([single]($x + $w - $d), [single]($y + $h - $d), $d, $d, [single]0, [single]90)
  $p.AddArc($x, [single]($y + $h - $d), $d, $d, [single]90, [single]90)
  $p.CloseFigure()
  return $p
}

# The H with its baseline at y=64 and em size 62, centred on x=50, then the purple bar.
function Add-Mark([System.Drawing.Graphics]$g) {
  $em = [single]62
  $glyph = New-Object System.Drawing.Drawing2D.GraphicsPath
  # Instrument Sans draws the H as overlapping contours. GDI+ defaults to even-odd fill,
  # which cancels every overlap and punches square holes where the crossbar meets the
  # stems. Browsers fill text with the nonzero rule; match them.
  $glyph.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $glyph.AddString('H', $family, [int]$style, $em, (New-Object System.Drawing.PointF 0, 0), [System.Drawing.StringFormat]::GenericTypographic)
  $ascent = $em * $family.GetCellAscent($style) / $family.GetEmHeight($style)
  $b = $glyph.GetBounds()
  $m = New-Object System.Drawing.Drawing2D.Matrix
  $m.Translate([single](50 - ($b.X + $b.Width / 2)), [single](64 - $ascent))
  $glyph.Transform($m)
  $g.FillPath((New-Object System.Drawing.SolidBrush $White), $glyph)
  $g.FillPath((New-Object System.Drawing.SolidBrush $Purple), (New-RoundRect 16 76 68 5 2.5))
  return $glyph.GetBounds()
}

function Save-Asset([string]$name, [int]$supersample, [scriptblock]$draw) {
  $big = $Px * $supersample
  $bmp = New-Object System.Drawing.Bitmap $big, $big, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform([single]($big / 100.0), [single]($big / 100.0))
  $bounds = & $draw $g
  $g.Dispose()

  $out = $bmp
  if ($supersample -gt 1) {
    # Regions are not antialiased in GDI+, so shapes that need one are drawn large and
    # scaled down, which antialiases every edge at once.
    $out = New-Object System.Drawing.Bitmap $Px, $Px, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $og = [System.Drawing.Graphics]::FromImage($out)
    $og.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $og.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $og.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $attrs = New-Object System.Drawing.Imaging.ImageAttributes
    $attrs.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
    $og.DrawImage($bmp, (New-Object System.Drawing.Rectangle 0, 0, $Px, $Px), 0, 0, $big, $big, [System.Drawing.GraphicsUnit]::Pixel, $attrs)
    $og.Dispose()
    $bmp.Dispose()
  }

  # Guard against a glyph placed off-canvas or not drawn: count white on a sample grid.
  $white = 0
  for ($y = 0; $y -lt $Px; $y += 8) {
    for ($x = 0; $x -lt $Px; $x += 8) {
      $c = $out.GetPixel($x, $y)
      if ($c.A -gt 230 -and $c.R -gt 230 -and $c.G -gt 230 -and $c.B -gt 230) { $white++ }
    }
  }
  if ($white -lt 50) { throw "${name}: the H did not render ($white white samples)" }

  $path = Join-Path $Assets "$name.png"
  $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
  "{0,-16} {1}x{1}  white samples {2,5}  glyph box x {3:N1}..{4:N1} y {5:N1}..{6:N1}  {7:N0} bytes" -f "$name.png", $Px, $white, $bounds.Left, $bounds.Right, $bounds.Top, $bounds.Bottom, (Get-Item $path).Length
}

# Full bleed and opaque: iOS rejects transparency and applies its own corner mask.
Save-Asset 'icon' 1 {
  param($g)
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $Ink), 0, 0, 100, 100)
  Add-Mark $g
}

# Transparent foreground for Android's adaptive icon. The launcher crops to a shape of its
# choosing, so the mark is scaled to 60% about the centre to stay inside the safe zone.
Save-Asset 'adaptive-icon' 1 {
  param($g)
  $g.TranslateTransform(50, 50); $g.ScaleTransform(0.6, 0.6); $g.TranslateTransform(-50, -50)
  Add-Mark $g
}

# The receipt slip exactly as the favicon draws it: rounded, with the torn bottom edge.
Save-Asset 'splash-icon' 4 {
  param($g)
  $region = New-Object System.Drawing.Region (New-RoundRect 0 0 100 100 18)
  foreach ($cx in 12.5, 37.5, 62.5, 87.5) {
    $tooth = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tooth.AddEllipse([single]($cx - 11), [single]89, [single]22, [single]22)
    $region.Exclude($tooth)
  }
  $g.FillRegion((New-Object System.Drawing.SolidBrush $Ink), $region)
  Add-Mark $g
}
