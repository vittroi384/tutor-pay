/**
 * 대시보드 — 이번 달 현황·연간 누계 요약, 월별 추이 차트, 강사별 실적 순위, 다가오는 강의, 확인 필요(⚠), 최근 변경 이력.
 * 서버 컴포넌트: 여기서 DB 를 읽어 숫자를 계산하고 클라이언트 차트에는 집계 결과만 넘긴다.
 */
import Link from "next/link";
import { desc } from "drizzle-orm";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { PageHeader } from "@/components/ui/PageHeader";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { GradeBadge } from "@/components/ui/Chips";
import { lectureWarnings } from "@/lib/calc";
import {
  currentYm,
  fmtDateKo,
  fmtDateTime,
  fmtSessions,
  fmtWon,
  fmtYm,
  todaySeoul,
} from "@/lib/format";
import {
  getInstructors,
  getLecturesByMonth,
  getLecturesByYear,
  getPayTypes,
  getYears,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { isUnpaid } from "@/lib/calc";
import { buildReportData } from "@/lib/report-data";
import { DashboardCharts } from "@/components/charts/DashboardCharts";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const ym = currentYm();
  const year =
    sp.year && /^\d{4}$/.test(sp.year)
      ? Number(sp.year)
      : Number(ym.slice(0, 4));
  const payTypeRows = await getPayTypes();
  const rules = payTypeRows.map((p) => ({
    code: p.code,
    roleBased: p.roleBased,
    manual: p.manual,
    sort: p.sort,
    isActive: p.isActive,
  }));
  const [month, yearLectures, instructors, years, logs] = await Promise.all([
    getLecturesByMonth(ym),
    getLecturesByYear(year),
    getInstructors(),
    getYears(Number(ym.slice(0, 4))),
    db.select().from(auditLogs).orderBy(desc(auditLogs.at)).limit(12),
  ]);
  const today = todaySeoul();
  // 이번 달 지표 (미지급은 기관지급 제외)
  const m = {
    count: month.length,
    sessions: month.reduce((a, l) => a + (l.sessions ?? 0), 0),
    net: month.reduce((a, l) => a + l.netAmount, 0),
    unpaid: month.filter(isUnpaid), // 기관지급 제외
    undone: month.filter((l) => !l.isDone && l.date <= today),
    upcoming: month.filter((l) => l.date >= today).slice(0, 8),
    warn: month.filter((l) => lectureWarnings(l, rules).length),
  };
  const yearWarn = yearLectures.filter((l) => lectureWarnings(l, rules).length);

  // 강사별 연간 실적 (시트 '강사 정보' QUERY 대체): 총 차시 내림차순
  const rank = new Map<
    number,
    { count: number; sessions: number; headcount: number; net: number }
  >();
  for (const l of yearLectures) {
    if (l.instructorId == null) continue; // 미배정은 강사 통계 제외
    const r = rank.get(l.instructorId) ?? {
      count: 0,
      sessions: 0,
      headcount: 0,
      net: 0,
    };
    r.count++;
    r.sessions += l.sessions ?? 0;
    r.headcount += l.headcount ?? 0;
    r.net += l.netAmount;
    rank.set(l.instructorId, r);
  }
  const ranking = [...rank.entries()]
    .map(([id, r]) => ({ inst: instructors.find((i) => i.id === id)!, ...r }))
    .filter((r) => r.inst)
    .sort((a, b) => b.sessions - a.sessions || b.count - a.count);
  const unregistered = instructors.filter(
    (i) => i.gradeCode == null && i.isActive,
  );
  const report = buildReportData(yearLectures, 1, 12);

  return (
    <>
      <PageHeader
        title="대시보드"
        subtitle={`${fmtYm(ym)} 현황 · ${year}년 누계`}
      />
      <SummaryStrip
        items={[
          {
            label: "이번 달 강의",
            value: `${m.count}건`,
            sub: `${fmtSessions(m.sessions)}차시`,
          },
          {
            label: "이번 달 지급 예정(세후)",
            value: fmtWon(m.net),
            tone: "brand",
          },
          {
            label: "미지급",
            value: `${m.unpaid.length}건`,
            sub: fmtWon(m.unpaid.reduce((a, l) => a + l.netAmount, 0)),
            tone: m.unpaid.length ? "amber" : "default",
          },
          {
            label: "미완료(지난 강의)",
            value: `${m.undone.length}건`,
            tone: m.undone.length ? "amber" : "default",
          },
          {
            label: `${year}년 누계`,
            value: `${yearLectures.length}건`,
            sub: `${fmtSessions(yearLectures.reduce((a, l) => a + (l.sessions ?? 0), 0))}차시 · ${fmtWon(yearLectures.reduce((a, l) => a + l.netAmount, 0))}`,
          },
          {
            label: "확인 필요 ⚠ (연간)",
            value: yearWarn.length ? (
              <Link
                href={`/lectures?from=${year}-01-01&to=${year}-12-31&warn=1`}
                className="hover:underline"
                title="확인 필요한 강의만 보기"
              >
                {yearWarn.length}건
              </Link>
            ) : (
              "0건"
            ),
            tone: yearWarn.length ? "rose" : "default",
          },
          {
            label: "등급 미등록 강사",
            value: `${unregistered.length}명`,
            tone: unregistered.length ? "rose" : "default",
          },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DashboardCharts data={report} year={year} />
        </div>
        <div className="card xl:col-span-2 xl:col-start-1 xl:row-start-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <div className="text-[13px] font-semibold text-slate-700">
              강사별 실적 순위 ({year}년 누계)
            </div>
            <form className="flex items-center gap-2 text-[12px]">
              <select
                name="year"
                defaultValue={year}
                className="input w-auto py-1"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
              <button className="btn-secondary btn-sm">보기</button>
            </form>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="dense w-full min-w-[520px] text-[13px]">
              <thead className="sticky top-0">
                <tr>
                  <th className="text-right">순위</th>
                  <th className="text-left">강사명</th>
                  <th className="text-right">총 차시</th>
                  <th className="text-right">강의 횟수</th>
                  <th className="text-right">총 인원</th>
                  <th className="text-right">지급 강사료(세후)</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.inst.id}>
                    <td className="num text-slate-500">{i + 1}</td>
                    <td>
                      <Link
                        href={`/instructors/${r.inst.id}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {r.inst.name}
                      </Link>{" "}
                      <GradeBadge gradeCode={r.inst.gradeCode} />
                    </td>
                    <td className="num">{fmtSessions(r.sessions)}</td>
                    <td className="num">{r.count}</td>
                    <td className="num">{r.headcount}</td>
                    <td className="num">{fmtWon(r.net)}</td>
                  </tr>
                ))}
                {ranking.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      {year}년 강의 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4 xl:col-start-3 xl:row-start-1 xl:row-span-2">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <div className="text-[13px] font-semibold text-slate-700">
                다가오는 강의
              </div>
              <Link
                href={`/lectures?ym=${ym}`}
                className="inline-flex items-center gap-1 text-[12px] text-brand-700 hover:underline"
              >
                강의배정 <ArrowRight size={12} />
              </Link>
            </div>
            <ul className="divide-y divide-slate-100 text-[12.5px]">
              {m.upcoming.length === 0 && (
                <li className="px-4 py-4 text-slate-500">
                  이번 달 남은 강의가 없습니다.
                </li>
              )}
              {m.upcoming.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-4 py-1.5">
                  <Link
                    href={`/lectures?ym=${l.date.slice(0, 7)}&date=${l.date}`}
                    className="w-20 shrink-0 text-slate-500 hover:underline"
                    title="그날 강의 보기"
                  >
                    {fmtDateKo(l.date)}
                  </Link>
                  <span className="w-12 shrink-0 text-slate-400">
                    {l.startTime ?? ""}
                  </span>
                  <Link
                    href={`/lectures?ym=${l.date.slice(0, 7)}&institution=${l.institutionId}`}
                    className="truncate hover:underline"
                    title="이 기관 강의 보기"
                  >
                    {l.institutionName}
                  </Link>
                  <Link
                    href={`/instructors/${l.instructorId}`}
                    className="ml-auto shrink-0 text-slate-600 hover:underline"
                    title="강사 상세"
                  >
                    {l.instructorName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {(m.warn.length > 0 || unregistered.length > 0) && (
            <div className="card border-rose-200">
              <div className="flex items-center gap-1.5 border-b border-rose-100 px-4 py-2.5 text-[13px] font-semibold text-rose-700">
                <AlertTriangle size={14} /> 확인이 필요해요
                <Link
                  href={`/lectures?from=${year}-01-01&to=${year}-12-31&warn=1`}
                  className="ml-auto inline-flex items-center gap-1 text-[12px] font-normal text-rose-700 hover:underline"
                  title="올해 확인 필요한 강의만 모아 보기"
                >
                  올해 전체 {yearWarn.length}건 <ArrowRight size={12} />
                </Link>
              </div>
              <ul className="divide-y divide-slate-100 text-[12.5px]">
                {m.warn.slice(0, 5).map((l) => (
                  <li key={l.id} className="px-4 py-1.5">
                    <Link
                      href={`/lectures?ym=${ym}&warn=1`}
                      className="hover:underline"
                      title="이 달 확인 필요한 강의만 보기"
                    >
                      {fmtDateKo(l.date)} {l.instructorName} ·{" "}
                      {l.institutionName}
                    </Link>
                    <div className="text-[11px] text-rose-600">
                      {lectureWarnings(l, rules).join(" · ")}
                    </div>
                  </li>
                ))}
                {unregistered.length > 0 && (
                  <li className="px-4 py-1.5">
                    <Link
                      href="/instructors?grade=미등록"
                      className="hover:underline"
                    >
                      등급 미등록 활동 강사 {unregistered.length}명 — 배정 시
                      단가 0으로 계산됩니다
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          )}
          <div className="card">
            <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
              최근 변경 이력
            </div>
            <ul className="divide-y divide-slate-100 text-[12px]">
              {logs.length === 0 && (
                <li className="px-4 py-4 text-slate-500">
                  아직 변경 이력이 없습니다.
                </li>
              )}
              {logs.map((g) => (
                <li key={g.id} className="flex items-start gap-2 px-4 py-1.5">
                  <span className="w-20 shrink-0 text-slate-400">
                    {fmtDateTime(g.at)}
                  </span>
                  <span className="truncate">
                    {g.summary ?? `${g.tableName} ${g.action}`}
                  </span>
                  <span
                    className="ml-auto shrink-0 truncate text-slate-400"
                    title={g.userEmail ?? ""}
                  >
                    {(g.userEmail ?? "").split("@")[0]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
