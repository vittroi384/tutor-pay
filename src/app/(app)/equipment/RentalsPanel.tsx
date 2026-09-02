/** 대여 기록 탭 — 전체 대여 표(상태/교구/검색/강의 필터, 정렬), 행에서 반납, [전체 보기] 원클릭 초기화 */
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

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  CornerDownLeft,
  FilterX,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  SortableTh,
  compareValues,
  type SortState,
} from "@/components/ui/SortableTh";
import { useToast } from "@/components/ui/Toast";
import { fmtDateShort } from "@/lib/format";
import type { EquipmentRentalRow, EquipmentRow } from "@/lib/types";
import { deleteRental, returnRental } from "./actions";
import { RentalEditForm, RentalForm } from "./RentalForm";
import {
  daysSince,
  rentalValue,
  type RentalFilters,
  type RentalSortKey,
} from "./shared";

export function RentalsPanel({
  equipment,
  rentals,
  renterOptions,
  today,
  canEdit,
  canReturn,
  filters,
  onFilters,
  onDetail,
}: {
  equipment: EquipmentRow[];
  rentals: EquipmentRentalRow[];
  renterOptions: string[];
  today: string;
  canEdit: boolean;
  canReturn: boolean; // 조회 전용도 true — 반납 버튼만 노출
  filters: RentalFilters;
  onFilters: (f: RentalFilters) => void;
  onDetail: (equipmentId: number) => void;
}) {
  const { toast } = useToast();
  const { status, equipmentId, lectureId, purposes, q } = filters;
  const [sort, setSort] = useState<SortState<RentalSortKey>>({
    key: "outDate",
    dir: "desc",
  });
  const [drawer, setDrawer] = useState<"new" | EquipmentRentalRow | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [, start] = useTransition();

  // 용도별 보기 옵션 — 실제 기록에 있는 용도들
  const purposeOptions = useMemo(
    () =>
      [...new Set(rentals.map((r) => r.purpose ?? "").filter(Boolean))].sort(
        (x, y) => x.localeCompare(y, "ko"),
      ),
    [rentals],
  );
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rentals
      .filter((r) => {
        if (status === "open" && r.inDate) return false;
        if (status === "returned" && !r.inDate) return false;
        if (equipmentId != null && r.equipmentId !== equipmentId) return false;
        if (lectureId != null && r.lectureId !== lectureId) return false;
        if (purposes.length > 0 && !purposes.includes(r.purpose ?? ""))
          return false;
        if (
          qq &&
          ![r.renter, r.purpose ?? "", r.note ?? "", r.equipmentName].some(
            (s) => s.toLowerCase().includes(qq),
          )
        )
          return false;
        return true;
      })
      .sort(
        (a, b) =>
          compareValues(
            rentalValue(a, sort.key),
            rentalValue(b, sort.key),
            sort.dir,
          ) || b.id - a.id,
      );
  }, [rentals, status, equipmentId, lectureId, purposes, q, sort]);

  const totalQty = visible.reduce((a, r) => a + r.quantity, 0);

  const runReturn = (r: EquipmentRentalRow) => {
    setBusyIds((s) => new Set(s).add(r.id));
    start(async () => {
      const res = await returnRental(r.id, today);
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(r.id);
        return n;
      });
      res.ok
        ? toast(`반납 처리했어요 · ${r.equipmentName} × ${r.quantity}`)
        : toast(res.error, "error");
    });
  };

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input w-52 pl-8"
            placeholder="대여처·용도·비고 검색"
            value={q}
            onChange={(e) => onFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <select
          className="input w-28"
          value={status}
          onChange={(e) =>
            onFilters({
              ...filters,
              status: e.target.value as RentalFilters["status"],
            })
          }
        >
          <option value="all">상태 전체</option>
          <option value="open">대여중</option>
          <option value="returned">반납완료</option>
        </select>
        <select
          className="input w-44"
          value={equipmentId ?? ""}
          onChange={(e) =>
            onFilters({
              ...filters,
              equipmentId: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">교구 전체</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <PurposeMultiFilter
          options={purposeOptions}
          selected={purposes}
          onChange={(next) => onFilters({ ...filters, purposes: next })}
        />
        {lectureId != null && (
          <button
            className="chip bg-teal-50 text-teal-800 ring-teal-200 hover:bg-teal-100"
            onClick={() => onFilters({ ...filters, lectureId: null })}
            title="강의 연동 필터 해제"
          >
            강의 #{lectureId} 연동만 ×
          </button>
        )}
        {(status !== "all" ||
          equipmentId != null ||
          lectureId != null ||
          purposes.length > 0 ||
          q.trim() !== "") && (
          <button
            className="btn-secondary btn-sm"
            onClick={() =>
              onFilters({
                status: "all",
                equipmentId: null,
                lectureId: null,
                purposes: [],
                q: "",
              })
            }
            title="검색·상태·교구·강의 필터를 모두 해제하고 전체 기록 보기"
          >
            <FilterX size={13} /> 전체 보기
          </button>
        )}
        <span className="text-[12px] text-slate-500">
          {visible.length}건 · {totalQty.toLocaleString()}개
        </span>
        {canEdit && (
          <button
            className="btn-primary ml-auto"
            onClick={() => setDrawer("new")}
          >
            <Plus size={14} /> 대여 등록
          </button>
        )}
      </div>
      <div className="table-scroll max-h-[max(420px,calc(100dvh-306px))]">
        <table className="dense w-full min-w-[940px] table-fixed text-[13px]">
          <colgroup>
            <col className="w-[80px]" />
            <col className="w-[140px]" />
            <col className="w-[104px]" />
            <col className="w-[180px]" />
            <col className="w-[56px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[148px]" />
          </colgroup>
          <thead>
            <tr>
              <SortableTh col="outDate" sort={sort} onSort={setSort}>
                출고일
              </SortableTh>
              <SortableTh col="renter" sort={sort} onSort={setSort}>
                대여처
              </SortableTh>
              <th className="text-left">용도</th>
              <SortableTh col="equipment" sort={sort} onSort={setSort}>
                교구
              </SortableTh>
              <SortableTh
                col="quantity"
                sort={sort}
                onSort={setSort}
                align="right"
              >
                수량
              </SortableTh>
              <SortableTh col="status" sort={sort} onSort={setSort}>
                상태
              </SortableTh>
              <th className="text-left">비고</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  조건에 맞는 대여 기록이 없습니다.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className={r.inDate ? "" : "bg-amber-50/40"}>
                <td className="whitespace-nowrap">{fmtDateShort(r.outDate)}</td>
                <td className="overflow-hidden">
                  <div className="truncate font-medium" title={r.renter}>
                    {r.renter}
                  </div>
                  {r.lectureInstructorName && (
                    <div
                      className="truncate text-[11px] leading-tight text-slate-500"
                      title={`연동 강의 담당: ${r.lectureRole} ${r.lectureInstructorName}`}
                    >
                      {r.lectureRole} {r.lectureInstructorName}
                    </div>
                  )}
                </td>
                <td className="overflow-hidden whitespace-nowrap text-[12px] text-slate-600">
                  <span className="truncate" title={r.purpose ?? ""}>
                    {r.purpose ?? "-"}
                  </span>
                  {r.lectureId != null && (
                    <Link
                      href={`/lectures?date=${r.outDate}`}
                      className="ml-1 align-middle text-[10.5px] text-teal-700 hover:underline"
                      title="연동된 강의 보기 (해당 날짜 강의배정으로 이동)"
                    >
                      강의↗
                    </Link>
                  )}
                </td>
                <td className="overflow-hidden whitespace-nowrap">
                  <button
                    className="truncate hover:text-brand-700 hover:underline"
                    title="교구 상세 보기 — 닫으면 이 목록 그대로"
                    onClick={() => onDetail(r.equipmentId)}
                  >
                    {r.equipmentName}
                  </button>
                </td>
                <td className="num">{r.quantity}</td>
                <td className="whitespace-nowrap">
                  {r.inDate ? (
                    <span
                      className="text-[12px] text-slate-500"
                      title={`반납일 ${r.inDate}`}
                    >
                      반납 {fmtDateShort(r.inDate)}
                    </span>
                  ) : (
                    <span
                      className="chip bg-amber-50 text-amber-800 ring-amber-200"
                      title={`출고 ${r.outDate}`}
                    >
                      대여중 {daysSince(r.outDate, today)}일째
                    </span>
                  )}
                </td>
                <td className="overflow-hidden">
                  <div className="truncate" title={r.note ?? ""}>
                    {r.note ?? ""}
                  </div>
                </td>
                <td className="whitespace-nowrap text-right">
                  {canReturn && !r.inDate && (
                    <button
                      className="btn-secondary btn-sm"
                      title="오늘 날짜로 반납 처리"
                      disabled={busyIds.has(r.id)}
                      onClick={() => runReturn(r)}
                    >
                      <CornerDownLeft size={12} /> 반납
                    </button>
                  )}
                  {canEdit && (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        title="수정"
                        onClick={() => setDrawer(r)}
                      >
                        <Pencil size={13} />
                      </button>
                      <ConfirmButton
                        disabled={busyIds.has(r.id)}
                        onConfirm={() =>
                          start(async () => {
                            const res = await deleteRental(r.id);
                            res.ok
                              ? toast("대여 기록을 삭제했어요")
                              : toast(res.error, "error");
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
      {drawer === "new" && (
        <RentalForm
          equipment={equipment}
          renterOptions={renterOptions}
          today={today}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer && drawer !== "new" && (
        <RentalEditForm
          rental={drawer}
          equipment={equipment}
          renterOptions={renterOptions}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

/** 용도 다중 선택 필터 — 체크한 용도들만 표시(아무것도 안 고르면 전체). 바깥 클릭으로 닫힘 */
function PurposeMultiFilter({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const toggle = (p: string) =>
    onChange(
      selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p],
    );
  // 체크된 값이 기록에 없어도(주소로 진입 등) 목록에 보여 해제할 수 있게
  const all = [...new Set([...options, ...selected])].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const label =
    selected.length === 0
      ? "용도 전체"
      : selected.length === 1
        ? selected[0]
        : `용도 ${selected.length}개`;
  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className={`input flex w-40 items-center justify-between gap-1 text-left ${selected.length ? "border-brand-300 bg-brand-50/40" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="용도별 보기 — 여러 개 체크 가능"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
          {all.length === 0 && (
            <div className="px-2 py-1.5 text-[12px] text-slate-400">
              기록된 용도가 없습니다
            </div>
          )}
          {all.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="accent-brand-500"
                checked={selected.includes(p)}
                onChange={() => toggle(p)}
              />
              <span className="truncate">{p}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              className="mt-1 w-full rounded border-t border-slate-100 px-2 pt-1.5 pb-0.5 text-left text-[12px] text-slate-500 hover:text-slate-700"
              onClick={() => onChange([])}
            >
              전체 해제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
