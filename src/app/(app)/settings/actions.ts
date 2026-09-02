"use server";
/**
 * 사용자 서버 액션 — 추가/권한·활성 변경/삭제. 자기 자신은 낮추거나 지울 수 없고, .env 고정 계정도 비활성화·삭제 불가.
 */
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  contents,
  equipment,
  equipmentRentals,
  grades,
  institutions,
  instructors,
  lectures,
  payTypes,
  users,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { safeAction } from "@/lib/action-utils";
import { requireAdmin, requireEditor } from "@/lib/session";
import { allowedEmails } from "@/auth.config";
import type { ActionResult } from "@/lib/types";

/** 로그인 허용 사용자 추가 (이메일 형식·중복 검사). 구글 로그인 앱이 테스트 모드면 콘솔의 테스트 사용자에도 넣어야 실제 로그인 가능 */
export async function addUser(
  email: string,
  name: string | null,
  role: "admin" | "staff" | "viewer",
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireAdmin();
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      throw new Error("이메일 형식이 올바르지 않습니다.");
    const dup = await db.query.users.findFirst({ where: eq(users.email, e) });
    if (dup) throw new Error("이미 등록된 이메일입니다.");
    await db.insert(users).values({ email: e, name, role });
    await logAudit(db, {
      userEmail: user.email,
      tableName: "users",
      recordId: e,
      action: "create",
      after: { email: e, role },
      summary: `사용자 추가: ${e} (${role})`,
    });
    revalidatePath("/settings");
    return undefined;
  });
}

/** 권한(관리자/조회 전용) 또는 활성 여부 변경. 본인 권한 낮추기·비활성화, .env 고정 계정 비활성화는 거부 */
export async function updateUser(
  id: number,
  patch: { role?: "admin" | "staff" | "viewer"; isActive?: boolean },
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireAdmin();
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!row) throw new Error("사용자를 찾을 수 없습니다.");
    if (
      row.email === user.email &&
      (patch.isActive === false || patch.role === "viewer")
    )
      throw new Error("자기 자신의 권한은 낮추거나 비활성화할 수 없습니다.");
    if (patch.isActive === false && allowedEmails().includes(row.email))
      throw new Error(
        "서버 설정(.env ALLOWED_EMAILS)에 고정된 계정은 비활성화할 수 없습니다. 목록에서 빼려면 .env 를 수정하세요.",
      );
    await db.update(users).set(patch).where(eq(users.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "users",
      recordId: id,
      action: "update",
      before: row,
      after: patch,
      summary: `사용자 변경: ${row.email}`,
    });
    revalidatePath("/settings");
    return undefined;
  });
}

export async function deleteUser(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireAdmin();
    const row = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!row) throw new Error("사용자를 찾을 수 없습니다.");
    if (row.email === user.email)
      throw new Error("자기 자신은 삭제할 수 없습니다.");
    if (allowedEmails().includes(row.email))
      throw new Error(
        "서버 설정(.env ALLOWED_EMAILS)에 고정된 계정은 삭제해도 다음 로그인 때 다시 등록됩니다. 목록에서 빼려면 .env 를 수정하세요.",
      );
    await db.delete(users).where(eq(users.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "users",
      recordId: id,
      action: "delete",
      before: row,
      summary: `사용자 삭제: ${row.email}`,
    });
    revalidatePath("/settings");
    return undefined;
  });
}

/* ---------------- 삭제 복원 ---------------- */

/** JSON 으로 저장된 행에서 ISO 일시 문자열("2026-08-19T…")을 Date 로 되돌린다. 날짜만("2026-08-19")은 문자열 유지 */
function reviveRow(before: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(before))
    out[k] =
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)
        ? new Date(v)
        : v;
  return out;
}

/** 복원 후 자동번호(serial) 시퀀스를 현재 최대 id 로 맞춰 이후 등록이 충돌하지 않게 한다 */
async function bumpSequence(tableName: string) {
  await db.execute(
    sql`select setval(pg_get_serial_sequence(${tableName}, 'id'), (select coalesce(max(id), 1) from ${sql.raw(`"${tableName}"`)}))`,
  );
}

const RESTORE_LABEL: Record<string, string> = {
  lectures: "강의",
  contents: "콘텐츠",
  pay_types: "지급유형",
  grades: "등급",
  users: "사용자",
  equipment: "교구",
  equipment_rentals: "교구 대여",
};

/**
 * 변경 이력의 '삭제' 항목을 되살린다 — 삭제 당시 저장해 둔 내용(before)을 원래 번호(id) 그대로 다시 넣는다.
 * 지원: 강의·콘텐츠·지급유형·등급·사용자·교구·교구 대여. (단가표 버전은 단가 항목까지 지워져 복원 불가 — 새 버전으로 다시 입력)
 * 이름/이메일이 그새 다른 항목에 쓰였거나, 강의가 잠긴 달이거나, 연결된 강사·기관·교구가 없으면 이유를 알려주고 거부한다.
 */
