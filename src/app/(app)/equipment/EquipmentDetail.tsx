/** 교구 상세 서랍 — 재고 구성 띠그래프, 지금 빌리고 있는 곳(담당 강사 포함)·바로 반납, 최근 반납 이력 */
/**
 * 교구 관리 (클라이언트) — 탭 2개.
 *  - 교구 현황: 종류별 총 보유/대여중/수리중/폐기/사용 가능 표 (열 클릭 정렬, 열 너비 고정),
 *    사용 가능이 음수면 붉게 표시(대여·재고 수치가 안 맞는 것), 교구 등록·수정·삭제 서랍
 *  - 대여 기록: 상태(대여중/반납)·교구·검색 필터 + 페이지, 대여 등록(여러 교구 한 번에),
 *    행에서 바로 반납 처리, 수정·삭제
 *  - 통계: 재고 구성·대여 추이·대여처 Top 등 차트 (EquipmentCharts.tsx)
 * 교구명을 클릭하면 상세 서랍: 재고 구성 바 + 지금 빌리고 있는 곳(반납 버튼) + 최근 이력.
 */
/**
 * 교구 상세 서랍 — "지금 누가 빌리고 있는지"를 바로 보여준다.
 *  재고 구성 띠그래프 → 대여중 목록(대여처·수량·경과일·반납 버튼) → 최근 이력.
 */
"use client";

import { useState, useTransition } from "react";
import { CornerDownLeft, ExternalLink, Pencil } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { fmtDateShort } from "@/lib/format";
import type { EquipmentRentalRow, EquipmentRow } from "@/lib/types";
import { returnRental } from "./actions";
import { daysSince } from "./shared";

export function EquipmentDetail({
  equipment: e,
  rentals,
  today,
  canEdit,
  canReturn,
  onEdit,
  onShowAll,
  onClose,
}: {
  equipment: EquipmentRow | null;
  rentals: EquipmentRentalRow[];
  today: string;
  canEdit: boolean;
  canReturn: boolean; // 조회 전용도 true — 반납만 가능
  onEdit: (e: EquipmentRow) => void;
  onShowAll: (equipmentId: number) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  if (!e) return null;
  const open = rentals
    .filter((r) => !r.inDate)
    .sort((a, b) => (a.outDate < b.outDate ? -1 : 1));
  const history = rentals
    .filter((r) => r.inDate)
    .sort((a, b) => (a.inDate! > b.inDate! ? -1 : 1))
    .slice(0, 8);
  const seg = [
    { label: "사용 가능", value: Math.max(0, e.available), cls: "bg-teal-500" },
    { label: "대여중", value: e.rentedNow, cls: "bg-amber-400" },
    { label: "수리중", value: e.repairCount, cls: "bg-rose-400" },
    { label: "폐기", value: e.discardCount, cls: "bg-slate-300" },
  ];
  const segTotal = seg.reduce((a, s) => a + s.value, 0) || 1;
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
        ? toast(`반납 처리했어요 · ${r.renter} × ${r.quantity}`)
        : toast(res.error, "error");
    });
  };
  return (
    <Drawer
      open
      title={`${e.name} — 교구 상세`}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => onShowAll(e.id)}>
            <ExternalLink size={13} /> 대여 기록 전체 보기
          </button>
          {canEdit && (
            <button className="btn-secondary" onClick={() => onEdit(e)}>
              <Pencil size={13} /> 수정
            </button>
          )}
          <button className="btn-primary ml-auto" onClick={onClose}>
            닫기
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="text-[12.5px] text-slate-500">
          {e.code && <span className="mr-2">코드 {e.code}</span>}
          {e.category && <span className="mr-2">분류 {e.category}</span>}
          {!e.isActive && (
            <span className="mr-2 text-rose-600">사용 안 함</span>
          )}
          {e.note && <div className="mt-0.5 text-slate-600">{e.note}</div>}
        </div>

        {/* 재고 구성 띠그래프 */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-slate-700">재고 구성</span>
            <span className="text-slate-500">
              총 보유 <b className="text-slate-800">{e.totalStock}</b>개
            </span>
          </div>
          <div
            className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label="재고 구성"
          >
            {seg
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className={s.cls}
                  style={{ width: `${(s.value / segTotal) * 100}%` }}
                  title={`${s.label} ${s.value}개`}
                />
              ))}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-[12px]">
            {seg.map((s) => (
              <div key={s.label} className="rounded-md bg-slate-50 px-1 py-1.5">
                <div className="flex items-center justify-center gap-1 text-slate-500">
                  <span className={`h-2 w-2 rounded-full ${s.cls}`} /> {s.label}
                </div>
                <div
                  className={`text-[15px] font-semibold tabular-nums ${s.label === "사용 가능" ? (e.available < 0 ? "text-rose-700" : "text-brand-700") : "text-slate-800"}`}
                >
                  {s.label === "사용 가능" ? e.available : s.value}
                </div>
              </div>
            ))}
          </div>
          {e.available < 0 && (
            <p className="mt-1.5 text-[12px] text-rose-600">
              사용 가능이 음수입니다 — 총 보유·수리중 수치나 대여 기록 중 하나가
              틀렸으니 맞춰 주세요.
            </p>
          )}
        </div>

        {/* 지금 빌리고 있는 곳 */}
        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-slate-700">
            지금 빌리고 있는 곳{" "}
            <span className="font-normal text-slate-500">
              ({open.length}건 · {open.reduce((a, r) => a + r.quantity, 0)}개)
            </span>
          </div>
          {open.length === 0 ? (
            <p className="rounded-md bg-slate-50 px-3 py-4 text-center text-[13px] text-slate-500">
              지금 대여중인 곳이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-[13px]">
              {open.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-slate-800">
                        {r.renter}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-700">
                        ×{r.quantity}
                      </span>
                      {r.purpose && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600">
                          {r.purpose}
                        </span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-slate-500">
                      출고 {fmtDateShort(r.outDate)} ·{" "}
                      <span className="text-amber-700">
                        {daysSince(r.outDate, today)}일째
                      </span>
                      {r.lectureInstructorName && (
                        <span className="ml-1.5">
                          · {r.lectureRole} {r.lectureInstructorName}
                        </span>
                      )}
                      {r.note && (
                        <span className="ml-1.5 text-slate-400">{r.note}</span>
                      )}
                    </div>
                  </div>
                  {canReturn && (
                    <button
                      className="btn-secondary btn-sm shrink-0"
                      title="오늘 날짜로 반납 처리"
                      disabled={busyIds.has(r.id)}
                      onClick={() => runReturn(r)}
                    >
                      <CornerDownLeft size={12} /> 반납
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 최근 이력 */}
        {history.length > 0 && (
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-700">
              최근 반납 이력{" "}
              <span className="font-normal text-slate-500">
                (최근 {history.length}건)
              </span>
            </div>
            <ul className="divide-y divide-slate-100 text-[12.5px]">
              {history.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-1 py-1.5">
                  <span className="w-24 shrink-0 text-slate-500">
                    {fmtDateShort(r.outDate)} → {fmtDateShort(r.inDate!)}
                  </span>
                  <span className="truncate">
                    {r.renter}
                    {r.lectureInstructorName && (
                      <span className="ml-1 text-[11px] text-slate-400">
                        ({r.lectureInstructorName})
                      </span>
                    )}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums text-slate-600">
                    ×{r.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  );
}
