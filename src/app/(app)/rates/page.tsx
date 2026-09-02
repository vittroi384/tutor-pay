/**
 * 단가표 화면 진입점 — 지급유형(열)·등급(행)·단가표 버전들을 RatesView 에 넘긴다.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { todaySeoul } from "@/lib/format";
import { getGrades, getPayTypes, getRateTables } from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { db } from "@/db";
import { instructors, lectures } from "@/db/schema";
import { sql } from "drizzle-orm";
import { RatesView } from "./RatesView";

export default async function RatesPage() {
  const user = await requireUser();
  const [grades, tables, payTypes, payTypeUsage, gradeUsage] =
    await Promise.all([
      getGrades(),
      getRateTables(),
      getPayTypes(),
      db
        .select({ code: lectures.payType, n: sql<number>`count(*)::int` })
        .from(lectures)
        .groupBy(lectures.payType),
      db
        .select({ gradeId: instructors.gradeId, n: sql<number>`count(*)::int` })
        .from(instructors)
        .groupBy(instructors.gradeId),
    ]);
  const ptUsage: Record<string, number> = {};
  for (const r of payTypeUsage) if (r.code) ptUsage[r.code] = r.n;
  const gUsage: Record<number, number> = {};
  for (const r of gradeUsage) if (r.gradeId != null) gUsage[r.gradeId] = r.n;
  return (
    <>
      <PageHeader
        title="등급별 단가표"
        subtitle="적용 시작일 기준으로 버전을 관리합니다. 이미 저장된 강의의 단가는 스냅샷이라 새 버전·새 유형의 영향을 받지 않습니다."
      />
      <RatesView
        grades={grades}
        tables={tables}
        payTypes={payTypes}
        payTypeUsage={ptUsage}
        gradeUsage={gUsage}
        today={todaySeoul()}
        canEdit={isEditor(user.role)}
      />
    </>
  );
}
