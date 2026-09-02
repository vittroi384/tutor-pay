#!/usr/bin/env bash
# DB 덤프 → gzip → 로컬 보관(기본 90일). 주 1회(월요일 08:00, 서버 시간대 Asia/Seoul 기준) 실행 권장.
# crontab 예:
#   0 8 * * 1 /home/ubuntu/TutorPay/scripts/backup.sh >> /home/ubuntu/backup.log 2>&1
# 서버 시간대가 UTC 라면 먼저: sudo timedatectl set-timezone Asia/Seoul
#
# 외부 보관(선택): S3 로 올리거나(aws cli), 가끔 PC에서 내려받아 두면 서버 장애에도 안전합니다.
#   aws s3 sync ./backups s3://<버킷명>/tutorpay-backups/
#   scp -i <SSH키> ubuntu@<서버IP>:~/TutorPay/backups/*.gz <로컬 백업 폴더>
# 복원: gunzip -c backups/tutorpay_날짜.sql.gz | docker compose exec -T db psql -U tutorpay -d tutorpay
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BUCKET="${OCI_BUCKET:-}"          # (선택) OCI Object Storage 버킷명
KEEP_DAYS="${KEEP_DAYS:-90}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M)
FILE="$BACKUP_DIR/tutorpay_$STAMP.sql.gz"
docker compose exec -T db pg_dump -U tutorpay -d tutorpay | gzip > "$FILE"
echo "dump: $FILE ($(du -h "$FILE" | cut -f1))"

# ---- (선택) OCI Object Storage 업로드 ----
if [ -n "$BUCKET" ]; then
  if command -v oci >/dev/null 2>&1; then
    oci os object put --bucket-name "$BUCKET" --file "$FILE" --name "$(basename "$FILE")" --force
  elif command -v rclone >/dev/null 2>&1; then
    rclone copy "$FILE" "oci:$BUCKET/"
  fi
fi

find "$BACKUP_DIR" -name 'tutorpay_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "done"
