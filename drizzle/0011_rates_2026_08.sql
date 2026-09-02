-- 2026-08 강사료 개편 (요청: 2026-08-26)
--  · 강릉·동해 강사: 전 차시 일괄 주 50,000 / 보조 35,000 (관내·관외 무관)
--  · 그 외 지역: 관내 주 1~2차시 50,000 → 3차시부터 30,000 / 보조 30,000 일괄
--               관외 주 1~2차시 60,000 → 3차시부터 40,000 / 보조 40,000 일괄
--  · 유아: 주 40,000 / 보조 35,000 일괄 (지급유형 '유아' 신설)
--  · 부스: 35,000 일괄 (직접 입력 → 단가표 계산으로 전환)
--  적용 시작일 2026-08-26 — 기존 강의 금액(스냅샷)은 변하지 않는다. 여러 번 실행돼도 안전.
INSERT INTO "pay_types" ("code","sort","role_based","manual","color","is_active","note") VALUES
 ('유아',9,true,false,'rose',true,'유아 대상 수업 — 주 4만/보조 3.5만 일괄')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
UPDATE "pay_types" SET "manual" = false, "note" = '행사 부스 운영 — 시간(차시)당 35,000원' WHERE "code" = '부스';
--> statement-breakpoint
DO $$
DECLARE
  new_id integer;
  prev_id integer;
BEGIN
  IF EXISTS (SELECT 1 FROM rate_tables WHERE effective_from = '2026-08-26') THEN
    RETURN; -- 이미 반영됨
  END IF;
  SELECT id INTO prev_id FROM rate_tables WHERE effective_from < '2026-08-26' ORDER BY effective_from DESC LIMIT 1;
  INSERT INTO rate_tables (effective_from, memo, created_by)
  VALUES ('2026-08-26', '2026-08 개편: 강릉·동해 일괄, 차시 구간(1~2차시/이후), 유아·부스 고정 단가', '규칙 개편(자동)')
  RETURNING id INTO new_id;

  -- 1) 이전 버전의 모든 칸을 그대로 복사 (기관지급 0원 등 누락 방지)
  IF prev_id IS NOT NULL THEN
    INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount)
    SELECT new_id, grade_id, pay_type, role, amount FROM rate_items WHERE rate_table_id = prev_id;
  END IF;

  -- 2) 관내/관외를 새 규칙으로 (전 등급 동일 — 등급 차등 폐지 방침)
  UPDATE rate_items SET amount = 50000, amount_after = 30000, tier_limit = 2
    WHERE rate_table_id = new_id AND pay_type = '관내' AND role = '주강사';
  UPDATE rate_items SET amount = 30000, amount_after = NULL, tier_limit = NULL
    WHERE rate_table_id = new_id AND pay_type = '관내' AND role = '보조강사';
  UPDATE rate_items SET amount = 60000, amount_after = 40000, tier_limit = 2
    WHERE rate_table_id = new_id AND pay_type = '관외' AND role = '주강사';
  UPDATE rate_items SET amount = 40000, amount_after = NULL, tier_limit = NULL
    WHERE rate_table_id = new_id AND pay_type = '관외' AND role = '보조강사';

  -- 3) 유아 칸 (전 등급, 주/보조)
  INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount)
  SELECT new_id, g.id, '유아', r.role, CASE r.role WHEN '주강사' THEN 40000 ELSE 35000 END
  FROM grades g CROSS JOIN (VALUES ('주강사'), ('보조강사')) AS r(role);

  -- 4) 강릉·동해 그룹 칸 — 관내·관외 어느 유형을 골라도 주 5만/보조 3.5만 일괄
  INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount, region_group)
  SELECT new_id, g.id, pt.pay_type, r.role, CASE r.role WHEN '주강사' THEN 50000 ELSE 35000 END, '강릉·동해'
  FROM grades g
  CROSS JOIN (VALUES ('관내'), ('관외')) AS pt(pay_type)
  CROSS JOIN (VALUES ('주강사'), ('보조강사')) AS r(role);

  -- 5) 부스 칸 (역할 무관 35,000)
  INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount)
  SELECT new_id, g.id, '부스', NULL, 35000 FROM grades g;
END $$;
