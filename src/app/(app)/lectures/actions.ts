"use server";
/**
 * 강의배정 서버 액션 (모든 변경은 여기서만 일어난다).
 * - createLectures: 공통 입력 + 강사 배정 목록 → 트랜잭션으로 N건 생성 (기관 자동 등록, 콘텐츠 정규화, 서버 재계산 스냅샷, 감사로그)
 * - updateLecture / deleteLecture / toggleLecture(완료·지급): 잠긴 달이면 거부(assertMonthUnlocked)
 * - markInstructorMonthPaid / markInstructorPeriodPaid: 강사별 미지급 일괄 지급 (기관지급 제외)
 * - setMonthLock: 월 정산 확정/해제
 * 검증 규칙(0.5차시 단위, 수동기입 단가 필수, 같은 강사 중복 금지 등)도 이 파일에 있다.
 */
import { revalidatePath } from "next/cache";
import { and, between, eq, gt, inArray, ne } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  equipmentRentals,
  contentAliases,
  contents,
  institutions,
  instructors,
  lectures,
  settlementLocks,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  calcAmounts,
  classifyInstitution,
  findRateTable,
  INSTITUTION_PAID,
  isManualPayType,
  regionFromInstitutionName,
  ROLES,
  type PayTypeRule,
  TAX_TYPES,
} from "@/lib/calc";
import { monthsBetween, ymRange } from "@/lib/format";
import { getLockedMonths, getPayTypes, getRateTables } from "@/lib/queries";
import { insertRentalsTx } from "@/lib/rentals";
import { requireEditor } from "@/lib/session";
import { safeAction } from "@/lib/action-utils";
import type { ActionResult } from "@/lib/types";

/** 강의 등록/수정 폼의 공통 입력값 (강사와 무관한 부분). 날짜·시간·차시·기관·콘텐츠·지급유형·비고·완료/지급 */
export type LectureCommonInput = {
  date: string;
  startTime: string | null;
  endTime: string | null;
  sessions: number | null;
  headcount: number | null;
  institutionId: number | null;
  institutionName: string | null; // 직접 입력 시
  content: string | null;
  payType: string | null;
  isDone: boolean;
  isPaid: boolean;
  /** 교통비(원) — 기본 0, 수기 입력. 세금 계산과 무관하게 지급액에 합산 */
  travelFee: number;
  /** 세금 구분 — 사업소득(3.3%)/기타소득(8.8%)/비과세(0%). 없으면 사업소득 */
  taxType?: string | null;
  note: string | null;
  /** (선택) 이 강의와 함께 빌려준 교구 — 저장 시 교구 관리의 대여 기록으로 만들어지고 강의와 연결된다 */
  equipmentItems?: { equipmentId: number; quantity: number }[];
};
/** 강사 1명 배정: 강사 id(없으면 '미배정'으로 등록) + 역할 + (수동기입일 때) 단가 */
export type AssignmentInput = {
  instructorId: number | null;
  role: string;
  manualPrice: number | null;
};

function revalidateAll() {
  revalidatePath("/", "layout");
}

async function assertMonthUnlocked(tx: Tx, dateStr: string) {
  const { year, month } = ymRange(dateStr.slice(0, 7));
  const lock = await tx.query.settlementLocks.findFirst({
    where: and(
      eq(settlementLocks.year, year),
      eq(settlementLocks.month, month),
    ),
  });
  if (lock)
    throw new Error(
      `${year}년 ${month}월은 정산 확정(잠금) 상태입니다. 정산 화면에서 잠금을 해제한 뒤 수정하세요.`,
    );
}

/** 검증·계산에 쓰는 지급유형 규칙 (DB pay_types). 비활성 유형도 포함 — 과거 강의 수정은 허용 */
async function loadRules(): Promise<PayTypeRule[]> {
  return (await getPayTypes()).map((p) => ({
    code: p.code,
    roleBased: p.roleBased,
    manual: p.manual,
    sort: p.sort,
    isActive: p.isActive,
  }));
}

