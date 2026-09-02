"use client";
/**
 * 등급별 단가표 (클라이언트)
 *  - 왼쪽: 버전 목록(적용 시작일)·현재 버전 표시, 새 버전 추가
 *  - 오른쪽 위: 선택한 버전의 단가표 (행 = 등급, 열 = 지급유형×역할). 이전 버전과 다른 칸 강조
 *  - 아래: 지급유형 관리(열의 종류 추가·이름·색·역할 구분·직접 입력·사용 중지)와 등급 관리(행 추가·이름·색)
 * 기존 강의는 스냅샷이라 새 버전·새 유형의 영향을 받지 않는다.
 */
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { useToast } from "@/components/ui/Toast";
import { GradeBadge, PayTypeChip } from "@/components/ui/Chips";
import { findRateTable, rateColumns, type RateColumn } from "@/lib/calc";
import { CHIP_COLORS } from "@/lib/constants";
import { fmtWon } from "@/lib/format";
import type { Grade, PayTypeMeta, RateItem, RateTable } from "@/lib/types";
import {
  createGrade,
  createPayType,
  createRateTable,
  deleteGrade,
  deletePayType,
  deleteRateTable,
  movePayType,
  updateGrade,
  updatePayType,
  type GradeInput,
  type PayTypeInput,
} from "./actions";

/** 특정 버전에서 등급 × 열(지급유형·역할)의 칸 (없으면 undefined). regionGroup 지정 시 그 그룹 칸 */
function itemOf(
  items: RateItem[],
  gradeId: number,
  col: RateColumn,
  regionGroup: string | null = null,
) {
  return items.find(
    (i) =>
      i.gradeId === gradeId &&
      i.payType === col.payType &&
      (i.role ?? null) === col.role &&
      (i.regionGroup ?? null) === regionGroup,
  );
}
function amountOf(items: RateItem[], gradeId: number, col: RateColumn) {
  return itemOf(items, gradeId, col)?.amount ?? 0;
}
/** 셀 표시: 구간형이면 두 줄로 "50,000 / 3차시~ 30,000". 이후 단가가 기본과 같으면 일괄로 취급 */
function RateCellValue({ item }: { item: RateItem | undefined }) {
  if (!item) return <>0</>;
  if (item.amountAfter == null || item.amountAfter === item.amount)
    return <>{fmtWon(item.amount)}</>;
  const from = (item.tierLimit ?? 2) + 1;
  return (
    <div className="leading-tight">
      {fmtWon(item.amount)}
      <div className="text-[11px] font-normal whitespace-nowrap text-slate-500">
        {from}차시~ {fmtWon(item.amountAfter)}
      </div>
    </div>
  );
}

const toRules = (payTypes: PayTypeMeta[]) =>
  payTypes.map((p) => ({
    code: p.code,
    roleBased: p.roleBased,
    manual: p.manual,
    sort: p.sort,
    isActive: p.isActive,
  }));

