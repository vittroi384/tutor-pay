/**
 * 강사 관리 진입점 — 강사 목록 + 선택 연도의 실적(건수·차시·세후·미지급·최근 강의)을 합쳐 InstructorsView 에 넘긴다.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { currentYm } from "@/lib/format";
import { getGrades, getInstructors, getLecturesByYear } from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { isUnpaid } from "@/lib/calc";
import { InstructorsView } from "./InstructorsView";

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const year = Number(currentYm().slice(0, 4));
  const [instructors, grades, lectures] = await Promise.all([
    getInstructors(),
    getGrades(),
    getLecturesByYear(year),
  ]);
  const stats = new Map<
    number,
    {
      count: number;
      sessions: number;
      net: number;
      unpaid: number;
      last: string | null;
    }
  >();
  for (const l of lectures) {
    if (l.instructorId == null) continue; // 미배정 제외
    const s = stats.get(l.instructorId) ?? {
      count: 0,
      sessions: 0,
      net: 0,
      unpaid: 0,
      last: null,
    };
    s.count++;
    s.sessions += l.sessions ?? 0;
    s.net += l.netAmount;
    if (isUnpaid(l)) s.unpaid++; // 기관지급 제외
    if (!s.last || l.date > s.last) s.last = l.date;
    stats.set(l.instructorId, s);
  }
  const rows = instructors.map((i) => ({
    ...i,
    stat: stats.get(i.id) ?? {
      count: 0,
      sessions: 0,
      net: 0,
      unpaid: 0,
      last: null,
    },
  }));
  return (
    <>
      <PageHeader
        title="강사 관리"
        subtitle={`강사 ${instructors.length}명 · 활동 ${instructors.filter((i) => i.isActive).length}명 · ${year}년 실적 기준`}
      />
      <InstructorsView
        rows={rows}
        grades={grades}
        year={year}
        canEdit={isEditor(user.role)}
        initialGrade={sp.grade ?? ""}
        initialQ={sp.q ?? ""}
      />
    </>
  );
}
