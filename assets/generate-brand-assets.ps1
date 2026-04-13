<#
  What this file does:
  Generates the raster icon set, store graphics, and docs image copies for Cookieless.

  Why it exists:
  The extension now has a store-facing brand, a docs site, and a public launch path that all need reproducible assets.

  How to extend it:
  Refresh the color system, screenshots, or promo layouts here when the product branding evolves.
#>

param(
  [string]$ExtensionRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$brandRoot = Join-Path $ExtensionRoot "assets\brand"
$iconRoot = Join-Path $brandRoot "icons"
$storeRoot = Join-Path $ExtensionRoot "assets\store"
$screenshotRoot = Join-Path $storeRoot "screenshots"
$docsRoot = Join-Path $ExtensionRoot "docs"
$docsBrandRoot = Join-Path $docsRoot "assets\brand"
$docsScreenshotRoot = Join-Path $docsRoot "assets\screenshots"

foreach ($path in @($brandRoot, $iconRoot, $storeRoot, $screenshotRoot, $docsBrandRoot, $docsScreenshotRoot)) {
  New-Item -ItemType Directory -Path $path -Force | Out-Null
}

function Get-Color([string]$Hex, [int]$Alpha = 255) {
  $color = [System.Drawing.ColorTranslator]::FromHtml($Hex)
  return [System.Drawing.Color]::FromArgb($Alpha, $color.R, $color.G, $color.B)
}

function New-Canvas([int]$Width, [int]$Height) {
  $bitmap = New-Object System.Drawing.Bitmap $Width, $Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  return @{
    Bitmap = $bitmap
    Graphics = $graphics
    Width = $Width
    Height = $Height
  }
}

function Save-Canvas($Canvas, [string]$Path) {
  $Canvas.Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $Canvas.Graphics.Dispose()
  $Canvas.Bitmap.Dispose()
}

function New-RoundRectPath([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Max(1, $Radius * 2)
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundRect($Graphics, $Brush, [float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = New-RoundRectPath $X $Y $Width $Height $Radius
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Draw-RoundRect($Graphics, $Pen, [float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = New-RoundRectPath $X $Y $Width $Height $Radius
  $Graphics.DrawPath($Pen, $path)
  $path.Dispose()
}

function Draw-Text($Graphics, [string]$Text, [string]$FontName, [float]$Size, $Style, $Brush, [float]$X, [float]$Y) {
  $font = New-Object System.Drawing.Font($FontName, $Size, $Style)
  $Graphics.DrawString($Text, $font, $Brush, $X, $Y)
  $font.Dispose()
}

function Draw-TextCentered($Graphics, [string]$Text, [string]$FontName, [float]$Size, $Style, $Brush, [float]$X, [float]$Y, [float]$Width, [float]$Height) {
  $font = New-Object System.Drawing.Font($FontName, $Size, $Style)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF -ArgumentList $X, $Y, $Width, $Height
  $Graphics.DrawString($Text, $font, $Brush, $rect, $format)
  $format.Dispose()
  $font.Dispose()
}

function Fill-CreamBackground($Graphics, [int]$Width, [int]$Height) {
  $rect = New-Object System.Drawing.RectangleF -ArgumentList 0, 0, $Width, $Height
  $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, (Get-Color "#FBF4EA"), (Get-Color "#F2E5D4"), 90
  $Graphics.FillRectangle($gradient, $rect)
  $gradient.Dispose()

  $warmGlow = New-Object System.Drawing.SolidBrush (Get-Color "#D38A3C" 34)
  $coolGlow = New-Object System.Drawing.SolidBrush (Get-Color "#2E9A8D" 28)
  $Graphics.FillEllipse($warmGlow, $Width * 0.72, -$Height * 0.10, $Width * 0.30, $Height * 0.38)
  $Graphics.FillEllipse($warmGlow, -$Width * 0.08, $Height * 0.58, $Width * 0.22, $Height * 0.28)
  $Graphics.FillEllipse($coolGlow, $Width * 0.06, $Height * 0.04, $Width * 0.16, $Height * 0.20)
  $Graphics.FillEllipse($coolGlow, $Width * 0.76, $Height * 0.64, $Width * 0.16, $Height * 0.18)
  $warmGlow.Dispose()
  $coolGlow.Dispose()
}

function Draw-Card($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height, [string]$FillHex, [int]$Alpha = 244) {
  $brush = New-Object System.Drawing.SolidBrush (Get-Color $FillHex $Alpha)
  Fill-RoundRect $Graphics $brush $X $Y $Width $Height 24
  $brush.Dispose()
  $pen = New-Object System.Drawing.Pen((Get-Color "#B79A73" 42), 1.2)
  Draw-RoundRect $Graphics $pen $X $Y $Width $Height 24
  $pen.Dispose()
}

function Draw-Button($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height, [string]$Label, [string]$FillHex, [string]$TextHex) {
  $brush = New-Object System.Drawing.SolidBrush (Get-Color $FillHex)
  Fill-RoundRect $Graphics $brush $X $Y $Width $Height ($Height / 2)
  $brush.Dispose()
  $textBrush = New-Object System.Drawing.SolidBrush (Get-Color $TextHex)
  Draw-TextCentered $Graphics $Label "Segoe UI Semibold" 13 ([System.Drawing.FontStyle]::Bold) $textBrush $X $Y $Width $Height
  $textBrush.Dispose()
}

function Draw-Pill($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height, [string]$Label, [string]$FillHex, [string]$TextHex) {
  $brush = New-Object System.Drawing.SolidBrush (Get-Color $FillHex)
  Fill-RoundRect $Graphics $brush $X $Y $Width $Height ($Height / 2)
  $brush.Dispose()
  $textBrush = New-Object System.Drawing.SolidBrush (Get-Color $TextHex)
  Draw-TextCentered $Graphics $Label "Segoe UI Semibold" 12 ([System.Drawing.FontStyle]::Bold) $textBrush $X $Y $Width $Height
  $textBrush.Dispose()
}

function Draw-CookieMark($Graphics, [float]$X, [float]$Y, [float]$Size) {
  $backgroundRect = New-Object System.Drawing.RectangleF -ArgumentList $X, $Y, $Size, $Size
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $backgroundRect, (Get-Color "#6D4320"), (Get-Color "#392413"), 120
  Fill-RoundRect $Graphics $bgBrush $X $Y $Size $Size ($Size * 0.24)
  $bgBrush.Dispose()

  $shine = New-Object System.Drawing.SolidBrush (Get-Color "#F6D39B" 36)
  $Graphics.FillEllipse($shine, $X + $Size * 0.64, $Y + $Size * 0.08, $Size * 0.18, $Size * 0.18)
  $shine.Dispose()

  $cookieRect = New-Object System.Drawing.RectangleF -ArgumentList ($X + $Size * 0.18), ($Y + $Size * 0.16), ($Size * 0.52), ($Size * 0.52)
  $cookieBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $cookieRect, (Get-Color "#EBC589"), (Get-Color "#D5A768"), 90
  $Graphics.FillEllipse($cookieBrush, $cookieRect)
  $cookieBrush.Dispose()

  $cookiePen = New-Object System.Drawing.Pen((Get-Color "#8F6134"), [Math]::Max(1.5, $Size * 0.028))
  $Graphics.DrawEllipse($cookiePen, $cookieRect)
  $cookiePen.Dispose()

  $chipBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6F4928")
  $chipLayout = @(
    @(0.28, 0.24, 0.07),
    @(0.44, 0.24, 0.06),
    @(0.52, 0.35, 0.07),
    @(0.33, 0.42, 0.06),
    @(0.48, 0.49, 0.06),
    @(0.26, 0.56, 0.05)
  )
  foreach ($chip in $chipLayout) {
    $Graphics.FillEllipse(
      $chipBrush,
      $X + ($Size * [double]$chip[0]),
      $Y + ($Size * [double]$chip[1]),
      $Size * [double]$chip[2],
      $Size * [double]$chip[2]
    )
  }
  $chipBrush.Dispose()

  $biteBrush = New-Object System.Drawing.SolidBrush (Get-Color "#4A2E18")
  $Graphics.FillEllipse($biteBrush, $X + $Size * 0.56, $Y + $Size * 0.10, $Size * 0.22, $Size * 0.22)
  $Graphics.FillEllipse($biteBrush, $X + $Size * 0.64, $Y + $Size * 0.24, $Size * 0.14, $Size * 0.14)
  $biteBrush.Dispose()

  $shield = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shield.AddLines(@(
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.68), ($Y + $Size * 0.46)),
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.84), ($Y + $Size * 0.52)),
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.84), ($Y + $Size * 0.70)),
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.68), ($Y + $Size * 0.84)),
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.52), ($Y + $Size * 0.70)),
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.52), ($Y + $Size * 0.52)),
    (New-Object System.Drawing.PointF -ArgumentList ($X + $Size * 0.68), ($Y + $Size * 0.46))
  ))
  $shieldBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2E9A8D")
  $Graphics.FillPath($shieldBrush, $shield)
  $shieldBrush.Dispose()
  $shieldPen = New-Object System.Drawing.Pen((Get-Color "#C8FFF6"), [Math]::Max(1.4, $Size * 0.022))
  $Graphics.DrawPath($shieldPen, $shield)
  $shieldPen.Dispose()
  $shield.Dispose()

  $checkPen = New-Object System.Drawing.Pen((Get-Color "#FFFFFF"), [Math]::Max(1.6, $Size * 0.034))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Graphics.DrawLine($checkPen, $X + $Size * 0.60, $Y + $Size * 0.65, $X + $Size * 0.67, $Y + $Size * 0.72)
  $Graphics.DrawLine($checkPen, $X + $Size * 0.67, $Y + $Size * 0.72, $X + $Size * 0.78, $Y + $Size * 0.58)
  $checkPen.Dispose()
}

