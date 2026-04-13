<#
  What this file does:
  Runs a static smoke gate for the current Cookieless launch package.

  Why it exists:
  The popup, remote report flow, safer cookie-only handling, docs, and release prep all need to stay aligned before launch.

  How to extend it:
  Add new markers here when the runtime surface, listing assets, or release-prep layout changes.
#>

param(
  [string]$Root = "C:\ChromeExtension\apps\Cookieless"
)

$ErrorActionPreference = "Stop"

$requiredFiles = @(
  ".gitignore",
  "manifest.json",
  "storage.js",
  "rules.js",
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.css",
  "popup.js",
  "support.js",
  "config.js",
  "prepare-release.ps1",
  "README.md",
  "TEST_CASES.md",
  "MANUAL_TEST_PLAN.md",
  "GITHUB_PUBLISH.md",
  "release\README.md",
  "post-change-smoke.ps1",
  "run-http-harness.ps1",
  "assets\generate-brand-assets.ps1",
  "assets\brand\favicon-mini.svg",
  "assets\brand\icon-mark.svg",
  "assets\brand\logo-lockup.svg",
  "assets\brand\wordmark.svg",
  "assets\brand\icons\icon-16.png",
  "assets\brand\icons\icon-32.png",
  "assets\brand\icons\icon-48.png",
  "assets\brand\icons\icon-128.png",
  "assets\store\STORE_LISTING.md",
  "assets\store\RELEASE_CHECKLIST.md",
  "assets\store\VIDEO_STORYBOARD.md",
  "assets\store\small-promo-440x280.png",
  "assets\store\marquee-1400x560.png",
  "assets\store\video-thumbnail-1280x720.png",
  "assets\store\screenshots\screenshot-01-popup-overview.png",
  "assets\store\screenshots\screenshot-02-quiet-handling.png",
  "assets\store\screenshots\screenshot-03-report-flow.png",
  "assets\store\screenshots\screenshot-04-site-pause.png",
  "assets\store\screenshots\screenshot-05-local-first.png",
  "docs\index.html",
  "docs\privacy-policy.html",
  "docs\styles.css",
  "docs\assets\brand\logo-lockup.svg",
  "docs\assets\brand\icon-128.png",
  "docs\assets\screenshots\popup-overview.png",
  "docs\assets\screenshots\quiet-handling.png",
  "docs\assets\screenshots\report-flow.png",
  "docs\assets\screenshots\site-pause.png",
  "docs\assets\screenshots\local-first.png",
  "supabase\functions\report-bug\index.ts",
  "supabase\migrations\20260412180000_create_bug_reports.sql",
  ".github\ISSUE_TEMPLATE\broken-site.yml",
  ".github\workflows\smoke.yml",
  "rules\consent-network.json",
  "fixtures\index.html",
  "fixtures\belot-matchmaking.html",
  "fixtures\shared.js",
  "fixtures\negative-modal.html",
  "harness\http\index.html",
  "harness\http\lab.js"
)

$errors = New-Object System.Collections.Generic.List[string]

function Require-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    $errors.Add("Missing required file: $Path")
  }
}

function Require-Text {
  param(
    [string]$Text,
    [string]$Needle,
    [string]$Label
  )
  if (-not $Text.Contains($Needle)) {
    $errors.Add("Missing expected marker for ${Label}: $Needle")
  }
}

function Require-NotText {
  param(
    [string]$Text,
    [string]$Needle,
    [string]$Label
  )
  if ($Text.Contains($Needle)) {
    $errors.Add("Found unexpected marker for ${Label}: $Needle")
  }
}

foreach ($relativePath in $requiredFiles) {
  Require-File -Path (Join-Path $Root $relativePath)
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host "FAIL: $_" -ForegroundColor Red }
  exit 1
}

$manifest = Get-Content -LiteralPath (Join-Path $Root "manifest.json") -Raw | ConvertFrom-Json
$storage = Get-Content -LiteralPath (Join-Path $Root "storage.js") -Raw
$rules = Get-Content -LiteralPath (Join-Path $Root "rules.js") -Raw
$background = Get-Content -LiteralPath (Join-Path $Root "background.js") -Raw
$content = Get-Content -LiteralPath (Join-Path $Root "content.js") -Raw
$popupHtml = Get-Content -LiteralPath (Join-Path $Root "popup.html") -Raw
$popup = Get-Content -LiteralPath (Join-Path $Root "popup.js") -Raw
$support = Get-Content -LiteralPath (Join-Path $Root "support.js") -Raw
$config = Get-Content -LiteralPath (Join-Path $Root "config.js") -Raw
$releasePrep = Get-Content -LiteralPath (Join-Path $Root "prepare-release.ps1") -Raw
$releaseReadme = Get-Content -LiteralPath (Join-Path $Root "release\README.md") -Raw
$listing = Get-Content -LiteralPath (Join-Path $Root "assets\store\STORE_LISTING.md") -Raw
$storyboard = Get-Content -LiteralPath (Join-Path $Root "assets\store\VIDEO_STORYBOARD.md") -Raw
$docsHome = Get-Content -LiteralPath (Join-Path $Root "docs\index.html") -Raw
$docsPolicy = Get-Content -LiteralPath (Join-Path $Root "docs\privacy-policy.html") -Raw
$reportFunction = Get-Content -LiteralPath (Join-Path $Root "supabase\functions\report-bug\index.ts") -Raw
$reportMigration = Get-Content -LiteralPath (Join-Path $Root "supabase\migrations\20260412180000_create_bug_reports.sql") -Raw
$fixtureIndex = Get-Content -LiteralPath (Join-Path $Root "fixtures\index.html") -Raw
$belotFixture = Get-Content -LiteralPath (Join-Path $Root "fixtures\belot-matchmaking.html") -Raw
$dnrRules = Get-Content -LiteralPath (Join-Path $Root "rules\consent-network.json") -Raw | ConvertFrom-Json