function validateCommon(input: LectureCommonInput, rules: PayTypeRule[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    throw new Error("날짜를 입력하세요.");
  if (!input.institutionId && !input.institutionName?.trim())
    throw new Error("기관을 선택하거나 입력하세요.");
  if (input.payType && !rules.some((r) => r.code === input.payType))
    throw new Error(
      "지급유형 값이 올바르지 않습니다. (단가표 화면에서 지급유형을 먼저 등록하세요)",
    );
  if (
    input.sessions != null &&
    (input.sessions < 0 ||
      Math.round(input.sessions * 2) !== input.sessions * 2)
  )
    throw new Error("차시는 0.5 단위로 입력하세요.");
  if (
    input.headcount != null &&
    (input.headcount < 0 || !Number.isInteger(input.headcount))
  )
    throw new Error("교육 인원은 정수로 입력하세요.");
  for (const t of [input.startTime, input.endTime])
    if (t && !/^\d{2}:\d{2}$/.test(t))
      throw new Error("시간은 HH:MM 형식이어야 합니다.");
  if (input.taxType != null && !TAX_TYPES.some((t) => t.code === input.taxType))
    throw new Error("세금 구분이 올바르지 않습니다.");
  if (!Number.isInteger(input.travelFee) || input.travelFee < 0)
    throw new Error("교통비는 0 이상의 정수(원)여야 합니다.");
}

function validateAssignment(
  a: AssignmentInput,
  payType: string | null,
  rules: PayTypeRule[],
) {
  // 강사 미선택 허용 — 미배정으로 등록되고 나중에 수정에서 지정
  if (!(ROLES as readonly string[]).includes(a.role))
    throw new Error("역할 값이 올바르지 않습니다.");
  if (
    isManualPayType(payType, rules) &&
    (a.manualPrice == null || a.manualPrice < 0)
  )
    throw new Error(`${payType} 지급유형은 강사별 단가를 입력해야 합니다.`);
}

async function resolveInstitution(
  tx: Tx,
  input: LectureCommonInput,
  userEmail: string,
): Promise<number> {
  if (input.institutionId) {
    const row = await tx.query.institutions.findFirst({
      where: eq(institutions.id, input.institutionId),
    });
    if (!row) throw new Error("선택한 기관을 찾을 수 없습니다.");
    return row.id;
  }
  const name = input.institutionName!.trim();
  const existing = await tx.query.institutions.findFirst({
    where: eq(institutions.name, name),
  });
  if (existing) return existing.id;
  const [created] = await tx
    .insert(institutions)
    .values({
      name,
      type: classifyInstitution(name),
      region: regionFromInstitutionName(name),
    })
    .returning();
  await logAudit(tx, {
    userEmail,
    tableName: "institutions",
    recordId: created.id,
    action: "create",
    after: created,
    summary: `기관 자동 등록: ${name}`,
  });
  return created.id;
}

/** 콘텐츠 표기 정규화: 별칭 → 표준명, 여러 개는 " / " 로 결합. 모르는 표기는 검수 대상 콘텐츠로 자동 등록 */
async function normalizeContent(
  tx: Tx,
  raw: string | null,
): Promise<string | null> {
  const s = raw?.trim();
  if (!s) return null;
  const all = await tx.select().from(contents);
  const aliases = await tx.select().from(contentAliases);
  const key = (x: string) => x.replace(/\s+/g, "").toLowerCase();
  const map = new Map<string, string>();
  for (const c of all) map.set(key(c.name), c.name);
  for (const a of aliases) {
    const c = all.find((x) => x.id === a.contentId);
    if (c) map.set(key(a.alias), c.name);
  }
  const tokens = s
    .split(/[\/,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const std = map.get(key(t));
    if (std) out.push(std);
    else {
      await tx
        .insert(contents)
        .values({ name: t, needsReview: true })
        .onConflictDoNothing();
      out.push(t);
    }
  }
  return out.join(" / ");
}

async function computeSnapshot(
  tx: Tx,
  args: {
    date: string;
    instructorId: number | null;
    payType: string | null;
    role: string;
    manualPrice: number | null;
    sessions: number | null;
    taxType?: string | null;
  },
  rules: PayTypeRule[],
) {
  const inst =
    args.instructorId == null
      ? null // 미배정: 등급·지역 없음 → 단가 0, ⚠ 로 표시
      : await tx
          .select({
            id: instructors.id,
            gradeId: instructors.gradeId,
            name: instructors.name,
            region: instructors.region,
          })
          .from(instructors)
          .where(eq(instructors.id, args.instructorId))
          .then((r) => r[0]);
  if (args.instructorId != null && !inst)
    throw new Error("강사를 찾을 수 없습니다.");
  const tables = await getRateTables();
  const table = findRateTable(tables, args.date);
  const amounts = calcAmounts(
    table?.items ?? [],
    {
      gradeId: inst?.gradeId ?? null,
      payType: args.payType,
      role: args.role,
      manualPrice: args.manualPrice,
      region: inst?.region ?? null,
      sessions: args.sessions,
      taxType: args.taxType ?? null,
    },
    rules,
  );
  return { ...amounts, instructorName: inst?.name ?? "미배정" };
}

/**
 * 강의 등록 (다중 강사).
 * 1) 입력 검증 → 2) 잠긴 달 확인 → 3) 기관 확보(없으면 자동 등록+유형 분류) → 4) 콘텐츠 정규화
 * → 5) 강사별로 서버에서 단가·세전·세후 계산(스냅샷) → 6) N건 insert → 7) 감사로그. 전부 한 트랜잭션.
 */
export async function createLectures(
  input: LectureCommonInput & { assignments: AssignmentInput[] },
): Promise<ActionResult<{ count: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const rules = await loadRules();
    validateCommon(input, rules);
    // 강사를 아무도 배정하지 않으면 '미배정' 강의 1건으로 등록 (나중에 수정에서 지정)
    if (!input.assignments.length)
      input.assignments = [
        { instructorId: null, role: "주강사", manualPrice: null },
      ];
    const ids = input.assignments
      .map((a) => a.instructorId)
      .filter((v) => v != null);
    if (new Set(ids).size !== ids.length)
      throw new Error("같은 강사를 두 번 배정할 수 없습니다.");
    input.assignments.forEach((a) =>
      validateAssignment(a, input.payType, rules),
    );

    const count = await db.transaction(async (tx) => {
      await assertMonthUnlocked(tx, input.date);
      const institutionId = await resolveInstitution(tx, input, user.email);
      const content = await normalizeContent(tx, input.content);
      let n = 0;
      let firstLectureId: number | null = null; // 교구 대여를 연결할 강의 — 주강사 강의 우선, 없으면 첫 강의
      let mainLectureId: number | null = null;
      for (const a of input.assignments) {
        const snap = await computeSnapshot(
          tx,
          {
            date: input.date,
            instructorId: a.instructorId,
            payType: input.payType,
            role: a.role,
            manualPrice: isManualPayType(input.payType, rules)
              ? a.manualPrice
              : null,
            sessions: input.sessions,
            taxType: input.taxType,
          },
          rules,
        );
        const [row] = await tx
          .insert(lectures)
          .values({
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            instructorId: a.instructorId,
            institutionId,
            content,
            contentRaw:
              input.content && input.content.trim() !== content
                ? input.content.trim()
                : null,
            sessions: input.sessions,
            role: a.role,
            payType: input.payType,
            manualPrice: isManualPayType(input.payType, rules)
              ? a.manualPrice
              : null,
            unitPrice: snap.unitPrice,
            grossAmount: snap.grossAmount,
            netAmount: snap.netAmount,
            travelFee: input.travelFee,
            taxType: input.taxType ?? "사업소득",
            isPaid: input.isPaid,
            paidAt: input.isPaid ? new Date() : null,
            isDone: input.isDone,
            headcount: input.headcount,
            note: input.note,
            createdBy: user.email,
            updatedBy: user.email,
          })
          .returning();
        await logAudit(tx, {
          userEmail: user.email,
          tableName: "lectures",
          recordId: row.id,
          action: "create",
          after: row,
          summary: `강의 등록: ${input.date} ${snap.instructorName}`,
        });
        firstLectureId ??= row.id;
        if (a.role === "주강사") mainLectureId ??= row.id;
        n++;
      }
      // 함께 빌려준 교구 → 교구 관리의 대여 기록으로 (대여처 = 기관명, 첫 강의에 연결). 수량 초과면 강의 등록까지 통째로 취소된다
      if (input.equipmentItems?.length) {
        const inst = await tx.query.institutions.findFirst({
          where: eq(institutions.id, institutionId),
        });
        await insertRentalsTx(tx, {
          userEmail: user.email,
          renter: inst?.name ?? "기관 미상",
          purpose: "교육(수업)",
          outDate: input.date,
          note: `강의 연동${content ? ` · ${content}` : ""}`,
          items: input.equipmentItems,
          lectureId: mainLectureId ?? firstLectureId,
        });
      }
      return n;
    });
    revalidateAll();
    return { count };
  });
}

