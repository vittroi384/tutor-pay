/**
 * 통합보고서 진입점 — 연도·월 범위를 읽어 강의를 집계(buildReportData)하고 '차트' 또는 '표' 보기로 렌더링. 엑셀·강의배정 바로가기 포함.
 */
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportCharts } from "@/components/charts/ReportCharts";
import { currentYm, fmtSessions, fmtWon } from "@/lib/format";
import { getLecturesByRange, getYears } from "@/lib/queries";
import { buildReportData } from "@/lib/report-data";
import { requireUser } from "@/lib/session";
import { ReportTables } from "./ReportTables";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const nowYear = Number(currentYm().slice(0, 4));
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : nowYear;
  const fromM =
    sp.from && /^\d{1,2}$/.test(sp.from)
      ? Math.min(12, Math.max(1, Number(sp.from)))
      : 1;
  const toM =
    sp.to && /^\d{1,2}$/.test(sp.to)
      ? Math.min(12, Math.max(fromM, Number(sp.to)))
      : 12;
  const from = `${year}-${String(fromM).padStart(2, "0")}-01`;
  const to = `${year}-${String(toM).padStart(2, "0")}-${new Date(year, toM, 0).getDate()}`;
  const [lectures, years] = await Promise.all([
    getLecturesByRange(from, to),
    getYears(nowYear),
  ]);
  const data = buildReportData(lectures, fromM, toM);
  const periodLabel = `${year}년 ${fromM}월~${toM}월`;
  const view = sp.view === "table" ? "table" : "chart";
  const qs = (v: string) =>
    `/reports?year=${year}&from=${fromM}&to=${toM}&view=${v}`;

  return (
    <>
      <PageHeader
        title="통합보고서"
        subtitle={`${periodLabel} · 강의 ${data.total.count}건 · ${fmtSessions(data.total.sessions)}차시 · 교육 인원 ${data.total.headcount}명 · 세후 ${fmtWon(data.total.net)}`}
        right={
          <form className="flex flex-wrap items-center gap-2 text-[13px]">
            <input type="hidden" name="view" value={view} />
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
            <select
              name="from"
              defaultValue={fromM}
              className="input w-auto py-1"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}월부터
                </option>
              ))}
            </select>
            <select name="to" defaultValue={toM} className="input w-auto py-1">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}월까지
                </option>
              ))}
            </select>
            <button className="btn-secondary">조회</button>
            <a
              className="btn-secondary"
              href={`/lectures?from=${from}&to=${to}`}
              title="이 기간의 강의 목록"
            >
              강의배정 보기
            </a>
            <a
              className="btn-primary"
              href={`/api/export?type=report&year=${year}&from=${fromM}&to=${toM}`}
            >
              엑셀 내보내기
            </a>
          </form>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-slate-300 bg-white text-[13px]">
          <a
            href={qs("chart")}
            className={`whitespace-nowrap px-3 py-1.5 ${view === "chart" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            차트
          </a>
          <a
            href={qs("table")}
            className={`whitespace-nowrap px-3 py-1.5 ${view === "table" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            표
          </a>
        </div>
        <span className="text-[12px] text-slate-500">
          {view === "chart"
            ? "그래프 위에 마우스를 올리면 정확한 값이 보입니다"
            : "시트 '통합보고서' 와 같은 구성"}
        </span>
      </div>
      {view === "chart" ? (
        <ReportCharts data={data} periodLabel={periodLabel} />
      ) : (
        <ReportTables data={data} from={from} to={to} />
      )}
    </>
  );
}
