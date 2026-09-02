/**
 * 개별 명세서 — 강사 1명의 기간(월/범위) 강의 내역과 세전/원천징수/세후·교통비·지급 합계. 인쇄 CSS(print-root)로 그대로 PDF 저장 가능.
 */
import { COMPANY_NAME } from "@/lib/constants";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PeriodNav } from "@/components/ui/PeriodNav";
import { GradeBadge, PayTypeChip } from "@/components/ui/Chips";
import {
  fmtDateKo,
  fmtPeriod,
  fmtSessions,
  fmtTimeRange,
  fmtWon,
  monthsBetween,
  parsePeriod,
  periodQuery,
} from "@/lib/format";
import {
  getInstructors,
  getLectureDateBounds,
  getLecturesByRange,
  getLockedMonths,
} from "@/lib/queries";
import { isEditor, requireUser } from "@/lib/session";
import { isInstitutionPaid, isPayable, isUnpaid } from "@/lib/calc";
import { StatementActions } from "./StatementActions";

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ instructorId: string }>;
  searchParams: Promise<{ ym?: string; from?: string; to?: string }>;
}) {
  const { instructorId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const period = parsePeriod(sp);
  const pq = periodQuery(period);
  const id = Number(instructorId);
  const [instructors, periodLectures, lockedAll, bounds] = await Promise.all([
    getInstructors(),
    getLecturesByRange(period.from, period.to),
    getLockedMonths(),
    getLectureDateBounds(),
  ]);
  const lockedMonths = monthsBetween(period.from, period.to).filter((m) =>
    lockedAll.has(m),
  );
  const locked = lockedMonths.length > 0;
  const inst = instructors.find((i) => i.id === id);
  if (!inst) notFound();
  const rows = periodLectures.filter((l) => l.instructorId === id);
  const tot = rows.reduce(
    (a, l) => ({
      sessions: a.sessions + (l.sessions ?? 0),
      gross: a.gross + l.grossAmount,
      net: a.net + l.netAmount,
      travel: a.travel + l.travelFee,
      unpaid: a.unpaid + (isUnpaid(l) ? 1 : 0),
    }),
    { sessions: 0, gross: 0, net: 0, travel: 0, unpaid: 0 },
  );

  return (
    <>
      <PageHeader
        title="개별 명세서"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-3">
            <Link
              href={`/settlement?${pq}`}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <ArrowLeft size={12} /> 정산 목록으로
            </Link>
            <Link href={`/instructors/${id}`} className="hover:underline">
              강사 상세
            </Link>
          </span>
        }
        right={<PeriodNav period={period} bounds={bounds} />}
      />
      <div className="no-print mb-3">
        <StatementActions
          instructorId={id}
          from={period.from}
          to={period.to}
          query={pq}
          unpaidCount={tot.unpaid}
          canEdit={isEditor(user.role)}
          locked={locked}
          lockedLabel={
            period.mode === "month"
              ? "정산 확정(잠금) 상태 — 지급 변경 불가"
              : `기간에 정산 확정된 달(${lockedMonths.join(", ")})이 있어 일괄 지급 불가`
          }
        />
      </div>
      <div className="print-root card mx-auto max-w-[980px] p-4 sm:p-8">
        <div className="mb-6 flex items-end justify-between border-b-2 border-slate-800 pb-3">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt={COMPANY_NAME}
              className="mb-2 h-10 w-auto"
            />
            <div className="text-[12px] tracking-wide text-slate-500">
              {COMPANY_NAME} · 강사료 지급 명세서
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {fmtPeriod(period)} 강사료 지급 명세서
            </h2>
          </div>
          <div className="text-right text-[12px] text-slate-500">
            발행일{" "}
            {new Intl.DateTimeFormat("ko-KR", {
              timeZone: "Asia/Seoul",
              dateStyle: "long",
            }).format(new Date())}
            {locked && <div className="text-amber-700">정산 확정본</div>}
          </div>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-slate-500">강사명</div>
            <div className="font-semibold">
              {inst.name}{" "}
              <span className="no-print">
                <GradeBadge gradeCode={inst.gradeCode} full />
              </span>
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">지역</div>
            <div>{inst.region ?? "-"}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">연락처</div>
            <div>{inst.phone ?? "-"}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">활동 상태</div>
            <div>{inst.isActive ? "활동" : "비활성(out)"}</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="dense w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr>
                <th className="text-left">날짜</th>
                <th className="text-left">시간</th>
                <th className="text-left">기관</th>
                <th className="text-left">콘텐츠</th>
                <th className="text-right">차시</th>
                <th className="text-left">역할</th>
                <th className="text-left">지급유형</th>
                <th className="text-right">단가</th>
                <th className="text-right">세전</th>
                <th className="text-right">세후</th>
                <th className="text-right">교통비</th>
                <th className="text-center no-print">지급</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    {fmtPeriod(period)}에 배정된 강의가 없습니다.
                  </td>
                </tr>
              )}
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{fmtDateKo(l.date)}</td>
                  <td className="whitespace-nowrap">
                    {fmtTimeRange(l.startTime, l.endTime)}
                  </td>
                  <td className="max-w-[170px] break-keep print:max-w-none">
                    {l.institutionName}
                  </td>
                  <td className="max-w-[150px] break-keep print:max-w-none">
                    {l.content ?? ""}
                  </td>
                  <td className="num">{fmtSessions(l.sessions)}</td>
                  <td className="whitespace-nowrap">{l.role}</td>
                  <td>
                    <PayTypeChip payType={l.payType} />
                  </td>
                  <td className="num">{fmtWon(l.unitPrice)}</td>
                  <td className="num">{fmtWon(l.grossAmount)}</td>
                  <td className="num">
                    {fmtWon(l.netAmount)}
                    {l.taxType !== "사업소득" && (
                      <span className="ml-1 text-[10px] text-slate-500">
                        ({l.taxType === "비과세" ? "0%" : "8.8%"})
                      </span>
                    )}
                  </td>
                  <td className="num text-slate-600">
                    {l.travelFee ? fmtWon(l.travelFee) : "-"}
                  </td>
                  <td className="no-print whitespace-nowrap text-center text-[11px]">
                    {l.isPaid ? (
                      <span className="text-brand-700">완료</span>
                    ) : isInstitutionPaid(l) ? (
                      <span
                        className="text-slate-400"
                        title="기관이 직접 지급 — 집계 제외"
                      >
                        기관
                      </span>
                    ) : !isPayable(l) ? (
                      <span
                        className="text-slate-400"
                        title="세후 0원 — 집계 제외"
                      >
                        0원
                      </span>
                    ) : (
                      <span className="text-amber-700">미지급</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 ml-auto w-72 text-[13px]">
          <div className="flex justify-between border-b border-slate-200 py-1">
            <span className="text-slate-500">강의 횟수 · 차시</span>
            <span className="tabular-nums">
              {rows.length}건 · {fmtSessions(tot.sessions)}차시
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-1">
            <span className="text-slate-500">세전 합계</span>
            <span className="tabular-nums">{fmtWon(tot.gross)}원</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-1">
            <span className="text-slate-500">원천징수</span>
            <span className="tabular-nums">
              -{fmtWon(tot.gross - tot.net)}원
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-1">
            <span className="text-slate-500">세후 합계</span>
            <span className="tabular-nums">{fmtWon(tot.net)}원</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-1">
            <span className="text-slate-500">교통비 합계</span>
            <span className="tabular-nums">{fmtWon(tot.travel)}원</span>
          </div>
          <div className="flex justify-between py-1.5 text-[15px] font-bold">
            <span>지급 합계 (세후 + 교통비)</span>
            <span className="tabular-nums text-brand-700">
              {fmtWon(tot.net + tot.travel)}원
            </span>
          </div>
        </div>
        <p className="mt-6 text-[11px] leading-5 text-slate-500">
          ※ 계산 방식: 세전 = 차시 × 단가(등급·지급유형·역할별 단가표,
          수동기입은 직접 입력값) / 세후 = 건별 원천징수 후 원 단위 절사(기본
          3.3%, 강의별 기타소득 8.8% · 비과세 0% 선택 원천징수) / 교통비는 세금
          계산과 무관하게 별도 합산됩니다. 단가·세전·세후는 각 강의를 저장한
          시점의 값으로 확정되어 이후 단가표가 바뀌어도 소급되지 않습니다.
        </p>
      </div>
    </>
  );
}
