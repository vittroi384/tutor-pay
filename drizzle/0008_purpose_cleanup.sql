-- 데이터 정리: '디지털 새싹' 계열 용도는 '타기관 교육용'으로 통합 (요청: 2026-08-26)
-- 이미 반영된 서버에서 다시 실행돼도 대상이 없으면 아무 일도 하지 않는다.
UPDATE "equipment_rentals"
SET "purpose" = '타기관 교육용', "updatedAt" = now(), "updated_by" = '용도 정리(자동)'
WHERE "purpose" ILIKE '%새싹%' AND "purpose" <> '타기관 교육용';
