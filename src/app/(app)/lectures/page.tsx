/**
 * 강의배정 화면 진입점 (서버 컴포넌트).
 * - URL 의 기간(ym= 또는 from=&to=)과 초기 필터(instructor=, institution=, q=, date=, paid=)를 읽어 LecturesView 에 넘긴다.
 * - 잠긴 달 목록(lockedMonths)도 함께 넘겨 행 단위로 변경을 막는다.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { fmtPeriod, monthsBetween, parsePeriod } from "@/lib/format";
import {
  getEquipmentList,
  getLectureDateBounds,
  getLectureRentalCounts,
  getLecturesByRange,
  getLockedMonths,
  getMasterData,
} from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { LecturesView } from "./LecturesView";

type SP = {
  ym?: string;
  from?: string;
  to?: string;
  instructor?: string;
  institution?: string;
  q?: string;
  date?: string;
  view?: string;
  new?: string;
  paid?: string;
  warn?: string;
};

export default async function LecturesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const period = parsePeriod(sp);
  const [lectures, master, lockedAll, bounds, equipment, rentalCounts] =
    await Promise.all([
      getLecturesByRange(period.from, period.to),
      getMasterData(),
      getLockedMonths(),
      getLectureDateBounds(),
      getEquipmentList(),
      getLectureRentalCounts(),
    ]);
  const lockedMonths = monthsBetween(period.from, period.to).filter((m) =>
    lockedAll.has(m),
  );
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);
  return (
    <>
      <PageHeader
        title="강의배정"
        subtitle={`${fmtPeriod(period)} · 강의 1건 = 강사 1명 1행 · 단가·세전·세후는 저장 시점에 확정(스냅샷)`}
        right={<PeriodNav period={period} bounds={bounds} />}
      />
      <LecturesView
        key={`${period.from}_${period.to}`}
        period={period}
        lectures={lectures}
        equipment={equipment}
        rentalCounts={rentalCounts}
        master={master}
        lockedMonths={lockedMonths}
        canEdit={isEditor(user.role)}
        initial={{
          instructorId: num(sp.instructor),
          institutionId: num(sp.institution),
          q: sp.q ?? "",
          date:
            sp.date && sp.date >= period.from && sp.date <= period.to
              ? sp.date
              : null,
          paid:
            sp.paid === "unpaid"
              ? "unpaid"
              : sp.paid === "paid"
                ? "paid"
                : "all",
          warn: sp.warn === "1",
        }}
        initialView={
          sp.view === "calendar" && period.mode === "month"
            ? "calendar"
            : "list"
        }
        openNew={sp.new === "1"}
      />
    </>
  );
}
