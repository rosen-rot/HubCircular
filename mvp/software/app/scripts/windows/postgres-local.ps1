#requires -Version 5.1
<#
.SYNOPSIS
  Administra un PostgreSQL LOCAL y DESCARTABLE (sin Docker) para las pruebas destructivas de integración/E2E.
  NUNCA se usa con Supabase. Escucha solo en 127.0.0.1 con autenticación «trust» (solo para pruebas locales).

  Requisito: binarios portables de PostgreSQL 16 para Windows (zip de EDB «Binaries») descomprimidos, p. ej. en D:\Tools\pgsql
  Descarga: https://www.enterprisedb.com/download-postgresql-binaries   (no requiere instalador ni administrador)
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\postgres-local.ps1 -Action init
  powershell -ExecutionPolicy Bypass -File scripts\windows\postgres-local.ps1 -Action start
  $env:TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:54329/postgres'; npm run test:integration
#>
param(
  [Parameter(Mandatory)][ValidateSet('init','start','stop','status')][string]$Action,
  [string]$PgBin   = 'D:\Tools\pgsql\bin',
  [string]$DataDir = 'D:\Datos\hubcircular-pg-test',
  [int]$Port = 54329
)
$ErrorActionPreference = 'Stop'
foreach ($e in 'initdb.exe','pg_ctl.exe') {
  if (-not (Test-Path (Join-Path $PgBin $e))) { throw "No se encontró $e en $PgBin. Ajuste -PgBin (ver ayuda del script)." }
}
$log = Join-Path $DataDir 'servidor.log'
switch ($Action) {
  'init' {
    if (Test-Path (Join-Path $DataDir 'PG_VERSION')) { Write-Host "Ya inicializado en $DataDir"; break }
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    & (Join-Path $PgBin 'initdb.exe') -D $DataDir -U postgres -A trust --encoding=UTF8 --locale=C
    Write-Host "Listo. Inicie con: -Action start"
  }
  'start' {
    & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir -o "-p $Port -c listen_addresses=127.0.0.1" -l $log -w start
    Write-Host "TEST_DATABASE_URL = postgres://postgres@127.0.0.1:$Port/postgres"
  }
  'stop'   { & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir -m fast stop }
  'status' { & (Join-Path $PgBin 'pg_ctl.exe') -D $DataDir status }
}
