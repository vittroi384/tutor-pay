"use server";
/**
 * 단가표 서버 액션
 *  - 버전: createRateTable(새 버전, 같은 적용일 중복 금지, 0 이상 정수 검증) / deleteRateTable(마지막 버전은 불가)
 *  - 지급유형(단가표 열의 종류): createPayType / updatePayType(이름 바꾸면 강의·단가 항목의 값도 함께 치환) / deletePayType(사용 중이면 거부)
 *  - 등급(단가표 행): createGrade / updateGrade / deleteGrade(강사가 쓰고 있으면 거부)
 */
import { revalidatePath } from "next/cache";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  grades,
  instructors,
  lectures,
  payTypes,
  rateItems,
  rateTables,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { safeAction } from "@/lib/action-utils";
import { CHIP_COLORS } from "@/lib/constants";
import { getPayTypes } from "@/lib/queries";
import { requireEditor } from "@/lib/session";
import type { ActionResult, RateItem } from "@/lib/types";

/** 단가표 새 버전 추가. 적용 시작일 이후의 새 강의부터 이 단가가 쓰인다 (기존 강의는 스냅샷 유지) */
export async function createRateTable(input: {
  effectiveFrom: string;
  memo: string | null;
  items: RateItem[];
}): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))
      throw new Error("적용 시작일을 입력하세요.");
    if (!input.items.length) throw new Error("단가 항목이 없습니다.");
    const known = new Set((await getPayTypes()).map((p) => p.code));
    for (const it of input.items) {
      if (!known.has(it.payType))
        throw new Error(`지급유형 값이 올바르지 않습니다: ${it.payType}`);
      if (!Number.isInteger(it.amount) || it.amount < 0)
        throw new Error("단가는 0 이상의 정수여야 합니다.");
      if (
        it.amountAfter != null &&
        (!Number.isInteger(it.amountAfter) || it.amountAfter < 0)
      )
        throw new Error("'3차시부터' 단가는 0 이상의 정수여야 합니다.");
    }
    const dup = await db.query.rateTables.findFirst({
      where: eq(rateTables.effectiveFrom, input.effectiveFrom),
    });
    if (dup) throw new Error("같은 적용 시작일의 단가표가 이미 있습니다.");
    const id = await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(rateTables)
        .values({
          effectiveFrom: input.effectiveFrom,
          memo: input.memo,
          createdBy: user.email,
        })
        .returning();
      await tx.insert(rateItems).values(
        input.items.map((i) => ({
          rateTableId: t.id,
          gradeId: i.gradeId,
          payType: i.payType,
          role: i.role,
          amount: i.amount,
          // 이후 단가가 기본과 같으면 구간이 의미 없으므로 일괄(null)로 정규화
          amountAfter:
            i.amountAfter != null && i.amountAfter !== i.amount
              ? i.amountAfter
              : null,
          tierLimit:
            i.amountAfter != null && i.amountAfter !== i.amount
              ? (i.tierLimit ?? 2)
              : null,
          regionGroup: i.regionGroup ?? null,
        })),
      );
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "rate_tables",
        recordId: t.id,
        action: "create",
        after: input,
        summary: `단가표 새 버전: ${input.effectiveFrom} 적용`,
      });
      return t.id;
    });
    revalidatePath("/", "layout");
    return { id };
  });
}

