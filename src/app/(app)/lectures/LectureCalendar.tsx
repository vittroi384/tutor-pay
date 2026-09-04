"use client";
/**
 * 강의배정 달력 보기 — 월 그리드에 일별 강의(최대 4건 미리보기 + 더보기), 세후 소계, 날짜 클릭 → 그날만 목록 보기, 빈 칸 hover → 그날 강의 등록.
 */
import { Plus } from "lucide-react";
import { fmtWon, todaySeoul, ymRange } from "@/lib/format";
import type { LectureRow } from "@/lib/types";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function LectureCalendar({
  ym,
  lectures,
  onPickDate,
  onNewAt,
}: {
  ym: string;
  lectures: LectureRow[];
  onPickDate: (date: string) => void;
  onNewAt?: (date: string) => void;
}) {
  const { year, month, days } = ymRange(ym);
  const first = new Date(year, month - 1, 1).getDay();
  const today = todaySeoul();
  const byDate = new Map<string, LectureRow[]>();
  for (const l of lectures)
    byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  const cells: (string | null)[] = [
    ...Array(first).fill(null),
    ...Array.from(
      { length: days },
      (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-[12px] font-medium">
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`py-1.5 ${i === 0 ? "text-rose-600" : i === 6 ? "text-blue-600" : "text-slate-500"}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, idx) => {
            if (!d)
              return (
                <div
                  key={`e${idx}`}
                  className="min-h-[112px] border-b border-r border-slate-100 bg-slate-50/50"
                />
              );
            const rows = byDate.get(d) ?? [];
            const dow = idx % 7;
            const net = rows.reduce((a, l) => a + l.netAmount, 0);
            const dayNum = Number(d.slice(-2));
            return (
              <div
                key={d}
                className={`group relative min-h-[112px] border-b border-r border-slate-100 p-1.5 ${d === today ? "bg-brand-50/40" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <button
                    className={`rounded px-1 text-[12px] font-semibold hover:bg-slate-100 ${dow === 0 ? "text-rose-600" : dow === 6 ? "text-blue-600" : "text-slate-700"}`}
                    onClick={() => onPickDate(d)}
                    title="이 날짜의 강의만 보기"
                  >
                    {dayNum}
                  </button>
                  <div className="flex items-center gap-1">
                    {rows.length > 0 && (
                      <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                        {rows.length}
                      </span>
                    )}
                    {onNewAt && (
                      <button
                        className="hidden rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-brand-700 group-hover:block"
                        onClick={() => onNewAt(d)}
                        title="이 날짜에 강의 등록"
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-1 space-y-0.5">
                  {rows.slice(0, 4).map((l) => (
                    <button
                      key={l.id}
                      className="block w-full truncate rounded px-1 text-left text-[11px] leading-4 text-slate-700 hover:bg-slate-100"
                      onClick={() => onPickDate(d)}
                      title={`${l.startTime ?? ""} ${l.institutionName} ${l.instructorName ?? "미배정"} (${l.role})`}
                    >
                      <span className="text-slate-400">
                        {l.startTime ?? "--:--"}
                      </span>{" "}
                      {l.institutionName.replace(
                        /(초등학교|중학교|고등학교|유치원)$/,
                        (m) =>
                          ({
                            초등학교: "초",
                            중학교: "중",
                            고등학교: "고",
                            유치원: "유",
                          })[m] ?? m,
                      )}{" "}
                      <span
                        className={
                          l.role === "보조강사" ? "text-slate-400" : ""
                        }
                      >
                        {(l.instructorName ?? "미배정").replace(
                          /^(강북|강릉|춘천|충청|철원|태백|동해)/,
                          "",
                        )}
                      </span>
                    </button>
                  ))}
                  {rows.length > 4 && (
                    <button
                      className="px-1 text-[11px] text-brand-700 hover:underline"
                      onClick={() => onPickDate(d)}
                    >
                      +{rows.length - 4}건 더
                    </button>
                  )}
                </div>
                {net > 0 && (
                  <div className="absolute bottom-1 right-1.5 text-[10px] tabular-nums text-slate-400">
                    {fmtWon(net)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
