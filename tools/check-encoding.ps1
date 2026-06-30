$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$patterns = "Ã|Â|â€|â†|â˜|�"
$files = Get-ChildItem -LiteralPath $root -Recurse -File -Include *.html,*.js,*.css,*.gs,*.json,*.md,*.webmanifest |
  Where-Object { $_.FullName -notmatch "\\.git\\" }
$hits = foreach ($file in $files) {
  Select-String -LiteralPath $file.FullName -Pattern $patterns -Encoding UTF8 |
    Select-Object @{n="File";e={$file.FullName}}, LineNumber, Line
}
if ($hits) {
  $hits | Format-Table -AutoSize
  throw "Se detectaron caracteres mojibake. Guardar archivos como UTF-8 y corregir antes de publicar."
}
"Codificación OK: sin mojibake detectado."
