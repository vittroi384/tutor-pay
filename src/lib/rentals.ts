/**
 * 교구 대여 등록 공용 로직 (서버 전용, 트랜잭션 안에서 호출).
 * 교구 관리 화면(equipment/actions.createRentals)과 강의 등록(lectures/actions — 강의와 연동된 대여)이 함께 쓴다.
 * 사용 가능 수량(총 보유 − 대여중 − 수리중 − 폐기)을 넘으면 던진다 → 호출한 트랜잭션 전체가 취소된다.
 */
import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { equipment, equipmentRentals } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { isValidDate } from "@/lib/format";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RentalItem = { equipmentId: number; quantity: number };

/** 대여 N건 삽입 + 감사로그. 만든 대여 id 배열 반환 */
export async function insertRentalsTx(
  tx: Tx,
  args: {
    userEmail: string;
    renter: string;
    purpose: string | null;
    outDate: string;
    note: string | null;
    items: RentalItem[];
    lectureId?: number | null;
  },
): Promise<number[]> {
  const renter = args.renter.trim();
  if (!renter) throw new Error("대여처(기관 또는 사람)를 입력하세요.");
  if (!isValidDate(args.outDate)) throw new Error("출고일을 입력하세요.");
  if (!args.items.length) throw new Error("대여할 교구를 1개 이상 추가하세요.");
  // 같은 교구가 여러 줄이면 합쳐서 사용 가능 수량 검사
  const byEq = new Map<number, number>();
  for (const it of args.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1)
      throw new Error("교구 수량은 1 이상의 정수여야 합니다.");
    byEq.set(it.equipmentId, (byEq.get(it.equipmentId) ?? 0) + it.quantity);
  }
  for (const [equipmentId, qty] of byEq) {
    const eqRow = await tx.query.equipment.findFirst({
      where: eq(equipment.id, equipmentId),
    });
    if (!eqRow) throw new Error("교구를 찾을 수 없습니다.");
    const [r] = await tx
      .select({
        qty: sql<number>`coalesce(sum(${equipmentRentals.quantity}), 0)::int`,
      })
      .from(equipmentRentals)
      .where(
        and(
          eq(equipmentRentals.equipmentId, equipmentId),
          sql`${equipmentRentals.inDate} is null`,
        ),
      );
    const available =
      eqRow.totalStock - r.qty - eqRow.repairCount - eqRow.discardCount;
    if (qty > available)
      throw new Error(
        `'${eqRow.name}' 사용 가능 수량은 ${available}개인데 ${qty}개를 대여하려 합니다. 수량을 줄이거나, 총 보유·수리중 수치가 틀렸다면 교구 현황에서 먼저 고치세요.`,
      );
  }
  const ids: number[] = [];
  for (const it of args.items) {
    const [row] = await tx
      .insert(equipmentRentals)
      .values({
        equipmentId: it.equipmentId,
        quantity: it.quantity,
        renter,
        purpose: args.purpose?.trim() || null,
        outDate: args.outDate,
        inDate: null,
        lectureId: args.lectureId ?? null,
        note: args.note?.trim() || null,
        updatedBy: args.userEmail,
        updatedAt: new Date(),
      })
      .returning();
    await logAudit(tx, {
      userEmail: args.userEmail,
      tableName: "equipment_rentals",
      recordId: row.id,
      action: "create",
      after: row,
      summary: `교구 대여: ${renter} · 교구 #${it.equipmentId} × ${it.quantity}${args.lectureId ? " (강의 연동)" : ""}`,
    });
    ids.push(row.id);
  }
  return ids;
}
