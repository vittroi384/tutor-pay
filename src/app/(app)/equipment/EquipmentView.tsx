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

import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import type { EquipmentRentalRow, EquipmentRow } from "@/lib/types";
import { EquipmentStats } from "./EquipmentCharts";
import { EquipmentDetail } from "./EquipmentDetail";
import { EquipmentForm } from "./EquipmentForm";
import { RentalsPanel } from "./RentalsPanel";
import type { RentalFilters, RentalInitial, Tab } from "./shared";
import { StockPanel } from "./StockPanel";

export function EquipmentView({
  equipment,
  rentals,
  renterOptions,
  today,
  canEdit,
  canReturn,
  initialTab,
  initial,
}: {
  equipment: EquipmentRow[];
  rentals: EquipmentRentalRow[];
  renterOptions: string[];
  today: string;
  canEdit: boolean;
  canReturn: boolean;
  initialTab: Tab;
  initial: RentalInitial;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // 대여 기록 필터·페이지·상세/수정 서랍을 여기(부모)서 관리 → 어느 탭에서든 상세를 열고, 닫으면 그 자리 그대로
  const [filters, setFilters] = useState<RentalFilters>({
    status: initial.status,
    equipmentId: initial.equipmentId,
    lectureId: initial.lectureId,
    purposes: initial.purposes,
    q: initial.q,
  });
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EquipmentRow | "new" | null>(null);
  useEffect(() => {
    setTab(initialTab);
    setFilters({
      status: initial.status,
      equipmentId: initial.equipmentId,
      lectureId: initial.lectureId,
      purposes: initial.purposes,
      q: initial.q,
    });
  }, [
    initialTab,
    initial.status,
    initial.equipmentId,
    initial.lectureId,
    initial.purposes,
    initial.q,
  ]);
  // 현재 탭·필터·페이지를 주소창에 반영(서버 요청 없이) → 강의↗ 등 다른 화면에 갔다가 '뒤로' 눌러도 보던 상태 그대로
  useEffect(() => {
    const sp = new URLSearchParams();
    if (tab !== "stock") sp.set("tab", tab);
    if (tab === "rentals") {
      if (filters.status !== "all") sp.set("status", filters.status);
      if (filters.equipmentId != null)
        sp.set("eq", String(filters.equipmentId));
      if (filters.lectureId != null) sp.set("lec", String(filters.lectureId));
      for (const v of filters.purposes) sp.append("pu", v);
      if (filters.q) sp.set("q", filters.q);
    }
    const qs = sp.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `/equipment?${qs}` : "/equipment",
    );
  }, [tab, filters]);
  const applyFilters = (next: RentalFilters) => setFilters(next);
  /** 다른 곳(현황 표·상세 서랍)에서 "이 교구의 대여만 보기" */
  const showRentalsFor = (
    equipmentId: number | null,
    status: RentalFilters["status"] = "all",
  ) => {
    applyFilters({
      status,
      equipmentId,
      lectureId: null,
      purposes: [],
      q: "",
    });
    setDetailId(null);
    setTab("rentals");
  };
  const detailEq =
    detailId != null
      ? (equipment.find((e) => e.id === detailId) ?? null)
      : null;
  const categories = [
    ...new Set(
      equipment.map((e) => e.category).filter((c): c is string => !!c),
    ),
  ].sort((a, b) => a.localeCompare(b, "ko"));

  const openRentals = rentals.filter((r) => !r.inDate);
  const negative = equipment.filter((e) => e.available < 0);
  const sum = (f: (e: EquipmentRow) => number) =>
    equipment.reduce((a, e) => a + f(e), 0);

  return (
    <>
      <SummaryStrip
        items={[
          {
            label: "등록 교구",
            value: `${equipment.filter((e) => e.isActive).length}종`,
            sub: equipment.some((e) => !e.isActive)
              ? `사용 안 함 ${equipment.filter((e) => !e.isActive).length}종`
              : undefined,
          },
          {
            label: "총 보유 수량",
            value: `${sum((e) => e.totalStock).toLocaleString()}개`,
          },
          {
            label: "대여중",
            value: `${sum((e) => e.rentedNow).toLocaleString()}개`,
            sub: `${openRentals.length}건`,
            tone: openRentals.length ? "amber" : "default",
            onClick: () => setTab("rentals"),
            title: "대여 기록 보기",
          },
          {
            label: "수리중",
            value: `${sum((e) => e.repairCount).toLocaleString()}개`,
          },
          {
            label: "폐기",
            value: `${sum((e) => e.discardCount).toLocaleString()}개`,
          },
          {
            label: "사용 가능",
            value: `${sum((e) => e.available).toLocaleString()}개`,
            tone: "brand",
          },
          {
            label: "수치 확인 필요",
            value: `${negative.length}종`,
            tone: negative.length ? "rose" : "default",
            title: negative.length
              ? "사용 가능이 음수인 교구 — 총 보유·수리중·대여 기록이 서로 안 맞습니다"
              : undefined,
          },
        ]}
      />
      <div className="no-print mb-3 inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-[13px]">
        <button
          className={`px-3 py-1.5 ${tab === "stock" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          onClick={() => setTab("stock")}
        >
          교구 현황 ({equipment.length})
        </button>
        <button
          className={`px-3 py-1.5 ${tab === "rentals" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          onClick={() => setTab("rentals")}
        >
          대여 기록 ({rentals.length})
        </button>
        <button
          className={`inline-flex items-center gap-1 px-3 py-1.5 ${tab === "stats" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          onClick={() => setTab("stats")}
        >
          <BarChart3 size={13} /> 통계
        </button>
      </div>
      {tab === "stock" && (
        <StockPanel
          equipment={equipment}
          canEdit={canEdit}
          onShowRentalsFor={(id) => showRentalsFor(id, "open")}
          onDetail={setDetailId}
          onEdit={setEditing}
        />
      )}
      {tab === "rentals" && (
        <RentalsPanel
          equipment={equipment}
          rentals={rentals}
          renterOptions={renterOptions}
          today={today}
          canEdit={canEdit}
          canReturn={canReturn}
          filters={filters}
          onFilters={applyFilters}
          onDetail={setDetailId}
        />
      )}
      {tab === "stats" && (
        <EquipmentStats equipment={equipment} rentals={rentals} today={today} />
      )}
      {editing && (
        <EquipmentForm
          equipment={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
      {detailId != null && (
        <EquipmentDetail
          equipment={detailEq}
          rentals={rentals.filter((r) => r.equipmentId === detailId)}
          today={today}
          canEdit={canEdit}
          canReturn={canReturn}
          onEdit={(e) => {
            setDetailId(null);
            setEditing(e);
          }}
          onShowAll={(id) => showRentalsFor(id, "all")}
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  );
}

/* ---------------- 교구 현황 ---------------- */