function Draw-StatTile($Graphics, [float]$X, [float]$Y, [string]$Value, [string]$Label) {
  Draw-Card $Graphics $X $Y 92 84 "#FFF7ED" 250
  $valueBrush = New-Object System.Drawing.SolidBrush (Get-Color "#3C2C1A")
  $labelBrush = New-Object System.Drawing.SolidBrush (Get-Color "#8A6842")
  Draw-TextCentered $Graphics $Value "Segoe UI Semibold" 21 ([System.Drawing.FontStyle]::Bold) $valueBrush $X ($Y + 10) 92 30
  Draw-TextCentered $Graphics $Label "Segoe UI Semibold" 10 ([System.Drawing.FontStyle]::Bold) $labelBrush $X ($Y + 40) 92 28
  $valueBrush.Dispose()
  $labelBrush.Dispose()
}

function Draw-PopupMock($Graphics, [float]$X, [float]$Y, [hashtable]$State) {
  $panelWidth = 360
  $panelHeight = 610
  Draw-Card $Graphics $X $Y $panelWidth $panelHeight "#FFF8F0" 248

  $heroBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (
    (New-Object System.Drawing.RectangleF -ArgumentList ($X + 18), ($Y + 18), 324, 110),
    (Get-Color "#FFF8EF"),
    (Get-Color "#F4E3CE"),
    145
  )
  Fill-RoundRect $Graphics $heroBrush ($X + 18) ($Y + 18) 324 110 24
  $heroBrush.Dispose()

  Draw-CookieMark $Graphics ($X + 34) ($Y + 34) 52
  $eyebrowBrush = New-Object System.Drawing.SolidBrush (Get-Color "#8A6137")
  $titleBrush = New-Object System.Drawing.SolidBrush (Get-Color "#382918")
  $copyBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6E5234")
  Draw-Text $Graphics "QUIET BROWSING BY DEFAULT" "Segoe UI Semibold" 9.5 ([System.Drawing.FontStyle]::Bold) $eyebrowBrush ($X + 98) ($Y + 36)
  Draw-Text $Graphics "Cookieless" "Georgia" 22 ([System.Drawing.FontStyle]::Bold) $titleBrush ($X + 98) ($Y + 52)
  Draw-Text $Graphics "Hide cookie nags quietly with optional user-initiated reporting." "Segoe UI" 10.8 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 34) ($Y + 92)

  Draw-Card $Graphics ($X + 18) ($Y + 142) 324 86 "#FFFDF9" 252
  Draw-Text $Graphics "BROWSING STYLE" "Segoe UI Semibold" 10 ([System.Drawing.FontStyle]::Bold) $eyebrowBrush ($X + 34) ($Y + 158)
  Draw-Card $Graphics ($X + 34) ($Y + 176) 292 34 "#FFF8EF" 255
  Draw-Text $Graphics $State.ModeLabel "Segoe UI" 11.5 ([System.Drawing.FontStyle]::Regular) $titleBrush ($X + 48) ($Y + 184)
  Draw-Text $Graphics $State.ModeHelp "Segoe UI" 9.4 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 34) ($Y + 212)

  Draw-Card $Graphics ($X + 18) ($Y + 242) 324 166 "#FFFDF9" 252
  Draw-Text $Graphics "CURRENT SITE" "Segoe UI Semibold" 10 ([System.Drawing.FontStyle]::Bold) $eyebrowBrush ($X + 34) ($Y + 258)
  Draw-Text $Graphics $State.Hostname "Segoe UI Semibold" 16 ([System.Drawing.FontStyle]::Bold) $titleBrush ($X + 34) ($Y + 280)
  Draw-Pill $Graphics ($X + 34) ($Y + 312) 92 28 $State.Outcome $State.OutcomeFill $State.OutcomeText
  Draw-Text $Graphics $State.Activity "Segoe UI" 10.6 ([System.Drawing.FontStyle]::Regular) $titleBrush ($X + 34) ($Y + 350)
  Draw-Text $Graphics $State.Banner "Segoe UI" 9.6 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 34) ($Y + 378)

  Draw-Button $Graphics ($X + 18) ($Y + 424) 156 42 $State.ToggleLabel "#FFF8EF" "#43311C"
  Draw-Button $Graphics ($X + 186) ($Y + 424) 156 42 "Report broken site" "#6D4320" "#FFF9F0"

  Draw-Text $Graphics "Reports are optional and sent only when you click the button." "Segoe UI" 9.2 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 24) ($Y + 480)
  Draw-Text $Graphics "No auto-send" "Segoe UI Semibold" 9.2 ([System.Drawing.FontStyle]::Bold) $titleBrush ($X + 268) ($Y + 480)

  Draw-Card $Graphics ($X + 18) ($Y + 510) 324 82 "#FFFDF9" 252
  Draw-Text $Graphics "LIFETIME STATS" "Segoe UI Semibold" 10 ([System.Drawing.FontStyle]::Bold) $eyebrowBrush ($X + 34) ($Y + 526)
  Draw-StatTile $Graphics ($X + 34) ($Y + 544) $State.Hidden "Hidden"
  Draw-StatTile $Graphics ($X + 134) ($Y + 544) $State.Rejected "Rejected"
  Draw-StatTile $Graphics ($X + 234) ($Y + 544) $State.Reports "Reports"

  $eyebrowBrush.Dispose()
  $titleBrush.Dispose()
  $copyBrush.Dispose()
}

