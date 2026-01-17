#!/usr/bin/env pwsh
param(
    [string]$v = "default"
)

$activity = "Processing Data"

Write-Progress -Activity $activity -Status "Cleaning build artifacts..." -PercentComplete 0
scripts/clean

Write-Progress -Activity $activity -Status "Compiling TypeScript..." -PercentComplete 33
Push-Location "src"

Write-Progress -Activity $activity -Status "Compiling TypeScript..." -PercentComplete 34
npx tsgo

Write-Progress -Activity $activity -Status "Done" -PercentComplete 100
Write-Host "Starting Electron app..."

if ($v -eq "q") {
    npx electron . | Out-Null
} else {
    npx electron .
}

Write-Host "Electron app exited."
Write-Progress -Activity $activity -Status "Cleaning Artifacts" -PercentComplete 0
Write-Host "Cleaning build artifacts..."
Pop-Location
scripts/clean
Write-Progress -Activity $activity -Status "Cleaning Artifacts" -PercentComplete 100
Write-Host "Done"
exit 0