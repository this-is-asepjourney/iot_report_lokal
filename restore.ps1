# restore.ps1 — Restore database dari file backup ke Docker
# Cara pakai: .\restore.ps1                      (pilih file terbaru otomatis)
#             .\restore.ps1 -File backups\backup_20260305_153456.sql

param(
    [string]$File = ""
)

$ErrorActionPreference = "Stop"

$PROJECT_ROOT = $PSScriptRoot
$BACKUP_DIR   = Join-Path $PROJECT_ROOT "backups"
$CONTAINER    = "iot_report_lokal-db-1"
$DB_NAME      = "iot_reports"
$DB_USER      = "postgres"

Write-Host "=== IoT Report — Restore Database ===" -ForegroundColor Cyan

# Jika file tidak ditentukan, pilih backup terbaru
if (-not $File) {
    $latest = Get-ChildItem -Path $BACKUP_DIR -Filter "backup_*.sql" |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1
    if (-not $latest) {
        Write-Host "GAGAL: Tidak ada file backup di folder '$BACKUP_DIR'." -ForegroundColor Red
        exit 1
    }
    $File = $latest.FullName
    Write-Host "File   : $File (terbaru)" -ForegroundColor Yellow
} else {
    if (-not [System.IO.Path]::IsPathRooted($File)) {
        $File = Join-Path $PROJECT_ROOT $File
    }
    Write-Host "File   : $File"
}

if (-not (Test-Path $File)) {
    Write-Host "GAGAL: File '$File' tidak ditemukan." -ForegroundColor Red
    exit 1
}

# Pastikan container berjalan
$running = docker ps --filter "name=$CONTAINER" --filter "status=running" -q
if (-not $running) {
    Write-Host "GAGAL: Container '$CONTAINER' tidak berjalan. Jalankan 'docker compose up -d' terlebih dahulu." -ForegroundColor Red
    exit 1
}

# Konfirmasi sebelum restore
Write-Host ""
Write-Host "PERINGATAN: Restore akan menghapus data saat ini dan diganti dengan data dari backup." -ForegroundColor Yellow
$confirm = Read-Host "Ketik 'ya' untuk melanjutkan"
if ($confirm -ne "ya") {
    Write-Host "Dibatalkan." -ForegroundColor DarkGray
    exit 0
}

Write-Host "Meng-copy file ke container..."
docker cp $File "${CONTAINER}:/restore_temp.sql"

Write-Host "Truncate tabel data..."
$truncateSQL = @"
TRUNCATE TABLE "Device", "User", "Repair", "Installation" RESTART IDENTITY CASCADE;
"@
$truncateSQL | docker exec -i $CONTAINER psql -U $DB_USER -d $DB_NAME

Write-Host "Import data dari backup..."
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -f /restore_temp.sql 2>&1 |
    Where-Object { $_ -notmatch "duplicate key|does not exist|backslash commands|psql:.*ERROR" } |
    ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }

Write-Host "Membersihkan file temporary..."
docker exec $CONTAINER rm /restore_temp.sql

Write-Host "Verifikasi jumlah data:" -ForegroundColor Cyan
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "SELECT relname AS tabel, n_live_tup AS jumlah_baris FROM pg_stat_user_tables WHERE relname IN ('Device','User','Repair','Installation') ORDER BY relname;"

Write-Host "=== Restore selesai ===" -ForegroundColor Green
