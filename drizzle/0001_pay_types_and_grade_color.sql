CREATE TABLE "pay_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"role_based" boolean DEFAULT true NOT NULL,
	"manual" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"note" text,
	CONSTRAINT "pay_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "grades" ADD COLUMN "color" text DEFAULT 'slate' NOT NULL;--> statement-breakpoint
-- 기본 지급유형 7종 (시트 이전 당시 규칙). 이미 있으면 건너뜀
INSERT INTO "pay_types" ("code","sort","role_based","manual","color","is_active") VALUES
 ('관내',1,true,false,'sky',true),
 ('관외',2,true,false,'violet',true),
 ('센터',3,true,false,'teal',true),
 ('기관지급',4,false,false,'slate',true),
 ('주(주말교육)',5,false,false,'orange',true),
 ('교구정리',6,false,false,'lime',true),
 ('수동기입',7,false,true,'amber',true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- 강의에 쓰였지만 목록에 없는 지급유형이 있으면 역할 무관 유형으로 추가 (데이터 보호)
INSERT INTO "pay_types" ("code","sort","role_based","manual","color","is_active")
SELECT DISTINCT l.pay_type, 90, false, false, 'slate', true FROM "lectures" l
WHERE l.pay_type IS NOT NULL AND l.pay_type NOT IN (SELECT code FROM "pay_types")
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- 기본 등급 색
UPDATE "grades" SET "color" = CASE "code" WHEN 'S등급' THEN 'amber' WHEN 'A등급' THEN 'teal' WHEN 'B등급' THEN 'slate' WHEN '연구원' THEN 'ink' ELSE "color" END;
