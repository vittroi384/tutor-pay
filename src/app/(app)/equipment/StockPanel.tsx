/** 교구 현황 탭 — 재고 표(정렬·검색·분류 필터), 사용 가능 수량 자동 계산 표시. 교구명 → 상세, 대여중 숫자 → 대여 기록 필터 */
/**
 * 교구 관리 (클라이언트) — 탭 2개.
 *  - 교구 현황: 종류별 총 보유/대여중/수리중/폐기/사용 가능 표 (열 클릭 정렬, 열 너비 고정),
 *    사용 가능이 음수면 붉게 표시(대여·재고 수치가 안 맞는 것), 교구 등록·수정·삭제 서랍
 *  - 대여 기록: 상태(대여중/반납)·교구·검색 필터 + 페이지, 대여 등록(여러 교구 한 번에),
 *    행에서 바로 반납 처리, 수정·삭제
 *  - 통계: 재고 구성·대여 추이·대여처 Top 등 차트 (EquipmentCharts.tsx)
 * 교구명을 클릭하면 상세 서랍: 재고 구성 바 + 지금 빌리고 있는 곳(반납 버튼) + 최근 이력.
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  SortableTh,
  compareValues,
  type SortState,
} from "@/components/ui/SortableTh";
import { useToast } from "@/components/ui/Toast";
import type { EquipmentRow } from "@/lib/types";
import { deleteEquipment } from "./actions";

type StockSortKey =
  | "code"
  | "name"
  | "category"
  | "total"
  | "rented"
  | "repair"
  | "discard"
  | "available";
function stockValue(e: EquipmentRow, k: StockSortKey): unknown {
  switch (k) {
    case "code":
      return e.code;
    case "name":
      return e.name;
    case "category":
      return e.category;
    case "total":
      return e.totalStock;
    case "rented":
      return e.rentedNow;
    case "repair":
      return e.repairCount;
    case "discard":
      return e.discardCount;
    case "available":
      return e.available;
  }
}

export function StockPanel({
  equipment,
  canEdit,
  onShowRentalsFor,
  onDetail,
  onEdit,
}: {
  equipment: EquipmentRow[];
  canEdit: boolean;
  onShowRentalsFor: (equipmentId: number) => void;
  onDetail: (id: number) => void;
  onEdit: (e: EquipmentRow | "new") => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortState<StockSortKey>>({
    key: "name",
    dir: "asc",
  });
  const [pending, start] = useTransition();
  const categories = useMemo(
    () =>
      [
        ...new Set(
          equipment.map((e) => e.category).filter((c): c is string => !!c),
        ),
      ].sort((a, b) => a.localeCompare(b, "ko")),
    [equipment],
  );
  // 필터 → 열 클릭 정렬 (기본: 이름 오름차순)
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return equipment
      .filter(
        (e) =>
          (!qq ||
            e.name.toLowerCase().includes(qq) ||
            (e.code ?? "").toLowerCase().includes(qq) ||
            (e.note ?? "").toLowerCase().includes(qq)) &&
          (!category || e.category === category),
      )
      .sort(
        (a, b) =>
          compareValues(
            stockValue(a, sort.key),
            stockValue(b, sort.key),
            sort.dir,
          ) || a.name.localeCompare(b.name, "ko"),
      );
  }, [equipment, q, category, sort]);

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input w-56 pl-8"
            placeholder="교구명·코드·비고 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input w-36"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">분류 전체</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-slate-500">{visible.length}종</span>
        {canEdit && (
          <button className="btn-primary ml-auto" onClick={() => onEdit("new")}>
            <Plus size={14} /> 교구 등록
          </button>
        )}
      </div>
      {/* 열 너비 고정: 정렬해도 표가 흔들리지 않게. 표는 자체 스크롤(머리글 고정) */}
      <div className="table-scroll max-h-[max(420px,calc(100dvh-350px))]">
        <table className="dense w-full min-w-[900px] table-fixed text-[13px]">
          <colgroup>
            <col className="w-[84px]" />
            <col className="w-[200px]" />
            <col className="w-[104px]" />
            <col className="w-[76px]" />
            <col className="w-[76px]" />
            <col className="w-[76px]" />
            <col className="w-[64px]" />
            <col className="w-[86px]" />
            <col />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr>
              <SortableTh col="code" sort={sort} onSort={setSort}>
                코드
              </SortableTh>
              <SortableTh col="name" sort={sort} onSort={setSort}>
                교구명
              </SortableTh>
              <SortableTh col="category" sort={sort} onSort={setSort}>
                분류
              </SortableTh>
              <SortableTh
                col="total"
                sort={sort}
                onSort={setSort}
                align="right"
              >
                총 보유
              </SortableTh>
              <SortableTh
                col="rented"
                sort={sort}
                onSort={setSort}
                align="right"
              >
                대여중
              </SortableTh>
              <SortableTh
                col="repair"
                sort={sort}
                onSort={setSort}
                align="right"
              >
                수리중
              </SortableTh>
              <SortableTh
                col="discard"
                sort={sort}
                onSort={setSort}
                align="right"
              >
                폐기
              </SortableTh>
              <SortableTh
                col="available"
                sort={sort}
                onSort={setSort}
                align="right"
              >
                사용 가능
              </SortableTh>
              <th className="text-left">비고</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  조건에 맞는 교구가 없습니다.
                </td>
              </tr>
            )}
            {visible.map((e) => (
              <tr
                key={e.id}
                className={`${e.available < 0 ? "bg-rose-50/60" : ""} ${e.isActive ? "" : "text-slate-400"}`}
              >
                <td className="overflow-hidden whitespace-nowrap text-slate-500">
                  {e.code ?? "-"}
                </td>
                <td className="overflow-hidden whitespace-nowrap font-medium">
                  <button
                    className="truncate hover:text-brand-700 hover:underline"
                    title="상세 보기 — 지금 누가 빌리고 있는지"
                    onClick={() => onDetail(e.id)}
                  >
                    {e.name}
                  </button>
                  {!e.isActive && (
                    <span className="ml-1 text-[11px]">(사용 안 함)</span>
                  )}
                </td>
                <td className="overflow-hidden whitespace-nowrap">
                  {e.category ?? <span className="text-slate-300">미분류</span>}
                </td>
                <td className="num">{e.totalStock}</td>
                <td className="num">
                  {e.rentedNow > 0 ? (
                    <button
                      className="text-amber-700 hover:underline"
                      title="이 교구의 대여중 기록 보기"
                      onClick={() => onShowRentalsFor(e.id)}
                    >
                      {e.rentedNow}
                    </button>
                  ) : (
                    <span className="text-slate-300">0</span>
                  )}
                </td>
                <td className="num">
                  {e.repairCount || <span className="text-slate-300">0</span>}
                </td>
                <td className="num">
                  {e.discardCount || <span className="text-slate-300">0</span>}
                </td>
                <td
                  className={`num font-semibold ${e.available < 0 ? "text-rose-700" : e.available === 0 ? "text-slate-400" : "text-brand-700"}`}
                  title={
                    e.available < 0
                      ? "대여·재고 수치가 안 맞습니다. 총 보유/수리중 또는 대여 기록을 확인하세요"
                      : undefined
                  }
                >
                  {e.available}
                </td>
                <td className="overflow-hidden">
                  <div className="truncate" title={e.note ?? ""}>
                    {e.note ?? ""}
                  </div>
                </td>
                <td className="whitespace-nowrap text-right">
                  {canEdit && (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        title="수정"
                        onClick={() => onEdit(e)}
                      >
                        <Pencil size={13} />
                      </button>
                      <ConfirmButton
                        disabled={pending}
                        onConfirm={() =>
                          start(async () => {
                            const r = await deleteEquipment(e.id);
                            r.ok
                              ? toast(`삭제했어요 · ${e.name}`)
                              : toast(r.error, "error");
                          })
                        }
                      />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] text-slate-500">
        총 보유·수리중·폐기는 여기서 직접 입력하고,{" "}
        <b>대여중은 대여 기록에서 자동 계산</b>됩니다. 사용 가능이 음수(붉은
        줄)면 총 보유·수리중 수치나 대여 기록 중 하나가 틀린 것이니 맞춰 주세요.
      </p>
    </div>
  );
}
