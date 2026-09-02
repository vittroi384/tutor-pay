"use client";
/**
 * 정산 목록 (클라이언트) — 강사별 합계표(세후 내림차순), 검색, 강의 없는 강사 표시, 엑셀, 월 정산 확정/해제(월 탭에서만),
 * 행마다 명세서·강의 목록·강사 상세 바로가기.
 */
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarDays, Lock, LockOpen, Search, User } from "lucide-react";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { GradeBadge } from "@/components/ui/Chips";
import { useToast } from "@/components/ui/Toast";
import {
  fmtSessions,
  fmtWon,
  fmtYm,
  periodQuery,
  type Period,
} from "@/lib/format";
import { setMonthLock } from "../lectures/actions";

/** 강사별 정산 합계 한 줄. payableCount = TutorPay이 지급하는 건수(기관지급 제외), unpaid* = 그중 미지급 */
export type SettlementRowT = {
  instructorId: number;
  name: string;
  gradeCode: string | null;
  region: string | null;
  isActive: boolean;
  count: number;
  payableCount: number;
  sessions: number;
  gross: number;
  net: number;
  travel: number; // 교통비 합계 — 지급액 = net + travel
  unpaidCount: number;
  unpaidNet: number;
  warn: number;
};

export function SettlementView({
  period,
  rows,
  lockedMonths,
  canEdit,
}: {
  period: Period;
  rows: SettlementRowT[];
  lockedMonths: string[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const ym = period.ym;
  const pq = periodQuery(period);
  const locked = period.mode === "month" && lockedMonths.includes(ym);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  // 표시 행: 검색어 + "강의 없는 강사도 표시" 옵션 적용, 세후 내림차순
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows
      .filter(
        (r) =>
          (showAll || r.count > 0) &&
          (!qq || r.name.toLowerCase().includes(qq)),
      )
      .sort(
        (a, b) =>
          b.net - a.net ||
          b.count - a.count ||
          a.name.localeCompare(b.name, "ko"),
      );
  }, [rows, q, showAll]);

  const active = rows.filter((r) => r.count > 0);
  const tot = active.reduce(
    (a, r) => ({
      count: a.count + r.count,
      sessions: a.sessions + r.sessions,
      gross: a.gross + r.gross,
      net: a.net + r.net,
      travel: a.travel + r.travel,
      unpaidCount: a.unpaidCount + r.unpaidCount,
      unpaidNet: a.unpaidNet + r.unpaidNet,
    }),
    {
      count: 0,
      sessions: 0,
      gross: 0,
      net: 0,
      travel: 0,
      unpaidCount: 0,
      unpaidNet: 0,
    },
  );

  // 월 정산 확정/해제 (월 탭에서만 노출)
  const toggleLock = () =>
    start(async () => {
      const r = await setMonthLock(ym, !locked);
      if (r.ok)
        toast(
          locked ? "정산 확정을 해제했어요" : "이 달 정산을 확정(잠금)했어요",
        );
      else toast(r.error, "error");
    });

  return (
    <div>
      <SummaryStrip
        items={[
          {
            label: "정산 대상 강사",
            value: `${active.length}명`,
            sub: `${tot.count}건 · ${fmtSessions(tot.sessions)}차시`,
          },
          { label: "세전 합계", value: fmtWon(tot.gross) },
          { label: "원천징수", value: fmtWon(tot.gross - tot.net) },
          { label: "교통비 합계", value: fmtWon(tot.travel) },
          {
            label: "지급액(세후+교통비)",
            value: fmtWon(tot.net + tot.travel),
            tone: "brand" as const,
          },
          {
            label: "미지급",
            value: `${tot.unpaidCount}건`,
            sub: fmtWon(tot.unpaidNet),
            tone: tot.unpaidCount ? "amber" : "default",
          },
          period.mode === "month"
            ? {
                label: "정산 상태",
                value: locked ? "확정(잠금)" : "진행 중",
                tone: locked ? "amber" : "default",
              }
            : {
                label: "기간 내 확정된 달",
                value: lockedMonths.length
                  ? `${lockedMonths.length}개월`
                  : "없음",
                sub:
                  lockedMonths
                    .map((m) => fmtYm(m).replace("년 ", "."))
                    .join(", ") || undefined,
                tone: lockedMonths.length ? "amber" : "default",
              },
        ]}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
          />
          <input
            className="input w-52 pl-8"
            placeholder="강사 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[13px] text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />{" "}
          강의 없는 강사도 표시
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link className="btn-secondary" href={`/lectures?${pq}`}>
            <CalendarDays size={14} /> 강의배정 보기
          </Link>
          <a
            className="btn-secondary"
            href={
              period.mode === "month"
                ? `/api/export?type=lectures&ym=${ym}`
                : `/api/export?type=range&from=${period.from}&to=${period.to}`
            }
          >
            {period.mode === "month"
              ? "이 달 엑셀 내려받기"
              : "이 기간 엑셀 내려받기"}
          </a>
          {canEdit && period.mode === "month" && (
            <button
              className={locked ? "btn-secondary" : "btn-primary"}
              onClick={toggleLock}
              disabled={pending}
              title="확정하면 이 달 강의의 등록·수정·삭제·지급 변경이 막힙니다"
            >
              {locked ? <LockOpen size={14} /> : <Lock size={14} />}{" "}
              {locked ? "확정 해제" : "이 달 정산 확정"}
            </button>
          )}
          {canEdit && period.mode === "range" && (
            <span className="text-[12px] text-slate-500">
              정산 확정은 월 탭에서 달 단위로 합니다
            </span>
          )}
        </div>
      </div>
      <div className="card">
        <div className="table-scroll max-h-[max(420px,calc(100dvh-250px))]">
          <table className="dense w-full min-w-[900px] text-[13px]">
            <thead>
              <tr>
                <th className="text-left">강사</th>
                <th className="text-left">지역</th>
                <th className="text-right">강의 횟수</th>
                <th className="text-right">총 차시</th>
                <th className="text-right">세전 합계</th>
                <th className="text-right">세후</th>
                <th className="text-right">교통비</th>
                <th className="text-right">지급액</th>
                <th className="text-left">지급 상태</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    이 기간에 정산할 강의가 없습니다.
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr
                  key={r.instructorId}
                  className={r.count === 0 ? "text-slate-400" : ""}
                >
                  <td>
                    <Link
                      href={`/settlement/${r.instructorId}?${pq}`}
                      className="font-medium text-slate-800 hover:text-brand-700 hover:underline"
                      title="명세서 보기"
                    >
                      {r.name}
                    </Link>{" "}
                    <GradeBadge gradeCode={r.gradeCode} />
                    {!r.isActive && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        (out)
                      </span>
                    )}
                    {r.warn > 0 && (
                      <span
                        className="ml-1 text-[11px] text-rose-600"
                        title="지급유형·차시·수동기입 단가 누락 건 포함"
                      >
                        ⚠{r.warn}
                      </span>
                    )}
                  </td>
                  <td>{r.region ?? "-"}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{fmtSessions(r.sessions)}</td>
                  <td className="num">{fmtWon(r.gross)}</td>
                  <td className="num">{fmtWon(r.net)}</td>
                  <td className="num text-slate-600">
                    {r.travel ? fmtWon(r.travel) : "-"}
                  </td>
                  <td className="num font-semibold text-slate-800">
                    {fmtWon(r.net + r.travel)}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.count === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : r.payableCount === 0 ? (
                      <span
                        className="text-[11px] text-slate-400"
                        title="기관지급 또는 세후 0원(연구원 등)뿐 — TutorPay 지급 대상 없음"
                      >
                        지급 대상 없음
                      </span>
                    ) : r.unpaidCount === 0 ? (
                      <span className="chip bg-brand-50 text-brand-800 ring-brand-200">
                        완료
                      </span>
                    ) : (
                      <span
                        className="chip bg-amber-50 text-amber-800 ring-amber-200"
                        title="기관지급·세후 0원 건은 제외한 숫자"
                      >
                        미지급 {r.unpaidCount}/{r.payableCount}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link
                      className="btn-ghost btn-sm"
                      href={`/settlement/${r.instructorId}?${pq}`}
                    >
                      명세서
                    </Link>
                    <Link
                      className="btn-ghost btn-sm"
                      href={`/lectures?${pq}&instructor=${r.instructorId}`}
                      title="이 기간 이 강사의 강의 목록"
                    >
                      <CalendarDays size={13} />
                    </Link>
                    <Link
                      className="btn-ghost btn-sm"
                      href={`/instructors/${r.instructorId}`}
                      title="강사 상세"
                    >
                      <User size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            {active.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td colSpan={2}>합계 ({active.length}명)</td>
                  <td className="num">{tot.count}</td>
                  <td className="num">{fmtSessions(tot.sessions)}</td>
                  <td className="num">{fmtWon(tot.gross)}</td>
                  <td className="num">{fmtWon(tot.net)}</td>
                  <td className="num">{fmtWon(tot.travel)}</td>
                  <td className="num text-brand-700">
                    {fmtWon(tot.net + tot.travel)}
                  </td>
                  <td colSpan={2} className="text-[12px] text-slate-500">
                    미지급 {tot.unpaidCount}건 · {fmtWon(tot.unpaidNet)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
