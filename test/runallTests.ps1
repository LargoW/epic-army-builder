# Arbeitsverzeichnis auf den Ordner des PS-Skripts setzen (sicherer bei Aufruf aus anderen Pfaden)
Set-Location -Path $PSScriptRoot

$outputFile = "report.txt"
$passed = 0
$failed = 0

# Alle *.test.js Dateien im Ordner holen
$skripte = Get-ChildItem -Filter "*.test.js" | Sort-Object Name

if ($skripte.Count -eq 0) {
    Write-Host "Keine *.test.js Dateien im Ordner gefunden." -ForegroundColor Yellow
    exit
}

# Report-Datei initialisieren
"=== TEST REPORT ($(Get-Date -Format 'dd.MM.yyyy HH:mm:ss')) ===`r`n" | Out-File -FilePath $outputFile -Encoding utf8

foreach ($skript in $skripte) {
    Write-Host "Starte $($skript.Name) ..." -ForegroundColor Cyan
    
    "--------------------------------------------------" | Out-File -FilePath $outputFile -Append -Encoding utf8
    "TEST: $($skript.Name)" | Out-File -FilePath $outputFile -Append -Encoding utf8
    "--------------------------------------------------" | Out-File -FilePath $outputFile -Append -Encoding utf8
    
    # Node ausführen (stdout + stderr abfangen)
    node $skript.Name 2>&1 | Out-File -FilePath $outputFile -Append -Encoding utf8
    
    # Exit-Code von Node prüfen
    if ($LASTEXITCODE -eq 0) {
        "[STATUS: PASS]`r`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
        $passed++
    } else {
        "[STATUS: FAIL (Exit-Code: $LASTEXITCODE)]`r`n" | Out-File -FilePath $outputFile -Append -Encoding utf8
        $failed++
    }
}

# Zusammenfassung ans Ende schreiben
$summary = "=== ZUSAMMENFASSUNG: $passed bestanden, $failed fehlgeschlagen (Gesamt: $($skripte.Count)) ==="
$summary | Out-File -FilePath $outputFile -Append -Encoding utf8

Write-Host "`n$summary" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "Report gespeichert unter: $(Join-Path $PSScriptRoot $outputFile)"