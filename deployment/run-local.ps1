$ErrorActionPreference = 'Stop'
if (-not (Test-Path './backend/.env')) { Copy-Item './backend/.env.example' './backend/.env' }
Write-Host 'Edit backend/.env and replace all replace-with-* secrets before production use.'
docker compose up -d --build
Write-Host 'TicketGuard: http://localhost:5000'
Write-Host 'Swagger: http://localhost:5000/docs'
Write-Host 'Frontend: http://localhost:5173'
