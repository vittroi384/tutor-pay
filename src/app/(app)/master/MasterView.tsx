"use client";
/**
 * 기관·콘텐츠 관리 (클라이언트) — 탭 2개.
 * - 기관: 검색·유형 필터, 등록/수정 서랍(유형 자동분류), 다른 기관으로 병합(중복 정리), 이름 기준 자동 재분류, 강의 건수 → 강의 목록
 * - 콘텐츠: 표준명·별칭 편집, 병합(원본 표기는 별칭으로 흡수), 검수 필요 표시, 사용 건수 → 강의 목록
 */
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Merge, Pencil, Plus, Search, Wand2 } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { InstitutionTypeChip } from "@/components/ui/Chips";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  SortableTh,
  compareValues,
  type SortState,
} from "@/components/ui/SortableTh";
import { useToast } from "@/components/ui/Toast";
import { INSTITUTION_TYPES, classifyInstitution } from "@/lib/calc";
import type { Content, Institution } from "@/lib/types";
import {
  autoClassifyInstitution,
  createInstitution,
  deleteContent,
  mergeContents,
  mergeInstitutions,
  saveContent,
  updateInstitution,
  type ContentInput,
  type InstitutionInput,
} from "./actions";

export function MasterView({
  tab,
  institutions,
  contents,
  instUsage,
  contentUsage,
  canEdit,
  bounds,
}: {
  tab: "institutions" | "contents";
  institutions: Institution[];
  contents: Content[];
  instUsage: Record<number, number>;
  contentUsage: Record<string, number>;
  canEdit: boolean;
  bounds: { min: string; max: string } | null;
}) {
  return (
    <div>
      <div className="mb-3 inline-flex overflow-hidden rounded-md border border-slate-300 bg-white text-[13px]">
        <Link
          href="/master?tab=institutions"
          className={`whitespace-nowrap px-3 py-1.5 ${tab === "institutions" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          기관 {institutions.length}
        </Link>
        <Link
          href="/master?tab=contents"
          className={`whitespace-nowrap px-3 py-1.5 ${tab === "contents" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
        >
          콘텐츠 {contents.length}
          {contents.some((c) => c.needsReview) && (
            <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
              {contents.filter((c) => c.needsReview).length}
            </span>
          )}
        </Link>
      </div>
      {tab === "institutions" ? (
        <InstitutionsPanel
          institutions={institutions}
          usage={instUsage}
          canEdit={canEdit}
          bounds={bounds}
        />
      ) : (
        <ContentsPanel
          contents={contents}
          usage={contentUsage}
          canEdit={canEdit}
          bounds={bounds}
        />
      )}
    </div>
  );
}

// ---------------- 기관 ----------------
/** 기관 탭 */
function InstitutionsPanel({
  institutions,
  usage,
  canEdit,
  bounds,
}: {
  institutions: Institution[];
  usage: Record<number, number>;
  canEdit: boolean;
  bounds: { min: string; max: string } | null;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<Institution | "new" | null>(null);
  const [merge, setMerge] = useState<{ source: Institution } | null>(null);
  const [pending, start] = useTransition();
  type InstSortKey = "name" | "type" | "region" | "usage" | "active";
  const [sort, setSort] = useState<SortState<InstSortKey>>({
    key: "name",
    dir: "asc",
  });
  const TYPE_ORDER: Record<string, number> = {
    초등: 0,
    중등: 1,
    고등: 2,
    유치원: 3,
    어린이집: 4,
    "기타 기관": 5,
  };
  const sortValue = (i: Institution, key: InstSortKey): unknown =>
    key === "name"
      ? i.name
      : key === "type"
        ? (TYPE_ORDER[i.type] ?? 9)
        : key === "region"
          ? i.region
          : key === "usage"
            ? (usage[i.id] ?? 0)
            : i.isActive;
  // 필터 → 열 클릭 정렬 (같은 값이면 이름순)
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return institutions
      .filter(
        (i) =>
          (!qq || i.name.toLowerCase().includes(qq)) &&
          (!type || i.type === type),
      )
      .sort(
        (a, b) =>
          compareValues(
            sortValue(a, sort.key),
            sortValue(b, sort.key),
            sort.dir,
          ) || a.name.localeCompare(b.name, "ko"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutions, q, type, sort, usage]);
  const suspicious = institutions.filter(
    (i) => classifyInstitution(i.name) !== i.type,
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
          />
          <input
            className="input w-56 pl-8"
            placeholder="기관명 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input w-32"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">유형 전체</option>
          {INSTITUTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-slate-500">
          {visible.length}곳
          {suspicious.length
            ? ` · 자동분류와 다른 유형 ${suspicious.length}곳`
            : ""}
        </span>
        {canEdit && (
          <button
            className="btn-primary ml-auto"
            onClick={() => setEditing("new")}
          >
            <Plus size={15} /> 기관 등록
          </button>
        )}
      </div>
      <div className="card">
        {/* 열 너비 고정(table-fixed): 정렬해도 표가 흔들리지 않게. 표는 자체 스크롤(머리글 고정) */}
        <div className="table-scroll max-h-[max(420px,calc(100dvh-204px))]">
          <table className="dense w-full min-w-[820px] table-fixed text-[13px]">
            <colgroup>
              <col className="w-[240px]" />
              <col className="w-[120px]" />
              <col className="w-[80px]" />
              <col className="w-[90px]" />
              <col className="w-[70px]" />
              <col />
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr>
                <SortableTh col="name" sort={sort} onSort={setSort}>
                  기관명
                </SortableTh>
                <SortableTh col="type" sort={sort} onSort={setSort}>
                  유형
                </SortableTh>
                <SortableTh col="region" sort={sort} onSort={setSort}>
                  지역
                </SortableTh>
                <SortableTh
                  col="usage"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                >
                  강의 건수
                </SortableTh>
                <SortableTh col="active" sort={sort} onSort={setSort}>
                  상태
                </SortableTh>
                <th className="text-left">비고</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} className={i.isActive ? "" : "text-slate-400"}>
                  <td className="overflow-hidden whitespace-nowrap font-medium">
                    <span className="truncate" title={i.name}>
                      {i.name}
                    </span>
                  </td>
                  <td className="overflow-hidden whitespace-nowrap">
                    <InstitutionTypeChip type={i.type} />
                    {classifyInstitution(i.name) !== i.type && (
                      <span
                        className="ml-1 text-[11px] text-amber-700"
                        title={`이름 기준 자동분류: ${classifyInstitution(i.name)}`}
                      >
                        수동
                      </span>
                    )}
                  </td>
                  <td>{i.region ?? "-"}</td>
                  <td className="num">
                    {usage[i.id] ? (
                      <Link
                        href={`/lectures?from=${bounds?.min ?? "2000-01-01"}&to=${bounds?.max ?? "2100-12-31"}&institution=${i.id}`}
                        className="hover:underline"
                        title="이 기관의 전체 강의 보기"
                      >
                        {usage[i.id]}
                      </Link>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td>{i.isActive ? "사용" : "비활성"}</td>
                  <td className="overflow-hidden">
                    <div className="truncate" title={i.note ?? ""}>
                      {i.note ?? ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {canEdit && (
                      <>
                        <button
                          className="btn-ghost btn-sm"
                          title="수정"
                          onClick={() => setEditing(i)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          title="다른 기관으로 병합(중복 정리)"
                          onClick={() => setMerge({ source: i })}
                        >
                          <Merge size={13} />
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          title="이름 기준으로 유형·지역 자동 재분류"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const r = await autoClassifyInstitution(i.id);
                              r.ok
                                ? toast(`자동 분류했어요 · ${i.name}`)
                                : toast(r.error, "error");
                            })
                          }
                        >
                          <Wand2 size={13} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <InstitutionForm
          institution={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {merge && (
        <MergeDialog
          title={`'${merge.source.name}' 을(를) 다른 기관으로 병합`}
          description={`이 기관에 배정된 강의 ${usage[merge.source.id] ?? 0}건을 선택한 기관으로 옮기고, '${merge.source.name}' 은 삭제됩니다.`}
          options={institutions
            .filter((i) => i.id !== merge.source.id)
            .map((i) => ({ id: i.id, label: `${i.name} (${i.type})` }))}
          onClose={() => setMerge(null)}
          onMerge={async (targetId) => {
            const r = await mergeInstitutions(merge.source.id, targetId);
            if (r.ok) toast(`병합했어요 · 강의 ${r.data?.moved ?? 0}건 이동`);
            else toast(r.error, "error");
            setMerge(null);
          }}
        />
      )}
    </div>
  );
}

/** 기관 등록/수정 서랍 (유형을 비워두면 이름 키워드로 자동 분류) */
function InstitutionForm({
  institution,
  onClose,
}: {
  institution: Institution | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(institution?.name ?? "");
  const [type, setType] = useState(institution?.type ?? "");
  const [region, setRegion] = useState(institution?.region ?? "");
  const [isActive, setIsActive] = useState(institution?.isActive ?? true);
  const [note, setNote] = useState(institution?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const autoType = name.trim() ? classifyInstitution(name.trim()) : "";
  const finalType = type || autoType || "기타 기관";
  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: InstitutionInput = {
      name,
      type: finalType,
      region: region.trim() || null,
      isActive,
      note: note.trim() || null,
    };
    const r = institution
      ? await updateInstitution(institution.id, input)
      : await createInstitution(input);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(
      institution
        ? `기관 정보를 저장했어요 · ${name}`
        : `기관을 등록했어요 · ${name}`,
    );
    onClose();
  };
  return (
    <Drawer
      open
      title={institution ? "기관 수정" : "기관 등록"}
      onClose={onClose}
      width="max-w-md"
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
      <div className="space-y-3">
        <div>
          <label className="label">
            기관명 * (지역 접미가 필요하면 _동해 처럼)
          </label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">
              유형{" "}
              {autoType && (
                <span className="text-slate-400">(자동: {autoType})</span>
              )}
            </label>
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">자동 분류</option>
              {INSTITUTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">지역</label>
            <input
              className="input"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="예: 동해"
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
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />{" "}
          사용 중 (해제하면 새 배정 목록에서 흐리게 표시)
        </label>
      </div>
    </Drawer>
  );
}

// ---------------- 콘텐츠 ----------------
/** 콘텐츠 탭 (검수 필요 항목이 위로) */
function ContentsPanel({
  contents,
  usage,
  canEdit,
  bounds,
}: {
  contents: Content[];
  usage: Record<string, number>;
  canEdit: boolean;
  bounds: { min: string; max: string } | null;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Content | "new" | null>(null);
  const [merge, setMerge] = useState<Content | null>(null);
  const [pending, start] = useTransition();
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return [...contents]
      .filter(
        (c) =>
          !qq || `${c.name} ${c.aliases.join(" ")}`.toLowerCase().includes(qq),
      )
      .sort(
        (a, b) =>
          Number(b.needsReview) - Number(a.needsReview) ||
          (usage[b.name] ?? 0) - (usage[a.name] ?? 0) ||
          a.name.localeCompare(b.name, "ko"),
      );
  }, [contents, q, usage]);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
          />
          <input
            className="input w-56 pl-8"
            placeholder="표준명·별칭 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-[12px] text-slate-500">
          표준명 {contents.length}개 · 별칭으로 입력해도 저장 시 표준명으로
          바뀝니다
        </span>
        {canEdit && (
          <button
            className="btn-primary ml-auto"
            onClick={() => setEditing("new")}
          >
            <Plus size={15} /> 콘텐츠 등록
          </button>
        )}
      </div>
      <div className="card">
        <div className="table-scroll max-h-[max(420px,calc(100dvh-204px))]">
          <table className="dense w-full min-w-[760px] text-[13px]">
            <thead>
              <tr>
                <th className="text-left">표준명</th>
                <th className="text-left">별칭(시트 표기 등)</th>
                <th className="text-right">사용 건수</th>
                <th className="text-left">상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className={c.isActive ? "" : "text-slate-400"}>
                  <td className="font-medium">
                    {c.name}
                    {c.needsReview && (
                      <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                        검수 필요
                      </span>
                    )}
                  </td>
                  <td className="text-slate-500">{c.aliases.join(", ")}</td>
                  <td className="num">
                    {usage[c.name] ? (
                      <Link
                        href={`/lectures?from=${bounds?.min ?? "2000-01-01"}&to=${bounds?.max ?? "2100-12-31"}&q=${encodeURIComponent(c.name)}`}
                        className="hover:underline"
                        title="이 콘텐츠 강의 보기"
                      >
                        {usage[c.name]}
                      </Link>
                    ) : (
                      <span className="text-slate-300">0</span>
                    )}
                  </td>
                  <td>{c.isActive ? "사용" : "비활성"}</td>
                  <td className="whitespace-nowrap text-right">
                    {canEdit && (
                      <>
                        <button
                          className="btn-ghost btn-sm"
                          title="수정"
                          onClick={() => setEditing(c)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          title="다른 콘텐츠로 병합"
                          onClick={() => setMerge(c)}
                        >
                          <Merge size={13} />
                        </button>
                        <ConfirmButton
                          disabled={pending}
                          onConfirm={() =>
                            start(async () => {
                              const r = await deleteContent(c.id);
                              r.ok
                                ? toast(`삭제했어요 · ${c.name}`)
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
      </div>
      {editing && (
        <ContentForm
          content={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {merge && (
        <MergeDialog
          title={`'${merge.name}' 을(를) 다른 콘텐츠로 병합`}
          description={`강의 ${usage[merge.name] ?? 0}건의 표기가 선택한 표준명으로 바뀌고, '${merge.name}' 은 그 콘텐츠의 별칭이 됩니다.`}
          options={contents
            .filter((c) => c.id !== merge.id)
            .map((c) => ({ id: c.id, label: c.name }))}
          onClose={() => setMerge(null)}
          onMerge={async (targetId) => {
            const r = await mergeContents(merge.id, targetId);
            if (r.ok) toast(`병합했어요 · 강의 ${r.data?.moved ?? 0}건 반영`);
            else toast(r.error, "error");
            setMerge(null);
          }}
        />
      )}
    </div>
  );
}

/** 콘텐츠 등록/수정 서랍 (표준명 변경 시 기존 강의 표기도 바뀐다는 안내 포함) */
function ContentForm({
  content,
  onClose,
}: {
  content: Content | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(content?.name ?? "");
  const [aliases, setAliases] = useState(content?.aliases.join(", ") ?? "");
  const [isActive, setIsActive] = useState(content?.isActive ?? true);
  const [needsReview, setNeedsReview] = useState(content?.needsReview ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: ContentInput = {
      name,
      aliases: aliases
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive,
      needsReview,
    };
    const r = await saveContent(content?.id ?? null, input);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(
      content
        ? `콘텐츠를 저장했어요 · ${name}${r.data?.renamed ? ` (강의 ${r.data.renamed}건 표기 변경)` : ""}`
        : `콘텐츠를 등록했어요 · ${name}`,
    );
    onClose();
  };
  return (
    <Drawer
      open
      title={content ? "콘텐츠 수정" : "콘텐츠 등록"}
      onClose={onClose}
      width="max-w-md"
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
      <div className="space-y-3">
        <div>
          <label className="label">표준명 *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {content && content.name !== name.trim() && name.trim() && (
            <p className="mt-1 text-[11px] text-amber-700">
              표준명을 바꾸면 이 표기를 쓰는 기존 강의도 함께 바뀝니다.
            </p>
          )}
        </div>
        <div>
          <label className="label">
            별칭 (쉼표 구분) — 이 표기로 입력해도 표준명으로 저장
          </label>
          <input
            className="input"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="예: 투닝, AI투닝, 투닝AI"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />{" "}
          사용 중 (자동완성 목록에 표시)
        </label>
        <label className="inline-flex items-center gap-1.5 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-rose-600"
            checked={needsReview}
            onChange={(e) => setNeedsReview(e.target.checked)}
          />{" "}
          검수 필요 표시
        </label>
      </div>
    </Drawer>
  );
}

/** 병합 대상 선택 서랍 — 기관/콘텐츠 공용. 되돌릴 수 없어 2단계 확인 버튼 사용 */
function MergeDialog({
  title,
  description,
  options,
  onClose,
  onMerge,
}: {
  title: string;
  description: string;
  options: { id: number; label: string }[];
  onClose: () => void;
  onMerge: (targetId: number) => Promise<void>;
}) {
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      open
      title={title}
      onClose={onClose}
      width="max-w-md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <ConfirmButton
            className="btn-primary"
            label="병합"
            confirmLabel="정말 병합 (되돌릴 수 없음)"
            disabled={!target || busy}
            onConfirm={async () => {
              setBusy(true);
              await onMerge(Number(target));
              setBusy(false);
            }}
          />
        </div>
      }
    >
      <p className="mb-3 text-[13px] text-slate-600">{description}</p>
      <label className="label">병합 대상 (남길 쪽)</label>
      <select
        className="input"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">선택</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Drawer>
  );
}