function Draw-BrowserShell($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height) {
  Draw-Card $Graphics $X $Y $Width $Height "#FFF9F0" 248
  $topBrush = New-Object System.Drawing.SolidBrush (Get-Color "#EDE1D0")
  Fill-RoundRect $Graphics $topBrush $X $Y $Width 56 24
  $topBrush.Dispose()
  $dotBrush = New-Object System.Drawing.SolidBrush (Get-Color "#B99974")
  $Graphics.FillEllipse($dotBrush, $X + 20, $Y + 22, 10, 10)
  $Graphics.FillEllipse($dotBrush, $X + 38, $Y + 22, 10, 10)
  $Graphics.FillEllipse($dotBrush, $X + 56, $Y + 22, 10, 10)
  $dotBrush.Dispose()
  Draw-Card $Graphics ($X + 88) ($Y + 15) ($Width - 116) 26 "#FFF8EF" 255
}

function Draw-NewsPage($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height) {
  Draw-BrowserShell $Graphics $X $Y $Width $Height
  Draw-Card $Graphics ($X + 20) ($Y + 80) ($Width - 40) 48 "#102A20" 250
  Draw-Card $Graphics ($X + 20) ($Y + 150) ($Width * 0.56) ($Height * 0.36) "#D9E6CF" 255
  Draw-Card $Graphics ($X + $Width * 0.62) ($Y + 150) ($Width * 0.28) 180 "#FFF7ED" 255
  Draw-Card $Graphics ($X + 20) ($Y + 468) ($Width - 40) 110 "#FFF7ED" 255

  $headlineBrush = New-Object System.Drawing.SolidBrush (Get-Color "#183627")
  $mutedBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6F7A6E")
  Draw-Text $Graphics "Tech headlines" "Segoe UI Semibold" 16 ([System.Drawing.FontStyle]::Bold) $headlineBrush ($X + 38) ($Y + 98)
  Draw-Text $Graphics "Article cards, lists, and page content stay visible behind the consent flow." "Segoe UI" 11 ([System.Drawing.FontStyle]::Regular) $mutedBrush ($X + 38) ($Y + 124)
  Draw-Text $Graphics "Top stories" "Segoe UI Semibold" 14 ([System.Drawing.FontStyle]::Bold) $headlineBrush ($X + $Width * 0.65) ($Y + 166)
  $headlineBrush.Dispose()
  $mutedBrush.Dispose()
}

