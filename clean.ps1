Get-ChildItem -Recurse -Filter *.ts | ForEach-Object {
  $base = $_.FullName -replace '\.ts$', ''
  Remove-Item "$base.js","$base.js.map","$base.d.ts" -ErrorAction SilentlyContinue
}
