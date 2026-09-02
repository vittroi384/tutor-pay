/**
 * 교구 관리 (클라이언트) — 탭 2개.
 *  - 교구 현황: 종류별 총 보유/대여중/수리중/폐기/사용 가능 표 (열 클릭 정렬, 열 너비 고정),
 *    사용 가능이 음수면 붉게 표시(대여·재고 수치가 안 맞는 것), 교구 등록·수정·삭제 서랍
 *  - 대여 기록: 상태(대여중/반납)·교구·검색 필터 + 페이지, 대여 등록(여러 교구 한 번에),
 *    행에서 바로 반납 처리, 수정·삭제
 *  - 통계: 재고 구성·대여 추이·대여처 Top 등 차트 (EquipmentCharts.tsx)
 * 교구명을 클릭하면 상세 서랍: 재고 구성 바 + 지금 빌리고 있는 곳(반납 버튼) + 최근 이력.
 */
/** 교구 등록/수정 서랍 */
"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import type { EquipmentRow } from "@/lib/types";
import { saveEquipment, type EquipmentInput } from "./actions";

export function EquipmentForm({
  equipment: eq,
  categories,
  onClose,
}: {
  equipment: EquipmentRow | null;
  categories: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(eq?.name ?? "");
  const [code, setCode] = useState(eq?.code ?? "");
  const [category, setCategory] = useState(eq?.category ?? "");
  const [totalStock, setTotalStock] = useState(String(eq?.totalStock ?? 0));
  const [repairCount, setRepairCount] = useState(String(eq?.repairCount ?? 0));
  const [discardCount, setDiscardCount] = useState(
    String(eq?.discardCount ?? 0),
  );
  const [note, setNote] = useState(eq?.note ?? "");
  const [isActive, setIsActive] = useState(eq?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: EquipmentInput = {
      name,
      code: code.trim() || null,
      category: category.trim() || null,
      totalStock: Number(totalStock),
      repairCount: Number(repairCount),
      discardCount: Number(discardCount),
      note: note.trim() || null,
      isActive,
    };
    const r = await saveEquipment(eq?.id ?? null, input);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(eq ? `교구를 저장했어요 · ${name}` : `교구를 등록했어요 · ${name}`);
    onClose();
  };
  return (
    <Drawer
      open
      title={eq ? "교구 수정" : "교구 등록"}
      onClose={onClose}
      width="max-w-md"
      footer={
        <div className="flex items-center gap-2">
          <span className="mr-auto text-[12px] text-rose-600">{error}</span>
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={saving || !name.trim()}
          >
            저장
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">교구명 *</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 카미봇"
            />
          </div>
          <div>
            <label className="label">코드</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="예: ROB-005"
            />
          </div>
        </div>
        <div>
          <label className="label">분류</label>
          <input
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="equipment-categories"
            placeholder="예: 로봇류"
          />
          <datalist id="equipment-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">총 보유 *</label>
            <input
              type="number"
              min="0"
              className="input text-right"
              value={totalStock}
              onChange={(e) => setTotalStock(e.target.value)}
            />
          </div>
          <div>
            <label className="label">수리중</label>
            <input
              type="number"
              min="0"
              className="input text-right"
              value={repairCount}
              onChange={(e) => setRepairCount(e.target.value)}
            />
          </div>
          <div>
            <label className="label">폐기</label>
            <input
              type="number"
              min="0"
              className="input text-right"
              value={discardCount}
              onChange={(e) => setDiscardCount(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">비고</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 전시용 1개 포함"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />{" "}
          사용 중 (해제하면 새 대여 등록 목록에서 숨김)
        </label>
      </div>
    </Drawer>
  );
}

/* ---------------- 대여 기록 ---------------- */