if ($manifest.manifest_version -ne 3) {
  $errors.Add("manifest_version must be 3.")
}

if ($manifest.name -ne "Cookieless") {
  $errors.Add("Manifest name must be Cookieless.")
}

if ($manifest.version -ne "0.5.0") {
  $errors.Add("Manifest version must be 0.5.0 for this launch pass.")
}

@("storage", "tabs", "activeTab", "declarativeNetRequest") | ForEach-Object {
  if (-not (@($manifest.permissions) -contains $_)) {
    $errors.Add("Manifest is missing required permission: $_")
  }
}

@("cookies", "contentSettings", "browsingData", "scripting") | ForEach-Object {
  if (-not (@($manifest.optional_permissions) -contains $_)) {
    $errors.Add("Manifest is missing optional permission: $_")
  }
}

if (-not (@($manifest.host_permissions) -contains "<all_urls>")) {
  $errors.Add("Manifest must request <all_urls> host access.")
}

if (-not $manifest.content_scripts[0].all_frames) {
  $errors.Add("Content script must run in all frames.")
}

if (-not $manifest.content_scripts[0].match_origin_as_fallback) {
  $errors.Add("Content script must set match_origin_as_fallback.")
}

if ($dnrRules.Count -gt 10000) {
  $errors.Add("DNR ruleset exceeds the intended compact launch budget.")
}

Require-Text -Text $storage -Needle 'mode: "balanced"' -Label "storage.js"
Require-Text -Text $storage -Needle "reportingConsentAcknowledged" -Label "storage.js"
Require-Text -Text $storage -Needle "lastReportStatus" -Label "storage.js"
Require-Text -Text $storage -Needle "sitePolicies" -Label "storage.js"
Require-Text -Text $storage -Needle "lastOutcomeBySite" -Label "storage.js"

Require-Text -Text $rules -Needle "cookieTextSignals" -Label "rules.js"
Require-Text -Text $rules -Needle "genericBypassHosts" -Label "rules.js"
Require-Text -Text $rules -Needle "belot.bg" -Label "rules.js"
Require-Text -Text $rules -Needle "matchmaking" -Label "rules.js"
Require-Text -Text $rules -Needle "shouldBypassGenericHost" -Label "rules.js"
Require-NotText -Text $rules -Needle "privacy-banner" -Label "rules.js"

Require-Text -Text $background -Needle 'submitBugReport: submitBugReportForActiveTab' -Label "background.js"
Require-Text -Text $background -Needle 'getReportConsentState: getReportConsentState' -Label "background.js"
Require-Text -Text $background -Needle 'setReportConsentState: () => setReportConsentState(message.acknowledged)' -Label "background.js"
Require-Text -Text $background -Needle 'copyDebugReport: copyDebugReportForActiveTab' -Label "background.js"
Require-Text -Text $background -Needle "CookielessConfig.reportSubmission.endpoint" -Label "background.js"

Require-Text -Text $content -Needle "shouldBypassGenericHost" -Label "content.js"
Require-Text -Text $content -Needle "Skipped generic fallback on" -Label "content.js"
Require-Text -Text $content -Needle "findDynamicBackdropCandidates(container)" -Label "content.js"

Require-Text -Text $popupHtml -Needle "Browsing style" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "modeInfoButton" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "modePopover" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "Recommended" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "Hide only" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "Stronger reject" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "Pause on this site" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "Report broken site" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "reportDisclosure" -Label "popup.html"
Require-Text -Text $popupHtml -Needle "reportConsentCheckbox" -Label "popup.html"
Require-NotText -Text $popupHtml -Needle "Retry reject" -Label "popup.html"
Require-NotText -Text $popupHtml -Needle "Undo last action" -Label "popup.html"
Require-NotText -Text $popupHtml -Needle "Inspect current state" -Label "popup.html"
Require-NotText -Text $popupHtml -Needle "Clear site state" -Label "popup.html"

