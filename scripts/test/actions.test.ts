/**
 * 서버 액션 통합 테스트 (실제 DB 사용, 마지막에 만든 데이터는 정리)
 *   AUTH_DISABLED=true DATABASE_URL=... npx tsx -r ./scripts/test/shim.cjs scripts/test/actions.test.ts
 */
import assert from "node:assert/strict";
import { and, eq, like, sql, desc } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLogs,
  contents,
  equipment,
  equipmentRentals,
  institutions,
  instructors,
  lectures,
  settlementLocks,
  payTypes,
  grades as gradesTable,
} from "../../src/db/schema";
import {
  createLectures,
  deleteLecture,
  markInstructorMonthPaid,
  setMonthLock,
  toggleLecture,
  updateLecture,
} from "../../src/app/(app)/lectures/actions";
import {
  createInstitution,
  mergeInstitutions,
  mergeContents,
  saveContent,
} from "../../src/app/(app)/master/actions";
import {
  deleteInstructor,
  createInstructor,
  updateInstructor,
} from "../../src/app/(app)/instructors/actions";
import {
  createGrade,
  createPayType,
  createRateTable,
  deleteGrade,
  deletePayType,
  deleteRateTable,
  updatePayType,
} from "../../src/app/(app)/rates/actions";
import {
  createRentals,
  deleteEquipment,
  deleteRental,
  returnRental,
  saveEquipment,
} from "../../src/app/(app)/equipment/actions";
import { restoreDeleted } from "../../src/app/(app)/settings/actions";
import {
  getEquipmentRentals,
  getRateTables,
  getGrades,
  getPayTypes,
} from "../../src/lib/queries";

const ok = <T>(
  r: { ok: boolean; error?: string; data?: T },
  msg: string,
): T => {
  assert.equal(r.ok, true, `${msg}: ${r.error}`);
  return r.data as T;
};
const fail = (
  r: { ok: boolean; error?: string },
  msg: string,
  includes?: string,
) => {
  assert.equal(r.ok, false, `${msg} 은(는) 실패해야 함`);
  if (includes)
    assert.ok(
      r.error?.includes(includes),
      `${msg}: 오류문구 '${r.error}' 에 '${includes}' 없음`,
    );
};

