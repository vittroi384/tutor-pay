"use server";
/**
 * 기관·콘텐츠 서버 액션 — 등록/수정/병합/자동분류, 콘텐츠 표준명 변경 시 기존 강의 표기 일괄 치환, 삭제(사용 중이면 거부).
 * 병합은 강의 재연결 → 원본 삭제를 한 트랜잭션으로 처리하고 감사로그를 남긴다.
 */
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contentAliases, contents, institutions, lectures } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { safeAction } from "@/lib/action-utils";
import {
  classifyInstitution,
  INSTITUTION_TYPES,
  regionFromInstitutionName,
} from "@/lib/calc";
import { requireEditor } from "@/lib/session";
import type { ActionResult } from "@/lib/types";

const revalidate = () => revalidatePath("/", "layout");

// ---------------- 기관 ----------------
export type InstitutionInput = {
  name: string;
  type: string;
  region: string | null;
  isActive: boolean;
  note: string | null;
};

function validateInstitution(i: InstitutionInput) {
  if (!i.name.trim()) throw new Error("기관명을 입력하세요.");
  if (!(INSTITUTION_TYPES as readonly string[]).includes(i.type))
    throw new Error("기관유형 값이 올바르지 않습니다.");
}

/** 기관 등록 (이름 중복 불가) */
export async function createInstitution(
  input: InstitutionInput,
): Promise<ActionResult<{ id: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    validateInstitution(input);
    const name = input.name.trim();
    if (
      await db.query.institutions.findFirst({
        where: eq(institutions.name, name),
      })
    )
      throw new Error("같은 이름의 기관이 이미 있습니다.");
    const [row] = await db
      .insert(institutions)
      .values({ ...input, name })
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "institutions",
      recordId: row.id,
      action: "create",
      after: row,
      summary: `기관 등록: ${name}`,
    });
    revalidate();
    return { id: row.id };
  });
}

/** 기관 수정 — 이름을 다른 기관과 같게 바꾸려 하면 거부(병합 기능 안내) */
export async function updateInstitution(
  id: number,
  input: InstitutionInput,
): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    validateInstitution(input);
    const before = await db.query.institutions.findFirst({
      where: eq(institutions.id, id),
    });
    if (!before) throw new Error("기관을 찾을 수 없습니다.");
    const name = input.name.trim();
    const dup = await db.query.institutions.findFirst({
      where: eq(institutions.name, name),
    });
    if (dup && dup.id !== id)
      throw new Error(
        "같은 이름의 기관이 이미 있습니다. 중복이면 '병합'을 사용하세요.",
      );
    const [after] = await db
      .update(institutions)
      .set({ ...input, name, updatedAt: new Date() })
      .where(eq(institutions.id, id))
      .returning();
    await logAudit(db, {
      userEmail: user.email,
      tableName: "institutions",
      recordId: id,
      action: "update",
      before,
      after,
      summary: `기관 수정: ${name}`,
    });
    revalidate();
    return undefined;
  });
}

/** 중복 기관 병합: source 의 강의를 target 으로 옮기고 source 삭제 */
export async function mergeInstitutions(
  sourceId: number,
  targetId: number,
): Promise<ActionResult<{ moved: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    if (sourceId === targetId) throw new Error("서로 다른 기관을 선택하세요.");
    const moved = await db.transaction(async (tx) => {
      const src = await tx.query.institutions.findFirst({
        where: eq(institutions.id, sourceId),
      });
      const dst = await tx.query.institutions.findFirst({
        where: eq(institutions.id, targetId),
      });
      if (!src || !dst) throw new Error("기관을 찾을 수 없습니다.");
      const rows = await tx
        .update(lectures)
        .set({
          institutionId: targetId,
          updatedBy: user.email,
          updatedAt: new Date(),
        })
        .where(eq(lectures.institutionId, sourceId))
        .returning({ id: lectures.id });
      await tx.delete(institutions).where(eq(institutions.id, sourceId));
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "institutions",
        recordId: sourceId,
        action: "merge",
        before: src,
        after: { mergedInto: dst.id, moved: rows.length },
        summary: `기관 병합: ${src.name} → ${dst.name} (${rows.length}건 이동)`,
      });
      return rows.length;
    });
    revalidate();
    return { moved };
  });
}

/** 기관명 키워드로 유형·지역을 다시 자동 분류 (수동으로 바꿔둔 유형을 되돌릴 때) */
export async function autoClassifyInstitution(
  id: number,
): Promise<ActionResult> {
  return safeAction(async () => {
    await requireEditor();
    const row = await db.query.institutions.findFirst({
      where: eq(institutions.id, id),
    });
    if (!row) throw new Error("기관을 찾을 수 없습니다.");
    await db
      .update(institutions)
      .set({
        type: classifyInstitution(row.name),
        region: row.region ?? regionFromInstitutionName(row.name),
        updatedAt: new Date(),
      })
      .where(eq(institutions.id, id));
    revalidate();
    return undefined;
  });
}

// ---------------- 콘텐츠 ----------------
/** 콘텐츠 편집 폼 입력값 (별칭은 쉼표로 나눠 배열로 옴) */
export type ContentInput = {
  name: string;
  aliases: string[];
  isActive: boolean;
  needsReview: boolean;
};

const keyOf = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 강의의 content 문자열(" / " 로 결합)에서 토큰 치환 */
async function replaceContentToken(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  from: string,
  to: string,
  userEmail: string,
) {
  const rows = await tx
    .select({ id: lectures.id, content: lectures.content })
    .from(lectures)
    .where(sql`${lectures.content} like ${"%" + from + "%"}`);
  let n = 0;
  for (const r of rows) {
    const tokens = (r.content ?? "").split(" / ");
    if (!tokens.includes(from)) continue;
    const next = [...new Set(tokens.map((t) => (t === from ? to : t)))].join(
      " / ",
    );
    if (next !== r.content) {
      await tx
        .update(lectures)
        .set({ content: next, updatedBy: userEmail, updatedAt: new Date() })
        .where(eq(lectures.id, r.id));
      n++;
    }
  }
  return n;
}

