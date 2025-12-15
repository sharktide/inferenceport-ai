# Elevate if not admin
if (-not (
    [Security.Principal.WindowsPrincipal]::new(
        [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
)) {
    Write-Host "Restarting with admin privileges..."
    Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

# ---- Inputs ----
$publisherCN = Read-Host "Enter Publisher CN (must exactly match AppxManifest Publisher, e.g. CN=Contoso)"
$appxPath    = Read-Host "Enter full path to the .appx file"
if (-not (Test-Path $appxPath)) { Write-Error "APPX not found at $appxPath"; exit 1 }
$pfxPassword = Read-Host "Enter a password for the PFX" -AsSecureString

# ---- Create self-signed code signing cert ----
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $publisherCN `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -KeyExportPolicy Exportable `
    -KeyUsage DigitalSignature `
    -CertStoreLocation "Cert:\LocalMachine\My" `
    -NotAfter (Get-Date).AddYears(2)

# ---- Export certs (CER for trust, PFX for signing) ----
$temp = Join-Path $env:TEMP ("appx-sign-" + [Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $temp | Out-Null
$cerPath = Join-Path $temp "publisher.cer"
$pfxPath = Join-Path $temp "publisher.pfx"

Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pfxPassword | Out-Null

# ---- Trust the publisher (TrustedPeople) ----
# Using TrustedPeople avoids putting a self-signed cert in Root while still trusting the package publisher.
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPeople" | Out-Null
Write-Host "Publisher certificate trusted (LocalMachine\\TrustedPeople)."

# ---- Locate signtool ----
$signtool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
if (-not $signtool) {
    $paths = @(
        "C:\Program Files (x86)\Windows Kits\10\bin",
        "C:\Program Files\Windows Kits\10\bin"
    )
    foreach ($base in $paths) {
        if (Test-Path $base) {
            $candidate = Get-ChildItem -Path $base -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue | 
                         Sort-Object FullName -Descending | Select-Object -First 1
            if ($candidate) { $signtool = $candidate.FullName; break }
        }
    }
}
if (-not $signtool) { Write-Error "signtool.exe not found. Install the Windows SDK."; exit 1 }

# ---- Sign the APPX ----
$plainPwd = [System.Net.NetworkCredential]::new("", $pfxPassword).Password
# Optional: timestamp server improves long-term signature validity
$timestampUrl = "http://timestamp.digicert.com"

& $signtool sign `
    /fd SHA256 `
    /f $pfxPath `
    /p $plainPwd `
    /tr $timestampUrl `
    /td SHA256 `
    "$appxPath"

if ($LASTEXITCODE -ne 0) { Write-Error "Signing failed."; exit $LASTEXITCODE }

# ---- Verify signature ----
& $signtool verify /pa "$appxPath"
if ($LASTEXITCODE -ne 0) { Write-Error "Signature verification failed."; exit $LASTEXITCODE }

Write-Host "APPX signed and verified."

# ---- Install the APPX ----
try {
    Add-AppxPackage -Path "$appxPath"
    Write-Host "APPX installed successfully."
} catch {
    Write-Error "Installation failed: $($_.Exception.Message)"
    Write-Host "Common causes:
    - Publisher CN does not match AppxManifest Publisher
    - Missing dependencies or capabilities
    - Sideloading/Developer Mode disabled"
    exit 1
}