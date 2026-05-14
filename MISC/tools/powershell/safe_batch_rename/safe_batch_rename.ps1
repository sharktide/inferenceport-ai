param(
  [string]$directory,
  [string]$prefix,
  [string]$replacement,
  [switch]$preview,
  [string]$allowed_root
)

if ([string]::IsNullOrWhiteSpace($directory)) {
  Write-Error "directory is required"
  exit 1
}
if ([string]::IsNullOrWhiteSpace($prefix)) {
  Write-Error "prefix is required"
  exit 1
}
if ($null -eq $replacement) {
  $replacement = ""
}

$resolvedDir = (Resolve-Path -LiteralPath $directory).Path

if (-not [string]::IsNullOrWhiteSpace($allowed_root)) {
  $resolvedRoot = (Resolve-Path -LiteralPath $allowed_root).Path
  if (-not $resolvedDir.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "directory must be inside allowed_root"
    exit 1
  }
}

$items = Get-ChildItem -LiteralPath $resolvedDir -File
$renames = @()

foreach ($item in $items) {
  if ($item.Name.StartsWith($prefix)) {
    $newName = "$replacement$($item.Name.Substring($prefix.Length))"
    $renames += [pscustomobject]@{
      old = $item.Name
      new = $newName
      changed = ($item.Name -ne $newName)
    }
    if (-not $preview -and $item.Name -ne $newName) {
      Rename-Item -LiteralPath $item.FullName -NewName $newName
    }
  }
}

$result = [pscustomobject]@{
  ok = $true
  directory = $resolvedDir
  preview = [bool]$preview
  matched = $renames.Count
  renames = $renames
}

$result | ConvertTo-Json -Depth 6