async function main() {
  const grades = await getGrades();
  const gA = grades.find((g) => g.code === "A등급")!.id;
  const gB = grades.find((g) => g.code === "B등급")!.id;
  const tag = `T${Date.now()}`;
  const startedAt = new Date();

  // 강사 2명(A, B), 기관 1곳 등록
  const iA = ok(
    await createInstructor({
      name: `테스트A${tag}`,
      gradeId: gA,
      phone: null,
      region: "원주",
      isActive: true,
      note: null,
    }),
    "강사A",
  ).id;
  const iB = ok(
    await createInstructor({
      name: `테스트B${tag}`,
      gradeId: gB,
      phone: null,
      region: "원주",
      isActive: true,
      note: null,
    }),
    "강사B",
  ).id;
  fail(
    await createInstructor({
      name: `테스트A${tag}`,
      gradeId: gA,
      phone: null,
      region: null,
      isActive: true,
      note: null,
    }),
    "중복 강사",
    "이미",
  );
  const org = ok(
    await createInstitution({
      name: `테스트초등학교_${tag}`,
      type: "초등",
      region: null,
      isActive: true,
      note: null,
    }),
    "기관",
  ).id;

  // 다중 강사 배정: 관외, 주강사 A(60,000) + 보조강사 B(30,000), 3차시
  const common = {
    date: "2031-03-10",
    startTime: "09:10",
    endTime: "12:20",
    sessions: 3,
    headcount: 20,
    travelFee: 0,
    institutionId: org,
    institutionName: null,
    content: "투닝",
    payType: "관외",
    isDone: false,
    isPaid: false,
    note: `${tag}`,
  };
  const created = ok(
    await createLectures({
      ...common,
      assignments: [
        { instructorId: iA, role: "주강사", manualPrice: null },
        { instructorId: iB, role: "보조강사", manualPrice: null },
      ],
    }),
    "다중 배정",
  );
  assert.equal(created.count, 2);
  const rows = await db.select().from(lectures).where(eq(lectures.note, tag));
  const rA = rows.find((r) => r.instructorId === iA)!;
  const rB = rows.find((r) => r.instructorId === iB)!;
  assert.equal(rA.unitPrice, 60000, "A 관외 주강사 단가");
  // 2026-08 개편: 관외 주 3차시 = 6+6+4만 (1~2차시 6만, 이후 4만)
  assert.equal(rA.grossAmount, 160000);
  assert.equal(rA.netAmount, Math.floor((160000 * 967) / 1000)); // 154,720
  assert.equal(rB.unitPrice, 0, "B등급 단가는 0원 (미사용)");
  assert.equal(rB.netAmount, 0);
  assert.equal(rA.content, "AI 투닝", "별칭 '투닝' → 표준명 정규화");
  assert.equal(rA.contentRaw, "투닝");

  // 검증 규칙
  fail(
    await createLectures({
      ...common,
      sessions: 1.3,
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
    }),
    "0.5 단위",
    "0.5",
  );
  fail(
    await createLectures({
      ...common,
      payType: "수동기입",
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
    }),
    "수동기입 단가 누락",
    "단가",
  );
  fail(
    await createLectures({
      ...common,
      assignments: [
        { instructorId: iA, role: "주강사", manualPrice: null },
        { instructorId: iA, role: "보조강사", manualPrice: null },
      ],
    }),
    "같은 강사 중복",
    "두 번",
  );

  // 수동기입 + 미등록 기관명 직접 입력(자동 등록) + 알 수 없는 콘텐츠(검수 필요로 자동 등록)
  const c2 = ok(
    await createLectures({
      ...common,
      institutionId: null,
      institutionName: `새기관고등학교_${tag}`,
      content: `신규콘텐츠${tag}`,
      payType: "수동기입",
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: 50000 }],
    }),
    "수동기입",
  );
  assert.equal(c2.count, 1);
  const newOrg = await db.query.institutions.findFirst({
    where: eq(institutions.name, `새기관고등학교_${tag}`),
  });
  assert.ok(
    newOrg && newOrg.type === "고등",
    "기관 자동 등록 + 유형 자동분류(고등)",
  );
  const newContent = await db.query.contents.findFirst({
    where: eq(contents.name, `신규콘텐츠${tag}`),
  });
  assert.ok(newContent?.needsReview, "미지 콘텐츠 → 검수 필요로 등록");
  const manual = (
    await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.note, tag), eq(lectures.payType, "수동기입")))
  )[0];
  assert.equal(manual.unitPrice, 50000);
  assert.equal(manual.netAmount, 145050);

  // 수정: 차시 4로 → 세전/세후 재계산 (스냅샷 갱신은 '수정' 시에만)
  ok(
    await updateLecture(rA.id, {
      ...common,
      sessions: 4,
      instructorId: iA,
      role: "주강사",
      manualPrice: null,
    }),
    "수정",
  );
  const rA2 = (
    await db.select().from(lectures).where(eq(lectures.id, rA.id))
  )[0];
  // 관외 주 4차시 = 6+6+4+4만 (개편 구간)
  assert.equal(rA2.grossAmount, 200000);
  assert.equal(rA2.netAmount, 193400);

  // 등급 변경은 기존 강의에 소급되지 않음
  ok(
    await updateInstructor(iA, {
      name: `테스트A${tag}`,
      gradeId: gB,
      phone: null,
      region: "원주",
      isActive: true,
      note: null,
    }),
    "등급 변경",
  );
  const rA3 = (
    await db.select().from(lectures).where(eq(lectures.id, rA.id))
  )[0];
  assert.equal(rA3.unitPrice, 60000, "등급 변경 후에도 기존 단가 스냅샷 유지");
  ok(
    await updateInstructor(iA, {
      name: `테스트A${tag}`,
      gradeId: gA,
      phone: null,
      region: "원주",
      isActive: true,
      note: null,
    }),
    "등급 복구",
  );

  // 토글 / 월 일괄 지급
  ok(await toggleLecture(rB.id, "isDone", true), "완료 토글");
  const paid = ok(await markInstructorMonthPaid(iA, "2031-03"), "월 일괄 지급");
  assert.equal(paid.count, 2, "A 강사 3월 미지급 2건 → 지급완료");
  const paidRows = await db
    .select()
    .from(lectures)
    .where(and(eq(lectures.note, tag), eq(lectures.instructorId, iA)));
  assert.ok(
    paidRows.every((r) => r.isPaid && r.paidAt),
    "paidAt 기록",
  );

  // 정산 확정(잠금) → 수정·삭제·생성 차단 → 해제
  ok(await setMonthLock("2031-03", true), "잠금");
  fail(await toggleLecture(rB.id, "isPaid", true), "잠긴 달 토글", "잠금");
  fail(await deleteLecture(rB.id), "잠긴 달 삭제", "잠금");
  fail(
    await createLectures({
      ...common,
      assignments: [{ instructorId: iB, role: "주강사", manualPrice: null }],
    }),
    "잠긴 달 생성",
    "잠금",
  );
  ok(await setMonthLock("2031-03", false), "잠금 해제");
  ok(await toggleLecture(rB.id, "isPaid", true), "해제 후 토글");

  // 단가표 새 버전(2031-04-01 적용, A 관외 주강사 70,000) → 4월 강의에만 반영, 3월 강의는 그대로
  const base = (await getRateTables())[0];
  const items = base.items.map((i) => ({
    ...i,
    amount:
      i.gradeId === gA && i.payType === "관외" && i.role === "주강사"
        ? 70000
        : i.amount,
  }));
  const rt = ok(
    await createRateTable({
      effectiveFrom: "2031-04-01",
      memo: "테스트",
      items,
    }),
    "단가표 버전",
  ).id;
  ok(
    await createLectures({
      ...common,
      date: "2031-04-02",
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
    }),
    "4월 강의",
  );
  const apr = (
    await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.note, tag), eq(lectures.date, "2031-04-02")))
  )[0];
  assert.equal(apr.unitPrice, 70000, "새 버전 단가 적용");
  const mar = (
    await db.select().from(lectures).where(eq(lectures.id, rA.id))
  )[0];
  assert.equal(mar.unitPrice, 60000, "이전 강의는 소급 없음");
  ok(await deleteRateTable(rt), "단가표 버전 삭제");

  // ---- 지급유형·등급 추가 (단가표 종류 확장) ----
  const ptName = `특강${tag}`;
  const pt = ok(
    await createPayType({
      code: ptName,
      roleBased: false,
      manual: false,
      color: "pink",
      isActive: true,
      note: "테스트",
    }),
    "지급유형 추가",
  ).id;
  assert.ok(
    (await getPayTypes()).some((p) => p.code === ptName),
    "지급유형 목록에 반영",
  );
  fail(
    await createPayType({
      code: ptName,
      roleBased: true,
      manual: false,
      color: "sky",
      isActive: true,
      note: null,
    }),
    "지급유형 중복",
    "이미",
  );
  fail(
    await createPayType({
      code: "미지정",
      roleBased: true,
      manual: false,
      color: "sky",
      isActive: true,
      note: null,
    }),
    "미지정 금지",
    "미지정",
  );
  const gNew = ok(
    await createGrade({
      code: `C등급${tag}`,
      label: "테스트 등급",
      color: "blue",
    }),
    "등급 추가",
  ).id;
  // 새 유형 단가는 새 버전으로: A등급 특강 70,000, 새 등급 관내 주강사 30,000
  const base2 = (await getRateTables()).sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? 1 : -1,
  )[0];
  const items2 = [
    ...base2.items.filter((i) => i.gradeId !== gNew),
    { gradeId: gA, payType: ptName, role: null, amount: 70000 },
    { gradeId: gNew, payType: "관내", role: "주강사", amount: 30000 },
  ];
  const rt2 = ok(
    await createRateTable({
      effectiveFrom: "2031-05-01",
      memo: "특강 신설",
      items: items2,
    }),
    "새 유형 포함 버전",
  ).id;
  ok(
    await createLectures({
      ...common,
      date: "2031-05-03",
      payType: ptName,
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
    }),
    "새 지급유형 강의",
  );
  const spLec = (
    await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.note, tag), eq(lectures.payType, ptName)))
  )[0];
  assert.equal(spLec.unitPrice, 70000, "새 지급유형(역할 무관) 단가 적용");
  assert.equal(spLec.netAmount, Math.floor((70000 * 3 * 967) / 1000));
  // 이름 변경 → 강의·단가 항목 치환
  const renamedPt = ok(
    await updatePayType(pt, {
      code: `${ptName}R`,
      roleBased: false,
      manual: false,
      color: "pink",
      isActive: true,
      note: null,
    }),
    "지급유형 이름 변경",
  );
  assert.equal(renamedPt.renamedLectures, 1);
  assert.equal(
    (await db.select().from(lectures).where(eq(lectures.id, spLec.id)))[0]
      .payType,
    `${ptName}R`,
  );
  fail(await deletePayType(pt), "사용 중 지급유형 삭제", "삭제할 수 없");
  fail(
    await createLectures({
      ...common,
      date: "2031-05-04",
      payType: "없는유형",
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
    }),
    "미등록 지급유형",
    "지급유형",
  );
  ok(await deleteRateTable(rt2), "버전 삭제");
  ok(await deleteLecture(spLec.id), "특강 강의 삭제");
  ok(await deletePayType(pt), "지급유형 삭제(미사용)");
  ok(await deleteGrade(gNew), "등급 삭제(미사용)");

  // ---- 교구: 등록 → 대여 → 초과 거부 → 반납 → 삭제 가드 ----
  const eqId = ok(
    await saveEquipment(null, {
      name: `테스트교구${tag}`,
      code: null,
      category: "테스트",
      totalStock: 10,
      repairCount: 1,
      discardCount: 0,
      note: null,
      isActive: true,
    }),
    "교구 등록",
  ).id;
  const rentIds = ok(
    await createRentals({
      renter: `테스트강사${tag}`,
      purpose: "강사 연구용",
      outDate: "2031-05-02",
      note: tag,
      items: [{ equipmentId: eqId, quantity: 3 }],
    }),
    "교구 대여",
  ).ids;
  fail(
    await createRentals({
      renter: `테스트강사${tag}`,
      purpose: null,
      outDate: "2031-05-03",
      note: tag,
      items: [{ equipmentId: eqId, quantity: 7 }],
    }),
    "사용 가능 초과 대여",
    "사용 가능",
  ); // 가능 = 10-1-3 = 6
  fail(await deleteEquipment(eqId), "대여 기록 있는 교구 삭제", "삭제할 수 없");
  ok(await returnRental(rentIds[0], "2031-05-04"), "교구 반납");
  ok(
    await createRentals({
      renter: `테스트강사${tag}`,
      purpose: null,
      outDate: "2031-05-05",
      note: tag,
      items: [{ equipmentId: eqId, quantity: 7 }],
    }),
    "반납 후 재대여",
  );
  for (const rid of (
    await db
      .select()
      .from(equipmentRentals)
      .where(eq(equipmentRentals.note, tag))
  ).map((r) => r.id))
    ok(await deleteRental(rid), "대여 삭제");
  ok(await deleteEquipment(eqId), "교구 삭제(기록 없음)");

  // ---- 삭제 복원: 감사로그의 delete 항목을 되살린다 ----
  const eqDelLog = (
    await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, "equipment"),
          eq(auditLogs.action, "delete"),
          eq(auditLogs.recordId, String(eqId)),
        ),
      )
      .orderBy(desc(auditLogs.id))
      .limit(1)
  )[0];
  assert.ok(eqDelLog, "교구 삭제 이력 존재");
  ok(await restoreDeleted(eqDelLog.id), "교구 복원");
  const eqBack = (
    await db.select().from(equipment).where(eq(equipment.id, eqId))
  )[0];
  assert.ok(
    eqBack && eqBack.name === `테스트교구${tag}` && eqBack.totalStock === 10,
    "복원된 교구 내용 확인",
  );
  fail(await restoreDeleted(eqDelLog.id), "중복 복원 거부", "이미");
  const eqB = ok(
    await saveEquipment(null, {
      name: `테스트교구B${tag}`,
      code: null,
      category: "테스트",
      totalStock: 1,
      repairCount: 0,
      discardCount: 0,
      note: null,
      isActive: true,
    }),
    "복원 후 신규 등록(시퀀스 충돌 없음)",
  ).id;
  ok(await deleteEquipment(eqB), "정리: 신규 교구 삭제");
  ok(await deleteEquipment(eqId), "정리: 복원 교구 삭제");
  const lecDelLog = (
    await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, "lectures"),
          eq(auditLogs.action, "delete"),
          eq(auditLogs.recordId, String(spLec.id)),
        ),
      )
      .orderBy(desc(auditLogs.id))
      .limit(1)
  )[0];
  assert.ok(lecDelLog, "강의 삭제 이력 존재");
  ok(await restoreDeleted(lecDelLog.id), "강의 복원");
  const lecBack = (
    await db.select().from(lectures).where(eq(lectures.id, spLec.id))
  )[0];
  assert.ok(
    lecBack &&
      lecBack.netAmount === spLec.netAmount &&
      lecBack.date === "2031-05-03",
    "복원된 강의 금액·날짜 확인",
  ); // 정리는 note=tag 일괄 삭제가 담당

  // ---- 2026-08 단가 개편: 차시 구간·강릉/동해 일괄·부스·유아 ----
  {
    const mk = async (over: Record<string, unknown>, instId: number) => {
      const r = await createLectures({
        ...common,
        date: "2026-09-15",
        payType: "관내",
        travelFee: 0,
        ...over,
        assignments: [
          {
            instructorId: instId,
            role: (over.role as string) ?? "주강사",
            manualPrice: null,
          },
        ],
      } as Parameters<typeof createLectures>[0]);
      assert.ok(
        r.ok,
        "구간 케이스 등록 실패: " +
          JSON.stringify(over) +
          (r.ok ? "" : " → " + r.error),
      );
      const row = (
        await db
          .select()
          .from(lectures)
          .where(and(eq(lectures.note, tag), eq(lectures.date, "2026-09-15")))
      )[0];
      await deleteLecture(row.id);
      return row;
    };
    const gradeA = (
      await db.select().from(gradesTable).where(eq(gradesTable.code, "A등급"))
    )[0];
    assert.ok(gradeA, "A등급 존재");
    const [tierInst] = await db
      .insert(instructors)
      .values({ name: tag + "구간검증", gradeId: gradeA!.id })
      .returning();
    const t1 = await mk({ sessions: 4 }, tierInst.id);
    assert.equal(t1.grossAmount, 160000, "관내 주 4차시 = 5+5+3+3만");
    assert.equal(t1.netAmount, 154720, "관내 주 4차시 세후");
    const t2 = await mk({ sessions: 2.5 }, tierInst.id);
    assert.equal(
      t2.grossAmount,
      115000,
      "관내 주 2.5차시 = 5+5+1.5만 (0.5차시 비례)",
    );
    const t3 = await mk({ sessions: 4, role: "보조강사" }, tierInst.id);
    assert.equal(t3.grossAmount, 120000, "관내 보조 4차시 = 3만×4 일괄");
    const [gInst] = await db
      .insert(instructors)
      .values({ name: tag + "강릉검증", gradeId: gradeA!.id, region: "강릉" })
      .returning();
    const t4 = await mk({ sessions: 4, payType: "관외" }, gInst.id);
    assert.equal(t4.grossAmount, 200000, "강릉 강사: 관외 4차시도 일괄 5만×4");
    const t4b = await mk({ sessions: 3, role: "보조강사" }, gInst.id);
    assert.equal(t4b.grossAmount, 105000, "강릉 보조 3차시 = 3.5만×3");
    await deleteInstructor(gInst.id);
    const t5 = await mk({ sessions: 3, payType: "부스" }, tierInst.id);
    assert.equal(t5.grossAmount, 105000, "부스 3차시 = 3.5만×3 (역할 무관)");
    const t6 = await mk({ sessions: 2, payType: "유아" }, tierInst.id);
    await deleteInstructor(tierInst.id);
    assert.equal(t6.grossAmount, 80000, "유아 주 2차시 = 4만×2");
  }

  // ---- 세금 구분: 기본 3.3%, 기타소득 8.8%, 비과세 0%, 수정 시 재계산 ----
  {
    const mkTax = async (taxType: string | null) => {
      const r = await createLectures({
        ...common,
        date: "2026-09-17",
        payType: "관내",
        travelFee: 0,
        taxType,
        assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
      } as Parameters<typeof createLectures>[0]);
      assert.ok(r.ok, "세금 케이스 등록: " + taxType);
      const row = (
        await db
          .select()
          .from(lectures)
          .where(and(eq(lectures.note, tag), eq(lectures.date, "2026-09-17")))
      )[0];
      return row;
    };
    const t0 = await mkTax(null); // 기본 = 사업소득
    assert.equal(t0.taxType, "사업소득", "기본 세금 구분");
    assert.equal(
      t0.netAmount,
      Math.floor((t0.grossAmount * 967) / 1000),
      "3.3% 계산",
    );
    ok(
      await updateLecture(t0.id, {
        ...common,
        date: "2026-09-17",
        payType: "관내",
        travelFee: 0,
        taxType: "기타소득",
        instructorId: iA,
        role: "주강사",
        manualPrice: null,
      }),
      "세금 구분 변경(기타소득)",
    );
    const t1 = (
      await db.select().from(lectures).where(eq(lectures.id, t0.id))
    )[0];
    assert.equal(
      t1.netAmount,
      Math.floor((t1.grossAmount * 912) / 1000),
      "8.8% 재계산",
    );
    ok(
      await updateLecture(t0.id, {
        ...common,
        date: "2026-09-17",
        payType: "관내",
        travelFee: 0,
        taxType: "비과세",
        instructorId: iA,
        role: "주강사",
        manualPrice: null,
      }),
      "세금 구분 변경(비과세)",
    );
    const t2 = (
      await db.select().from(lectures).where(eq(lectures.id, t0.id))
    )[0];
    assert.equal(t2.netAmount, t2.grossAmount, "비과세 = 세전과 동일");
    fail(
      await createLectures({
        ...common,
        date: "2026-09-17",
        payType: "관내",
        travelFee: 0,
        taxType: "이상한값",
        assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
      } as Parameters<typeof createLectures>[0]),
      "잘못된 세금 구분 거부",
      "세금 구분",
    );
    ok(await deleteLecture(t2.id), "세금 케이스 정리");
  }

  // ---- 강사 미배정: 등록 → 목록 ⚠ → 수정에서 지정 ----
  ok(
    await createLectures({
      ...common,
      date: "2026-09-16",
      payType: "관내",
      travelFee: 0,
      assignments: [],
    }),
    "강사 없이 등록(미배정 1건 생성)",
  );
  const un = (
    await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.note, tag), eq(lectures.date, "2026-09-16")))
  )[0];
  assert.equal(un.instructorId, null, "미배정 저장");
  assert.equal(un.unitPrice, 0, "미배정 단가 0");
  ok(
    await updateLecture(un.id, {
      ...common,
      date: "2026-09-16",
      payType: "관내",
      travelFee: 0,
      instructorId: iA,
      role: "주강사",
      manualPrice: null,
    }),
    "미배정 → 강사 지정",
  );
  const un2 = (
    await db.select().from(lectures).where(eq(lectures.id, un.id))
  )[0];
  assert.ok(
    un2.instructorId === iA && un2.grossAmount > 0,
    "지정 후 금액 재계산",
  );
  ok(await deleteLecture(un.id), "미배정 케이스 정리");

  // ---- 강사 삭제: 강의 연결 시 거부, 없으면 삭제(첨부 포함) ----
  fail(await deleteInstructor(iA), "강의 있는 강사 삭제 거부", "연결");
  const [tmpInst] = await db
    .insert(instructors)
    .values({ name: tag + "삭제용", gradeId: null })
    .returning();
  ok(await deleteInstructor(tmpInst.id), "강의 없는 강사 삭제");
  assert.equal(
    await db.query.instructors.findFirst({
      where: eq(instructors.id, tmpInst.id),
    }),
    undefined,
    "삭제 확인",
  );

  // ---- 교통비: 저장·수정·검증, 지급액과 무관하게 세후는 그대로 ----
  ok(
    await createLectures({
      ...common,
      date: "2031-06-01",
      payType: "관내",
      travelFee: 15000,
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
    }),
    "교통비 포함 등록",
  );
  const tf = (
    await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.note, tag), eq(lectures.date, "2031-06-01")))
  )[0];
  assert.equal(tf.travelFee, 15000, "교통비 저장");
  assert.ok(
    tf.netAmount > 0 &&
      tf.netAmount === Math.floor((tf.grossAmount * 967) / 1000),
    "세후는 교통비와 무관",
  );
  ok(
    await updateLecture(tf.id, {
      ...common,
      date: "2031-06-01",
      payType: "관내",
      travelFee: 0,
      instructorId: iA,
      role: "주강사",
      manualPrice: null,
    }),
    "교통비 0으로 수정",
  );
  fail(
    await updateLecture(tf.id, {
      ...common,
      date: "2031-06-01",
      payType: "관내",
      travelFee: -100,
      instructorId: iA,
      role: "주강사",
      manualPrice: null,
    }),
    "음수 교통비 거부",
    "교통비",
  );
  ok(await deleteLecture(tf.id), "교통비 강의 정리");

  // '부스' 지급유형이 시드되어 있고 단가 직접 입력(manual)인지
  const booth = await db.query.payTypes.findFirst({
    where: eq(payTypes.code, "부스"),
  });
  assert.ok(
    booth && booth.manual === false,
    "'부스' 지급유형 존재(2026-08 개편: 단가표 3.5만 계산)",
  );

  // ---- 강의 ↔ 교구 연동: 등록 시 대여 생성, 초과 시 전체 롤백, 강의 삭제 시 대여 함께 삭제 ----
  const eqL = ok(
    await saveEquipment(null, {
      name: `연동교구${tag}`,
      code: null,
      category: "테스트",
      totalStock: 5,
      repairCount: 0,
      discardCount: 0,
      note: null,
      isActive: true,
    }),
    "연동 교구 등록",
  ).id;
  ok(
    await createLectures({
      ...common,
      date: "2031-05-06",
      payType: "관내",
      assignments: [
        { instructorId: iB, role: "보조강사", manualPrice: null },
        { instructorId: iA, role: "주강사", manualPrice: null },
      ],
      equipmentItems: [{ equipmentId: eqL, quantity: 2 }],
    }),
    "강의(보조+주강사) + 교구 대여 등록",
  );
  const linked = await db
    .select()
    .from(equipmentRentals)
    .where(eq(equipmentRentals.equipmentId, eqL));
  assert.equal(linked.length, 1, "연동 대여 1건 생성");
  assert.equal(linked[0].quantity, 2);
  assert.ok(
    linked[0].lectureId != null && linked[0].inDate == null,
    "강의 연결 + 대여중 상태",
  );
  const mainLec = (
    await db
      .select()
      .from(lectures)
      .where(eq(lectures.id, linked[0].lectureId!))
  )[0];
  assert.equal(
    mainLec.role,
    "주강사",
    "보조를 먼저 배정해도 주강사 강의에 연결",
  );
  const joined = (await getEquipmentRentals()).find(
    (r) => r.id === linked[0].id,
  );
  assert.ok(
    joined?.lectureInstructorName && joined.lectureRole === "주강사",
    "대여 조회에 담당 강사(주강사) 표시",
  );
  fail(
    await createLectures({
      ...common,
      date: "2031-05-07",
      payType: "관내",
      assignments: [{ instructorId: iA, role: "주강사", manualPrice: null }],
      equipmentItems: [{ equipmentId: eqL, quantity: 9 }],
    }),
    "교구 초과 시 등록 거부",
    "사용 가능",
  );
  assert.equal(
    (
      await db
        .select()
        .from(lectures)
        .where(and(eq(lectures.note, tag), eq(lectures.date, "2031-05-07")))
    ).length,
    0,
    "교구 초과 시 강의도 롤백",
  );
  const delRes = ok(
    await deleteLecture(linked[0].lectureId!),
    "연동(주강사) 강의 삭제",
  );
  assert.equal(delRes.removedRentals, 1, "연동 대여 1건 함께 삭제 보고");
  assert.equal(
    (
      await db
        .select()
        .from(equipmentRentals)
        .where(eq(equipmentRentals.equipmentId, eqL))
    ).length,
    0,
    "강의 삭제 시 연동 교구 대여도 함께 삭제",
  );
  ok(await deleteEquipment(eqL), "연동 교구 정리");

  // 기관 병합: newOrg → org (수동기입 강의 1건 이동)
  const merged = ok(await mergeInstitutions(newOrg!.id, org), "기관 병합");
  assert.equal(merged.moved, 1);
  assert.equal(
    await db.query.institutions.findFirst({
      where: eq(institutions.id, newOrg!.id),
    }),
    undefined,
  );

  // 콘텐츠: 표준명 변경 → 강의 반영, 병합 → 별칭화
  const renamed = ok(
    await saveContent(newContent!.id, {
      name: `신규콘텐츠개명${tag}`,
      aliases: [`신규콘텐츠${tag}`],
      isActive: true,
      needsReview: false,
    }),
    "콘텐츠 개명",
  );
  assert.equal(renamed.renamed, 1);
  const tuning = await db.query.contents.findFirst({
    where: eq(contents.name, "AI 투닝"),
  });
  const m2 = ok(await mergeContents(newContent!.id, tuning!.id), "콘텐츠 병합");
  assert.equal(m2.moved, 1);
  const afterMerge = (
    await db
      .select()
      .from(lectures)
      .where(and(eq(lectures.note, tag), eq(lectures.payType, "수동기입")))
  )[0];
  assert.equal(afterMerge.content, "AI 투닝");

  // 정리
  for (const r of await db
    .select({ id: lectures.id })
    .from(lectures)
    .where(eq(lectures.note, tag)))
    ok(await deleteLecture(r.id), "삭제");
  await db.delete(instructors).where(like(instructors.name, `%${tag}%`));
  await db.delete(institutions).where(like(institutions.name, `%${tag}%`));
  await db.delete(contents).where(like(contents.name, `%${tag}%`));
  await db.execute(
    sql`delete from content_aliases where alias like ${"%" + tag + "%"}`,
  );
  await db.execute(
    sql`delete from audit_logs where summary like ${"%" + tag + "%"} or at >= ${startedAt.toISOString()}::timestamptz`,
  );
  await db.delete(settlementLocks).where(eq(settlementLocks.year, 2031));
  await db.execute(
    sql`delete from pay_types where code like ${"%" + tag + "%"}`,
  );
  await db.execute(
    sql`delete from equipment_rentals where note = ${tag} or renter like ${"%" + tag + "%"}`,
  );
  await db.execute(
    sql`delete from equipment where name like ${"%" + tag + "%"}`,
  );
  await db.execute(sql`delete from grades where code like ${"%" + tag + "%"}`);
  const left = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lectures);
  assert.equal(left[0].n, 558, "원본 558건 유지");
  console.log(
    "서버 액션 통합 테스트 통과 ✓ (배정·검증·정규화·스냅샷·잠금·일괄지급·단가표버전·지급유형/등급·교구·강의연동대여·삭제복원·병합)",
  );
  process.exit(0);
}
main().catch((e) => {
  console.error("실패:", e.message ?? e);
  process.exit(1);
});
