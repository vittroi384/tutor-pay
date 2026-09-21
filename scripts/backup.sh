#!/usr/bin/env bash
# DB 덤프 → gzip → 로컬 보관(기본 90일). 주 1회(월요일 08:00, 서버 시간대 Asia/Seoul 기준) 실행 권장.
# crontab 예:
#   0 8 * * 1 /home/ubuntu/TutorPay/scripts/backup.sh >> /home/ubuntu/backup.log 2>&1
# 서버 시간대가 UTC 라면 먼저: sudo timedatectl set-timezone Asia/Seoul
#
# 외부 보관: S3_BUCKET 을 주면 덤프를 S3 로 올린다 (EC2 인스턴스 역할로 인증 — 액세스 키를 서버에 두지 않음).
#   버킷 수명 주기 규칙으로 오래된 덤프를 Glacier 로 내리거나 만료시키면 서버 밖 보관 기간을 따로 관리할 수 있다.
# 복원: gunzip -c backups/tutorpay_날짜.sql.gz | docker compose exec -T db psql -U tutorpay -d tutorpay
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BUCKET="${S3_BUCKET:-}"           # (선택) S3 버킷명
KEEP_DAYS="${KEEP_DAYS:-90}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M)
FILE="$BACKUP_DIR/tutorpay_$STAMP.sql.gz"
docker compose exec -T db pg_dump -U tutorpay -d tutorpay | gzip > "$FILE"
echo "dump: $FILE ($(du -h "$FILE" | cut -f1))"

# ---- (선택) S3 업로드 ----
if [ -n "$BUCKET" ]; then
  aws s3 cp "$FILE" "s3://$BUCKET/tutorpay-backups/$(basename "$FILE")" --only-show-errors
  echo "s3: s3://$BUCKET/tutorpay-backups/$(basename "$FILE")"
fi

find "$BACKUP_DIR" -name 'tutorpay_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "done"