function Draw-ConsentModal($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height, [string]$PrimaryLabel, [string]$SecondaryLabel, [int]$Alpha = 255) {
  $overlay = New-Object System.Drawing.SolidBrush (Get-Color "#1E140D" 90)
  $Graphics.FillRectangle($overlay, $X, $Y, $Width, $Height)
  $overlay.Dispose()

  $modalX = $X + ($Width * 0.24)
  $modalY = $Y + ($Height * 0.14)
  $modalWidth = $Width * 0.46
  $modalHeight = $Height * 0.58
  Draw-Card $Graphics $modalX $modalY $modalWidth $modalHeight "#FFFDF9" $Alpha
  Draw-CookieMark $Graphics ($modalX + 24) ($modalY + 22) 56

  $titleBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2B231A")
  $copyBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6E5234")
  Draw-Text $Graphics "This site asks for consent" "Segoe UI Semibold" 18 ([System.Drawing.FontStyle]::Bold) $titleBrush ($modalX + 96) ($modalY + 28)
  Draw-Text $Graphics "Personalised ads, measurement, and device storage access." "Segoe UI" 10.6 ([System.Drawing.FontStyle]::Regular) $copyBrush ($modalX + 26) ($modalY + 106)
  Draw-Text $Graphics "Cookieless can reject supported banners or hide them quietly." "Segoe UI" 10.6 ([System.Drawing.FontStyle]::Regular) $copyBrush ($modalX + 26) ($modalY + 132)
  Draw-Button $Graphics ($modalX + 26) ($modalY + $modalHeight - 70) 146 40 $SecondaryLabel "#FFF8EF" "#43311C"
  Draw-Button $Graphics ($modalX + 186) ($modalY + $modalHeight - 70) 146 40 $PrimaryLabel "#6D4320" "#FFF9F0"
  $titleBrush.Dispose()
  $copyBrush.Dispose()
}

