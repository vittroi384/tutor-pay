/** 정렬 가능한 표 머리글 칸 — 클릭할 때마다 오름/내림차순 전환, 현재 정렬 방향 화살표 표시 */
"use client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortState<K extends string> = { key: K; dir: "asc" | "desc" };

/** 클릭하면 오름차순 → 내림차순 → (같은 열 재클릭) 토글되는 표 헤더 */
export function SortableTh<K extends string>({
  col,
  sort,
  onSort,
  align = "left",
  children,
  className = "",
}: {
  col: K;
  sort: SortState<K>;
  onSort: (s: SortState<K>) => void;
  align?: "left" | "right";
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort.key === col;
  const next = () =>
    onSort({
      key: col,
      dir:
        active && sort.dir === "asc"
          ? "desc"
          : active && sort.dir === "desc"
            ? "asc"
            : "asc",
    });
  return (
    <th
      className={`overflow-hidden whitespace-nowrap ${align === "right" ? "text-right" : "text-left"} ${className}`}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={next}
        className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-800 ${active ? "text-slate-800" : ""}`}
        title="클릭하면 정렬 (다시 클릭하면 반대 순서)"
      >
        {children}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp size={12} className="text-brand-600" />
          ) : (
            <ArrowDown size={12} className="text-brand-600" />
          )
        ) : (
          <ArrowUpDown size={12} className="text-slate-300" />
        )}
      </button>
    </th>
  );
}

/** 정렬 비교 유틸: 숫자·문자열·null 안전 */
export function compareValues(
  a: unknown,
  b: unknown,
  dir: "asc" | "desc",
): number {
  const m = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1; // null 은 항상 뒤로
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * m;
  if (typeof a === "boolean" && typeof b === "boolean")
    return (Number(a) - Number(b)) * m;
  return String(a).localeCompare(String(b), "ko") * m;
}