export function RatesView({
  grades,
  tables,
  payTypes,
  payTypeUsage,
  gradeUsage,
  today,
  canEdit,
}: {
  grades: Grade[];
  tables: RateTable[];
  payTypes: PayTypeMeta[];
  payTypeUsage: Record<string, number>;
  gradeUsage: Record<number, number>;
  today: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const current = findRateTable(tables, today);
  const [selectedId, setSelectedId] = useState<number | null>(
    current?.id ?? tables[0]?.id ?? null,
  );
  const [creating, setCreating] = useState(false);
  const selected = tables.find((t) => t.id === selectedId) ?? tables[0];
  const sorted = useMemo(
    () =>
      [...tables].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1)),
    [tables],
  );
  const prev = selected
    ? sorted.find((t) => t.effectiveFrom < selected.effectiveFrom)
    : undefined;
  const columns = useMemo(
    () => rateColumns(toRules(payTypes), true),
    [payTypes],
  );
  const activeColumns = useMemo(
    () => rateColumns(toRules(payTypes), false),
    [payTypes],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_1fr]">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
            <div className="text-[13px] font-semibold text-slate-700">
              버전 ({tables.length})
            </div>
            {canEdit && (
              <button
                className="btn-primary btn-sm"
                onClick={() => setCreating(true)}
                disabled={!selected}
              >
                <Plus size={13} /> 새 버전
              </button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {sorted.map((t) => (
              <li key={t.id}>
                <button
                  className={`flex w-full flex-col items-start px-3 py-2 text-left hover:bg-slate-50 ${selected?.id === t.id ? "bg-brand-50" : ""}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span className="text-[13px] font-medium text-slate-800">
                    {t.effectiveFrom} 적용
                    {current?.id === t.id && (
                      <span className="ml-1.5 rounded bg-brand-500 px-1.5 py-0.5 text-[10px] text-slate-900">
                        현재
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t.memo ?? "메모 없음"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card overflow-x-auto">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
                <div className="text-[13px] font-semibold text-slate-700">
                  {selected.effectiveFrom} 적용 단가표 (원)
                </div>
                <div className="text-[12px] text-slate-500">
                  {selected.memo}
                </div>
                {prev && (
                  <div className="text-[12px] text-amber-700">
                    이전 버전({prev.effectiveFrom})과 다른 칸은 강조 표시
                  </div>
                )}
                {canEdit && tables.length > 1 && (
                  <div className="ml-auto">
                    <ConfirmButton
                      label="이 버전 삭제"
                      onConfirm={async () => {
                        const r = await deleteRateTable(selected.id);
                        if (r.ok) {
                          toast("단가표 버전을 삭제했어요");
                          setSelectedId(null);
                        } else toast(r.error, "error");
                      }}
                    />
                  </div>
                )}
              </div>
              <table className="dense w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr>
                    <th className="text-left">등급</th>
                    {columns.map((c) => {
                      const meta = payTypes.find((p) => p.code === c.payType);
                      return (
                        <th
                          key={c.key}
                          className={`text-right ${meta && !meta.isActive ? "text-slate-400" : ""}`}
                          title={
                            meta && !meta.isActive
                              ? "사용 중지된 유형 (과거 단가 참고용)"
                              : undefined
                          }
                        >
                          {c.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {selected.items.some((i) => i.regionGroup) && (
                    <tr className="bg-sky-50/60">
                      <td className="whitespace-nowrap font-medium text-sky-800">
                        강릉·동해 강사
                        <span className="ml-1 text-[11px] font-normal text-sky-600">
                          전 등급 공통 · 일괄
                        </span>
                      </td>
                      {columns.map((c) => {
                        const it = itemOf(
                          selected.items,
                          grades[0]?.id ?? 0,
                          c,
                          "강릉·동해",
                        );
                        return (
                          <td key={c.key} className="num text-sky-900">
                            {it ? (
                              <RateCellValue item={it} />
                            ) : (
                              <span className="text-slate-300">〃</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  {grades.map((g) => (
                    <tr key={g.id}>
                      <td className="whitespace-nowrap font-medium">
                        <GradeBadge gradeCode={g.code} full />{" "}
                        <span className="ml-1 text-[11px] font-normal text-slate-500">
                          {g.label !== g.code ? g.label : ""}
                        </span>
                      </td>
                      {columns.map((c) => {
                        const it = itemOf(selected.items, g.id, c);
                        const v = it?.amount ?? 0;
                        const pv = prev ? amountOf(prev.items, g.id, c) : v;
                        return (
                          <td
                            key={c.key}
                            className={`num ${v !== pv ? "bg-amber-50 font-semibold text-amber-800" : ""}`}
                            title={v !== pv ? `이전: ${fmtWon(pv)}` : undefined}
                          >
                            <RateCellValue item={it} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-[12px] text-slate-500">
                단가 결정: 역할 구분 유형(관내·관외·아코센터 등)은
                주강사/보조강사 열, 역할 무관 유형(기관지급·주말교육·교구정리
                등)은 한 열, 단가 직접 입력 유형(수동기입)은 강의 등록 시
                강사별로 입력. 등급 미등록 강사는 단가 0. 강의 저장 시{" "}
                <b>강의 날짜</b>에 적용 중인 버전(적용 시작일 ≤ 강의일 중
                최신)을 씁니다. 새 지급유형·새 등급을 추가하면 이 표에 열/행이
                생기고, 금액은 <b>새 버전을 추가</b>해서 채웁니다.
              </p>
            </>
          ) : (
            <div className="p-8 text-center text-slate-500">
              단가표가 없습니다. 새 버전을 추가하세요.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PayTypesPanel
          payTypes={payTypes}
          usage={payTypeUsage}
          canEdit={canEdit}
        />
        <GradesPanel grades={grades} usage={gradeUsage} canEdit={canEdit} />
      </div>

      {creating && selected && (
        <NewVersionForm
          grades={grades}
          base={selected}
          columns={activeColumns}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/** 새 버전 추가 서랍 — 선택된 버전 값을 기본으로 채우고 바뀐 칸만 강조 */
function NewVersionForm({
  grades,
  base,
  columns,
  onClose,
}: {
  grades: Grade[];
  base: RateTable;
  columns: RateColumn[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [memo, setMemo] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const g of grades)
      for (const c of columns)
        v[`${g.id}|${c.key}`] = String(amountOf(base.items, g.id, c));
    return v;
  });
  // '3차시부터' 단가(구간) — 비워두면 전 차시 동일
  const [after, setAfter] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const g of grades)
      for (const c of columns) {
        const it = itemOf(base.items, g.id, c);
        v[`${g.id}|${c.key}`] =
          it?.amountAfter != null ? String(it.amountAfter) : "";
      }
    return v;
  });
  // 강릉·동해 공통 행(전 등급 동일·일괄) — 비워두면 그룹 칸 없이 기본 단가 사용
  const [gd, setGd] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const c of columns) {
      const it = itemOf(base.items, grades[0]?.id ?? 0, c, "강릉·동해");
      v[c.key] = it ? String(it.amount) : "";
    }
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    const items: RateItem[] = [];
    for (const g of grades)
      for (const c of columns) {
        const key = `${g.id}|${c.key}`;
        const af = (after[key] ?? "").replace(/,/g, "").trim();
        items.push({
          gradeId: g.id,
          payType: c.payType,
          role: c.role,
          amount: Number((values[key] ?? "0").replace(/,/g, "")) || 0,
          amountAfter: af === "" ? null : Number(af) || 0,
          tierLimit: af === "" ? null : 2,
        });
        // 강릉·동해 공통 값이 입력된 열은 전 등급에 같은 그룹 칸 생성
        const gv = (gd[c.key] ?? "").replace(/,/g, "").trim();
        if (gv !== "")
          items.push({
            gradeId: g.id,
            payType: c.payType,
            role: c.role,
            amount: Number(gv) || 0,
            regionGroup: "강릉·동해",
          });
      }
    const r = await createRateTable({
      effectiveFrom,
      memo: memo.trim() || null,
      items,
    });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(`단가표 새 버전을 추가했어요 · ${effectiveFrom} 적용`);
    onClose();
  };
  return (
    <Drawer
      open
      title="단가표 새 버전 추가"
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <div className="flex items-center gap-2">
          <span className="mr-auto text-[12px] text-rose-600">{error}</span>
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            버전 추가
          </button>
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div>
          <label className="label">적용 시작일 *</label>
          <input
            type="date"
            className="input"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className="label">메모</label>
          <input
            className="input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 2027년 1월 단가 인상 / 방과후 유형 단가 신설"
          />
        </div>
      </div>
      <p className="mb-2 text-[12px] text-slate-500">
        {base.effectiveFrom} 버전의 값을 기본으로 채웠습니다. 각 칸의 위 칸 =
        기본 단가(1~2차시), 아래 칸 = 3차시부터(비우면 전 차시 동일). 맨 윗줄
        강릉·동해는 전 등급 공통 일괄값입니다. (사용 중지된 유형은 제외)
      </p>
      <div className="overflow-x-auto">
        <table className="dense w-full min-w-[1360px] text-[12.5px]">
          <thead>
            <tr>
              <th className="text-left">등급</th>
              {columns.map((c) => (
                <th key={c.key} className="text-right">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-sky-50/60">
              <td className="whitespace-nowrap font-medium text-sky-800">
                강릉·동해
                <div className="text-[10px] font-normal text-sky-600">
                  전 등급 공통 · 일괄 (비우면 미사용)
                </div>
              </td>
              {columns.map((c) => (
                <td key={c.key} className="!p-1">
                  <input
                    inputMode="numeric"
                    placeholder="미사용"
                    className="input w-24 !px-1.5 !py-1 text-right placeholder:text-slate-300"
                    value={gd[c.key] ?? ""}
                    onChange={(e) => setGd({ ...gd, [c.key]: e.target.value })}
                  />
                </td>
              ))}
            </tr>
            {grades.map((g) => (
              <tr key={g.id}>
                <td className="whitespace-nowrap font-medium">{g.code}</td>
                {columns.map((c) => {
                  const key = `${g.id}|${c.key}`;
                  const changed =
                    Number(values[key]) !== amountOf(base.items, g.id, c);
                  return (
                    <td key={c.key} className="!p-1">
                      <input
                        inputMode="numeric"
                        className={`input w-24 !px-1.5 !py-1 text-right ${changed ? "border-amber-400 bg-amber-50" : ""}`}
                        value={values[key] ?? "0"}
                        onChange={(e) =>
                          setValues({ ...values, [key]: e.target.value })
                        }
                        title="기본 단가 (1~2차시)"
                      />
                      <input
                        inputMode="numeric"
                        placeholder="3차시~"
                        className="input mt-0.5 w-24 !px-1.5 !py-1 text-right text-[12px] placeholder:text-slate-300"
                        value={after[key] ?? ""}
                        onChange={(e) =>
                          setAfter({ ...after, [key]: e.target.value })
                        }
                        title="3차시부터 단가 — 비워두면 전 차시 동일"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

/** 색 선택 (팔레트 점 클릭) */
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(CHIP_COLORS).map(([key, c]) => (
        <button
          key={key}
          type="button"
          title={c.label}
          onClick={() => onChange(key)}
          className={`h-6 w-6 rounded-full ring-2 ring-offset-1 ${value === key ? "ring-slate-800" : "ring-transparent"}`}
          style={{ background: c.hex }}
          aria-label={c.label}
        />
      ))}
    </div>
  );
}

/** 지급유형 관리 패널 */
function PayTypesPanel({
  payTypes,
  usage,
  canEdit,
}: {
  payTypes: PayTypeMeta[];
  usage: Record<string, number>;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<PayTypeMeta | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div>
          <div className="text-[13px] font-semibold text-slate-700">
            지급유형 (단가표 열의 종류)
          </div>
          <div className="text-[11px] text-slate-500">
            추가하면 단가표에 열이 생기고 강의 등록 폼에서 바로 고를 수
            있습니다. 금액은 새 버전으로 채우세요.
          </div>
        </div>
        {canEdit && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => setEditing("new")}
          >
            <Plus size={13} /> 지급유형 추가
          </button>
        )}
      </div>
      <table className="dense w-full text-[13px]">
        <thead>
          <tr>
            <th className="text-left">이름</th>
            <th className="text-left">단가 방식</th>
            <th className="text-right">강의 사용</th>
            <th className="text-left">상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {payTypes.map((p, i) => (
            <tr key={p.id} className={p.isActive ? "" : "text-slate-400"}>
              <td>
                <PayTypeChip payType={p.code} />
                {p.note && (
                  <span className="ml-2 text-[11px] text-slate-500">
                    {p.note}
                  </span>
                )}
              </td>
              <td className="text-[12px]">
                {p.manual
                  ? "강의 등록 시 직접 입력"
                  : p.roleBased
                    ? "주강사/보조강사 열 2개"
                    : "역할 무관 열 1개"}
              </td>
              <td className="num">{usage[p.code] ?? 0}</td>
              <td>{p.isActive ? "사용" : "중지"}</td>
              <td className="whitespace-nowrap text-right">
                {canEdit && (
                  <>
                    <button
                      className="btn-ghost btn-sm"
                      title="위로"
                      disabled={pending || i === 0}
                      onClick={() =>
                        start(async () => {
                          const r = await movePayType(p.id, -1);
                          if (!r.ok) toast(r.error, "error");
                        })
                      }
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      title="아래로"
                      disabled={pending || i === payTypes.length - 1}
                      onClick={() =>
                        start(async () => {
                          const r = await movePayType(p.id, 1);
                          if (!r.ok) toast(r.error, "error");
                        })
                      }
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      className="btn-ghost btn-sm"
                      title="수정"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil size={13} />
                    </button>
                    <ConfirmButton
                      disabled={pending || (usage[p.code] ?? 0) > 0}
                      onConfirm={() =>
                        start(async () => {
                          const r = await deletePayType(p.id);
                          r.ok
                            ? toast(`삭제했어요 · ${p.code}`)
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
      {editing && (
        <PayTypeForm
          payType={editing === "new" ? null : editing}
          usage={editing === "new" ? 0 : (usage[editing.code] ?? 0)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PayTypeForm({
  payType,
  usage,
  onClose,
}: {
  payType: PayTypeMeta | null;
  usage: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState(payType?.code ?? "");
  const [mode, setMode] = useState<"role" | "flat" | "manual">(
    payType
      ? payType.manual
        ? "manual"
        : payType.roleBased
          ? "role"
          : "flat"
      : "role",
  );
  const [color, setColor] = useState(payType?.color ?? "sky");
  const [isActive, setIsActive] = useState(payType?.isActive ?? true);
  const [note, setNote] = useState(payType?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: PayTypeInput = {
      code,
      roleBased: mode === "role",
      manual: mode === "manual",
      color,
      isActive,
      note: note.trim() || null,
    };
    if (payType) {
      const r = await updatePayType(payType.id, input);
      setSaving(false);
      if (!r.ok) return setError(r.error);
      toast(
        `지급유형을 저장했어요 · ${code}${r.data?.renamedLectures ? ` (강의 ${r.data.renamedLectures}건 이름 반영)` : ""}`,
      );
    } else {
      const r = await createPayType(input);
      setSaving(false);
      if (!r.ok) return setError(r.error);
      toast(`지급유형을 추가했어요 · ${code} — 단가는 '새 버전'에서 채우세요`);
    }
    onClose();
  };
  return (
    <Drawer
      open
      title={payType ? "지급유형 수정" : "지급유형 추가"}
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
            disabled={saving || !code.trim()}
          >
            저장
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">이름 * (예: 방과후, 특강, 캠프)</label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={20}
          />
          {payType && payType.code !== code.trim() && code.trim() && (
            <p className="mt-1 text-[11px] text-amber-700">
              이름을 바꾸면 이 유형을 쓰는 강의 {usage}건과 단가표 항목의 표기도
              함께 바뀝니다.
            </p>
          )}
        </div>
        <div>
          <label className="label">단가 방식</label>
          <div className="space-y-1.5 text-[13px]">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-0.5 accent-brand-600"
                checked={mode === "role"}
                onChange={() => setMode("role")}
                disabled={!!payType && usage > 0 && mode !== "role"}
              />
              <span>
                <b>주강사/보조강사 구분</b> — 단가표에 열이 2개
                (관내·관외·아코센터처럼)
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-0.5 accent-brand-600"
                checked={mode === "flat"}
                onChange={() => setMode("flat")}
                disabled={!!payType && usage > 0 && mode !== "flat"}
              />
              <span>
                <b>역할 무관</b> — 단가표에 열 1개 (주말교육·교구정리처럼)
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                className="mt-0.5 accent-brand-600"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
                disabled={!!payType && usage > 0 && mode !== "manual"}
              />
              <span>
                <b>강의 등록 시 직접 입력</b> — 단가표 열 없음 (수동기입처럼)
              </span>
            </label>
          </div>
          {payType && usage > 0 && (
            <p className="mt-1 text-[11px] text-slate-500">
              이미 강의에 쓰인 유형은 단가 방식을 바꿀 수 없습니다. 방식이
              다르면 새 유형을 만드세요.
            </p>
          )}
        </div>
        <div>
          <label className="label">칩 색</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div>
          <label className="label">메모</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 2027학년도 방과후 사업"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />{" "}
          사용 중 (해제하면 새 강의 등록 폼에서 숨김, 기존 강의는 그대로)
        </label>
      </div>
    </Drawer>
  );
}

/** 등급 관리 패널 */
function GradesPanel({
  grades,
  usage,
  canEdit,
}: {
  grades: Grade[];
  usage: Record<number, number>;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Grade | "new" | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div>
          <div className="text-[13px] font-semibold text-slate-700">
            등급 (단가표 행)
          </div>
          <div className="text-[11px] text-slate-500">
            추가하면 단가표에 행이 생기고 강사 등록에서 고를 수 있습니다.
          </div>
        </div>
        {canEdit && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => setEditing("new")}
          >
            <Plus size={13} /> 등급 추가
          </button>
        )}
      </div>
      <table className="dense w-full text-[13px]">
        <thead>
          <tr>
            <th className="text-left">등급</th>
            <th className="text-left">설명</th>
            <th className="text-right">강사 수</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {grades.map((g) => (
            <tr key={g.id}>
              <td>
                <GradeBadge gradeCode={g.code} full />
              </td>
              <td className="text-[12px] text-slate-600">
                {g.label !== g.code ? g.label : ""}
              </td>
              <td className="num">{usage[g.id] ?? 0}</td>
              <td className="whitespace-nowrap text-right">
                {canEdit && (
                  <>
                    <button
                      className="btn-ghost btn-sm"
                      title="수정"
                      onClick={() => setEditing(g)}
                    >
                      <Pencil size={13} />
                    </button>
                    <ConfirmButton
                      disabled={pending || (usage[g.id] ?? 0) > 0}
                      onConfirm={() =>
                        start(async () => {
                          const r = await deleteGrade(g.id);
                          r.ok
                            ? toast(`삭제했어요 · ${g.code}`)
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
      {editing && (
        <GradeForm
          grade={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function GradeForm({
  grade,
  onClose,
}: {
  grade: Grade | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState(grade?.code ?? "");
  const [label, setLabel] = useState(grade?.label ?? "");
  const [color, setColor] = useState(grade?.color ?? "slate");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: GradeInput = { code, label, color };
    const r = grade
      ? await updateGrade(grade.id, input)
      : await createGrade(input);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(
      grade
        ? `등급을 저장했어요 · ${code}`
        : `등급을 추가했어요 · ${code} — 단가는 '새 버전'에서 채우세요`,
    );
    onClose();
  };
  return (
    <Drawer
      open
      title={grade ? "등급 수정" : "등급 추가"}
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
            disabled={saving || !code.trim()}
          >
            저장
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">등급 이름 * (예: C등급, 인턴)</label>
          <input
            className="input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <div>
          <label className="label">설명</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="예: 신입 강사"
          />
        </div>
        <div>
          <label className="label">배지 색</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </div>
    </Drawer>
  );
}