function Draw-ReportDisclosureMock($Graphics, [float]$X, [float]$Y, [float]$Width, [float]$Height) {
  Draw-Card $Graphics $X $Y $Width $Height "#FFFDF9" 250
  Draw-Card $Graphics ($X + 20) ($Y + 20) ($Width - 40) 44 "#F7F2E8" 255
  $headlineBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2B231A")
  Draw-Text $Graphics "Before you report" "Segoe UI Semibold" 16 ([System.Drawing.FontStyle]::Bold) $headlineBrush ($X + 34) ($Y + 32)

  $labelBrush = New-Object System.Drawing.SolidBrush (Get-Color "#8A6137")
  $copyBrush = New-Object System.Drawing.SolidBrush (Get-Color "#5D4B37")
  $debugBrush = New-Object System.Drawing.SolidBrush (Get-Color "#F8E9D4")
  Draw-Card $Graphics ($X + 28) ($Y + 84) ($Width - 56) 76 "#FFF8EF" 255
  Draw-Text $Graphics "Current page: techcrunch.com" "Segoe UI Semibold" 12 ([System.Drawing.FontStyle]::Bold) $headlineBrush ($X + 42) ($Y + 102)
  Draw-Text $Graphics "Cookieless sends the full URL and diagnostics only when you confirm." "Segoe UI" 10.4 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 42) ($Y + 126)
  Draw-Text $Graphics "This helps support reproduce and fix banner issues faster." "Segoe UI" 10.4 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 42) ($Y + 148)
  Draw-Text $Graphics "Disclosure" "Segoe UI Semibold" 10 ([System.Drawing.FontStyle]::Bold) $labelBrush ($X + 28) ($Y + 182)
  Draw-Card $Graphics ($X + 28) ($Y + 200) ($Width - 56) 72 "#FFF8EF" 255
  Draw-Text $Graphics "I understand and want Cookieless to send reports when I click report." "Segoe UI" 10.2 ([System.Drawing.FontStyle]::Regular) $copyBrush ($X + 42) ($Y + 214)
  Draw-Text $Graphics "Payload preview" "Segoe UI Semibold" 10 ([System.Drawing.FontStyle]::Bold) $labelBrush ($X + 28) ($Y + 292)
  Draw-Card $Graphics ($X + 28) ($Y + 310) ($Width - 56) ($Height - 390) "#2B231A" 245
  Draw-Text $Graphics "Mode: Recommended" "Consolas" 10 ([System.Drawing.FontStyle]::Regular) $debugBrush ($X + 42) ($Y + 326)
  Draw-Text $Graphics "Outcome: Hidden only" "Consolas" 10 ([System.Drawing.FontStyle]::Regular) $debugBrush ($X + 42) ($Y + 348)
  Draw-Text $Graphics "Detected banner: Generic cookie-related banner" "Consolas" 10 ([System.Drawing.FontStyle]::Regular) $debugBrush ($X + 42) ($Y + 370)
  Draw-Button $Graphics ($X + 28) ($Y + $Height - 58) 88 36 "Cancel" "#FFF8EF" "#43311C"
  Draw-Button $Graphics ($X + 126) ($Y + $Height - 58) 94 36 "Review" "#FFF8EF" "#43311C"
  Draw-Button $Graphics ($X + $Width - 172) ($Y + $Height - 58) 136 36 "Send report" "#2E9A8D" "#F6FFFD"
  $headlineBrush.Dispose()
  $labelBrush.Dispose()
  $copyBrush.Dispose()
  $debugBrush.Dispose()
}

