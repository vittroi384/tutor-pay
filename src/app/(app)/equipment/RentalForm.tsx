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

import { useState } from "react";
import { Package } from "lucide-react";
import { Combobox } from "@/components/ui/Combobox";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import type { EquipmentRentalRow, EquipmentRow } from "@/lib/types";
import { createRentals, updateRental, type RentalUpdateInput } from "./actions";

const PURPOSES = ["교육(수업)", "강사 연구용", "타기관 대여용", "행사", "기타"];

/** 대여 등록 서랍 — 여러 교구를 한 번에 (교구 + 수량 줄 추가) */
export function RentalForm({
  equipment,
  renterOptions,
  today,
  onClose,
}: {
  equipment: EquipmentRow[];
  renterOptions: string[];
  today: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [renter, setRenter] = useState("");
  const [purpose, setPurpose] = useState("교육(수업)");
  const [outDate, setOutDate] = useState(today);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<
    { equipmentId: string; quantity: string }[]
  >([{ equipmentId: "", quantity: "1" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectable = equipment.filter((e) => e.isActive);
  const availOf = (id: string) =>
    equipment.find((e) => e.id === Number(id))?.available;
  const submit = async () => {
    setSaving(true);
    setError(null);
    const parsed = items
      .filter((it) => it.equipmentId)
      .map((it) => ({
        equipmentId: Number(it.equipmentId),
        quantity: Number(it.quantity),
      }));
    const r = await createRentals({
      renter,
      purpose: purpose.trim() || null,
      outDate,
      note: note.trim() || null,
      items: parsed,
    });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(`대여 ${parsed.length}건을 등록했어요 · ${renter}`);
    onClose();
  };
  return (
    <Drawer
      open
      title="교구 대여 등록"
      onClose={onClose}
      width="max-w-lg"
      footer={
        <div className="flex items-center gap-2">
          <span className="mr-auto text-[12px] text-rose-600">{error}</span>
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={
              saving || !renter.trim() || !items.some((it) => it.equipmentId)
            }
          >
            등록
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">대여처 * (기관 또는 사람)</label>
            <input
              className="input"
              value={renter}
              onChange={(e) => setRenter(e.target.value)}
              list="renter-options"
              placeholder="예: 강동초 / 강북심승현"
            />
            <datalist id="renter-options">
              {renterOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">용도</label>
            <select
              className="input"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              {/* 목록에 없는 기존 값(옛 기록 수정 시)은 그대로 보존해 보여준다 */}
              {!PURPOSES.includes(purpose) && purpose && (
                <option value={purpose}>{purpose}</option>
              )}
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">출고일 *</label>
          <input
            type="date"
            className="input w-auto"
            value={outDate}
            onChange={(e) => setOutDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">대여 교구 * (사용 가능 수량 안에서)</label>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Combobox
                    value={it.equipmentId}
                    onChange={(v) =>
                      setItems(
                        items.map((x, j) =>
                          j === i ? { ...x, equipmentId: v } : x,
                        ),
                      )
                    }
                    placeholder="교구 선택 또는 이름 검색"
                    options={selectable.map((e) => ({
                      value: String(e.id),
                      label: `${e.name} (가능 ${e.available})`,
                      keywords: e.name,
                      muted: e.available <= 0,
                    }))}
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  className="input w-20 text-right"
                  value={it.quantity}
                  onChange={(e) =>
                    setItems(
                      items.map((x, j) =>
                        j === i ? { ...x, quantity: e.target.value } : x,
                      ),
                    )
                  }
                  aria-label="수량"
                />
                {it.equipmentId &&
                  Number(it.quantity) > (availOf(it.equipmentId) ?? 0) && (
                    <span className="text-[11px] text-rose-600">
                      가능 {availOf(it.equipmentId)}개
                    </span>
                  )}
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  disabled={items.length === 1}
                  aria-label="줄 삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn-secondary btn-sm mt-2"
            onClick={() =>
              setItems([...items, { equipmentId: "", quantity: "1" }])
            }
          >
            <Package size={12} /> 교구 추가
          </button>
        </div>
        <div>
          <label className="label">비고</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 허브 2개, 멀티탭 1 포함"
          />
        </div>
      </div>
    </Drawer>
  );
}

/** 대여 수정 서랍 — 반납일을 비우면 다시 대여중이 된다 */
export function RentalEditForm({
  rental,
  equipment,
  renterOptions,
  onClose,
}: {
  rental: EquipmentRentalRow;
  equipment: EquipmentRow[];
  renterOptions: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [renter, setRenter] = useState(rental.renter);
  const [purpose, setPurpose] = useState(rental.purpose ?? "");
  const [equipmentId, setEquipmentId] = useState(String(rental.equipmentId));
  const [quantity, setQuantity] = useState(String(rental.quantity));
  const [outDate, setOutDate] = useState(rental.outDate);
  const [inDate, setInDate] = useState(rental.inDate ?? "");
  const [note, setNote] = useState(rental.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: RentalUpdateInput = {
      renter,
      purpose: purpose.trim() || null,
      equipmentId: Number(equipmentId),
      quantity: Number(quantity),
      outDate,
      inDate: inDate || null,
      note: note.trim() || null,
    };
    const r = await updateRental(rental.id, input);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast("대여 기록을 저장했어요");
    onClose();
  };
  return (
    <Drawer
      open
      title="대여 기록 수정"
      onClose={onClose}
      width="max-w-lg"
      footer={
        <div className="flex items-center gap-2">
          <span className="mr-auto text-[12px] text-rose-600">{error}</span>
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            저장
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">대여처 *</label>
            <input
              className="input"
              value={renter}
              onChange={(e) => setRenter(e.target.value)}
              list="renter-options-edit"
            />
            <datalist id="renter-options-edit">
              {renterOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label">용도</label>
            <select
              className="input"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            >
              {!PURPOSES.includes(purpose) && purpose && (
                <option value={purpose}>{purpose}</option>
              )}
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">교구 *</label>
            <select
              className="input"
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
            >
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">수량 *</label>
            <input
              type="number"
              min="1"
              className="input text-right"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">출고일 *</label>
            <input
              type="date"
              className="input"
              value={outDate}
              onChange={(e) => setOutDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">반납일 (비우면 대여중)</label>
            <input
              type="date"
              className="input"
              value={inDate}
              min={outDate}
              onChange={(e) => setInDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">비고</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </Drawer>
  );
}