/** 단가표 버전 삭제 (마지막 남은 버전은 삭제 불가) */
export async function deleteRateTable(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const all = await db.select().from(rateTables);
    if (all.length <= 1)
      throw new Error("마지막 단가표 버전은 삭제할 수 없습니다.");
    const t = all.find((x) => x.id === id);
    if (!t) throw new Error("단가표를 찾을 수 없습니다.");
    await db.delete(rateTables).where(eq(rateTables.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "rate_tables",
      recordId: id,
      action: "delete",
      before: t,
      summary: `단가표 버전 삭제: ${t.effectiveFrom}`,
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

// ---------------- 지급유형 (단가표 열의 종류) ----------------
export type PayTypeInput = {
  code: string;
  roleBased: boolean;
  manual: boolean;
  color: string;
  isActive: boolean;
  note: string | null;
};

function validatePayType(i: PayTypeInput) {
  const code = i.code.trim();
  if (!code) throw new Error("지급유형 이름을 입력하세요.");
  if (code.length > 20)
    throw new Error("지급유형 이름은 20자 이내로 입력하세요.");
  if (code === "미지정")
    throw new Error(
      "'미지정'은 지급유형이 비어 있을 때 쓰는 표시라 이름으로 쓸 수 없습니다.",
    );
  if (!CHIP_COLORS[i.color]) throw new Error("색 값이 올바르지 않습니다.");
  if (i.manual && i.roleBased)
    throw new Error("단가를 직접 입력하는 유형은 역할 구분을 둘 수 없습니다.");
  return code;
}

/** 지급유형 추가 — 단가표에 열이 생기고(역할 구분이면 주/보조 2열), 강의 등록 폼의 선택지에 바로 나타난다. 단가는 새 버전을 추가해 채운다 */
export async function createPayType(
  input: PayTypeInput,
): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const code = validatePayType(input);
    if (await db.query.payTypes.findFirst({ where: eq(payTypes.code, code) }))
      throw new Error("같은 이름의 지급유형이 이미 있습니다.");
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${payTypes.sort}), 0)::int` })
      .from(payTypes);
    const [row] = await db
      .insert(payTypes)
      .values({
        code,
        sort: max + 1,
        roleBased: input.roleBased,
        manual: input.manual,
        color: input.color,
        isActive: input.isActive,
        note: input.note,
      })
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "pay_types",
      recordId: row.id,
      action: "create",
      after: row,
      summary: `지급유형 추가: ${code}`,
    });
    revalidatePath("/", "layout");
    return { id: row.id };
  });
}

/** 지급유형 수정 — 이름을 바꾸면 그 이름을 쓰는 강의(lectures.pay_type)와 단가 항목(rate_items.pay_type)도 한 트랜잭션으로 치환 */
export async function updatePayType(
  id: number,
  input: PayTypeInput,
): Promise<ActionResult<{ renamedLectures: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const code = validatePayType(input);
    return db.transaction(async (tx) => {
      const before = await tx.query.payTypes.findFirst({
        where: eq(payTypes.id, id),
      });
      if (!before) throw new Error("지급유형을 찾을 수 없습니다.");
      const dup = await tx.query.payTypes.findFirst({
        where: and(eq(payTypes.code, code), ne(payTypes.id, id)),
      });
      if (dup) throw new Error("같은 이름의 지급유형이 이미 있습니다.");
      let renamedLectures = 0;
      if (before.code !== code) {
        const moved = await tx
          .update(lectures)
          .set({ payType: code, updatedBy: user.email, updatedAt: new Date() })
          .where(eq(lectures.payType, before.code))
          .returning({ id: lectures.id });
        renamedLectures = moved.length;
        await tx
          .update(rateItems)
          .set({ payType: code })
          .where(eq(rateItems.payType, before.code));
      }
      // 역할 구분을 바꾸면 기존 버전의 단가 항목 모양이 안 맞으니 막는다 (새 유형으로 만드는 게 안전)
      if (before.roleBased !== input.roleBased) {
        const used = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(rateItems)
          .where(eq(rateItems.payType, before.code));
        if (used[0].n > 0)
          throw new Error(
            "이미 단가가 등록된 유형은 역할 구분 여부를 바꿀 수 없습니다. 새 지급유형을 만들어 쓰세요.",
          );
      }
      const [after] = await tx
        .update(payTypes)
        .set({
          code,
          roleBased: input.roleBased,
          manual: input.manual,
          color: input.color,
          isActive: input.isActive,
          note: input.note,
        })
        .where(eq(payTypes.id, id))
        .returning();
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "pay_types",
        recordId: id,
        action: "update",
        before,
        after,
        summary: `지급유형 수정: ${before.code}${before.code !== code ? ` → ${code} (강의 ${renamedLectures}건 반영)` : ""}`,
      });
      revalidatePath("/", "layout");
      return { renamedLectures };
    });
  });
}

/** 지급유형 삭제 — 강의에서 쓰고 있으면 거부(대신 '사용 중지'). 단가 항목은 함께 삭제 */
export async function deletePayType(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const row = await db.query.payTypes.findFirst({
      where: eq(payTypes.id, id),
    });
    if (!row) throw new Error("지급유형을 찾을 수 없습니다.");
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(lectures)
      .where(eq(lectures.payType, row.code));
    if (n > 0)
      throw new Error(
        `강의 ${n}건이 이 지급유형을 쓰고 있어 삭제할 수 없습니다. '사용 중지'로 바꾸세요.`,
      );
    await db.transaction(async (tx) => {
      await tx.delete(rateItems).where(eq(rateItems.payType, row.code));
      await tx.delete(payTypes).where(eq(payTypes.id, id));
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "pay_types",
        recordId: id,
        action: "delete",
        before: row,
        summary: `지급유형 삭제: ${row.code}`,
      });
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** 지급유형 순서 변경 (위/아래) */
export async function movePayType(
  id: number,
  dir: -1 | 1,
): Promise<ActionResult> {
  return safeAction(async () => {
    await requireEditor();
    const all = await db
      .select()
      .from(payTypes)
      .orderBy(asc(payTypes.sort), asc(payTypes.id));
    const i = all.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return undefined;
    // sort 값을 0..n-1 로 다시 매기며 두 항목 교환
    const order = all.map((p) => p.id);
    [order[i], order[j]] = [order[j], order[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < order.length; k++)
        await tx
          .update(payTypes)
          .set({ sort: k + 1 })
          .where(eq(payTypes.id, order[k]));
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

// ---------------- 등급 (단가표 행) ----------------
export type GradeInput = { code: string; label: string; color: string };

/** 등급 추가 — 단가표에 행이 생기고 강사 등록 폼에서 고를 수 있다 */
export async function createGrade(
  input: GradeInput,
): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const code = input.code.trim();
    if (!code) throw new Error("등급 이름을 입력하세요.");
    if (code === "미등록")
      throw new Error(
        "'미등록'은 등급이 없는 강사를 표시하는 값이라 쓸 수 없습니다.",
      );
    if (!CHIP_COLORS[input.color])
      throw new Error("색 값이 올바르지 않습니다.");
    if (await db.query.grades.findFirst({ where: eq(grades.code, code) }))
      throw new Error("같은 이름의 등급이 이미 있습니다.");
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${grades.sort}), 0)::int` })
      .from(grades);
    const [row] = await db
      .insert(grades)
      .values({
        code,
        label: input.label.trim() || code,
        sort: max + 1,
        color: input.color,
      })
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "grades",
      recordId: row.id,
      action: "create",
      after: row,
      summary: `등급 추가: ${code}`,
    });
    revalidatePath("/", "layout");
    return { id: row.id };
  });
}

