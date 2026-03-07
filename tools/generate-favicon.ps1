$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-ResizedBitmap {
    param(
        [Parameter(Mandatory=$true)][System.Drawing.Image]$Image,
        [Parameter(Mandatory=$true)][int]$Size
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        $g.DrawImage($Image, 0, 0, $Size, $Size)
    }
    finally {
        $g.Dispose()
    }
    return $bmp
}

function Get-NonBlackBounds {
    param(
        [Parameter(Mandatory=$true)][System.Drawing.Bitmap]$Bitmap,
        [Parameter(Mandatory=$true)][int]$Threshold
    )

    $minX = $Bitmap.Width
    $minY = $Bitmap.Height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $Bitmap.Height; $y++) {
        for ($x = 0; $x -lt $Bitmap.Width; $x++) {
            $c = $Bitmap.GetPixel($x, $y)
            if ($c.A -gt 0) {
                $m = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
                if ($m -gt $Threshold) {
                    if ($x -lt $minX) { $minX = $x }
                    if ($y -lt $minY) { $minY = $y }
                    if ($x -gt $maxX) { $maxX = $x }
                    if ($y -gt $maxY) { $maxY = $y }
                }
            }
        }
    }

    if ($maxX -lt 0) {
        throw "No non-black pixels found (threshold=$Threshold)."
    }

    return [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
}

function Make-OuterBlackTransparent {
    param(
        [Parameter(Mandatory=$true)][System.Drawing.Bitmap]$Bitmap,
        [Parameter(Mandatory=$true)][int]$Threshold
    )

    $w = $Bitmap.Width
    $h = $Bitmap.Height
    $visited = New-Object bool[] ($w * $h)
    $q = New-Object "System.Collections.Generic.Queue[int]"

    function Is-Background([int]$x, [int]$y) {
        try {
            $c = $Bitmap.GetPixel($x, $y)
        }
        catch {
            throw "GetPixel failed at x=$x y=$y (w=$w h=$h): $($_.Exception.Message)"
        }
        if ($c.A -eq 0) { return $true }
        $m = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
        return ($m -le $Threshold)
    }

    function EnqueueIfBg([int]$x, [int]$y) {
        if ($x -lt 0 -or $y -lt 0 -or $x -ge $w -or $y -ge $h) { return }
        $idx = ($y * $w) + $x
        if (-not $visited[$idx] -and (Is-Background $x $y)) {
            $visited[$idx] = $true
            $q.Enqueue($idx)
        }
    }

    for ($x = 0; $x -lt $w; $x++) {
        EnqueueIfBg $x 0
        EnqueueIfBg $x ($h - 1)
    }
    for ($y = 0; $y -lt $h; $y++) {
        EnqueueIfBg 0 $y
        EnqueueIfBg ($w - 1) $y
    }

    while ($q.Count -gt 0) {
        $idx = $q.Dequeue()
        if ($idx -lt 0 -or $idx -ge $visited.Length) {
            throw "Queue contained out-of-range index $idx (len=$($visited.Length))"
        }
        # PowerShell casts round-to-nearest; we need floor division for index math.
        $y = [int][Math]::Floor($idx / [double]$w)
        $x = $idx - ($y * $w)

        try {
            $c = $Bitmap.GetPixel($x, $y)
        }
        catch {
            throw "GetPixel failed in flood fill at idx=$idx => x=$x y=$y (w=$w h=$h): $($_.Exception.Message)"
        }
        if ($c.A -ne 0) {
            $Bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
        }

        if ($x -gt 0) { EnqueueIfBg ($x - 1) $y }
        if ($x -lt ($w - 1)) { EnqueueIfBg ($x + 1) $y }
        if ($y -gt 0) { EnqueueIfBg $x ($y - 1) }
        if ($y -lt ($h - 1)) { EnqueueIfBg $x ($y + 1) }
    }
}

