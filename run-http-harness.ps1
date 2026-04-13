param(
  [int]$Port = 8765,
  [string]$Root = (Join-Path $PSScriptRoot "harness\http")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Root)) {
  throw "Harness root not found: $Root"
}

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

$contentTypes = @{
  ".css" = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".txt" = "text/plain; charset=utf-8"
}

Write-Host "Cookieless HTTP harness running at $prefix" -ForegroundColor Green
Write-Host "Serving files from $resolvedRoot" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = $context.Request.Url.AbsolutePath.TrimStart("/")
    $relativePath = if ([string]::IsNullOrWhiteSpace($requestPath)) { "index.html" } else { $requestPath -replace "/", "\" }
    $candidatePath = Join-Path $resolvedRoot $relativePath

    try {
      $resolvedFile = (Resolve-Path -LiteralPath $candidatePath -ErrorAction Stop).Path
    } catch {
      $resolvedFile = $null
    }

    if (
      -not $resolvedFile -or
      -not $resolvedFile.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
      -not (Test-Path -LiteralPath $resolvedFile -PathType Leaf)
    ) {
      $context.Response.StatusCode = 404
      $buffer = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $context.Response.OutputStream.Write($buffer, 0, $buffer.Length)
      $context.Response.Close()
      continue
    }

    $extension = [System.IO.Path]::GetExtension($resolvedFile).ToLowerInvariant()
    $context.Response.ContentType = $contentTypes[$extension]
    if (-not $context.Response.ContentType) {
      $context.Response.ContentType = "application/octet-stream"
    }

    $bytes = [System.IO.File]::ReadAllBytes($resolvedFile)
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
