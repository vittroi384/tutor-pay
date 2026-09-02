/**
 * 기관·콘텐츠 관리 진입점 — 기관/콘텐츠 목록과 사용 건수(강의 수)를 모아 MasterView 에 넘긴다.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { lectures } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  getContents,
  getInstitutions,
  getLectureDateBounds,
} from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { MasterView } from "./MasterView";

export default async function MasterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const [institutions, contents, instCounts, contentRows, bounds] =
    await Promise.all([
      getInstitutions(),
      getContents(),
      db
        .select({ id: lectures.institutionId, n: sql<number>`count(*)::int` })
        .from(lectures)
        .groupBy(lectures.institutionId),
      db.select({ content: lectures.content }).from(lectures),
      getLectureDateBounds(),
    ]);
  const instUsage: Record<number, number> = {};
  for (const r of instCounts) instUsage[r.id] = r.n;
  const contentUsage: Record<string, number> = {};
  for (const r of contentRows)
    for (const t of (r.content ?? "").split(" / "))
      if (t) contentUsage[t] = (contentUsage[t] ?? 0) + 1;
  return (
    <>
      <PageHeader
        title="기관·콘텐츠 관리"
        subtitle="드롭다운 원천 목록 · 중복은 병합으로 정리 (지급유형·역할·등급 코드는 시스템 고정)"
      />
      <MasterView
        tab={sp.tab === "contents" ? "contents" : "institutions"}
        institutions={institutions}
        contents={contents}
        instUsage={instUsage}
        contentUsage={contentUsage}
        canEdit={isEditor(user.role)}
        bounds={bounds}
      />
    </>
  );
}
