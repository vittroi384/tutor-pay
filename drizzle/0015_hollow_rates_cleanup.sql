-- 완전 새 설치에서 0011 이 등급·이전 단가표보다 먼저 실행되면 2026-08-26 버전이 빈 껍데기로 남는다.
-- 아이템이 0개인 그 버전을 지워서, 시드(ensure 단계)가 온전한 버전을 다시 만들 수 있게 한다. 운영 DB(아이템 있음)에는 아무 일도 하지 않음.
DELETE FROM "rate_tables" t
WHERE t."effective_from" = '2026-08-26'
  AND NOT EXISTS (SELECT 1 FROM "rate_items" ri WHERE ri."rate_table_id" = t."id");
