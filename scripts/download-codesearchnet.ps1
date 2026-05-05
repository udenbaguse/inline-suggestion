param(
  [string]$OutputDir = "data/codesearchnet/raw",
  [string[]]$Languages = @("python", "java", "javascript", "php", "ruby", "go"),
  [switch]$SkipExtract
)

$ErrorActionPreference = "Stop"

$sources = @(
  "https://s3.amazonaws.com/code-search-net/CodeSearchNet/v2/{0}.zip",
  "https://huggingface.co/datasets/code-search-net/code_search_net/resolve/main/data/{0}.zip"
)

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

foreach ($lang in $Languages) {
  $zipName = "$lang.zip"
  $zipPath = Join-Path $OutputDir $zipName
  $downloaded = $false
  $errors = @()

  foreach ($source in $sources) {
    $url = [string]::Format($source, $lang)
    try {
      Write-Host "Downloading $url"
      Invoke-WebRequest -Uri $url -OutFile $zipPath -Headers @{ "User-Agent" = "inline-suggestion-downloader/1.0" }
      $downloaded = $true
      break
    } catch {
      $errors += "$url -> $($_.Exception.Message)"
      Write-Warning "Failed: $url"
    }
  }

  if (-not $downloaded) {
    throw "Failed to download $lang.zip. Attempts: $($errors -join ' || ')"
  }

  if (-not $SkipExtract) {
    $extractDir = Join-Path $OutputDir $lang
    if (-not (Test-Path $extractDir)) {
      New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    }
    Write-Host "Extracting $zipPath -> $extractDir"
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
  }
}

Write-Host "Done. Data saved in $OutputDir"