Require-Text -Text $popup -Needle 'type: "getStatus"' -Label "popup.js"
Require-Text -Text $popup -Needle 'type: "setMode"' -Label "popup.js"
Require-Text -Text $popup -Needle 'type: "toggleSite"' -Label "popup.js"
Require-Text -Text $popup -Needle 'type: "submitBugReport"' -Label "popup.js"
Require-Text -Text $popup -Needle 'type: "setReportConsentState"' -Label "popup.js"
Require-Text -Text $popup -Needle 'openReportDisclosure' -Label "popup.js"
Require-Text -Text $popup -Needle "toggleModePopover" -Label "popup.js"
Require-NotText -Text $popup -Needle 'type: "copyDebugReport"' -Label "popup.js"
Require-NotText -Text $popup -Needle "navigator.clipboard.writeText" -Label "popup.js"
Require-NotText -Text $popup -Needle "newIssueUrl" -Label "popup.js"

Require-Text -Text $support -Needle "CookielessSupport" -Label "support.js"

Require-Text -Text $config -Needle "reportSubmission" -Label "config.js"
Require-Text -Text $config -Needle "repositoryUrl" -Label "config.js"
Require-Text -Text $config -Needle "issuesUrl" -Label "config.js"
Require-Text -Text $config -Needle "homepageUrl" -Label "config.js"
Require-Text -Text $config -Needle "privacyPolicyUrl" -Label "config.js"
Require-Text -Text $config -Needle "report-bug" -Label "config.js"
Require-Text -Text $config -Needle "nwehygsvuxwhqqxefhpr" -Label "config.js"

Require-Text -Text $releasePrep -Needle "extension-upload" -Label "prepare-release.ps1"
Require-Text -Text $releasePrep -Needle "listing-assets" -Label "prepare-release.ps1"
Require-Text -Text $releasePrep -Needle 'Set-Content -LiteralPath $releaseNotePath' -Label "prepare-release.ps1"

Require-Text -Text $releaseReadme -Needle "prepare-release.ps1" -Label "release/README.md"
Require-Text -Text $releaseReadme -Needle "extension-upload" -Label "release/README.md"
Require-Text -Text $releaseReadme -Needle "listing-assets" -Label "release/README.md"

Require-Text -Text $listing -Needle "Broken-site reporting is optional and user-initiated" -Label "STORE_LISTING.md"
Require-Text -Text $listing -Needle "current page URL" -Label "STORE_LISTING.md"
Require-NotText -Text $listing -Needle "Saved reports" -Label "STORE_LISTING.md"

Require-Text -Text $storyboard -Needle "Optional report, sent only when you choose" -Label "VIDEO_STORYBOARD.md"
Require-NotText -Text $storyboard -Needle "GitHub issue page opens" -Label "VIDEO_STORYBOARD.md"

Require-Text -Text $docsHome -Needle "optional report action" -Label "docs/index.html"
Require-NotText -Text $docsHome -Needle "saved-report" -Label "docs/index.html"
Require-Text -Text $docsPolicy -Needle "Report broken site" -Label "docs/privacy-policy.html"
Require-Text -Text $docsPolicy -Needle "Supabase-hosted support inbox" -Label "docs/privacy-policy.html"

Require-Text -Text $reportFunction -Needle "Only POST requests are allowed." -Label "report-bug/index.ts"
Require-Text -Text $reportFunction -Needle "MAX_JSON_BYTES" -Label "report-bug/index.ts"
Require-Text -Text $reportFunction -Needle "MAX_REPORTS_PER_HOST_WINDOW" -Label "report-bug/index.ts"
Require-Text -Text $reportFunction -Needle "submittedAt is required" -Label "report-bug/index.ts"
Require-Text -Text $reportMigration -Needle "create table if not exists public.bug_reports" -Label "bug_reports migration"
Require-Text -Text $reportMigration -Needle "status text not null default 'new'" -Label "bug_reports migration"

Require-Text -Text $fixtureIndex -Needle "belot-matchmaking.html" -Label "fixtures/index.html"
Require-Text -Text $belotFixture -Needle "not a cookie banner" -Label "fixtures/belot-matchmaking.html"
Require-Text -Text $belotFixture -Needle "data-cookieless-hidden" -Label "fixtures/belot-matchmaking.html"

if ($errors.Count -gt 0) {
  Write-Host "Cookieless smoke gate: FAIL" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "FAIL: $_" -ForegroundColor Red }
  exit 1
}

Write-Host "Cookieless smoke gate: PASS" -ForegroundColor Green
Write-Host "OK: Popup, remote reporting, safer consent handling, docs, and release prep are aligned." -ForegroundColor Green
Write-Host "Manual follow-up:" -ForegroundColor Yellow
Write-Host "1. Reload the unpacked extension."
Write-Host "2. Enable file URL access."
Write-Host "3. Run assets\\generate-brand-assets.ps1 after any brand changes."
Write-Host "4. Run prepare-release.ps1 to create the manual zip folders."
Write-Host "5. Check report disclosure flow, belot-matchmaking.html, and a few live regression sites before store submission."
