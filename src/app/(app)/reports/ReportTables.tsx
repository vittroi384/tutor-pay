/**
 * 통합보고서 '표' 보기 — 기관 유형별(시트와 동일), 월별, 콘텐츠별, 지급유형별·등급별, 기관 Top 20, 요일별, 강사별. 기관/강사는 해당 화면으로 링크.
 */
import Link from "next/link";
import { InstitutionTypeChip } from "@/components/ui/Chips";
import { fmtSessions, fmtWon } from "@/lib/format";
import type { AggRow, ReportData } from "@/lib/report-data";

/** 표 안의 간단한 가로 막대 (최대값 대비 비율) */
function Bar({
  value,
  max,
  color = "bg-brand-500",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-4 w-full rounded bg-slate-100">
      <div
        className={`h-4 rounded ${color}`}
        style={{ width: `${value > 0 ? w : 0}%` }}
      />
    </div>
  );
}

/** 집계 행 렌더링 공용 (횟수·차시·인원·세후) */
function Rows({
  rows,
  showNet = true,
  showHead = true,
}: {
  rows: AggRow[];
  showNet?: boolean;
  showHead?: boolean;
}) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.key} className={r.count === 0 ? "text-slate-300" : ""}>
          <td>{r.key}</td>
          <td className="num">{r.count}</td>
          <td className="num">{fmtSessions(r.sessions)}</td>
          {showHead && <td className="num">{r.headcount}</td>}
          {showNet && <td className="num">{fmtWon(r.net)}</td>}
        </tr>
      ))}
    </>
  );
}

export function ReportTables({
  data,
  from,
  to,
}: {
  data: ReportData;
  from: string;
  to: string;
}) {
  const maxSessions = Math.max(1, ...data.months.map((v) => v.sessions));
  const maxHead = Math.max(1, ...data.months.map((v) => v.headcount));
  const t = data.total;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          기관 유형별
        </div>
        <table className="dense w-full min-w-[420px] text-[13px]">
          <thead>
            <tr>
              <th className="text-left">기관 유형</th>
              <th className="text-right">교육 횟수</th>
              <th className="text-right">총 차시</th>
              <th className="text-right">총 교육 인원</th>
              <th className="text-right">세후 강사료</th>
            </tr>
          </thead>
          <tbody>
            <Rows rows={data.byType} />
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td>합계</td>
              <td className="num">{t.count}</td>
              <td className="num">{fmtSessions(t.sessions)}</td>
              <td className="num">{t.headcount}</td>
              <td className="num">{fmtWon(t.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          월별 총 차시 · 총 인원
        </div>
        <table className="dense w-full min-w-[420px] text-[13px]">
          <thead>
            <tr>
              <th className="text-left">월</th>
              <th className="text-right">건수</th>
              <th className="text-right">총 차시</th>
              <th className="w-32"></th>
              <th className="text-right">총 인원</th>
              <th className="w-32"></th>
              <th className="text-right">세후 강사료</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((r) => (
              <tr key={r.m}>
                <td className="whitespace-nowrap">{r.key}</td>
                <td className="num">{r.count}</td>
                <td className="num">{fmtSessions(r.sessions)}</td>
                <td>
                  <Bar value={r.sessions} max={maxSessions} />
                </td>
                <td className="num">{r.headcount}</td>
                <td>
                  <Bar value={r.headcount} max={maxHead} color="bg-sky-400" />
                </td>
                <td className="num">{fmtWon(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          콘텐츠별 (여러 콘텐츠 강의는 각각 집계)
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="dense w-full min-w-[420px] text-[13px]">
            <thead className="sticky top-0">
              <tr>
                <th className="text-left">콘텐츠</th>
                <th className="text-right">횟수</th>
                <th className="text-right">차시</th>
                <th className="text-right">인원</th>
              </tr>
            </thead>
            <tbody>
              <Rows rows={data.byContent} showNet={false} />
            </tbody>
          </table>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          지급유형별 · 등급별
        </div>
        <table className="dense w-full min-w-[420px] text-[13px]">
          <thead>
            <tr>
              <th className="text-left">구분</th>
              <th className="text-right">횟수</th>
              <th className="text-right">차시</th>
              <th className="text-right">인원</th>
              <th className="text-right">세후 강사료</th>
            </tr>
          </thead>
          <tbody>
            <Rows rows={data.byPayType} />
            <tr>
              <td
                colSpan={5}
                className="bg-slate-50 py-1 text-[11px] font-medium text-slate-500"
              >
                등급별
              </td>
            </tr>
            <Rows rows={data.byGrade} />
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          기관별 Top 20 (교육 횟수 순)
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="dense w-full min-w-[420px] text-[13px]">
            <thead className="sticky top-0">
              <tr>
                <th className="text-left">기관</th>
                <th className="text-left">유형</th>
                <th className="text-right">횟수</th>
                <th className="text-right">차시</th>
                <th className="text-right">인원</th>
                <th className="text-right">세후 강사료</th>
              </tr>
            </thead>
            <tbody>
              {data.byInstitution.slice(0, 20).map((r) => (
                <tr key={r.institutionId}>
                  <td>
                    <Link
                      href={`/lectures?from=${from}&to=${to}&institution=${r.institutionId}`}
                      className="hover:underline"
                      title="이 기간 이 기관의 강의 목록"
                    >
                      {r.key}
                    </Link>
                  </td>
                  <td>
                    <InstitutionTypeChip type={r.type} />
                  </td>
                  <td className="num">{r.count}</td>
                  <td className="num">{fmtSessions(r.sessions)}</td>
                  <td className="num">{r.headcount}</td>
                  <td className="num">{fmtWon(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          요일별 강의 분포
        </div>
        <table className="dense w-full min-w-[360px] text-[13px]">
          <thead>
            <tr>
              <th className="text-left">요일</th>
              <th className="text-right">건수</th>
              <th className="w-40"></th>
              <th className="text-right">차시</th>
              <th className="text-right">인원</th>
            </tr>
          </thead>
          <tbody>
            {data.byWeekday.map((r) => (
              <tr key={r.key} className={r.count === 0 ? "text-slate-300" : ""}>
                <td
                  className={
                    r.key === "토"
                      ? "text-blue-600"
                      : r.key === "일"
                        ? "text-rose-600"
                        : ""
                  }
                >
                  {r.key}
                </td>
                <td className="num">{r.count}</td>
                <td>
                  <Bar
                    value={r.count}
                    max={Math.max(1, ...data.byWeekday.map((w) => w.count))}
                    color="bg-violet-400"
                  />
                </td>
                <td className="num">{fmtSessions(r.sessions)}</td>
                <td className="num">{r.headcount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          강사별 (세후 내림차순)
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="dense w-full min-w-[420px] text-[13px]">
            <thead className="sticky top-0">
              <tr>
                <th className="text-left">강사</th>
                <th className="text-right">횟수</th>
                <th className="text-right">차시</th>
                <th className="text-right">인원</th>
                <th className="text-right">세후 강사료</th>
              </tr>
            </thead>
            <tbody>
              {data.byInstructor.map((r) => (
                <tr key={r.instructorId}>
                  <td>
                    <Link
                      href={`/instructors/${r.instructorId}`}
                      className="hover:underline"
                    >
                      {r.key}
                    </Link>{" "}
                    <span className="text-[11px] text-slate-500">
                      {r.grade ? r.grade.replace("등급", "") : "미등록"}
                    </span>
                  </td>
                  <td className="num">{r.count}</td>
                  <td className="num">{fmtSessions(r.sessions)}</td>
                  <td className="num">{r.headcount}</td>
                  <td className="num">{fmtWon(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
