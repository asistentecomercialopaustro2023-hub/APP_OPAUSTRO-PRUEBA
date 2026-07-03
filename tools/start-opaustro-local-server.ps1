param(
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

$python = Get-Command py -ErrorAction SilentlyContinue
if ($python) {
  Write-Host "OPAUSTRO local: http://127.0.0.1:$Port/Login/index.html"
  & py -3 -m http.server $Port --bind 127.0.0.1
  exit $LASTEXITCODE
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python -and $python.Source -notlike '*\WindowsApps\python.exe') {
  Write-Host "OPAUSTRO local: http://127.0.0.1:$Port/Login/index.html"
  & python -m http.server $Port --bind 127.0.0.1
  exit $LASTEXITCODE
}

$bundledPython = 'C:\Users\Ryzen\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (Test-Path -LiteralPath $bundledPython) {
  Write-Host "OPAUSTRO local: http://127.0.0.1:$Port/Login/index.html"
  & $bundledPython -m http.server $Port --bind 127.0.0.1
  exit $LASTEXITCODE
}

function Get-MimeType([string]$Path) {
  switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { 'text/html; charset=utf-8'; break }
    '.htm' { 'text/html; charset=utf-8'; break }
    '.js' { 'text/javascript; charset=utf-8'; break }
    '.css' { 'text/css; charset=utf-8'; break }
    '.json' { 'application/json; charset=utf-8'; break }
    '.webmanifest' { 'application/manifest+json; charset=utf-8'; break }
    '.png' { 'image/png'; break }
    '.jpg' { 'image/jpeg'; break }
    '.jpeg' { 'image/jpeg'; break }
    '.gif' { 'image/gif'; break }
    '.webp' { 'image/webp'; break }
    '.avif' { 'image/avif'; break }
    '.svg' { 'image/svg+xml'; break }
    '.ico' { 'image/x-icon'; break }
    '.xlsx' { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; break }
    '.xls' { 'application/vnd.ms-excel'; break }
    default { 'application/octet-stream' }
  }
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "OPAUSTRO local: http://127.0.0.1:$Port/Login/index.html"
Write-Host "Servidor PowerShell activo. Cierra esta ventana para detenerlo."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }
    $target = [IO.Path]::GetFullPath((Join-Path $Root $requestPath))

    if (-not $target.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }
    if ([IO.Directory]::Exists($target)) { $target = Join-Path $target 'index.html' }
    if (-not [IO.File]::Exists($target)) {
      $bytes = [Text.Encoding]::UTF8.GetBytes('404 - Archivo no encontrado')
      $context.Response.StatusCode = 404
      $context.Response.ContentType = 'text/plain; charset=utf-8'
      if ($context.Request.HttpMethod -ne 'HEAD') { $context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
      $context.Response.Close()
      continue
    }

    $bytes = [IO.File]::ReadAllBytes($target)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = Get-MimeType $target
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.Headers['Cache-Control'] = 'no-store'
    if ($context.Request.HttpMethod -ne 'HEAD') { $context.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    $context.Response.Close()
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