function Draw-Arrow($Graphics, [float]$X1, [float]$Y1, [float]$X2, [float]$Y2) {
  $pen = New-Object System.Drawing.Pen((Get-Color "#2E9A8D"), 6)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $Graphics.DrawLine($pen, $X1, $Y1, $X2, $Y2)
  $pen.Dispose()
  $arrowBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2E9A8D")
  $triangle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $triangle.AddPolygon(@(
    (New-Object System.Drawing.PointF -ArgumentList $X2, $Y2),
    (New-Object System.Drawing.PointF -ArgumentList ($X2 - 20), ($Y2 - 12)),
    (New-Object System.Drawing.PointF -ArgumentList ($X2 - 20), ($Y2 + 12))
  ))
  $Graphics.FillPath($arrowBrush, $triangle)
  $triangle.Dispose()
  $arrowBrush.Dispose()
}

function Draw-SceneHeader($Graphics, [string]$Title, [string]$Subtitle) {
  $eyebrowBrush = New-Object System.Drawing.SolidBrush (Get-Color "#8A6137")
  $titleBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2B231A")
  $copyBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6E5234")
  Draw-Text $Graphics "COOKIE-QUIET BROWSING" "Segoe UI Semibold" 13 ([System.Drawing.FontStyle]::Bold) $eyebrowBrush 74 58
  Draw-Text $Graphics $Title "Georgia" 30 ([System.Drawing.FontStyle]::Bold) $titleBrush 74 84
  Draw-Text $Graphics $Subtitle "Segoe UI" 13.5 ([System.Drawing.FontStyle]::Regular) $copyBrush 74 132
  $eyebrowBrush.Dispose()
  $titleBrush.Dispose()
  $copyBrush.Dispose()
}

function New-Screenshot([string]$Path, [string]$Title, [string]$Subtitle, [scriptblock]$DrawContent) {
  $canvas = New-Canvas 1280 800
  $graphics = $canvas.Graphics
  Fill-CreamBackground $graphics 1280 800
  Draw-CookieMark $graphics 74 630 80
  Draw-SceneHeader $graphics $Title $Subtitle
  & $DrawContent $graphics
  Save-Canvas $canvas $Path
}

function New-PromoTile([string]$Path, [int]$Width, [int]$Height, [string]$Headline, [string]$Subhead) {
  $canvas = New-Canvas $Width $Height
  $graphics = $canvas.Graphics
  Fill-CreamBackground $graphics $Width $Height
  Draw-CookieMark $graphics ($Width * 0.08) ($Height * 0.18) ([Math]::Min($Width, $Height) * 0.30)
  $headlineBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2B231A")
  $copyBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6E5234")
  Draw-Text $graphics $Headline "Georgia" ([Math]::Max(20, $Width / 12)) ([System.Drawing.FontStyle]::Bold) $headlineBrush ($Width * 0.42) ($Height * 0.22)
  Draw-Text $graphics $Subhead "Segoe UI" ([Math]::Max(11, $Width / 28)) ([System.Drawing.FontStyle]::Regular) $copyBrush ($Width * 0.42) ($Height * 0.52)
  $headlineBrush.Dispose()
  $copyBrush.Dispose()
  Save-Canvas $canvas $Path
}

