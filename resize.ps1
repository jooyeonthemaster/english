Add-Type -AssemblyName System.Drawing
$imgPath = 'C:\3d models\juniham.jpg'
$outPath = 'C:\3d models\juniham_1_1.5.jpg'

try {
    $img = [System.Drawing.Image]::FromFile($imgPath)
    $newWidth = $img.Width
    $newHeight = [Math]::Round($img.Width * 1.5)
    
    Write-Host "Original size: $($img.Width)x$($img.Height)"
    Write-Host "New size: ${newWidth}x${newHeight}"
    
    $newImg = New-Object System.Drawing.Bitmap $newWidth, $newHeight
    $graphics = [System.Drawing.Graphics]::FromImage($newImg)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($img, 0, 0, $newWidth, $newHeight)
    
    $img.Dispose()
    
    $newImg.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $newImg.Dispose()
    $graphics.Dispose()
    
    Write-Host "Image successfully resized and saved to $outPath"
} catch {
    Write-Error $_
}