/** 강의 1건 수정. 저장 시 다시 계산해 스냅샷을 갱신한다 (등급/단가표 변경을 소급 반영하는 유일한 경로) */
export async function updateLecture(
  id: number,
  input: LectureCommonInput & AssignmentInput,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const rules = await loadRules();
    validateCommon(input, rules);
    validateAssignment(input, input.payType, rules);
    await db.transaction(async (tx) => {
      const before = await tx.query.lectures.findFirst({
        where: eq(lectures.id, id),
      });
      if (!before) throw new Error("강의를 찾을 수 없습니다.");
      await assertMonthUnlocked(tx, before.date);
      await assertMonthUnlocked(tx, input.date);
      const institutionId = await resolveInstitution(tx, input, user.email);
      const content = await normalizeContent(tx, input.content);
      const snap = await computeSnapshot(
        tx,
        {
          date: input.date,
          instructorId: input.instructorId,
          payType: input.payType,
          role: input.role,
          manualPrice: isManualPayType(input.payType, rules)
            ? input.manualPrice
            : null,
          sessions: input.sessions,
          taxType: input.taxType,
        },
        rules,
      );
      const [after] = await tx
        .update(lectures)
        .set({
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          instructorId: input.instructorId,
          institutionId,
          content,
          contentRaw:
            input.content && input.content.trim() !== content
              ? input.content.trim()
              : before.contentRaw,
          sessions: input.sessions,
          role: input.role,
          payType: input.payType,
          manualPrice: isManualPayType(input.payType, rules)
            ? input.manualPrice
            : null,
          unitPrice: snap.unitPrice,
          grossAmount: snap.grossAmount,
          netAmount: snap.netAmount,
          travelFee: input.travelFee,
          taxType: input.taxType ?? "사업소득",
          isPaid: input.isPaid,
          paidAt: input.isPaid ? (before.paidAt ?? new Date()) : null,
          isDone: input.isDone,
          headcount: input.headcount,
          note: input.note,
          updatedBy: user.email,
          updatedAt: new Date(),
        })
        .where(eq(lectures.id, id))
        .returning();
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "lectures",
        recordId: id,
        action: "update",
        before,
        after,
        summary: `강의 수정: ${input.date} ${snap.instructorName}`,
      });
      // (선택) 수정 화면에서 추가한 교구 대여 — 기존 연동 대여는 교구 관리에서 관리하고, 여기서는 새로 추가만 한다
      if (input.equipmentItems?.length) {
        const inst = await tx.query.institutions.findFirst({
          where: eq(institutions.id, institutionId),
        });
        await insertRentalsTx(tx, {
          userEmail: user.email,
          renter: inst?.name ?? "기관 미상",
          purpose: "교육(수업)",
          outDate: input.date,
          note: `강의 연동${content ? ` · ${content}` : ""}`,
          items: input.equipmentItems,
          lectureId: id,
        });
      }
    });
    revalidateAll();
    return undefined;
  });
}

