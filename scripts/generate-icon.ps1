# Gera assets/sploit.ico a partir do monograma "SP" da marca Sploit.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/generate-icon.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "sploit-src\packages\opencode\assets"
$outFile = Join-Path $outDir "sploit.ico"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$pink = [System.Drawing.Color]::FromArgb(255, 55, 175)   # #FF37AF (S)
$ember = [System.Drawing.Color]::FromArgb(255, 110, 35)  # #FF6E23 (P)
$bgTop = [System.Drawing.Color]::FromArgb(26, 26, 36)
$bgBottom = [System.Drawing.Color]::FromArgb(10, 10, 16)
$border = [System.Drawing.Color]::FromArgb(45, 45, 65)

function New-RoundedRectPath([System.Drawing.Rectangle]$rect, [float]$radius) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $radius * 2.0
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-RoundedPng([int]$size) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $margin = [Math]::Max(1, [int]($size * 0.03))
    $rect = [System.Drawing.Rectangle]::new($margin, $margin, ($size - 2 * $margin), ($size - 2 * $margin))
    $radius = $size * 0.22

    # fundo em gradiente vertical
    $bgPath = New-RoundedRectPath $rect $radius
    $bgBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $bgTop, $bgBottom, 90.0)
    $g.FillPath($bgBrush, $bgPath)

    # borda sutil
    $inner = [System.Drawing.Rectangle]::new(($rect.X + 1), ($rect.Y + 1), ($rect.Width - 2), ($rect.Height - 2))
    $innerPath = New-RoundedRectPath $inner ($radius - 1.5)
    $borderPen = [System.Drawing.Pen]::new($border, [Math]::Max(1.0, $size * 0.008))
    $g.DrawPath($borderPen, $innerPath)

    # monograma "SP": S em rosa, P em laranja, centralizado
    $family = [System.Drawing.FontFamily]::new("Segoe UI")
    $font = [System.Drawing.Font]::new($family, ($size * 0.52), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $sBrush = [System.Drawing.SolidBrush]::new($pink)
    $pBrush = [System.Drawing.SolidBrush]::new($ember)

    $sSize = $g.MeasureString("S", $font)
    $pSize = $g.MeasureString("P", $font)
    $totalWidth = $sSize.Width + $pSize.Width
    $baseline = $size / 2.0
    $x = ($size - $totalWidth) / 2.0
    $y = $baseline - $sSize.Height / 2.0

    $g.DrawString("S", $font, $sBrush, $x, $y)
    $g.DrawString("P", $font, $pBrush, ($x + $sSize.Width), $y)

    $ms = [System.IO.MemoryStream]::new()
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()

    $ms.Dispose(); $sBrush.Dispose(); $pBrush.Dispose(); $bgBrush.Dispose()
    $borderPen.Dispose(); $font.Dispose(); $family.Dispose()
    $g.Dispose(); $bmp.Dispose()

    return ,$bytes
}

$sizes = @(16, 20, 24, 32, 48, 64, 128, 256)
$pngs = @{}
foreach ($s in $sizes) {
    $pngs[$s] = New-RoundedPng $s
}

# composição do .ico: ICONDIR + ICONDIRENTRY (PNG comprimido, suportado desde o Vista)
$count = $sizes.Count
$header = [System.IO.MemoryStream]::new()
$bw = [System.IO.BinaryWriter]::new($header)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$count)
$offset = 6 + 16 * $count
foreach ($s in $sizes) {
    $bytes = $pngs[$s]
    $bw.Write([byte]($s -band 0xFF))       # largura (0 = 256)
    $bw.Write([byte]($s -band 0xFF))       # altura
    $bw.Write([byte]0)                     # paleta
    $bw.Write([byte]0)                     # reservado
    $bw.Write([uint16]1)                   # planos
    $bw.Write([uint16]32)                  # bpp
    $bw.Write([uint32]$bytes.Length)       # tamanho
    $bw.Write([uint32]$offset)             # offset
    $offset += $bytes.Length
}
foreach ($s in $sizes) {
    $bw.Write($pngs[$s])
}
$bw.Flush()
[System.IO.File]::WriteAllBytes($outFile, $header.ToArray())
$bw.Dispose(); $header.Dispose()

Write-Host "sploit.ico gerado: $outFile ($((Get-Item $outFile).Length) bytes)"
