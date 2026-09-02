-- 표시 정리: '3차시부터' 단가가 기본 단가와 같은 칸은 일괄로 정규화 (요청: 2026-08-26)
-- 계산 결과는 동일하며, 화면의 "→같은값(3차시~)" 군더더기 표기를 없앤다. 여러 번 실행 안전.
UPDATE "rate_items" SET "amount_after" = NULL, "tier_limit" = NULL
WHERE "amount_after" IS NOT NULL AND "amount_after" = "amount";