/** 강의 삭제 (잠긴 달이면 거부, 감사로그에 삭제 전 내용 보관) */
export async function deleteLecture(
  id: number,
): Promise<ActionResult<{ removedRentals: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    let removedRentals = 0;
    await db.transaction(async (tx) => {
      const before = await tx.query.lectures.findFirst({
        where: eq(lectures.id, id),
      });
      if (!before) throw new Error("이미 삭제된 강의입니다.");
      await assertMonthUnlocked(tx, before.date);
      // 이 강의에 연동된 교구 대여도 함께 삭제 — 교구 관리에서 따로 지울 필요 없게
      const linked = await tx
        .select()
        .from(equipmentRentals)
        .where(eq(equipmentRentals.lectureId, id));
      if (linked.length > 0) {
        for (const r of linked) {
          await logAudit(tx, {
            userEmail: user.email,
            tableName: "equipment_rentals",
            recordId: r.id,
            action: "delete",
            // 강의는 사라지므로 연결 없는 대여로 복원되도록 lectureId 를 비워서 보관
            before: { ...r, lectureId: null },
            summary: `강의 삭제로 대여 함께 삭제: ${r.renter} · 수량 ${r.quantity}`,
          });
        }
        await tx
          .delete(equipmentRentals)
          .where(eq(equipmentRentals.lectureId, id));
        removedRentals = linked.length;
      }
      await tx.delete(lectures).where(eq(lectures.id, id));
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "lectures",
        recordId: id,
        action: "delete",
        before,
        summary:
          `강의 삭제: ${before.date}` +
          (removedRentals
            ? ` (연동 교구 대여 ${removedRentals}건 함께 삭제)`
            : ""),
      });
    });
    revalidateAll();
    revalidatePath("/equipment");
    return { removedRentals };
  });
}

