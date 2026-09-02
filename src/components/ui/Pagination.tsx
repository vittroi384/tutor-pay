"use client";
/**
 * 표 하단 페이지네이션 (N–M / 전체, 페이지당 개수 선택, 처음/이전/번호/다음/마지막). 클라이언트 상태로만 동작한다.
 */
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  sizes = [20, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  sizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(page, pages);
  const start = total === 0 ? 0 : (cur - 1) * pageSize + 1;
  const end = Math.min(total, cur * pageSize);
  // 현재 페이지 주변 번호만 표시
  const nums: number[] = [];
  for (let p = Math.max(1, cur - 2); p <= Math.min(pages, cur + 2); p++)
    nums.push(p);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12.5px] text-slate-600">
      <div>
        {total === 0 ? "0명" : `${start}–${end} / ${total}명`}
        <select
          className="input ml-2 w-auto px-1.5 py-0.5 text-[12px]"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="페이지당 개수"
        >
          {sizes.map((n) => (
            <option key={n} value={n}>
              {n}개씩
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          className="btn-ghost btn-sm"
          onClick={() => onPage(1)}
          disabled={cur <= 1}
          aria-label="처음"
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          className="btn-ghost btn-sm"
          onClick={() => onPage(cur - 1)}
          disabled={cur <= 1}
          aria-label="이전"
        >
          <ChevronLeft size={14} />
        </button>
        {nums[0] > 1 && <span className="px-1 text-slate-400">…</span>}
        {nums.map((p) => (
          <button
            key={p}
            className={`min-w-[28px] rounded px-1.5 py-0.5 tabular-nums ${p === cur ? "bg-slate-800 text-white" : "hover:bg-slate-100"}`}
            onClick={() => onPage(p)}
            aria-current={p === cur ? "page" : undefined}
          >
            {p}
          </button>
        ))}
        {nums[nums.length - 1] < pages && (
          <span className="px-1 text-slate-400">…</span>
        )}
        <button
          className="btn-ghost btn-sm"
          onClick={() => onPage(cur + 1)}
          disabled={cur >= pages}
          aria-label="다음"
        >
          <ChevronRight size={14} />
        </button>
        <button
          className="btn-ghost btn-sm"
          onClick={() => onPage(pages)}
          disabled={cur >= pages}
          aria-label="마지막"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