function New-Icon([string]$Path, [int]$Size) {
  $canvas = New-Canvas $Size $Size
  Draw-CookieMark $canvas.Graphics 0 0 $Size
  Save-Canvas $canvas $Path
}

New-Icon (Join-Path $iconRoot "icon-16.png") 16
New-Icon (Join-Path $iconRoot "icon-32.png") 32
New-Icon (Join-Path $iconRoot "icon-48.png") 48
New-Icon (Join-Path $iconRoot "icon-128.png") 128
New-Icon (Join-Path $iconRoot "icon-256.png") 256

New-Screenshot (Join-Path $screenshotRoot "screenshot-01-popup-overview.png") `
  "A popup normal people can read fast" `
  "Cookieless keeps the browser controls simple: plain-language modes, one site status card, one pause button, and one optional report action." `
  {
    param($g)
    Draw-NewsPage $g 74 214 720 470
    Draw-PopupMock $g 844 120 @{
      ModeLabel = "Recommended"
      ModeHelp = "Rejects supported banners and hides the rest."
      Hostname = "techcrunch.com"
      Outcome = "Hidden"
      OutcomeFill = "#ECF3FF"
      OutcomeText = "#2457A6"
      Activity = "Hid a banner without clicking it."
      Banner = "Saw a banner, but not a named one yet."
      ToggleLabel = "Pause on this site"
      Hidden = "182"
      Rejected = "4"
      Reports = "3"
    }
  }

New-Screenshot (Join-Path $screenshotRoot "screenshot-02-quiet-handling.png") `
  "Quiet handling before heavy recovery" `
  "Supported banners can be rejected, and the rest can be hidden visually so the page becomes usable without pushing users into extra decisions." `
  {
    param($g)
    Draw-NewsPage $g 74 220 792 470
    Draw-ConsentModal $g 74 220 792 470 "Consent" "Do not consent" 240
    Draw-Pill $g 118 258 126 30 "Handled quietly" "#DFF4DF" "#1E6A3B"
    Draw-PopupMock $g 896 142 @{
      ModeLabel = "Recommended"
      ModeHelp = "Rejects supported banners and hides the rest."
      Hostname = "news.example"
      Outcome = "Rejected"
      OutcomeFill = "#DFF4DF"
      OutcomeText = "#1E6A3B"
      Activity = "Rejected a supported banner on this page."
      Banner = "Recognized banner: Sourcepoint."
      ToggleLabel = "Pause on this site"
      Hidden = "120"
      Rejected = "38"
      Reports = "1"
    }
  }

New-Screenshot (Join-Path $screenshotRoot "screenshot-03-report-flow.png") `
  "Broken-site reports stay in your hands" `
  "The popup requests consent first and then sends a support report only when the user explicitly confirms." `
  {
    param($g)
    Draw-PopupMock $g 86 148 @{
      ModeLabel = "Recommended"
      ModeHelp = "Rejects supported banners and hides the rest."
      Hostname = "yahoo.com"
      Outcome = "Hidden"
      OutcomeFill = "#ECF3FF"
      OutcomeText = "#2457A6"
      Activity = "Hid a banner without clicking it."
      Banner = "Saw a banner, but not a named one yet."
      ToggleLabel = "Pause on this site"
      Hidden = "132"
      Rejected = "22"
      Reports = "5"
    }
    Draw-Arrow $g 474 384 618 384
    Draw-ReportDisclosureMock $g 650 166 540 500
  }

New-Screenshot (Join-Path $screenshotRoot "screenshot-04-site-pause.png") `
  "One obvious recovery button" `
  "If a site breaks or feels wrong, pause Cookieless on that site and reload instead of choosing between troubleshooting actions you should not need to learn." `
  {
    param($g)
    Draw-NewsPage $g 74 220 760 470
    Draw-Pill $g 118 258 90 30 "Paused" "#EFE6D7" "#6B5439"
    Draw-PopupMock $g 876 140 @{
      ModeLabel = "Recommended"
      ModeHelp = "Rejects supported banners and hides the rest."
      Hostname = "example-store.com"
      Outcome = "Paused"
      OutcomeFill = "#EFE6D7"
      OutcomeText = "#6B5439"
      Activity = "Cookieless is paused here, so this site is left alone."
      Banner = "Banner handling is paused here."
      ToggleLabel = "Resume on this site"
      Hidden = "182"
      Rejected = "41"
      Reports = "6"
    }
  }