function Write-IcoFromPngBytes {
    param(
        [Parameter(Mandatory=$true)][string]$OutPath,
        [Parameter(Mandatory=$true)][hashtable]$PngBySize
    )

    $sizes = $PngBySize.Keys | Sort-Object
    $count = $sizes.Count

    $fs = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    $bw = New-Object System.IO.BinaryWriter($fs)
    try {
        # ICONDIR
        $bw.Write([UInt16]0)   # reserved
        $bw.Write([UInt16]1)   # type=icon
        $bw.Write([UInt16]$count)

        $dirEntryOffset = 6
        $dataOffset = $dirEntryOffset + (16 * $count)

        $entries = @()
        foreach ($size in $sizes) {
            $bytes = [byte[]]$PngBySize[$size]
            $entries += [pscustomobject]@{
                Size = [int]$size
                Bytes = $bytes
                Offset = $dataOffset
            }
            $dataOffset += $bytes.Length
        }

        foreach ($e in $entries) {
            $s = $e.Size
            $w = if ($s -ge 256) { 0 } else { $s }
            $h = if ($s -ge 256) { 0 } else { $s }

            $bw.Write([byte]$w)        # width
            $bw.Write([byte]$h)        # height
            $bw.Write([byte]0)         # color count
            $bw.Write([byte]0)         # reserved
            $bw.Write([UInt16]1)       # planes
            $bw.Write([UInt16]32)      # bit count
            $bw.Write([UInt32]$e.Bytes.Length)
            $bw.Write([UInt32]$e.Offset)
        }

        foreach ($e in $entries) {
            $bw.Write($e.Bytes)
        }
    }
    finally {
        $bw.Dispose()
        $fs.Dispose()
    }
}

$assetsDir = Join-Path $PSScriptRoot "..\\src\\main\\resources\\static\\ZClassScheduler\\Assets"
$inputPng = Join-Path $assetsDir "favicon.png"
$outIco = Join-Path $assetsDir "zclassscheduler.ico"

if (-not (Test-Path $inputPng)) {
    throw "Missing input PNG: $inputPng"
}

$src = [System.Drawing.Bitmap]::FromFile($inputPng)
try {
    $nonBlackThreshold = 12
    $bgThreshold = 10
    $pad = 12

    $bounds = Get-NonBlackBounds -Bitmap $src -Threshold $nonBlackThreshold
    $x = [Math]::Max(0, $bounds.X - $pad)
    $y = [Math]::Max(0, $bounds.Y - $pad)
    $r = [Math]::Min($src.Width, $bounds.Right + $pad)
    $b = [Math]::Min($src.Height, $bounds.Bottom + $pad)
    $rect = [System.Drawing.Rectangle]::FromLTRB($x, $y, $r, $b)

    $crop = $src.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        Make-OuterBlackTransparent -Bitmap $crop -Threshold $bgThreshold

        # Square canvas with a little breathing room so it doesn't touch edges.
        $side = [Math]::Max($crop.Width, $crop.Height)
        $canvasSize = $side
        $square = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($square)
        try {
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

            $scale = 0.98
            $tw = [int][Math]::Round($canvasSize * $scale)
            $th = [int][Math]::Round($canvasSize * $scale)
            $dx = [int][Math]::Round(($canvasSize - $tw) / 2.0)
            $dy = [int][Math]::Round(($canvasSize - $th) / 2.0)
            $g.DrawImage($crop, $dx, $dy, $tw, $th)
        }
        finally {
            $g.Dispose()
        }

        try {
            $sizes = @(16, 32, 48, 64, 128, 256)
            $pngBySize = @{}

            foreach ($s in $sizes) {
                $resized = New-ResizedBitmap -Image $square -Size $s
                try {
                    $ms = New-Object System.IO.MemoryStream
                    try {
                        $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                        $pngBySize[$s] = $ms.ToArray()
                    }
                    finally {
                        $ms.Dispose()
                    }

                    # Optional: also write the resized PNGs for debugging/other uses.
                    $pngOut = Join-Path $assetsDir ("zclassscheduler-{0}.png" -f $s)
                    [System.IO.File]::WriteAllBytes($pngOut, [byte[]]$pngBySize[$s])
                }
                finally {
                    $resized.Dispose()
                }
            }

            Write-IcoFromPngBytes -OutPath $outIco -PngBySize $pngBySize
            "Wrote $outIco"
        }
        finally {
            $square.Dispose()
        }
    }
    finally {
        $crop.Dispose()
    }
}
finally {
    $src.Dispose()
}
