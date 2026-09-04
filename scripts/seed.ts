/** 최초 1회 시드 — DB가 비어 있으면 data/tutorpay-seed.json(시트에서 이전한 강사·강의·교구 전체)을 넣는다. 이미 데이터가 있으면 아무것도 하지 않음 */
import "dotenv/config";
import fs from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql as dsql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { calcAmounts } from "../src/lib/calc";

/**
 * data/tutorpay-seed.json(시트 추출본, scripts/extract_from_sheet.py 결과) → DB 적재
 *   npm run db:seed              : 비어 있는 DB에만 적재 (강의가 이미 있으면 중단)
 *   npm run db:seed -- --force   : 기존 데이터를 모두 지우고 다시 적재
 *   npm run db:seed -- --file data/tutorpay-seed.json
 * 적재 후 월별 합계를 출력하니 시트 정산리포트와 대조하세요.
 */

/** 2026-08 단가 개편 버전 보장 — 새 설치처럼 마이그레이션 시점에 등급/이전 버전이 없어 못 만들어졌으면 여기서 생성 */
async function ensureRates202608(db: ReturnType<typeof drizzle<typeof schema>>) {
  await db.execute(dsql`
DO $$
DECLARE new_id integer; prev_id integer;
BEGIN
  IF EXISTS (SELECT 1 FROM rate_tables WHERE effective_from = '2026-08-26') THEN RETURN; END IF;
  SELECT id INTO prev_id FROM rate_tables WHERE effective_from < '2026-08-26' ORDER BY effective_from DESC LIMIT 1;
  INSERT INTO rate_tables (effective_from, memo, created_by)
  VALUES ('2026-08-26', '2026-08 개편: 강릉·동해 일괄, 차시 구간(1~2차시/이후), 유아·부스 고정 단가', '규칙 개편(자동)')
  RETURNING id INTO new_id;
  IF prev_id IS NOT NULL THEN
    INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount)
    SELECT new_id, grade_id, pay_type, role, amount FROM rate_items WHERE rate_table_id = prev_id;
  END IF;
  UPDATE rate_items SET amount = 50000, amount_after = 30000, tier_limit = 2
    WHERE rate_table_id = new_id AND pay_type = '관내' AND role = '주강사';
  UPDATE rate_items SET amount = 30000, amount_after = NULL, tier_limit = NULL
    WHERE rate_table_id = new_id AND pay_type = '관내' AND role = '보조강사';
  UPDATE rate_items SET amount = 60000, amount_after = 40000, tier_limit = 2
    WHERE rate_table_id = new_id AND pay_type = '관외' AND role = '주강사';
  UPDATE rate_items SET amount = 40000, amount_after = NULL, tier_limit = NULL
    WHERE rate_table_id = new_id AND pay_type = '관외' AND role = '보조강사';
  INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount)
  SELECT new_id, g.id, '유아', r.role, CASE r.role WHEN '주강사' THEN 40000 ELSE 35000 END
  FROM grades g CROSS JOIN (VALUES ('주강사'), ('보조강사')) AS r(role);
  INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount, region_group)
  SELECT new_id, g.id, pt.pay_type, r.role, CASE r.role WHEN '주강사' THEN 50000 ELSE 35000 END, '강릉·동해'
  FROM grades g CROSS JOIN (VALUES ('관내'), ('관외')) AS pt(pay_type) CROSS JOIN (VALUES ('주강사'), ('보조강사')) AS r(role);
  INSERT INTO rate_items (rate_table_id, grade_id, pay_type, role, amount)
  SELECT new_id, g.id, '부스', NULL, 35000 FROM grades g;
  UPDATE rate_items SET amount = 0, amount_after = NULL, tier_limit = NULL
   WHERE rate_table_id = new_id
     AND grade_id IN (SELECT id FROM grades WHERE code IN ('B등급', '연구원'));
END $$;
`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const fileIdx = args.indexOf("--file");
  const file = fileIdx >= 0 ? args[fileIdx + 1] : "data/tutorpay-seed.json";
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  const existing = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(schema.lectures);
  if (existing[0].n > 0 && !force) {
    console.log(
      `이미 강의 ${existing[0].n}건이 있습니다. 다시 적재하려면 --force 를 붙이세요.`,
    );
    await ensureRates202608(db);
    await client.end();
    return;
  }

  await db.transaction(async (tx) => {
    if (force) {
      await tx.execute(
        dsql`truncate table lectures, content_aliases, contents, institutions, rate_items, rate_tables, instructors, grades, settlement_locks, audit_logs restart identity cascade`,
      ); // pay_types 는 유지 (마이그레이션이 기본 7종을 넣음)
    }
    // 지급유형 기본 7종 보장 (마이그레이션이 이미 넣었으면 건너뜀)
    await tx.execute(
      dsql`insert into pay_types (code, sort, role_based, manual, color, is_active) values ('관내',1,true,false,'sky',true),('관외',2,true,false,'violet',true),('센터',3,true,false,'teal',true),('기관지급',4,false,false,'slate',true),('주(주말교육)',5,false,false,'orange',true),('교구정리',6,false,false,'lime',true),('수동기입',7,false,true,'amber',true) on conflict (code) do nothing`,
    );
    // 등급
    const GRADE_COLOR: Record<string, string> = {
      S등급: "amber",
      A등급: "teal",
      B등급: "slate",
      연구원: "ink",
    };
    const gradeRows = await tx
      .insert(schema.grades)
      .values(
        seed.grades.map((g: { code: string; label: string; sort: number }) => ({
          code: g.code,
          label: g.label,
          sort: g.sort,
          color: GRADE_COLOR[g.code] ?? "slate",
        })),
      )
      .returning();
    const gradeId = new Map(gradeRows.map((g) => [g.code, g.id]));
    // 단가표
    const [rt] = await tx
      .insert(schema.rateTables)
      .values({
        effectiveFrom: seed.rateTable.effectiveFrom,
        memo: seed.rateTable.memo,
        createdBy: "seed",
      })
      .returning();
    await tx.insert(schema.rateItems).values(
      seed.rateTable.items.map(
        (i: {
          grade: string;
          payType: string;
          role: string | null;
          amount: number;
        }) => ({
          rateTableId: rt.id,
          gradeId: gradeId.get(i.grade)!,
          payType: i.payType,
          role: i.role || null,
          amount: i.amount,
        }),
      ),
    );
    // 강사
    const instRows = await tx
      .insert(schema.instructors)
      .values(
        seed.instructors.map(
          (i: {
            name: string;
            grade: string | null;
            phone: string | null;
            region: string | null;
            isActive: boolean;
            note: string | null;
          }) => ({
            name: i.name,
            gradeId: i.grade ? (gradeId.get(i.grade) ?? null) : null,
            phone: i.phone,
            region: i.region,
            isActive: i.isActive,
            note: i.note,
          }),
        ),
      )
      .returning();
    const instId = new Map(instRows.map((i) => [i.name, i.id]));
    // 기관
    const orgRows = await tx
      .insert(schema.institutions)
      .values(
        seed.institutions.map(
          (i: {
            name: string;
            type: string;
            region: string | null;
            isActive: boolean;
          }) => ({
            name: i.name,
            type: i.type,
            region: i.region,
            isActive: i.isActive,
          }),
        ),
      )
      .returning();
    const orgId = new Map(orgRows.map((i) => [i.name, i.id]));
    // 콘텐츠 + 별칭
    for (const c of seed.contents as {
      name: string;
      aliases: string[];
      isActive: boolean;
      needsReview?: boolean;
    }[]) {
      const [row] = await tx
        .insert(schema.contents)
        .values({
          name: c.name,
          isActive: c.isActive,
          needsReview: !!c.needsReview,
        })
        .onConflictDoNothing()
        .returning();
      const cid =
        row?.id ??
        (await tx.query.contents.findFirst({
          where: eq(schema.contents.name, c.name),
        }))!.id;
      if (c.aliases.length)
        await tx
          .insert(schema.contentAliases)
          .values(c.aliases.map((alias) => ({ contentId: cid, alias })))
          .onConflictDoNothing();
    }
    // 강의 (단가·세전·세후는 시트 값 그대로 스냅샷)
    const rateItems = seed.rateTable.items.map(
      (i: {
        grade: string;
        payType: string;
        role: string | null;
        amount: number;
      }) => ({
        gradeId: gradeId.get(i.grade)!,
        payType: i.payType,
        role: i.role || null,
        amount: i.amount,
      }),
    );
    let mismatch = 0;
    const values = [];
    for (const l of seed.lectures) {
      const iid = instId.get(l.instructor);
      const oid = orgId.get(l.institution);
      if (!iid || !oid)
        throw new Error(
          `강사/기관을 찾을 수 없음: ${l.instructor} / ${l.institution}`,
        );
      const grade =
        seed.instructors.find((i: { name: string }) => i.name === l.instructor)
          ?.grade ?? null;
      const a = calcAmounts(rateItems, {
        gradeId: grade ? (gradeId.get(grade) ?? null) : null,
        payType: l.payType,
        role: l.role,
        manualPrice: l.manualPrice,
        sessions: l.sessions,
      });
      if (
        a.unitPrice !== l.unitPrice ||
        a.grossAmount !== l.grossAmount ||
        a.netAmount !== l.netAmount
      )
        mismatch++;
      values.push({
        date: l.date,
        startTime: l.startTime,
        endTime: l.endTime,
        instructorId: iid,
        institutionId: oid,
        content: l.content,
        contentRaw: l.contentRaw,
        sessions: l.sessions,
        role: l.role,
        payType: l.payType,
        manualPrice: l.manualPrice,
        unitPrice: l.unitPrice,
        grossAmount: l.grossAmount,
        netAmount: l.netAmount,
        isPaid: l.isPaid,
        paidAt: null,
        isDone: l.isDone,
        headcount: l.headcount,
        note: l.note,
        createdBy: "sheet-import",
        updatedBy: "sheet-import",
      });
    }
    for (let i = 0; i < values.length; i += 200)
      await tx.insert(schema.lectures).values(values.slice(i, i + 200));
    await tx.insert(schema.auditLogs).values({
      userEmail: "seed",
      tableName: "lectures",
      action: "import",
      summary: `시트 이전: 강의 ${values.length}건, 강사 ${instRows.length}명, 기관 ${orgRows.length}곳 (계산 불일치 ${mismatch}건)`,
    });
    console.log(
      `적재 완료: 강의 ${values.length}건 / 강사 ${instRows.length}명 / 기관 ${orgRows.length}곳 / 계산 불일치 ${mismatch}건`,
    );
  });

  // 관리자 계정 (ALLOWED_EMAILS)
  const emails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails)
    await db
      .insert(schema.users)
      .values({ email, role: "admin" })
      .onConflictDoNothing();

  await ensureRates202608(db);

  // 월별 합계 출력 (시트 정산리포트와 대조용)
  const rows = await db.execute(
    dsql`select substr(date::text,1,7) ym, count(*)::int n, sum(sessions)::float s, sum(gross_amount)::bigint g, sum(net_amount)::bigint t from lectures group by 1 order by 1`,
  );
  for (const r of rows as unknown as {
    ym: string;
    n: number;
    s: number;
    g: string;
    t: string;
  }[])
    console.log(
      `  ${r.ym}: ${r.n}건 ${r.s}차시 세전 ${Number(r.g).toLocaleString()} 세후 ${Number(r.t).toLocaleString()}`,
    );
  await client.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
