param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("check", "write", "invalid")]
  [string]$Mode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DirectRegularFile([string]$Path, [string]$Label) {
  $item = Get-Item -LiteralPath $Path -Force
  if ($item.PSIsContainer -or (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
    throw "$Label is not a direct regular file"
  }
  return $item
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::Open(
    $Path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::Read
  )
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    }
    finally {
      $algorithm.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

$here = [System.IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $here "..\..\..\.."))
$launcherPath = Join-Path $here "sealed-transform-launcher.mjs"
$nodePath = "C:\Program Files\nodejs\node.exe"

$launcher = Get-DirectRegularFile $launcherPath "sealed author launcher"
$node = Get-DirectRegularFile $nodePath "pinned author Node executable"
if ($launcher.Length -ne 16018 -or (Get-Sha256 $launcher.FullName) -ne "55fded04e879597ae7d6ab8aafac2c08dc6f6f72ee938e3ccba15b859eef7831") {
  throw "sealed author launcher bytes differ"
}
if ($node.Length -ne 89578992 -or (Get-Sha256 $node.FullName) -ne "c1b274a8d0a23e060fc42ce71c3cdfa1569b83d91ba82cc59fa907da97a425e9") {
  throw "pinned author Node executable bytes differ"
}

$parentEnvironment = [System.Environment]::GetEnvironmentVariables("Process")
$systemRoot = "C:\Windows"
$originalTemp = [string]$parentEnvironment["TEMP"]
if ([string]::IsNullOrWhiteSpace($originalTemp)) {
  throw "author bootstrap parent lacks a temp root"
}
$systemRoot = [System.IO.Path]::GetFullPath($systemRoot)
$systemRootItem = Get-Item -LiteralPath $systemRoot -Force
if (-not $systemRootItem.PSIsContainer -or (($systemRootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
  throw "author bootstrap Windows root is not a direct directory"
}
$originalTemp = [System.IO.Path]::GetFullPath($originalTemp)
$scratch = [System.IO.Path]::GetFullPath((Join-Path $originalTemp ("qgen-v6-author-bootstrap-" + [System.Guid]::NewGuid().ToString("N"))))
$tempPrefix = $originalTemp.TrimEnd("\") + "\"
if (-not $scratch.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "author bootstrap scratch escaped the exact parent temp root"
}
[System.IO.Directory]::CreateDirectory($scratch) | Out-Null
$scratchItem = Get-Item -LiteralPath $scratch -Force
if (-not $scratchItem.PSIsContainer -or (($scratchItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
  throw "author bootstrap scratch is not a direct directory"
}
$provenanceOutput = Join-Path $scratch "author-transform-provenance.json"

try {
  foreach ($entry in $parentEnvironment.GetEnumerator()) {
    [System.Environment]::SetEnvironmentVariable([string]$entry.Key, $null, "Process")
  }
  $exactEnvironment = [ordered]@{
    "COMSPEC" = (Join-Path $systemRoot "System32\cmd.exe")
    "PATH" = (Join-Path $systemRoot "System32")
    "PATHEXT" = ".COM;.EXE;.BAT;.CMD"
    "SystemRoot" = $systemRoot
    "TEMP" = $scratch
    "TMP" = $scratch
    "WINDIR" = $systemRoot
    "QGEN_V6_AUTHOR_EXTERNAL_BOOTSTRAP" = "1"
  }
  foreach ($entry in $exactEnvironment.GetEnumerator()) {
    [System.Environment]::SetEnvironmentVariable([string]$entry.Key, [string]$entry.Value, "Process")
  }
  Set-Location -LiteralPath $repoRoot
  $arguments = @(
    $launcher.FullName,
    "--role=AUTHOR_BUILD",
    ("--provenance-output=" + $provenanceOutput),
    "--"
  )
  if ($Mode -eq "check") { $arguments += "--check" }
  elseif ($Mode -eq "write") { $arguments += "--write" }
  & $node.FullName @arguments
  $childExitCode = $LASTEXITCODE
  if ($childExitCode -eq 0) {
    $proof = Get-DirectRegularFile $provenanceOutput "author transform provenance"
    if ($proof.Length -lt 1 -or $proof.Length -gt 67108864) {
      throw "author transform provenance size differs"
    }
    [Console]::Out.Write([System.IO.File]::ReadAllText($proof.FullName, [System.Text.Encoding]::UTF8))
  }
  exit $childExitCode
}
finally {
  if (Test-Path -LiteralPath $scratch) {
    $resolvedScratch = [System.IO.Path]::GetFullPath($scratch)
    if (-not $resolvedScratch.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "author bootstrap cleanup target escaped the exact parent temp root"
    }
    Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
  }
}