/** 목록에서 완료/지급 체크박스 즉시 저장. 지급 변경은 잠긴 달이면 거부, 지급 시각(paidAt)도 기록 */
export async function toggleLecture(
  id: number,
  field: "isDone" | "isPaid",
  value: boolean,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    await db.transaction(async (tx) => {
      const before = await tx.query.lectures.findFirst({
        where: eq(lectures.id, id),
      });
      if (!before) throw new Error("강의를 찾을 수 없습니다.");
      if (field === "isPaid") await assertMonthUnlocked(tx, before.date);
      const patch =
        field === "isDone"
          ? { isDone: value }
          : { isPaid: value, paidAt: value ? new Date() : null };
      await tx
        .update(lectures)
        .set({ ...patch, updatedBy: user.email, updatedAt: new Date() })
        .where(eq(lectures.id, id));
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "lectures",
        recordId: id,
        action: "toggle",
        before: { [field]: before[field] },
        after: { [field]: value },
        summary: `${field === "isDone" ? "완료" : "지급"} ${value ? "체크" : "해제"}: ${before.date}`,
      });
    });
    revalidateAll();
    return undefined;
  });
}

/** 정산 화면: 해당 강사의 해당 월 미지급 건을 일괄 지급완료 처리 */
export async function markInstructorMonthPaid(
  instructorId: number,
  ym: string,
): Promise<ActionResult<{ count: number }>> {
  const { from, to } = ymRange(ym);
  return markInstructorPeriodPaid(instructorId, from, to);
}

/** 기간 내 강사의 미지급 강의를 일괄 지급완료. 기간에 잠긴 달이 섞여 있으면 거부 */
export async function markInstructorPeriodPaid(
  instructorId: number,
  from: string,
  to: string,
): Promise<ActionResult<{ count: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from > to
    )
      throw new Error("기간이 올바르지 않습니다.");
    const lockedAll = await getLockedMonths();
    const lockedIn = monthsBetween(from, to).filter((m) => lockedAll.has(m));
    if (lockedIn.length)
      throw new Error(
        `정산 확정(잠금)된 달이 포함되어 있습니다: ${lockedIn.join(", ")} — 잠금을 해제하거나 기간을 조정하세요.`,
      );
    const ym =
      from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}~${to}`;
    const count = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: lectures.id })
        .from(lectures)
        .where(
          and(
            eq(lectures.instructorId, instructorId),
            between(lectures.date, from, to),
            eq(lectures.isPaid, false),
            ne(lectures.payType, INSTITUTION_PAID),
            gt(lectures.netAmount, 0),
          ),
        ); // 기관지급·세후 0원(연구원 등)은 지급 대상이 아니라 제외 (calc.isPayable 과 같은 기준)
      if (!rows.length) return 0;
      const ids = rows.map((r) => r.id);
      await tx
        .update(lectures)
        .set({
          isPaid: true,
          paidAt: new Date(),
          updatedBy: user.email,
          updatedAt: new Date(),
        })
        .where(inArray(lectures.id, ids));
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "lectures",
        action: "bulk-paid",
        after: { ids },
        summary: `${ym} 강사 #${instructorId} ${ids.length}건 지급완료`,
      });
      return ids.length;
    });
    revalidateAll();
    return { count };
  });
}

/** 월 정산 확정(잠금) / 해제 */
export async function setMonthLock(
  ym: string,
  locked: boolean,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const { year, month } = ymRange(ym);
    if (locked) {
      await db
        .insert(settlementLocks)
        .values({ year, month, lockedBy: user.email })
        .onConflictDoNothing();
    } else {
      await db
        .delete(settlementLocks)
        .where(
          and(eq(settlementLocks.year, year), eq(settlementLocks.month, month)),
        );
    }
    await logAudit(db, {
      userEmail: user.email,
      tableName: "settlement_locks",
      recordId: ym,
      action: locked ? "lock" : "unlock",
      summary: `${ym} 정산 ${locked ? "확정" : "확정 해제"}`,
    });
    revalidateAll();
    return undefined;
  });
}
