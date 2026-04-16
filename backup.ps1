# backup.ps1 — Backup database PostgreSQL dari Docker ke file lokal
# Cara pakai: .\backup.ps1
# Backup otomatis: daftarkan di Windows Task Scheduler (lihat README)

$ErrorActionPreference = "Stop"

$PROJECT_ROOT = $PSScriptRoot
$BACKUP_DIR   = Join-Path $PROJECT_ROOT "backups"
$CONTAINER    = "iot_report_lokal-db-1"
$DB_NAME      = "iot_reports"
$DB_USER      = "postgres"
$KEEP_DAYS    = 7   # hapus backup lebih lama dari N hari

# Buat folder backups jika belum ada
if (-not (Test-Path $BACKUP_DIR)) {
    New-Item -ItemType Directory -Path $BACKUP_DIR | Out-Null
}

$TIMESTAMP   = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_FILE = Join-Path $BACKUP_DIR "backup_$TIMESTAMP.sql"

Write-Host "=== IoT Report — Backup Database ===" -ForegroundColor Cyan
Write-Host "Waktu   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Output  : $BACKUP_FILE"

# Pastikan container berjalan
$running = docker ps --filter "name=$CONTAINER" --filter "status=running" -q
if (-not $running) {
    Write-Host "GAGAL: Container '$CONTAINER' tidak berjalan. Jalankan 'docker compose up -d' terlebih dahulu." -ForegroundColor Red
    exit 1
}

# Jalankan pg_dump di dalam container, simpan ke file host
docker exec $CONTAINER pg_dump -U $DB_USER -d $DB_NAME --no-owner --no-acl | Out-File -FilePath $BACKUP_FILE -Encoding utf8

if ($LASTEXITCODE -ne 0) {
    Write-Host "GAGAL: pg_dump error." -ForegroundColor Red
    exit 1
}

$sizeKB = [math]::Round((Get-Item $BACKUP_FILE).Length / 1024, 1)
Write-Host "Berhasil: backup tersimpan ($sizeKB KB)" -ForegroundColor Green

# Hapus backup lama
Write-Host "Membersihkan backup lebih lama dari $KEEP_DAYS hari..."
$cutoff = (Get-Date).AddDays(-$KEEP_DAYS)
Get-ChildItem -Path $BACKUP_DIR -Filter "backup_*.sql" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Remove-Item $_.FullName
        Write-Host "  Dihapus: $($_.Name)" -ForegroundColor DarkGray
    }

Write-Host "=== Selesai ===" -ForegroundColor Cyan
