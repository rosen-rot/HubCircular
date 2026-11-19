#requires -Version 5.1
<#
.SYNOPSIS
  Diagnóstico del entorno Windows para HubCircular. SOLO LEE: no instala, no modifica, no imprime secretos.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\verificar-entorno.ps1
#>
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..\..')

function Show($estado, $texto) { Write-Host ("  [{0}] {1}" -f $estado, $texto) }
function Version-De($cmd, $args_) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { return $null }
  try { return (& $cmd $args_ 2>$null | Select-Object -First 1) } catch { return $null }
}

Write-Host "== HubCircular · verificación de entorno Windows =="
Write-Host ("Carpeta del proyecto: {0}" -f (Get-Location).Path)

Write-Host "`nHerramientas"
$node = Version-De 'node' '--version'
if ($node) {
  $major = [int](($node -replace '^v','') -split '\.')[0]
  if ($major -ge 20) { Show 'OK' "Node $node" } else { Show 'ERROR' "Node $node (se requiere >= 20.9; recomendado LTS 22)" }
} else { Show 'ERROR' 'Node no encontrado. Instale Node.js LTS desde https://nodejs.org (o: winget install OpenJS.NodeJS.LTS)' }
$npm = Version-De 'npm' '--version'
if ($npm) { Show 'OK' "npm $npm" } else { Show 'ERROR' 'npm no encontrado' }
$git = Version-De 'git' '--version'
if ($git) { Show 'OK' $git } else { Show 'AVISO' 'Git no encontrado (winget install Git.Git)' }
if (Get-Command docker -ErrorAction SilentlyContinue) { Show 'INFO' 'Docker presente, pero este proyecto NO lo usa' }

Write-Host "`nDisco y cachés (recomendado: cachés en D: para no llenar C:)"
$drive = (Get-Location).Drive
if ($drive) { Show 'INFO' ("Unidad {0}: {1:N1} GB libres" -f $drive.Name, ($drive.Free / 1GB)) }
if ($npm) {
  $cache = (& npm config get cache 2>$null)
  Show 'INFO' "Caché de npm: $cache"
  if ($cache -like 'C:*') { Show 'AVISO' 'Para moverla: npm config set cache D:\Cache\npm' }
}

Write-Host "`nDependencias"
if (Test-Path 'node_modules') { Show 'OK' 'node_modules presente' } else { Show 'AVISO' 'Falta node_modules: ejecute npm ci' }

Write-Host "`nConfiguración (.env.local: solo se muestran NOMBRES y si tienen valor; nunca el valor)"
if (-not (Test-Path '.env.local')) {
  Show 'AVISO' 'No existe .env.local. Copie la plantilla: Copy-Item .env.example .env.local   y complete los valores (ver docs\19)'
} else {
  $claves = @('DATABASE_URL','MIGRATION_DATABASE_URL','DB_APP_ROLE','DB_SSL','SESSION_COOKIE_SECURE')
  $lineas = Get-Content '.env.local' | Where-Object { $_ -match '^\s*[A-Z0-9_]+\s*=' }
  foreach ($k in $claves) {
    $l = $lineas | Where-Object { $_ -match "^\s*$k\s*=" } | Select-Object -First 1
    $tiene = $false
    if ($l) { $v = ($l -split '=',2)[1].Trim().Trim('"').Trim("'"); $tiene = ($v.Length -gt 0) }
    Show ($(if ($tiene) { 'OK' } else { 'INFO' })) ("{0}: {1}" -f $k, $(if ($tiene) { 'definida' } else { 'vacía/ausente' }))
  }
  $db = $lineas | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($db -and ($db -match 'CAMBIAR_ESTA_CLAVE|\[YOUR-PASSWORD\]|<.*>')) { Show 'ERROR' 'DATABASE_URL aún contiene un marcador de la plantilla' }
}
if (git ls-files --error-unmatch .env.local 2>$null) { Show 'ERROR' '.env.local está rastreado por Git: ejecute git rm --cached .env.local' }

Write-Host "`nPuerto 3000"
$p = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($p) { Show 'AVISO' 'El puerto 3000 ya está en uso (use: npm run dev -- -p 3001)' } else { Show 'OK' 'Puerto 3000 libre' }

Write-Host "`nSiguiente paso: npm ci  →  npm run db:check  →  (con su aprobación) npm run db:migrate"