/** 등급 수정 (이름·설명·색). 강사·단가는 id 로 연결돼 있어 이름을 바꿔도 안전 */
export async function updateGrade(
  id: number,
  input: GradeInput,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const code = input.code.trim();
    if (!code) throw new Error("등급 이름을 입력하세요.");
    if (!CHIP_COLORS[input.color])
      throw new Error("색 값이 올바르지 않습니다.");
    const before = await db.query.grades.findFirst({
      where: eq(grades.id, id),
    });
    if (!before) throw new Error("등급을 찾을 수 없습니다.");
    const dup = await db.query.grades.findFirst({
      where: and(eq(grades.code, code), ne(grades.id, id)),
    });
    if (dup) throw new Error("같은 이름의 등급이 이미 있습니다.");
    const [after] = await db
      .update(grades)
      .set({ code, label: input.label.trim() || code, color: input.color })
      .where(eq(grades.id, id))
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "grades",
      recordId: id,
      action: "update",
      before,
      after,
      summary: `등급 수정: ${before.code}${before.code !== code ? ` → ${code}` : ""}`,
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** 등급 삭제 — 강사가 쓰고 있으면 거부. 단가 항목은 함께 삭제(FK cascade) */
export async function deleteGrade(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const row = await db.query.grades.findFirst({ where: eq(grades.id, id) });
    if (!row) throw new Error("등급을 찾을 수 없습니다.");
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(instructors)
      .where(eq(instructors.gradeId, id));
    if (n > 0)
      throw new Error(`강사 ${n}명이 이 등급을 쓰고 있어 삭제할 수 없습니다.`);
    await db.delete(grades).where(eq(grades.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "grades",
      recordId: id,
      action: "delete",
      before: row,
      summary: `등급 삭제: ${row.code}`,
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}
