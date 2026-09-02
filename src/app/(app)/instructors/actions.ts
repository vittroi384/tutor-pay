"use server";
/**
 * 강사 서버 액션 — 등록/수정 (이름 중복 검사, 등급 변경 시 감사로그 'grade-change' 기록). 기존 강의의 단가는 절대 소급 변경하지 않는다.
 */
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { instructorFiles, instructors, lectures } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { safeAction } from "@/lib/action-utils";
import { requireEditor } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

/** 강사 등록/수정 폼 입력값 */
export type InstructorInput = {
  name: string;
  gradeId: number | null;
  phone: string | null;
  region: string | null;
  isActive: boolean;
  note: string | null;
};

function validate(i: InstructorInput) {
  if (!i.name.trim()) throw new Error("강사명을 입력하세요.");
  if (i.name.trim().length > 30) throw new Error("강사명이 너무 깁니다.");
}

/** 강사 등록 (이름 중복 불가) */
export async function createInstructor(
  input: InstructorInput,
): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    validate(input);
    const dup = await db.query.instructors.findFirst({
      where: eq(instructors.name, input.name.trim()),
    });
    if (dup)
      throw new Error(
        "같은 이름의 강사가 이미 있습니다. 동명이인이면 지역 접두를 붙여 구분하세요.",
      );
    const [row] = await db
      .insert(instructors)
      .values({ ...input, name: input.name.trim() })
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "instructors",
      recordId: row.id,
      action: "create",
      after: row,
      summary: `강사 등록: ${row.name}`,
    });
    revalidatePath("/", "layout");
    return { id: row.id };
  });
}

/** 강사 수정. 등급이 바뀌면 감사로그에 grade-change 로 남겨 상세 화면의 "등급 변경 이력"에 표시. 기존 강의 단가는 그대로 */
export async function updateInstructor(
  id: number,
  input: InstructorInput,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    validate(input);
    const before = await db.query.instructors.findFirst({
      where: eq(instructors.id, id),
    });
    if (!before) throw new Error("강사를 찾을 수 없습니다.");
    const dup = await db.query.instructors.findFirst({
      where: eq(instructors.name, input.name.trim()),
    });
    if (dup && dup.id !== id)
      throw new Error("같은 이름의 강사가 이미 있습니다.");
    const [after] = await db
      .update(instructors)
      .set({ ...input, name: input.name.trim(), updatedAt: new Date() })
      .where(eq(instructors.id, id))
      .returning();
    const gradeChanged = before.gradeId !== after.gradeId;
    await logAudit(db, {
      userEmail: user.email,
      tableName: "instructors",
      recordId: id,
      action: gradeChanged ? "grade-change" : "update",
      before,
      after,
      summary: `강사 ${gradeChanged ? "등급 변경" : "수정"}: ${after.name}`,
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** 강사 프로필(사진·특기·주요 이력)만 저장 — 사진은 화면에서 512px 이하로 축소된 dataURL */
export async function updateInstructorProfile(
  id: number,
  input: {
    photo: string | null;
    intro: string | null;
    birthDate: string | null;
    email: string | null;
    specialty: string | null;
    certifications: string | null;
    career: string | null;
  },
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const before = await db.query.instructors.findFirst({
      where: eq(instructors.id, id),
    });
    if (!before) throw new Error("강사를 찾을 수 없습니다.");
    if (input.photo && input.photo.length > 400_000)
      throw new Error("사진이 너무 큽니다. 다른 사진으로 다시 시도해 주세요.");
    if (input.photo && !input.photo.startsWith("data:image/"))
      throw new Error("사진 형식이 올바르지 않습니다.");
    const email = input.email?.trim() || null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      throw new Error("이메일 형식이 올바르지 않습니다.");
    const birthDate = input.birthDate?.trim() || null;
    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
      throw new Error("생년월일 형식이 올바르지 않습니다.");
    const patch = {
      photo: input.photo,
      intro: input.intro?.trim().slice(0, 120) || null,
      birthDate,
      email,
      specialty: input.specialty?.trim() || null,
      certifications: input.certifications?.trim() || null,
      career: input.career?.trim() || null,
      updatedAt: new Date(),
    };
    const [after] = await db
      .update(instructors)
      .set(patch)
      .where(eq(instructors.id, id))
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "instructors",
      recordId: id,
      action: "update",
      before,
      after,
      summary: `강사 프로필 수정: ${before.name}`,
    });
    revalidatePath("/instructors");
    revalidatePath(`/instructors/${id}`);
    return undefined;
  });
}

