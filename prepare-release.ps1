<#
  What this file does:
  Prepares a ready-to-zip release folder for Chrome Web Store submission without creating zip files automatically.

  Why it exists:
  The store upload needs a clean runtime bundle and a separate listing-assets bundle, and the user wants to zip them manually.

  How to extend it:
  Add or remove copied files here if the runtime file set or store asset pack changes.
#>

param(
  [string]$ExtensionRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [string]$ReleaseRoot = "C:\ChromeExtension\release"
)

$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $ExtensionRoot "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$releaseFolderName = "Cookieless-$version-store-upload-$timestamp"
$releaseFolder = Join-Path $ReleaseRoot $releaseFolderName
$extensionFolder = Join-Path $releaseFolder "Cookieless-$version-extension-upload"
$listingFolder = Join-Path $releaseFolder "Cookieless-$version-listing-assets"

$runtimeFiles = @(
  "manifest.json",
  "background.js",
  "config.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.js",
  "popup.css",
  "power-tools.js",
  "rules.js",
  "storage.js",
  "support.js"
)

$runtimeDirectories = @(
  "assets\brand",
  "rules"
)

$listingFiles = @(
  "README.md",
  "GITHUB_PUBLISH.md",
  "MANUAL_TEST_PLAN.md",
  "TEST_CASES.md"
)

$listingDirectories = @(
  "assets\store",
  "docs",
  "supabase"
)

function Reset-Directory {
  param([string]$Path)

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }

  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-RelativeFile {
  param(
    [string]$Root,
    [string]$RelativePath,
    [string]$DestinationRoot
  )

  $sourcePath = Join-Path $Root $RelativePath
  $destinationPath = Join-Path $DestinationRoot $RelativePath
  $destinationParent = Split-Path -Parent $destinationPath

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing source file: $sourcePath"
  }

  New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
}

function Copy-RelativeDirectory {
  param(
    [string]$Root,
    [string]$RelativePath,
    [string]$DestinationRoot
  )

  $sourcePath = Join-Path $Root $RelativePath
  $destinationPath = Join-Path $DestinationRoot $RelativePath

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Missing source directory: $sourcePath"
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
}

Reset-Directory -Path $extensionFolder
Reset-Directory -Path $listingFolder

foreach ($relativePath in $runtimeFiles) {
  Copy-RelativeFile -Root $ExtensionRoot -RelativePath $relativePath -DestinationRoot $extensionFolder
}

foreach ($relativePath in $runtimeDirectories) {
  Copy-RelativeDirectory -Root $ExtensionRoot -RelativePath $relativePath -DestinationRoot $extensionFolder
}

foreach ($relativePath in $listingFiles) {
  Copy-RelativeFile -Root $ExtensionRoot -RelativePath $relativePath -DestinationRoot $listingFolder
}

foreach ($relativePath in $listingDirectories) {
  Copy-RelativeDirectory -Root $ExtensionRoot -RelativePath $relativePath -DestinationRoot $listingFolder
}

$releaseNotePath = Join-Path $ExtensionRoot "release\README.md"
$releaseNote = @"
# Cookieless Release Notes

Run this command:

powershell -ExecutionPolicy Bypass -File C:\ChromeExtension\apps\Cookieless\prepare-release.ps1

Latest prepared release folder:

- $releaseFolder

Inside that folder:

- $extensionFolder
- $listingFolder

Manual store submission flow:

1. Zip $(Split-Path -Leaf $extensionFolder)\ for the Chrome Web Store extension upload.
2. Zip $(Split-Path -Leaf $listingFolder)\ if you want one shareable archive of the screenshots, listing copy, and docs.
3. Use the files in docs\ for GitHub Pages publishing.
"@

Set-Content -LiteralPath $releaseNotePath -Value $releaseNote -Encoding UTF8

$releaseFolderNotePath = Join-Path $releaseFolder "README.txt"
$releaseFolderNote = @"
Cookieless release prep completed.

Extension upload folder:
$extensionFolder

Listing assets folder:
$listingFolder

Next step:
1. Zip the extension upload folder manually for the Chrome Web Store package upload.
2. Zip the listing assets folder manually if you want one archive of the screenshots and store copy.
"@

Set-Content -LiteralPath $releaseFolderNotePath -Value $releaseFolderNote -Encoding UTF8

Write-Host "Prepared Cookieless release folders:" -ForegroundColor Green
Write-Host "  Release root:      $releaseFolder"
Write-Host "  Extension upload:  $extensionFolder"
Write-Host "  Listing assets:    $listingFolder"