/** 콘텐츠 등록/수정. 표준명을 바꾸면 그 표기를 쓰던 강의의 content 도 함께 치환한다 */
export async function saveContent(
  id: number | null,
  input: ContentInput,
): Promise<ActionResult<{ id: number; renamed: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    const name = input.name.trim();
    if (!name) throw new Error("콘텐츠 표준명을 입력하세요.");
    const aliases = [
      ...new Set(
        input.aliases
          .map((a) => a.trim())
          .filter((a) => a && keyOf(a) !== keyOf(name)),
      ),
    ];
    return db.transaction(async (tx) => {
      const dup = await tx.query.contents.findFirst({
        where: eq(contents.name, name),
      });
      if (dup && dup.id !== id)
        throw new Error(
          "같은 표준명의 콘텐츠가 이미 있습니다. 합치려면 '병합'을 사용하세요.",
        );
      // 별칭이 다른 콘텐츠에 이미 있으면 거절
      const allAliases = await tx.select().from(contentAliases);
      for (const a of aliases) {
        const hit = allAliases.find(
          (x) => keyOf(x.alias) === keyOf(a) && x.contentId !== id,
        );
        if (hit)
          throw new Error(
            `별칭 '${a}' 은(는) 이미 다른 콘텐츠에 등록되어 있습니다.`,
          );
      }
      let renamed = 0;
      let cid = id;
      if (cid == null) {
        const [row] = await tx
          .insert(contents)
          .values({
            name,
            isActive: input.isActive,
            needsReview: input.needsReview,
          })
          .returning();
        cid = row.id;
        await logAudit(tx, {
          userEmail: user.email,
          tableName: "contents",
          recordId: cid,
          action: "create",
          after: row,
          summary: `콘텐츠 등록: ${name}`,
        });
      } else {
        const before = await tx.query.contents.findFirst({
          where: eq(contents.id, cid),
        });
        if (!before) throw new Error("콘텐츠를 찾을 수 없습니다.");
        await tx
          .update(contents)
          .set({
            name,
            isActive: input.isActive,
            needsReview: input.needsReview,
          })
          .where(eq(contents.id, cid));
        if (before.name !== name)
          renamed = await replaceContentToken(
            tx,
            before.name,
            name,
            user.email,
          );
        await logAudit(tx, {
          userEmail: user.email,
          tableName: "contents",
          recordId: cid,
          action: "update",
          before,
          after: { name, aliases, isActive: input.isActive },
          summary: `콘텐츠 수정: ${before.name}${before.name !== name ? ` → ${name} (강의 ${renamed}건 반영)` : ""}`,
        });
      }
      await tx.delete(contentAliases).where(eq(contentAliases.contentId, cid));
      if (aliases.length)
        await tx
          .insert(contentAliases)
          .values(aliases.map((alias) => ({ contentId: cid!, alias })));
      revalidate();
      return { id: cid, renamed };
    });
  });
}

/** 콘텐츠 병합: source 표기 → target 표준명으로 강의 치환, source 이름은 target 의 별칭이 됨 */
export async function mergeContents(
  sourceId: number,
  targetId: number,
): Promise<ActionResult<{ moved: number }>> {
  return safeAction(async () => {
    const user = await requireEditor();
    if (sourceId === targetId)
      throw new Error("서로 다른 콘텐츠를 선택하세요.");
    const moved = await db.transaction(async (tx) => {
      const src = await tx.query.contents.findFirst({
        where: eq(contents.id, sourceId),
      });
      const dst = await tx.query.contents.findFirst({
        where: eq(contents.id, targetId),
      });
      if (!src || !dst) throw new Error("콘텐츠를 찾을 수 없습니다.");
      const n = await replaceContentToken(tx, src.name, dst.name, user.email);
      await tx
        .update(contentAliases)
        .set({ contentId: targetId })
        .where(eq(contentAliases.contentId, sourceId));
      await tx
        .insert(contentAliases)
        .values({ contentId: targetId, alias: src.name })
        .onConflictDoNothing();
      await tx.delete(contents).where(eq(contents.id, sourceId));
      await logAudit(tx, {
        userEmail: user.email,
        tableName: "contents",
        recordId: sourceId,
        action: "merge",
        before: src,
        after: { mergedInto: dst.id, moved: n },
        summary: `콘텐츠 병합: ${src.name} → ${dst.name} (강의 ${n}건 반영)`,
      });
      return n;
    });
    revalidate();
    return { moved };
  });
}

/** 콘텐츠 삭제 — 강의에서 사용 중이면 거부 (병합 또는 비활성화 안내) */
export async function deleteContent(id: number): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireEditor();
    const row = await db.query.contents.findFirst({
      where: eq(contents.id, id),
    });
    if (!row) throw new Error("콘텐츠를 찾을 수 없습니다.");
    const used = await db
      .select({ id: lectures.id })
      .from(lectures)
      .where(sql`${lectures.content} like ${"%" + row.name + "%"}`);
    if (used.length)
      throw new Error(
        `강의 ${used.length}건에서 사용 중이라 삭제할 수 없습니다. 병합하거나 비활성화하세요.`,
      );
    await db.delete(contents).where(eq(contents.id, id));
    await logAudit(db, {
      userEmail: user.email,
      tableName: "contents",
      recordId: id,
      action: "delete",
      before: row,
      summary: `콘텐츠 삭제: ${row.name}`,
    });
    revalidate();
    return undefined;
  });
}
