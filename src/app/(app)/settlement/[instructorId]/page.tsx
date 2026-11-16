/**
 * 개별 명세서 — 강사 1명의 기간(월/범위) 강의 내역과 세전/원천징수/세후·교통비·지급 합계. 인쇄 CSS(print-root)로 그대로 PDF 저장 가능.
 */
import { COMPANY_NAME } from "@/lib/constants";
import { notFound } from "next/navigation";
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
import { isEditor, requireUser, canOverrideLock } from "@/lib/session";
import {
  isInstitutionPaid,
  isPayable,
  isUnpaid,
  travelNetOf,
  travelNote,
} from "@/lib/calc";
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
  // 정산 확정된 달이 섞여 있으면 지급 변경 불가 — 관리자는 예외
  const locked = lockedMonths.length > 0 && !canOverrideLock(user.role);
  const inst = instructors.find((i) => i.id === id);
  if (!inst) notFound();
  const rows = periodLectures.filter((l) => l.instructorId === id);
  const tot = rows.reduce(
    (a, l) => ({
      sessions: a.sessions + (l.sessions ?? 0),
      gross: a.gross + l.grossAmount,
      net: a.net + l.netAmount,
      travel: a.travel + l.travelFee,
      travelNet:
        a.travelNet + travelNetOf(l.travelFee, l.taxType, l.date, l.travelType),
      unpaid: a.unpaid + (isUnpaid(l) ? 1 : 0),
    }),
    { sessions: 0, gross: 0, net: 0, travel: 0, travelNet: 0, unpaid: 0 },
  );

  return (
    <>
      <PageHeader
        title="개별 명세서"
        subtitle="강사 1명의 기간 내역 — 인쇄하면 그대로 지급 명세서가 됩니다"
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
              ? "정산 확정(잠금) 상태 — 변경은 관리자만"
              : `기간에 정산 확정된 달(${lockedMonths.join(", ")})이 있어 일괄 지급 불가`
          }
        />
      </div>
      <div className="print-root card mx-auto max-w-[1080px] p-4 sm:p-6">
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
                  <td className="whitespace-nowrap">{l.content ?? ""}</td>
                  <td className="num">{fmtSessions(l.sessions)}</td>
                  <td className="whitespace-nowrap">{l.role}</td>
                  <td>
                    <PayTypeChip payType={l.payType} />
                  </td>
                  <td className="num">
                    {fmtWon(l.unitPrice)}
                    {l.unitPriceAfter != null && (
                      <div className="text-[10px] leading-tight whitespace-nowrap text-slate-500">
                        {(l.tierLimit ?? 2) + 1}차시~ {fmtWon(l.unitPriceAfter)}
                      </div>
                    )}
                  </td>
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
                    {l.travelFee ? (
                      <>
                        {fmtWon(l.travelFee)}
                        {travelNote(
                          l.travelFee,
                          l.taxType,
                          l.date,
                          l.travelType,
                        ) && (
                          <div className="text-[10px] leading-tight whitespace-nowrap text-slate-500">
                            {travelNote(
                              l.travelFee,
                              l.taxType,
                              l.date,
                              l.travelType,
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      "-"
                    )}
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
        <div className="stmt-bottom">
          <div className="stmt-summary mt-5 ml-auto w-72 text-[13px]">
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
            {tot.travel !== tot.travelNet && (
              <>
                <div className="flex justify-between border-b border-slate-200 py-1">
                  <span className="text-slate-500">교통비 원천징수</span>
                  <span className="tabular-nums">
                    -{fmtWon(tot.travel - tot.travelNet)}원
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 py-1">
                  <span className="text-slate-500">교통비 세후</span>
                  <span className="tabular-nums">
                    {fmtWon(tot.travelNet)}원
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between py-1.5 text-[15px] font-bold">
              <span>
                지급 합계 (세후 + 교통비
                {tot.travel !== tot.travelNet ? " 세후" : ""})
              </span>
              <span className="tabular-nums text-brand-700">
                {fmtWon(tot.net + tot.travelNet)}원
              </span>
            </div>
          </div>
          {/* 서명란 — 강사 확인용. 인쇄 시 한 페이지 안에서 쪼개지지 않음 */}
          <div className="stmt-sign mt-8 flex items-end justify-between gap-6 border-t border-slate-300 pt-5 text-[13px]">
            <div className="text-slate-600">
              위 내역과 지급 합계를 확인하였습니다.
              <div className="mt-3 text-slate-500">
                확인일 :
                20&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일
              </div>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-slate-500">강사명</span>
              <span className="inline-block h-7 w-32 border-b border-slate-800" />
              <span className="text-slate-500">(서명)</span>
              <span className="inline-block h-7 w-32 border-b border-slate-800" />
            </div>
          </div>
        </div>
        <p className="mt-6 text-[11px] leading-5 text-slate-500">
          ※ 계산 방식: 세전 = 차시 × 단가 — 구간 단가인 강의는 1~2차시는 기본
          단가, 3차시부터는 단가 칸 아래 표기된 단가로 계산(등급·지급유형·역할별
          단가표, 수동기입은 직접 입력값) / 세후 = 건별 원천징수 후 원 단위
          절사(기본 3.3%, 강의별 기타소득 8.8% · 비과세 0% 선택 원천징수) /
          교통비는 실비지급이면 비과세(전액), 정액지급이면 3.3%
          원천징수하며(구분 도입 전 기록은 기존 기준 유지), 지급 합계 = 세후
          합계 + 교통비 세후 합계입니다. 단가·세전·세후는 각 강의를 저장한
          시점의 값으로 확정되어 이후 단가표가 바뀌어도 소급되지 않습니다.
        </p>
      </div>
    </>
  );
}