New-Screenshot (Join-Path $screenshotRoot "screenshot-05-local-first.png") `
  "Local-first browsing with optional reporting" `
  "No account and no silent report submission. Banner handling stays local, and support reports are user-initiated." `
  {
    param($g)
    Draw-Card $g 86 246 334 376 "#FFFDF9" 250
    Draw-CookieMark $g 118 278 64
    $titleBrush = New-Object System.Drawing.SolidBrush (Get-Color "#2B231A")
    $copyBrush = New-Object System.Drawing.SolidBrush (Get-Color "#6E5234")
    Draw-Text $g "Processed locally" "Segoe UI Semibold" 18 ([System.Drawing.FontStyle]::Bold) $titleBrush 202 292
    Draw-Text $g "Banner checks and page changes stay in the browser." "Segoe UI" 11 ([System.Drawing.FontStyle]::Regular) $copyBrush 118 350
    Draw-Text $g "No auto-telemetry" "Segoe UI Semibold" 16 ([System.Drawing.FontStyle]::Bold) $titleBrush 118 404
    Draw-Text $g "No analytics" "Segoe UI Semibold" 16 ([System.Drawing.FontStyle]::Bold) $titleBrush 118 448
    Draw-Text $g "User-controlled reporting" "Segoe UI Semibold" 16 ([System.Drawing.FontStyle]::Bold) $titleBrush 118 492
    Draw-Text $g "Reporting is optional and only sent when you click report." "Segoe UI" 11 ([System.Drawing.FontStyle]::Regular) $copyBrush 118 522
    $titleBrush.Dispose()
    $copyBrush.Dispose()
    Draw-PopupMock $g 486 140 @{
      ModeLabel = "Hide only"
      ModeHelp = "Never clicks buttons. Only hides banners visually."
      Hostname = "example-blog.com"
      Outcome = "Hidden"
      OutcomeFill = "#ECF3FF"
      OutcomeText = "#2457A6"
      Activity = "Hid a banner without clicking it."
      Banner = "No recognized banner yet."
      ToggleLabel = "Pause on this site"
      Hidden = "201"
      Rejected = "12"
      Reports = "7"
    }
  }

New-PromoTile (Join-Path $storeRoot "small-promo-440x280.png") 440 280 "Cookieless" "Quiet cookie handling with simple controls and optional reporting."
New-PromoTile (Join-Path $storeRoot "marquee-1400x560.png") 1400 560 "Cookieless" "Reject supported banners, hide the rest, and report broken sites only when you choose."
New-PromoTile (Join-Path $storeRoot "video-thumbnail-1280x720.png") 1280 720 "Cookieless demo" "See the quiet popup flow, pause recovery, and consent-first report flow."

$docsShotMap = @{
  "screenshot-01-popup-overview.png" = "popup-overview.png"
  "screenshot-02-quiet-handling.png" = "quiet-handling.png"
  "screenshot-03-report-flow.png" = "report-flow.png"
  "screenshot-04-site-pause.png" = "site-pause.png"
  "screenshot-05-local-first.png" = "local-first.png"
}

foreach ($sourceName in $docsShotMap.Keys) {
  Copy-Item -LiteralPath (Join-Path $screenshotRoot $sourceName) -Destination (Join-Path $docsScreenshotRoot $docsShotMap[$sourceName]) -Force
}

foreach ($brandFile in @("icon-mark.svg", "wordmark.svg", "logo-lockup.svg", "favicon-mini.svg")) {
  Copy-Item -LiteralPath (Join-Path $brandRoot $brandFile) -Destination (Join-Path $docsBrandRoot $brandFile) -Force
}

Copy-Item -LiteralPath (Join-Path $iconRoot "icon-128.png") -Destination (Join-Path $docsBrandRoot "icon-128.png") -Force

Write-Host "Generated Cookieless brand and store assets:" -ForegroundColor Green
Write-Host "  Icons:       $iconRoot"
Write-Host "  Screenshots: $screenshotRoot"
Write-Host "  Docs assets: $docsRoot\assets"
Write-Host "  Promo:       $storeRoot"