export async function restoreDeleted(
  auditLogId: number,
): Promise<ActionResult<{ summary: string }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const log = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.id, auditLogId),
    });
    if (!log) throw new Error("이력 항목을 찾을 수 없습니다.");
    if (log.action !== "delete")
      throw new Error("'삭제' 이력만 복원할 수 있습니다.");
    if (log.tableName === "rate_tables")
      throw new Error(
        "단가표 버전은 단가 항목까지 함께 지워져 복원할 수 없습니다. '새 버전'으로 다시 입력하세요.",
      );
    if (!RESTORE_LABEL[log.tableName])
      throw new Error("이 항목은 복원을 지원하지 않습니다.");
    const before = log.before as Record<string, unknown> | null;
    if (!before || typeof before !== "object" || before.id == null)
      throw new Error("삭제 당시 내용이 저장돼 있지 않아 복원할 수 없습니다.");
    const row = reviveRow(before);
    const id = Number(row.id);
    const label = RESTORE_LABEL[log.tableName];

    // 표별 사전 검사 + 삽입
    if (log.tableName === "lectures") {
      if (await db.query.lectures.findFirst({ where: eq(lectures.id, id) }))
        throw new Error(
          "이미 같은 번호의 강의가 있습니다 (이미 복원됐을 수 있어요).",
        );
      const date = String(row.date ?? "");
      const [y, m] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))];
      const locked = await db.query.settlementLocks.findFirst({
        where: (t, { and: a, eq: e }) => a(e(t.year, y), e(t.month, m)),
      });
      if (locked)
        throw new Error(
          `${y}년 ${m}월은 정산 확정(잠금) 상태라 복원할 수 없습니다. 잠금을 해제한 뒤 다시 시도하세요.`,
        );
      if (
        !(await db.query.instructors.findFirst({
          where: eq(instructors.id, Number(row.instructorId)),
        }))
      )
        throw new Error(
          "이 강의의 강사가 없습니다. (강사가 삭제된 경우 강사부터 복원)",
        );
      if (
        !(await db.query.institutions.findFirst({
          where: eq(institutions.id, Number(row.institutionId)),
        }))
      )
        throw new Error("이 강의의 기관이 없습니다.");
      await db
        .insert(lectures)
        .values(row as unknown as typeof lectures.$inferInsert);
    } else if (log.tableName === "contents") {
      if (await db.query.contents.findFirst({ where: eq(contents.id, id) }))
        throw new Error("이미 같은 번호의 콘텐츠가 있습니다.");
      if (
        await db.query.contents.findFirst({
          where: eq(contents.name, String(row.name)),
        })
      )
        throw new Error(`'${row.name}' 이름의 콘텐츠가 이미 있습니다.`);
      await db
        .insert(contents)
        .values(row as unknown as typeof contents.$inferInsert);
    } else if (log.tableName === "pay_types") {
      if (
        await db.query.payTypes.findFirst({
          where: eq(payTypes.code, String(row.code)),
        })
      )
        throw new Error(`'${row.code}' 지급유형이 이미 있습니다.`);
      await db
        .insert(payTypes)
        .values(row as unknown as typeof payTypes.$inferInsert);
    } else if (log.tableName === "grades") {
      if (
        await db.query.grades.findFirst({
          where: eq(grades.code, String(row.code)),
        })
      )
        throw new Error(`'${row.code}' 등급이 이미 있습니다.`);
      await db
        .insert(grades)
        .values(row as unknown as typeof grades.$inferInsert);
    } else if (log.tableName === "users") {
      if (
        await db.query.users.findFirst({
          where: eq(users.email, String(row.email)),
        })
      )
        throw new Error(`'${row.email}' 계정이 이미 있습니다.`);
      await db
        .insert(users)
        .values(row as unknown as typeof users.$inferInsert);
    } else if (log.tableName === "equipment") {
      if (
        await db.query.equipment.findFirst({
          where: eq(equipment.name, String(row.name)),
        })
      )
        throw new Error(`'${row.name}' 교구가 이미 있습니다.`);
      await db
        .insert(equipment)
        .values(row as unknown as typeof equipment.$inferInsert);
    } else if (log.tableName === "equipment_rentals") {
      if (
        await db.query.equipmentRentals.findFirst({
          where: eq(equipmentRentals.id, id),
        })
      )
        throw new Error("이미 같은 번호의 대여 기록이 있습니다.");
      if (
        !(await db.query.equipment.findFirst({
          where: eq(equipment.id, Number(row.equipmentId)),
        }))
      )
        throw new Error("이 기록의 교구가 없습니다. 교구부터 복원하세요.");
      await db
        .insert(equipmentRentals)
        .values(row as unknown as typeof equipmentRentals.$inferInsert);
    }
    await bumpSequence(log.tableName);
    const summary = `${label} 복원: ${String(row.name ?? row.code ?? row.email ?? row.renter ?? `#${id}`)}`;
    await logAudit(db, {
      userEmail: user.email,
      tableName: log.tableName,
      recordId: id,
      action: "restore",
      after: row,
      summary,
    });
    revalidatePath("/", "layout");
    return { summary };
  });
}
