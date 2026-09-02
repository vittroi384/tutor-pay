/** 기간 이동 바 — 월/기간 전환, ◀▶ 이동, 이번 달 버튼 (강의배정·정산 등 상단 공용) */
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import {
  currentYm,
  fmtYm,
  shiftYm,
  todaySeoul,
  ymRange,
  type Period,
} from "@/lib/format";

/**
 * 월 ◀ ▶ 이동 + 날짜 범위 선택을 한 컴포넌트에서.
 *  - "월" 탭: 기존 MonthNav 와 동일 (ym=)
 *  - "기간" 탭: 시작일~종료일 + 빠른 선택(이번 주/지난달/최근 3개월/올해/전체) (from=&to=)
 * bounds 는 "전체" 프리셋에 쓸 데이터의 최소/최대 날짜.
 */
export function PeriodNav({
  period,
  bounds,
  allowRange = true,
}: {
  period: Period;
  bounds?: { min: string; max: string } | null;
  allowRange?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [tab, setTab] = useState<"month" | "range">(period.mode);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  useEffect(() => {
    setTab(period.mode);
    setFrom(period.from);
    setTo(period.to);
  }, [period.mode, period.from, period.to]);

  const navigate = (params: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params))
      v == null ? p.delete(k) : p.set(k, v);
    p.delete("date");
    router.push(`${pathname}?${p.toString()}`);
  };
  const goMonth = (ym: string) => navigate({ ym, from: null, to: null });
  const goRange = (a: string, b: string) => {
    if (!a || !b) return;
    navigate({ from: a, to: b, ym: null });
  };
  const thisYm = currentYm();
  const today = todaySeoul();

  const presets: { label: string; run: () => void }[] = [
    {
      label: "이번 주",
      run: () => {
        const d = new Date(today + "T00:00:00Z");
        const dow = d.getUTCDay();
        const mon = new Date(d);
        mon.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
        const sun = new Date(mon);
        sun.setUTCDate(mon.getUTCDate() + 6);
        goRange(mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10));
      },
    },
    { label: "지난달", run: () => goMonth(shiftYm(thisYm, -1)) },
    {
      label: "최근 3개월",
      run: () => goRange(ymRange(shiftYm(thisYm, -2)).from, ymRange(thisYm).to),
    },
    {
      label: "올해",
      run: () =>
        goRange(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`),
    },
    { label: "전체", run: () => bounds && goRange(bounds.min, bounds.max) },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowRange && (
        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-[12px]">
          <button
            className={`px-2.5 py-1.5 ${tab === "month" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            onClick={() =>
              period.mode === "month" ? setTab("month") : goMonth(period.ym)
            }
          >
            월
          </button>
          <button
            className={`px-2.5 py-1.5 ${tab === "range" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            onClick={() => setTab("range")}
          >
            기간
          </button>
        </div>
      )}
      {tab === "month" ? (
        <div className="flex items-center gap-1">
          <button
            className="btn-ghost btn-sm"
            onClick={() => goMonth(shiftYm(period.ym, -1))}
            aria-label="이전 달"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={period.ym}
            onChange={(e) => e.target.value && goMonth(e.target.value)}
            className="input w-auto px-2 py-1 text-[14px] font-semibold text-slate-800"
            aria-label="연월 선택"
          />
          <span className="sr-only">{fmtYm(period.ym)}</span>
          <button
            className="btn-ghost btn-sm"
            onClick={() => goMonth(shiftYm(period.ym, 1))}
            aria-label="다음 달"
          >
            <ChevronRight size={16} />
          </button>
          <button
            className={`btn-secondary btn-sm ml-1 ${period.ym === thisYm && period.mode === "month" ? "opacity-60" : ""}`}
            onClick={() => goMonth(thisYm)}
          >
            이번 달
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="input w-auto px-2 py-1 text-[13px]"
            aria-label="시작일"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="input w-auto px-2 py-1 text-[13px]"
            aria-label="종료일"
          />
          <button
            className="btn-primary btn-sm"
            onClick={() => goRange(from, to)}
            disabled={!from || !to}
          >
            <CalendarRange size={13} /> 조회
          </button>
          <select
            className="input w-auto px-2 py-1 text-[12px]"
            value=""
            onChange={(e) => {
              const p = presets.find((x) => x.label === e.target.value);
              p?.run();
            }}
            aria-label="빠른 선택"
          >
            <option value="">빠른 선택</option>
            {presets
              .filter((p) => p.label !== "전체" || bounds)
              .map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
