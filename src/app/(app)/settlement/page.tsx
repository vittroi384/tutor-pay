/**
 * 정산 화면 진입점 — 기간(월/범위)의 강의를 강사별로 합산(건수·차시·세전·세후·미지급)해 SettlementView 에 넘긴다.
 * 미지급 집계에서 '기관지급'은 제외한다.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { fmtPeriod, monthsBetween, parsePeriod } from "@/lib/format";
import {
  getInstructors,
  getLectureDateBounds,
  getLecturesByRange,
  getLockedMonths,
  getPayTypes,
} from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { isPayable, isUnpaid, lectureWarnings } from "@/lib/calc";
import { SettlementView, type SettlementRowT } from "./SettlementView";

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const period = parsePeriod(sp);
  const [lectures, instructors, lockedAll, bounds, payTypeRows] =
    await Promise.all([
      getLecturesByRange(period.from, period.to),
      getInstructors(),
      getLockedMonths(),
      getLectureDateBounds(),
      getPayTypes(),
    ]);
  const rules = payTypeRows.map((p) => ({
    code: p.code,
    roleBased: p.roleBased,
    manual: p.manual,
    sort: p.sort,
    isActive: p.isActive,
  }));
  const lockedMonths = monthsBetween(period.from, period.to).filter((m) =>
    lockedAll.has(m),
  );

  const map = new Map<number, SettlementRowT>();
  for (const i of instructors)
    map.set(i.id, {
      instructorId: i.id,
      name: i.name,
      gradeCode: i.gradeCode,
      region: i.region,
      isActive: i.isActive,
      count: 0,
      payableCount: 0,
      sessions: 0,
      gross: 0,
      net: 0,
      travel: 0,
      unpaidCount: 0,
      unpaidNet: 0,
      warn: 0,
    });
  for (const l of lectures) {
    if (l.instructorId == null) continue; // 미배정은 강사 통계 제외
    const r = map.get(l.instructorId);
    if (!r) continue;
    r.count++;
    r.sessions += l.sessions ?? 0;
    r.gross += l.grossAmount;
    r.net += l.netAmount;
    r.travel += l.travelFee;
    if (isPayable(l)) r.payableCount++; // TutorPay이 지급하는 건수 (기관지급·0원 제외)
    if (isUnpaid(l)) {
      r.unpaidCount++;
      r.unpaidNet += l.netAmount;
    }
    if (lectureWarnings(l, rules).length) r.warn++; // ⚠ 확인 필요 (지급유형 공란·차시 공란·직접입력 단가 누락·등급 미등록)
  }
  const rows = [...map.values()];
  return (
    <>
      <PageHeader
        title="정산·명세서"
        subtitle={`${fmtPeriod(period)} · 세후 = 건별 원천징수 절사 합 (기본 3.3% · 강의별 기타소득 8.8%/비과세 선택 가능)`}
        right={<PeriodNav period={period} bounds={bounds} />}
      />
      <SettlementView
        period={period}
        rows={rows}
        lockedMonths={lockedMonths}
        canEdit={isEditor(user.role)}
      />
    </>
  );
}
