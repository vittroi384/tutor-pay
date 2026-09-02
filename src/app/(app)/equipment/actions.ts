"use server";
/**
 * 교구 관리 서버 액션
 *  - saveEquipment: 교구 등록/수정 (이름 유일, 수량 0 이상)
 *  - deleteEquipment: 대여 기록이 있으면 거부 (대신 '사용 안 함')
 *  - createRentals: 대여 등록 (여러 교구 한 번에). 사용 가능 수량 초과 시 거부
 *  - returnRental / updateRental / deleteRental: 반납·수정·삭제
 * 모든 변경은 감사로그(audit_logs)에 남는다. 정산 잠금과는 무관.
 */
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { equipment, equipmentRentals } from "@/db/schema";
import { safeAction } from "@/lib/action-utils";
import { logAudit } from "@/lib/audit";
import { isValidDate } from "@/lib/format";
import { insertRentalsTx } from "@/lib/rentals";
import { requireUser } from "@/lib/session";
import { requireEditor } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

export type EquipmentInput = {
  code: string | null;
  name: string;
  category: string | null;
  totalStock: number;
  repairCount: number;
  discardCount: number;
  note: string | null;
  isActive: boolean;
};

function validateEquipment(i: EquipmentInput) {
  const name = i.name.trim();
  if (!name) throw new Error("교구명을 입력하세요.");
  for (const [label, v] of [
    ["총 보유", i.totalStock],
    ["수리중", i.repairCount],
    ["폐기", i.discardCount],
  ] as const) {
    if (!Number.isInteger(v) || v < 0)
      throw new Error(`${label} 수량은 0 이상의 정수여야 합니다.`);
  }
  return name;
}

