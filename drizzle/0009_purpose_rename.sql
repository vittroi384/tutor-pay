-- 용도 명칭 변경: '타기관 교육용' → '타기관 대여용' (요청: 2026-08-26)
-- 여러 번 실행돼도 대상이 없으면 아무 일도 하지 않는다.
UPDATE "equipment_rentals"
SET "purpose" = '타기관 대여용', "updatedAt" = now(), "updated_by" = '용도 정리(자동)'
WHERE "purpose" = '타기관 교육용';
