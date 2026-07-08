<#
  Activa una version anterior (o vuelve a una posterior) publicada en gh-pages,
  SIN perder nunca el trabajo actual.

  Como funciona:
  1. Antes de tocar nada, crea automaticamente un tag de respaldo que apunta
     exactamente al commit actual (el que tenias publicado antes de este cambio).
  2. Copia los archivos de la version elegida (tag) sobre el proyecto.
  3. Elimina del proyecto los archivos que esa version antigua no tenia
     (para que quede identica a como era, sin restos de la version rota).
  4. Crea un COMMIT NUEVO con ese contenido (nunca usa reset --hard).
  5. Deja el commit listo localmente; solo lo sube a GitHub si usas -Push.

  Como NUNCA se usa "reset --hard" ni "push --force", el historial completo
  queda intacto: la version que estabas arreglando sigue disponible en el
  tag de respaldo y en el historial de commits, lista para reactivarse con
  este mismo script cuando la termines de corregir.

  USO:
    .\tools\activar-version.ps1 -Tag opaustro-v1.4.2
    .\tools\activar-version.ps1 -Tag opaustro-v1.4.2 -Push
    .\tools\activar-version.ps1 -Listar
#>

param(
  [string]$Tag,
  [switch]$Push,
  [switch]$Listar
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Root

function Mostrar-Versiones {
  Write-Host ""
  Write-Host "Versiones publicadas disponibles:" -ForegroundColor Cyan
  git fetch --tags --quiet
  git tag --list "opaustro-v*" | Sort-Object { [version]($_ -replace '^opaustro-v','') }
  Write-Host ""
  Write-Host "Version actualmente publicada (HEAD de gh-pages):" -ForegroundColor Cyan
  git log -1 --format="  %h  %ad  %s" --date=short
  Write-Host ""
}

if ($Listar) {
  Mostrar-Versiones
  exit 0
}

if (-not $Tag) {
  Write-Host "Debes indicar que version activar. Ejemplo:" -ForegroundColor Red
  Write-Host "  .\tools\activar-version.ps1 -Tag opaustro-v1.4.2"
  Mostrar-Versiones
  exit 1
}

# 1. No arrancar si hay cambios locales sin guardar (para no mezclarlos por error)
$status = git status --porcelain
if ($status) {
  Write-Host "Tienes cambios sin guardar en el proyecto. Guardalos o descartalos antes de activar otra version." -ForegroundColor Red
  git status --short
  exit 1
}

# 2. Verificar que el tag existe
git fetch --tags --quiet
$tagExists = git tag --list $Tag
if (-not $tagExists) {
  Write-Host "El tag '$Tag' no existe." -ForegroundColor Red
  Mostrar-Versiones
  exit 1
}

$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne 'gh-pages') {
  Write-Host "Este script debe ejecutarse estando en la rama gh-pages (rama publicada). Rama actual: $currentBranch" -ForegroundColor Red
  exit 1
}

# 3. Respaldo automatico del estado actual, para no perder nada
$currentCommit = git rev-parse HEAD
$fecha = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupTag = "respaldo-$fecha"
git tag $backupTag $currentCommit
Write-Host "Respaldo creado: $backupTag -> $currentCommit" -ForegroundColor Yellow
Write-Host "  (para volver exactamente a este punto despues, usa: .\tools\activar-version.ps1 -Tag $backupTag)" -ForegroundColor Yellow

# 4. Traer el contenido del tag elegido sobre el working tree actual
git checkout $Tag -- .

# 5. Eliminar archivos que existen ahora pero NO existian en esa version antigua
# (Se protege esta misma herramienta y tools/ para poder seguir usandola sin importar
#  a que version tan vieja se vuelva.)
$archivosProtegidos = @(
  'tools/activar-version.ps1'
)
$archivosActuales = git ls-tree -r HEAD --name-only
$archivosVersion = git ls-tree -r $Tag --name-only
$aEliminar = Compare-Object -ReferenceObject $archivosActuales -DifferenceObject $archivosVersion |
  Where-Object { $_.SideIndicator -eq '<=' } |
  Select-Object -ExpandProperty InputObject |
  Where-Object { $archivosProtegidos -notcontains $_ }

foreach ($archivo in $aEliminar) {
  git rm -q -- "$archivo"
}

# 6. Confirmar que efectivamente hay algo que commitear
$cambios = git status --porcelain
if (-not $cambios) {
  Write-Host "El proyecto ya esta identico a $Tag. No hay nada que activar." -ForegroundColor Yellow
  git tag -d $backupTag | Out-Null
  exit 0
}

# 7. Commit (nunca reset --hard)
git add -A
git commit -m "Activar $Tag como version publicada (respaldo del estado anterior: $backupTag)" | Out-Null

Write-Host ""
Write-Host "Listo. Se creo un commit local activando $Tag." -ForegroundColor Green
Write-Host "El estado anterior sigue disponible en el tag: $backupTag" -ForegroundColor Green

if ($Push) {
  git push origin gh-pages
  git push origin $backupTag
  Write-Host "Publicado en GitHub Pages." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "Para publicarlo en GitHub Pages, ejecuta:" -ForegroundColor Cyan
  Write-Host "  git push origin gh-pages"
  Write-Host "  git push origin $backupTag"
}