/** 교구 등록(id=null) 또는 수정 */
export async function saveEquipment(
  id: number | null,
  input: EquipmentInput,
): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const name = validateEquipment(input);
    const values = {
      code: input.code?.trim() || null,
      name,
      category: input.category?.trim() || null,
      totalStock: input.totalStock,
      repairCount: input.repairCount,
      discardCount: input.discardCount,
      note: input.note?.trim() || null,
      isActive: input.isActive,
    };
    if (id == null) {
      if (
        await db.query.equipment.findFirst({ where: eq(equipment.name, name) })
      )
        throw new Error("같은 이름의 교구가 이미 있습니다.");
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${equipment.sort}), 0)::int` })
        .from(equipment);
      const [row] = await db
        .insert(equipment)
        .values({ ...values, sort: max + 1 })
        .returning();
      await logAudit(db, {
        userEmail: user.email,
        tableName: "equipment",
        recordId: row.id,
        action: "create",
        after: row,
        summary: `교구 등록: ${name} (총 ${input.totalStock})`,
      });
      revalidatePath("/equipment");
      return { id: row.id };
    }
    const before = await db.query.equipment.findFirst({
      where: eq(equipment.id, id),
    });
    if (!before) throw new Error("교구를 찾을 수 없습니다.");
    if (
      await db.query.equipment.findFirst({
        where: and(eq(equipment.name, name), ne(equipment.id, id)),
      })
    )
      throw new Error("같은 이름의 교구가 이미 있습니다.");
    const [after] = await db
      .update(equipment)
      .set(values)
      .where(eq(equipment.id, id))
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "equipment",
      recordId: id,
      action: "update",
      before,
      after,
      summary: `교구 수정: ${before.name}${before.name !== name ? ` → ${name}` : ""}`,
    });
    revalidatePath("/equipment");
    return { id };
  });
}

/** 교구 삭제 — 대여 기록이 1건이라도 있으면 거부 */
export async function deleteEquipment(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const row = await db.query.equipment.findFirst({
      where: eq(equipment.id, id),
    });
    if (!row) throw new Error("교구를 찾을 수 없습니다.");
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(equipmentRentals)
      .where(eq(equipmentRentals.equipmentId, id));
    if (n > 0)
      throw new Error(
        `대여 기록 ${n}건이 있어 삭제할 수 없습니다. '사용 안 함'으로 바꾸세요.`,
      );
    await db.delete(equipment).where(eq(equipment.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "equipment",
      recordId: id,
      action: "delete",
      before: row,
      summary: `교구 삭제: ${row.name}`,
    });
    revalidatePath("/equipment");
    return undefined;
  });
}

/** 특정 교구의 현재 사용 가능 수량 (excludeRentalId 는 수정 중인 대여 건 제외용) */
async function availableOf(
  equipmentId: number,
  excludeRentalId?: number,
): Promise<{ name: string; available: number }> {
  const eqRow = await db.query.equipment.findFirst({
    where: eq(equipment.id, equipmentId),
  });
  if (!eqRow) throw new Error("교구를 찾을 수 없습니다.");
  const [r] = await db
    .select({
      qty: sql<number>`coalesce(sum(${equipmentRentals.quantity}), 0)::int`,
    })
    .from(equipmentRentals)
    .where(
      and(
        eq(equipmentRentals.equipmentId, equipmentId),
        sql`${equipmentRentals.inDate} is null`,
        excludeRentalId ? ne(equipmentRentals.id, excludeRentalId) : undefined,
      ),
    );
  return {
    name: eqRow.name,
    available:
      eqRow.totalStock - r.qty - eqRow.repairCount - eqRow.discardCount,
  };
}

export type RentalItemInput = { equipmentId: number; quantity: number };
export type RentalCommonInput = {
  renter: string;
  purpose: string | null;
  outDate: string;
  note: string | null;
};

function validateRentalCommon(input: RentalCommonInput) {
  if (!input.renter.trim())
    throw new Error("대여처(기관 또는 사람)를 입력하세요.");
  if (!isValidDate(input.outDate)) throw new Error("출고일을 입력하세요.");
}

/** 대여 등록 — 같은 대여처·출고일로 여러 교구를 한 번에. 각 교구의 사용 가능 수량을 넘으면 거부 (공용 로직: lib/rentals.ts) */
export async function createRentals(
  input: RentalCommonInput & { items: RentalItemInput[] },
): Promise<ActionResult<{ ids: number[] }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const ids = await db.transaction((tx) =>
      insertRentalsTx(tx, {
        userEmail: user.email,
        renter: input.renter,
        purpose: input.purpose,
        outDate: input.outDate,
        note: input.note,
        items: input.items,
      }),
    );
    revalidatePath("/equipment");
    return { ids };
  });
}

/** 반납 처리 — inDate 를 채운다 (기본: 오늘). 출고일보다 빠르면 거부 */
export async function returnRental(
  id: number,
  inDate: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireUser(); // 조회 전용 계정도 반납은 가능 (요청 반영)
    if (!isValidDate(inDate)) throw new Error("반납일이 올바르지 않습니다.");
    const before = await db.query.equipmentRentals.findFirst({
      where: eq(equipmentRentals.id, id),
    });
    if (!before) throw new Error("대여 기록을 찾을 수 없습니다.");
    if (before.inDate) throw new Error("이미 반납 처리된 기록입니다.");
    if (inDate < before.outDate)
      throw new Error("반납일이 출고일보다 빠를 수 없습니다.");
    const [after] = await db
      .update(equipmentRentals)
      .set({ inDate, updatedBy: user.email, updatedAt: new Date() })
      .where(eq(equipmentRentals.id, id))
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "equipment_rentals",
      recordId: id,
      action: "return",
      before,
      after,
      summary: `교구 반납: ${before.renter} · ${inDate}`,
    });
    revalidatePath("/equipment");
    return undefined;
  });
}

export type RentalUpdateInput = RentalCommonInput & {
  equipmentId: number;
  quantity: number;
  inDate: string | null;
};

/** 대여 수정 — 반납일을 비우면 다시 '대여중'이 된다. 수량·교구 변경 시 사용 가능 수량 재검사 */
export async function updateRental(
  id: number,
  input: RentalUpdateInput,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    validateRentalCommon(input);
    if (!Number.isInteger(input.quantity) || input.quantity < 1)
      throw new Error("수량은 1 이상의 정수여야 합니다.");
    if (input.inDate != null && !isValidDate(input.inDate))
      throw new Error("반납일이 올바르지 않습니다.");
    if (input.inDate && input.inDate < input.outDate)
      throw new Error("반납일이 출고일보다 빠를 수 없습니다.");
    const before = await db.query.equipmentRentals.findFirst({
      where: eq(equipmentRentals.id, id),
    });
    if (!before) throw new Error("대여 기록을 찾을 수 없습니다.");
    if (input.inDate == null) {
      // 대여중 상태가 되므로 (이 건 제외한) 사용 가능 수량 검사
      const { name, available } = await availableOf(input.equipmentId, id);
      if (input.quantity > available)
        throw new Error(`'${name}' 사용 가능 수량(${available}개)을 넘습니다.`);
    }
    const [after] = await db
      .update(equipmentRentals)
      .set({
        equipmentId: input.equipmentId,
        quantity: input.quantity,
        renter: input.renter.trim(),
        purpose: input.purpose?.trim() || null,
        outDate: input.outDate,
        inDate: input.inDate,
        note: input.note?.trim() || null,
        updatedBy: user.email,
        updatedAt: new Date(),
      })
      .where(eq(equipmentRentals.id, id))
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "equipment_rentals",
      recordId: id,
      action: "update",
      before,
      after,
      summary: `교구 대여 수정: ${input.renter.trim()}`,
    });
    revalidatePath("/equipment");
    return undefined;
  });
}

/** 대여 기록 삭제 */
export async function deleteRental(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const before = await db.query.equipmentRentals.findFirst({
      where: eq(equipmentRentals.id, id),
    });
    if (!before) throw new Error("대여 기록을 찾을 수 없습니다.");
    await db.delete(equipmentRentals).where(eq(equipmentRentals.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "equipment_rentals",
      recordId: id,
      action: "delete",
      before,
      summary: `교구 대여 삭제: ${before.renter} × ${before.quantity}`,
    });
    revalidatePath("/equipment");
    return undefined;
  });
}