/** 첨부 파일 올리기 — 이력서·자격증 사본 등. 내용은 base64 로 DB 저장(파일당 최대 5MB) */
export async function uploadInstructorFile(
  instructorId: number,
  file: { name: string; mimeType: string; dataBase64: string },
): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const inst = await db.query.instructors.findFirst({
      where: eq(instructors.id, instructorId),
    });
    if (!inst) throw new Error("강사를 찾을 수 없습니다.");
    const name = file.name.trim().slice(0, 200);
    if (!name) throw new Error("파일 이름이 비어 있습니다.");
    const size = Math.floor((file.dataBase64.length * 3) / 4);
    if (size > 5 * 1024 * 1024)
      throw new Error("파일은 5MB 이하만 올릴 수 있습니다.");
    if (size === 0) throw new Error("빈 파일입니다.");
    const [row] = await db
      .insert(instructorFiles)
      .values({
        instructorId,
        name,
        mimeType: file.mimeType || "application/octet-stream",
        size,
        data: file.dataBase64,
        uploadedBy: user.email,
        uploadedAt: new Date(),
      })
      .returning({ id: instructorFiles.id });
    await logAudit(db, {
      userEmail: user.email,
      tableName: "instructor_files",
      recordId: row.id,
      action: "create",
      after: { id: row.id, instructorId, name, size }, // 내용(base64)은 이력에 넣지 않음
      summary: `강사 파일 올림: ${inst.name} · ${name}`,
    });
    revalidatePath(`/instructors/${instructorId}`);
    return { id: row.id };
  });
}

/** 첨부 파일 삭제 — 내용까지 지워지므로 복원 불가(확인창에서 안내) */
export async function deleteInstructorFile(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const row = await db.query.instructorFiles.findFirst({
      where: eq(instructorFiles.id, id),
    });
    if (!row) throw new Error("파일을 찾을 수 없습니다.");
    await db.delete(instructorFiles).where(eq(instructorFiles.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "instructor_files",
      recordId: id,
      action: "delete",
      before: {
        id,
        instructorId: row.instructorId,
        name: row.name,
        size: row.size,
      }, // 내용은 미보관 → 복원 불가
      summary: `강사 파일 삭제: ${row.name}`,
    });
    revalidatePath(`/instructors/${row.instructorId}`);
    return undefined;
  });
}

/**
 * 강사 삭제 — 연결된 강의가 하나라도 있으면 거부(기록 보존).
 * 강의가 없을 때만 삭제되며, 첨부 파일은 함께 삭제(파일 내용은 복원 불가).
 * 강사 정보 자체는 변경 이력에서 [복원] 가능.
 */
export async function deleteInstructor(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const before = await db.query.instructors.findFirst({
      where: eq(instructors.id, id),
    });
    if (!before) throw new Error("강사를 찾을 수 없습니다.");
    const [{ n: lectureCount }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(lectures)
      .where(eq(lectures.instructorId, id));
    if (lectureCount > 0)
      throw new Error(
        `강의 ${lectureCount}건이 연결되어 있어 삭제할 수 없습니다. 기록 보존을 위해 [활동 종료]로 바꿔 주세요.`,
      );
    const files = await db
      .select({ id: instructorFiles.id, name: instructorFiles.name })
      .from(instructorFiles)
      .where(eq(instructorFiles.instructorId, id));
    await db.delete(instructors).where(eq(instructors.id, id)); // 첨부 파일은 FK cascade 로 함께 삭제
    await logAudit(db, {
      userEmail: user.email,
      tableName: "instructors",
      recordId: id,
      action: "delete",
      before,
      summary:
        `강사 삭제: ${before.name}` +
        (files.length
          ? ` (첨부 파일 ${files.length}개 함께 삭제 — 파일 내용은 복원 불가)`
          : ""),
    });
    revalidatePath("/instructors");
    return undefined;
  });
}
