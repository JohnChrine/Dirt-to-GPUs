param(
  [string]$Password = ""
)

if (-not $Password) {
  $Password = Read-Host "Admin password for this local run"
}

$env:FDTG_ADMIN_PASSWORD = $Password
$env:PORT = "8000"

Write-Host "Starting From Dirt to GPUs..."
Write-Host "Site:  http://127.0.0.1:8000/"
Write-Host "Admin: http://127.0.0.1:8000/admin"
Write-Host ""

npm start
