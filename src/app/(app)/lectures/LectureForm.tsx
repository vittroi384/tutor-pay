"use client";
/**
 * 강의 등록/수정/복제 서랍 폼.
 * - 등록: 여러 강사를 한 번에 배정(강사 1명 = 강의 1건), 강사별 역할·수동기입 단가
 * - 실시간 미리보기: 입력이 바뀔 때마다 calc.ts 로 단가·세전·세후를 계산해 강사별로 보여준다 (저장 시 서버가 같은 규칙으로 다시 계산)
 * - 기관/콘텐츠는 목록에서 고르거나 직접 입력(새 기관 자동 등록, 콘텐츠 별칭 자동 정규화)
 * - '저장 후 계속'으로 같은 조건의 다음 강의를 이어서 입력할 수 있다
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Package } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Combobox, type ComboOption } from "@/components/ui/Combobox";
import { GradeBadge } from "@/components/ui/Chips";
import {
  calcAmounts,
  findRateTable,
  isManualPayType,
  ROLES,
  type PayTypeRule,
  DEFAULT_TAX_TYPE,
  TAX_TYPES,
} from "@/lib/calc";
import { currentYm, fmtDateKo, fmtWon, todaySeoul } from "@/lib/format";
import type { EquipmentRow, LectureRow, MasterData } from "@/lib/types";
import {
  createLectures,
  updateLecture,
  type LectureCommonInput,
} from "./actions";
import { useToast } from "@/components/ui/Toast";

export type FormMode = "create" | "edit" | "copy";

type Assignment = {
  key: number;
  instructorId: number | null;
  role: string;
  manualPrice: string;
};

let seq = 1;

export function LectureForm({
  mode,
  lecture,
  ym,
  master,
  equipment,
  linkedRentals = 0,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  lecture: Partial<LectureRow> | null;
  ym: string;
  master: MasterData;
  equipment: EquipmentRow[];
  linkedRentals?: number;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { toast } = useToast();
  // 새 강의 기본 날짜: 이번 달이면 오늘, 다른 달을 보고 있으면 그 달 1일. 수정/복제는 원본 날짜
  const defaultDate =
    lecture?.date ?? (ym === currentYm() ? todaySeoul() : `${ym}-01`);
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(lecture?.startTime ?? "");
  const [endTime, setEndTime] = useState(lecture?.endTime ?? "");
  const [sessions, setSessions] = useState(
    lecture?.sessions != null ? String(lecture.sessions) : "",
  );
  const [headcount, setHeadcount] = useState(
    lecture?.headcount != null ? String(lecture.headcount) : "",
  );
  const [institution, setInstitution] = useState<string>(
    lecture?.institutionId ? String(lecture.institutionId) : "",
  );
  const [content, setContent] = useState(lecture?.content ?? "");
  const [payType, setPayType] = useState(lecture?.payType ?? "");
  const [isDone, setIsDone] = useState(
    mode === "copy" ? false : (lecture?.isDone ?? false),
  );
  const [isPaid, setIsPaid] = useState(
    mode === "copy" ? false : (lecture?.isPaid ?? false),
  );
  const [note, setNote] = useState(lecture?.note ?? "");
  // 교통비(원) — 기본 0, 수기 입력
  const [travelFee, setTravelFee] = useState(String(lecture?.travelFee ?? 0));
  // 세금 구분 — 기본 사업소득 3.3%, 필요할 때만 기타소득/비과세로 전환
  const [taxType, setTaxType] = useState<string>(
    lecture?.taxType ?? DEFAULT_TAX_TYPE,
  );
  // 강사 배정 목록: 등록 모드에서는 여러 명, 수정 모드에서는 1명(해당 강의의 강사) 고정
  const [assignments, setAssignments] = useState<Assignment[]>(() => [
    {
      key: seq++,
      instructorId: lecture?.instructorId ?? null,
      role: lecture?.role ?? "주강사",
      manualPrice:
        lecture?.manualPrice != null
          ? String(lecture.manualPrice)
          : lecture?.payType &&
              master.payTypes.find((p) => p.code === lecture.payType)?.manual &&
              lecture?.unitPrice
            ? String(lecture.unitPrice)
            : "",
    },
  ]);
  // 함께 빌려주는 교구 (선택) — 저장하면 교구 관리에 대여 기록이 생기고 이 강의와 연결된다
  const [eqItems, setEqItems] = useState<
    { equipmentId: string; quantity: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const institutionOptions: ComboOption[] = useMemo(
    () =>
      master.institutions.map((i) => ({
        value: String(i.id),
        label: i.name,
        hint: i.type,
        muted: !i.isActive,
        keywords: i.region ?? "",
      })),
    [master.institutions],
  );
  const contentOptions: ComboOption[] = useMemo(
    () =>
      master.contents
        .filter((c) => c.isActive)
        .map((c) => ({
          value: c.name,
          label: c.name,
          keywords: c.aliases.join(" "),
          hint: c.aliases.length ? c.aliases.slice(0, 3).join(", ") : undefined,
        })),
    [master.contents],
  );
  const instructorOptions: ComboOption[] = useMemo(
    () =>
      master.instructors.map((i) => ({
        value: String(i.id),
        label: i.isActive ? i.name : `${i.name} (out)`,
        hint: `${i.gradeCode ?? "미등록"} · ${i.region ?? "-"}`,
        muted: !i.isActive,
        keywords: `${i.gradeCode ?? "미등록"} ${i.region ?? ""}`,
      })),
    [master.instructors],
  );

  const selectedInstitution = master.institutions.find(
    (i) => String(i.id) === institution,
  );
  // 미리보기 계산: 강의 날짜에 맞는 단가표 버전을 골라 강사별 단가·세전·세후를 즉시 계산 (서버 저장 시 같은 규칙으로 재계산)
  // 지급유형 규칙(DB) — 단가 직접 입력 여부·역할 구분 여부
  const rules: PayTypeRule[] = master.payTypes.map((p) => ({
    code: p.code,
    roleBased: p.roleBased,
    manual: p.manual,
    sort: p.sort,
    isActive: p.isActive,
  }));
  const isManual = isManualPayType(payType, rules);
  const rateTable = findRateTable(master.rateTables, date);
  const sessionsNum = sessions.trim() === "" ? null : Number(sessions);

  const previews = assignments.map((a) => {
    const inst = master.instructors.find((i) => i.id === a.instructorId);
    const manual =
      a.manualPrice.trim() === ""
        ? null
        : Number(a.manualPrice.replace(/,/g, ""));
    const amt = calcAmounts(
      rateTable?.items ?? [],
      {
        gradeId: inst?.gradeId ?? null,
        payType: payType || null,
        role: a.role,
        manualPrice: manual,
        region: inst?.region ?? null,
        taxType,
        sessions: sessionsNum,
      },
      rules,
    );
    return { inst, manual, ...amt };
  });
  const total = previews.reduce(
    (s, p) => ({ gross: s.gross + p.grossAmount, net: s.net + p.netAmount }),
    { gross: 0, net: 0 },
  );

  // 서버 액션에 넘길 공통 입력값 조립 (숫자 문자열 → number/null 변환)
  const commonInput = (): LectureCommonInput => ({
    date,
    startTime: startTime || null,
    endTime: endTime || null,
    sessions: sessionsNum,
    headcount: headcount.trim() === "" ? null : Number(headcount),
    institutionId: selectedInstitution ? selectedInstitution.id : null,
    institutionName: selectedInstitution ? null : institution.trim() || null,
    content: content.trim() || null,
    payType: payType || null,
    isDone,
    isPaid,
    note: note.trim() || null,
    travelFee: Number(travelFee.replace(/,/g, "")) || 0,
    taxType,
  });

  // 저장 전 클라이언트 검증 (서버도 같은 규칙으로 다시 검증한다)
  const validate = (): string | null => {
    if (!date) return "날짜를 입력하세요.";
    if (!selectedInstitution && !institution.trim())
      return "기관을 선택하거나 직접 입력하세요.";
    if (!payType) return "지급유형을 선택하세요.";
    if (
      sessionsNum != null &&
      (Number.isNaN(sessionsNum) ||
        sessionsNum < 0 ||
        Math.round(sessionsNum * 2) !== sessionsNum * 2)
    )
      return "차시는 0.5 단위로 입력하세요.";
    // 강사를 안 골라도 등록 가능 — '미배정'으로 저장되고 목록에 ⚠ 로 표시됩니다
    const ids = assignments.map((a) => a.instructorId).filter(Boolean);
    if (new Set(ids).size !== ids.length)
      return "같은 강사가 두 번 배정되어 있어요.";
    if (
      isManual &&
      assignments.some(
        (a) =>
          (a.instructorId && a.manualPrice.trim() === "") ||
          Number.isNaN(Number(a.manualPrice.replace(/,/g, ""))),
      )
    )
      return "수동기입은 강사별 단가를 입력해야 합니다.";
    if (startTime && endTime && startTime > endTime)
      return "종료 시간이 시작 시간보다 빠릅니다.";
    return null;
  };

  // 저장. keepOpen=true("저장 후 계속")면 서랍을 닫지 않고 같은 조건으로 다음 강의 입력을 이어간다
  /** 교구 줄들 → 서버 입력 (선택 안 된 줄은 무시) */
  const parsedEqItems = () => {
    const items = eqItems
      .filter((it) => it.equipmentId)
      .map((it) => ({
        equipmentId: Number(it.equipmentId),
        quantity: Number(it.quantity) || 1,
      }));
    return items.length ? { equipmentItems: items } : {};
  };

  const submit = async (keepOpen: boolean) => {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setSaving(true);
    try {
      const instName = selectedInstitution?.name ?? institution.trim();
      if (mode === "edit" && lecture?.id) {
        const a = assignments[0];
        const r = await updateLecture(lecture.id, {
          ...commonInput(),
          ...parsedEqItems(),
          instructorId: a.instructorId ? Number(a.instructorId) : null,
          role: a.role,
          manualPrice:
            a.manualPrice.trim() === ""
              ? null
              : Number(a.manualPrice.replace(/,/g, "")),
        });
        if (!r.ok) return setError(r.error);
        const ek = parsedEqItems().equipmentItems?.length ?? 0;
        onSaved(
          `수정했어요 · ${fmtDateKo(date)} ${instName}${ek ? ` · 교구 대여 ${ek}건 추가` : ""}`,
        );
      } else {
        const r = await createLectures({
          ...commonInput(),
          ...parsedEqItems(),
          assignments: assignments.map((a) => ({
            instructorId: a.instructorId ? Number(a.instructorId) : null,
            role: a.role,
            manualPrice:
              a.manualPrice.trim() === ""
                ? null
                : Number(a.manualPrice.replace(/,/g, "")),
          })),
        });
        if (!r.ok) return setError(r.error);
        const ek = parsedEqItems().equipmentItems?.length ?? 0;
        const msg = `${r.data?.count ?? assignments.length}건 등록했어요 · ${fmtDateKo(date)} ${instName}${ek ? ` · 교구 대여 ${ek}건` : ""}`;
        if (keepOpen) toast(msg);
        else onSaved(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "edit"
      ? "강의 수정"
      : mode === "copy"
        ? "강의 복제 등록"
        : "강의 등록";

  return (
    <Drawer
      open
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center gap-2">
          <div className="mr-auto text-[12px] text-slate-500">
            {error ? (
              <span className="text-rose-600">{error}</span>
            ) : rateTable ? (
              `단가표 ${rateTable.effectiveFrom} 버전 적용`
            ) : (
              "적용할 단가표가 없습니다"
            )}
          </div>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            취소
          </button>
          {mode !== "edit" && (
            <button
              className="btn-secondary"
              onClick={() => submit(true)}
              disabled={saving}
              title="저장 후 폼을 유지해 날짜만 바꿔 계속 등록"
            >
              저장 후 계속
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => submit(false)}
            disabled={saving}
          >
            {saving
              ? "저장 중…"
              : mode === "edit"
                ? "변경 저장"
                : `${assignments.length}건 등록`}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-1 sm:col-span-2">
          <label className="label">날짜 *</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">시작</label>
          <TimeField value={startTime} onChange={setStartTime} />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">종료</label>
          <TimeField value={endTime} onChange={setEndTime} />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">차시 (0.5 단위)</label>
          <input
            type="number"
            step="0.5"
            min="0"
            className="input"
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
            placeholder="예: 2"
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">교육 인원</label>
          <input
            type="number"
            step="1"
            min="0"
            className="input"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            placeholder="명 (선택 입력)"
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">
            교통비 <span className="font-normal text-slate-400">(원)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            className="input text-right"
            value={travelFee}
            onChange={(e) =>
              setTravelFee(e.target.value.replace(/[^\d,]/g, ""))
            }
            onBlur={() =>
              setTravelFee(String(Number(travelFee.replace(/,/g, "")) || 0))
            }
            title="기본 0원 — 지급 시 세후 금액에 더해집니다 (세금 계산과 무관)"
          />
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">세금 구분</label>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {TAX_TYPES.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setTaxType(t.code)}
                className={`flex-1 rounded-md px-1 py-1.5 text-[12px] transition-colors ${
                  taxType === t.code
                    ? "bg-brand-500 font-semibold text-white"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
                title={t.label}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-1 sm:col-span-2">
          <label className="label">지급유형 *</label>
          <select
            className="input"
            value={payType}
            onChange={(e) => setPayType(e.target.value)}
          >
            <option value="">선택</option>
            {master.payTypes
              .filter((p) => p.isActive || p.code === payType) // 비활성 유형은 이미 그 값인 강의를 수정할 때만 보임
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code}
                  {p.manual ? " (단가 직접 입력)" : ""}
                  {!p.isActive ? " (사용 중지)" : ""}
                </option>
              ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="label">기관 * (목록 선택 또는 직접 입력)</label>
          <Combobox
            value={institution}
            onChange={setInstitution}
            options={institutionOptions}
            allowCustom
            placeholder="기관명 검색 또는 새 기관명 입력"
          />
          {!selectedInstitution && institution.trim() && (
            <div className="mt-1 text-[11px] text-amber-700">
              목록에 없는 기관 — 저장 시 새 기관으로 등록됩니다.
            </div>
          )}
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className="label">교육 콘텐츠</label>
          <Combobox
            value={content}
            onChange={setContent}
            options={contentOptions}
            allowCustom
            placeholder="콘텐츠 검색 (여러 개는 / 로 구분)"
          />
        </div>
        <div className="col-span-2 sm:col-span-6">
          <label className="label">
            교구 대여 (선택){" "}
            <span className="font-normal text-slate-400">
              — 저장하면 교구 관리에 대여 기록이 생기고 이 강의와 연결됩니다
              (대여처 = 기관, 출고일 = 강의 날짜)
            </span>
          </label>
          {mode === "edit" && linkedRentals > 0 && (
            <p className="mb-1.5 text-[12px] text-slate-600">
              이 강의와 연동된 대여 <b>{linkedRentals}건</b>이 있습니다 —{" "}
              <a
                href={`/equipment?tab=rentals&lec=${lecture?.id}`}
                className="text-brand-700 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                교구 관리에서 반납·수정
              </a>
              . 아래에서는 새 대여만 추가됩니다.
            </p>
          )}
          {eqItems.length > 0 && (
            <div className="mb-2 space-y-2">
              {eqItems.map((it, i) => {
                const avail = equipment.find(
                  (e) => e.id === Number(it.equipmentId),
                )?.available;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Combobox
                        value={it.equipmentId}
                        onChange={(v) =>
                          setEqItems(
                            eqItems.map((x, j) =>
                              j === i ? { ...x, equipmentId: v } : x,
                            ),
                          )
                        }
                        placeholder="교구 선택 또는 이름 검색"
                        options={equipment
                          .filter((e) => e.isActive)
                          .map((e) => ({
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
                        setEqItems(
                          eqItems.map((x, j) =>
                            j === i ? { ...x, quantity: e.target.value } : x,
                          ),
                        )
                      }
                      aria-label="수량"
                    />
                    {it.equipmentId && Number(it.quantity) > (avail ?? 0) && (
                      <span className="text-[11px] text-rose-600">
                        가능 {avail}개
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        setEqItems(eqItems.filter((_, j) => j !== i))
                      }
                      aria-label="줄 삭제"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() =>
              setEqItems([...eqItems, { equipmentId: "", quantity: "1" }])
            }
          >
            <Package size={12} /> 빌려준 교구 추가
          </button>
        </div>
        <div className="col-span-2 sm:col-span-6">
          <label className="label">비고</label>
          <textarea
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 일비 금액 맞추기 위해 운영시간과 차시가 다름"
          />
        </div>
        <div className="col-span-2 flex items-center gap-5 sm:col-span-6">
          <label className="inline-flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={isDone}
              onChange={(e) => setIsDone(e.target.checked)}
            />{" "}
            강의 완료
          </label>
          <label className="inline-flex items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
            />{" "}
            지급 완료
          </label>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-slate-700">
            {mode === "edit" ? "강사" : "강사 배정 (강사별로 1건씩 생성)"}
          </div>
          {mode !== "edit" && (
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                setAssignments([
                  ...assignments,
                  {
                    key: seq++,
                    instructorId: null,
                    role: assignments.length ? "보조강사" : "주강사",
                    manualPrice: "",
                  },
                ])
              }
            >
              <Plus size={13} /> 강사 추가
            </button>
          )}
        </div>
        <div className="space-y-2">
          {assignments.map((a, idx) => {
            const p = previews[idx];
            return (
              <div
                key={a.key}
                className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5"
              >
                <div className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="label">강사</label>
                    <Combobox
                      value={a.instructorId ? String(a.instructorId) : ""}
                      onChange={(v) =>
                        setAssignments(
                          assignments.map((x) =>
                            x.key === a.key
                              ? { ...x, instructorId: v ? Number(v) : null }
                              : x,
                          ),
                        )
                      }
                      options={instructorOptions}
                      placeholder="강사 검색"
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-3">
                    <label className="label">역할</label>
                    <select
                      className="input"
                      value={a.role}
                      onChange={(e) =>
                        setAssignments(
                          assignments.map((x) =>
                            x.key === a.key
                              ? { ...x, role: e.target.value }
                              : x,
                          ),
                        )
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isManual ? (
                    <div className="col-span-6 sm:col-span-3">
                      <label className="label">단가({payType}) *</label>
                      <input
                        type="number"
                        step="1000"
                        min="0"
                        className="input"
                        value={a.manualPrice}
                        onChange={(e) =>
                          setAssignments(
                            assignments.map((x) =>
                              x.key === a.key
                                ? { ...x, manualPrice: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="원"
                      />
                    </div>
                  ) : (
                    <div className="col-span-6 pb-1.5 text-[12px] text-slate-500 sm:col-span-3">
                      {p.inst ? (
                        <span>
                          <GradeBadge gradeCode={p.inst.gradeCode} full /> ·{" "}
                          {payType || "지급유형?"} · {a.role}
                        </span>
                      ) : (
                        <span>강사를 선택하면 단가가 계산돼요</span>
                      )}
                    </div>
                  )}
                  <div className="col-span-1 pb-0.5 text-right">
                    {mode !== "edit" && assignments.length > 1 && (
                      <button
                        className="btn-ghost btn-sm text-rose-600"
                        onClick={() =>
                          setAssignments(
                            assignments.filter((x) => x.key !== a.key),
                          )
                        }
                        aria-label="강사 제거"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-col gap-0.5 text-[12px] tabular-nums sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-slate-500">
                    {p.inst?.gradeCode == null &&
                      p.inst &&
                      payType &&
                      !isManual &&
                      payType !== "기관지급" && (
                        <span className="mr-2 text-rose-600">
                          ⚠ 등급 미등록 강사 — 단가 0
                        </span>
                      )}
                    단가 {fmtWon(p.unitPrice)} × {sessionsNum ?? "?"}차시 = 세전{" "}
                    {fmtWon(p.grossAmount)}
                  </span>
                  <span>
                    세후 <b>{fmtWon(p.netAmount)}</b>{" "}
                    <span className="text-slate-400">
                      (원천징수 {fmtWon(p.withholding)})
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {assignments.length > 1 && (
          <div className="mt-2 flex justify-end gap-4 text-[13px] tabular-nums">
            <span>
              세전 합계 <b>{fmtWon(total.gross)}</b>
            </span>
            <span>
              세후 합계 <b className="text-brand-700">{fmtWon(total.net)}</b>
            </span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

/**
 * 24시간제 시간 입력 — 직접 타이핑(예: 930 → 09:30, 1425 → 14:25)과
 * ▾ 클릭 선택(분은 5분 단위) 둘 다 지원. 빈 값 허용.
 */
function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  /** "9", "930", "9:30", "14시25" 등 자유 입력을 HH:MM 으로 정규화 (실패 시 null) */
  const parse = (raw: string): string | null => {
    const t = raw.trim();
    if (t === "") return "";
    const d = t.replace(/[^0-9]/g, "");
    let h = 0;
    let m = 0;
    if (t.includes(":") || /[시]/.test(t)) {
      const [a, b = "0"] = t.split(/[:시]/);
      h = Number(a.replace(/[^0-9]/g, ""));
      m = Number(b.replace(/[^0-9]/g, "") || "0");
    } else if (d.length <= 2) {
      h = Number(d);
    } else if (d.length === 3) {
      h = Number(d.slice(0, 1));
      m = Number(d.slice(1));
    } else {
      h = Number(d.slice(0, 2));
      m = Number(d.slice(2, 4));
    }
    if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const commit = (raw: string) => {
    const v = parse(raw);
    if (v === null)
      setText(value); // 못 알아들으면 원래 값으로 되돌림
    else {
      setText(v);
      onChange(v);
    }
  };
  const [selH, selM] = value ? value.split(":") : ["", ""];
  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-center">
        <input
          className="input rounded-r-none"
          placeholder="예: 14:30"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
          }}
        />
        <button
          type="button"
          className="input w-9 shrink-0 rounded-l-none border-l-0 px-0 text-slate-500 hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
          aria-label="시간 선택 열기"
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="absolute z-30 mt-1 flex w-40 rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-52 flex-1 overflow-auto p-1 text-center text-[13px]">
            {Array.from({ length: 24 }, (_, i) =>
              String(i).padStart(2, "0"),
            ).map((h) => (
              <li key={h}>
                <button
                  type="button"
                  className={`w-full rounded px-1 py-1 hover:bg-slate-100 ${h === selH ? "bg-brand-50 font-semibold text-brand-700" : ""}`}
                  onClick={() => {
                    const v = `${h}:${selM || "00"}`;
                    setText(v);
                    onChange(v);
                  }}
                >
                  {h}시
                </button>
              </li>
            ))}
          </ul>
          <ul className="max-h-52 flex-1 overflow-auto border-l border-slate-100 p-1 text-center text-[13px]">
            {Array.from({ length: 12 }, (_, i) =>
              String(i * 5).padStart(2, "0"),
            ).map((m) => (
              <li key={m}>
                <button
                  type="button"
                  className={`w-full rounded px-1 py-1 hover:bg-slate-100 ${m === selM ? "bg-brand-50 font-semibold text-brand-700" : ""}`}
                  onClick={() => {
                    const v = `${selH || "09"}:${m}`;
                    setText(v);
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  {m}분
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
