# Script para iniciar el servidor Flecsa
Write-Host "Iniciando servidor Flecsa..." -ForegroundColor Green

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Host "Error: No se encontró package.json. Asegúrate de estar en el directorio server/" -ForegroundColor Red
    exit 1
}

# Verificar que node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    npm install
}

# Verificar que la base de datos esté configurada
Write-Host "Verificando configuración..." -ForegroundColor Yellow
Write-Host "Puerto: 3000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:8081" -ForegroundColor Cyan

# Iniciar el servidor
Write-Host "`nIniciando servidor en http://localhost:3000..." -ForegroundColor Green
npm run dev


