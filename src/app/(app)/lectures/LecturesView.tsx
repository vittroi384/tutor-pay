"use client";
/**
 * 강의배정 메인 화면 (클라이언트 컴포넌트).
 * - 상단 요약 → 필터 툴바(검색·강사·기관·지급유형·지급/완료) → 목록(날짜별 그룹·소계·합계) 또는 달력
 * - 행 안에서 완료/지급 체크(즉시 저장), 수정/복제/삭제(2단계 확인), 강사명 → 강사 상세, 기관명 클릭 → 그 기관만 보기
 * - '강의 등록' 버튼과 수정/복제는 오른쪽 서랍(LectureForm)을 연다
 * - 정산 확정된 달은 배너 표시 + 해당 달 행만 변경 불가 (기간 조회 시 여러 달이 섞여도 행 단위로 판단)
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Copy,
  List,
  Lock,
  Pencil,
  Plus,
  Search,
  X,
  Package,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import {
  GradeBadge,
  InstitutionTypeChip,
  PayTypeChip,
  RoleText,
} from "@/components/ui/Chips";
import { SortableTh, type SortState } from "@/components/ui/SortableTh";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import {
  isInstitutionPaid,
  isPayable,
  isUnpaid,
  lectureWarnings,
} from "@/lib/calc";
import {
  fmtDateKo,
  fmtSessions,
  fmtTimeRange,
  fmtWon,
  fmtYm,
  weekdayClass,
  weekdayOf,
  type Period,
} from "@/lib/format";
import type { EquipmentRow, LectureRow, MasterData } from "@/lib/types";
import { deleteLecture, toggleLecture } from "./actions";
import { LectureForm, type FormMode } from "./LectureForm";
import { LectureCalendar } from "./LectureCalendar";

type Filters = {
  q: string;
  instructorId: number | null;
  institutionId: number | null;
  payType: string;
  paid: "all" | "unpaid" | "paid";
  done: "all" | "done" | "undone";
  date: string | null;
  warn: boolean;
};
const EMPTY: Filters = {
  q: "",
  instructorId: null,
  institutionId: null,
  payType: "",
  paid: "all",
  done: "all",
  date: null,
  warn: false,
};

type InitialFilters = {
  instructorId: number | null;
  institutionId: number | null;
  q: string;
  date: string | null;
  paid: "all" | "unpaid" | "paid";
  warn: boolean;
};

export function LecturesView({
  period,
  lectures,
  equipment,
  rentalCounts,
  master,
  lockedMonths,
  canEdit,
  initial,
  initialView,
  openNew,
}: {
  period: Period;
  lectures: LectureRow[];
  equipment: EquipmentRow[];
  rentalCounts: Record<number, number>;
  master: MasterData;
  lockedMonths: string[];
  canEdit: boolean;
  initial: InitialFilters;
  initialView: "list" | "calendar";
  openNew: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const ym = period.ym;
  const lockedSet = useMemo(() => new Set(lockedMonths), [lockedMonths]);
  // 지급유형 규칙(단가 직접 입력 여부 등) — ⚠ 경고 판정에 사용
  const rules = useMemo(
    () =>
      master.payTypes.map((p) => ({
        code: p.code,
        roleBased: p.roleBased,
        manual: p.manual,
        sort: p.sort,
        isActive: p.isActive,
      })),
    [master.payTypes],
  );
  /** 월 모드: 그 달 잠김 여부 / 기간 모드: 등록 폼은 열되 잠긴 달 행만 잠금 */
  const locked = period.mode === "month" && lockedSet.has(ym);
  const isLockedRow = (l: LectureRow) => lockedSet.has(l.date.slice(0, 7));
  // ---- 화면 상태: 목록/달력, 필터, 열려 있는 서랍(등록/수정/복제), 진행 중인 저장 표시 ----
  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [filters, setFilters] = useState<Filters>({
    ...EMPTY,
    instructorId: initial.instructorId,
    institutionId: initial.institutionId,
    q: initial.q,
    date: initial.date,
    paid: initial.paid,
    warn: initial.warn,
  });
  const [drawer, setDrawer] = useState<{
    mode: FormMode;
    lecture: LectureRow | null;
  } | null>(openNew ? { mode: "create", lecture: null } : null);
  const [pending, startTransition] = useTransition();
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      instructorId: initial.instructorId,
      institutionId: initial.institutionId,
      q: initial.q,
      date: initial.date,
      paid: initial.paid,
      warn: initial.warn,
    }));
  }, [
    initial.instructorId,
    initial.institutionId,
    initial.q,
    initial.date,
    initial.paid,
    initial.warn,
  ]);

  // 필터 적용 (전부 클라이언트에서 — 한 달/기간 데이터를 이미 다 받아온 상태라 즉시 반응)
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return lectures.filter((l) => {
      if (filters.instructorId === 0 && l.instructorId != null) return false; // 미배정만
      if (filters.instructorId && l.instructorId !== filters.instructorId)
        return false;
      if (filters.institutionId && l.institutionId !== filters.institutionId)
        return false;
      if (filters.payType && (l.payType ?? "미지정") !== filters.payType)
        return false;
      if (filters.paid === "unpaid" && !isUnpaid(l)) return false; // 기관지급은 미지급 필터에서 제외
      if (filters.paid === "paid" && !l.isPaid) return false;
      if (filters.done === "done" && !l.isDone) return false;
      if (filters.done === "undone" && l.isDone) return false;
      if (filters.date && l.date !== filters.date) return false;
      if (filters.warn && lectureWarnings(l, rules).length === 0) return false; // ⚠ 확인 필요만
      if (q) {
        const hay =
          `${l.instructorName ?? "미배정"} ${l.institutionName} ${l.content ?? ""} ${l.contentRaw ?? ""} ${l.note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lectures, filters]);

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(EMPTY);

  // 상단 요약 숫자 (필터가 걸려 있으면 필터된 결과 기준)
  const summary = useMemo(() => {
    const src = filtered;
    const sessions = src.reduce((a, l) => a + (l.sessions ?? 0), 0);
    const gross = src.reduce((a, l) => a + l.grossAmount, 0);
    const net = src.reduce((a, l) => a + l.netAmount, 0);
    const travel = src.reduce((a, l) => a + l.travelFee, 0);
    const unpaid = src.filter(isUnpaid); // 기관지급 제외
    const unpaidNet = unpaid.reduce((a, l) => a + l.netAmount, 0);
    const undone = src.filter((l) => !l.isDone).length;
    const instructorsN = new Set(src.map((l) => l.instructorId)).size;
    const institutionsN = new Set(src.map((l) => l.institutionId)).size;
    const warn = src.filter((l) => lectureWarnings(l, rules).length).length;
    return {
      count: src.length,
      sessions,
      gross,
      net,
      travel,
      unpaid: unpaid.length,
      unpaidNet,
      undone,
      instructorsN,
      institutionsN,
      warn,
    };
  }, [filtered]);

  // 열 머리글 클릭 정렬 — 날짜 그룹·소계는 유지하고 그룹 안 행 순서를 바꾼다.
  // '시간'을 내림차순으로 하면 날짜 순서도 함께 뒤집힌다(최근 날짜부터).
  type SortKey =
    | "time"
    | "instructor"
    | "institution"
    | "content"
    | "sessions"
    | "unit"
    | "gross"
    | "net"
    | "travel";
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "time",
    dir: "asc",
  });
  const groups = useMemo(() => {
    const m = new Map<string, LectureRow[]>();
    for (const l of filtered) m.set(l.date, [...(m.get(l.date) ?? []), l]);
    const val = (l: LectureRow): string | number => {
      switch (sort.key) {
        case "time":
          return l.startTime ?? "";
        case "instructor":
          return l.instructorName ?? "";
        case "institution":
          return l.institutionName;
        case "content":
          return l.content ?? l.contentRaw ?? "";
        case "sessions":
          return l.sessions ?? 0;
        case "unit":
          return l.unitPrice;
        case "gross":
          return l.grossAmount;
        case "net":
          return l.netAmount;
        case "travel":
          return l.travelFee;
      }
    };
    const mul = sort.dir === "asc" ? 1 : -1;
    const entries = [...m.entries()].map(([date, rows]) => {
      const sorted = [...rows].sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        const c =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "ko");
        return c !== 0
          ? c * mul
          : (a.startTime ?? "").localeCompare(b.startTime ?? "");
      });
      return [date, sorted] as [string, LectureRow[]];
    });
    if (sort.key === "time" && sort.dir === "desc") entries.reverse();
    return entries;
  }, [filtered, sort]);

  // 완료/지급 체크박스: 서버 액션 호출 동안 그 행만 잠시 비활성화(busyIds), 실패하면 토스트
  const runToggle = (
    l: LectureRow,
    field: "isDone" | "isPaid",
    value: boolean,
  ) => {
    setBusyIds((s) => new Set(s).add(l.id));
    startTransition(async () => {
      const r = await toggleLecture(l.id, field, value);
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(l.id);
        return n;
      });
      if (!r.ok) toast(r.error, "error");
    });
  };
  // 삭제 (ConfirmButton 이 2단계 확인을 거친 뒤 호출)
  const runDelete = (l: LectureRow) => {
    startTransition(async () => {
      const r = await deleteLecture(l.id);
      if (r.ok)
        toast(
          `삭제했어요 · ${fmtDateKo(l.date)} ${l.institutionName} ${l.instructorName ?? "미배정"}` +
            ((r.data?.removedRentals ?? 0) > 0
              ? ` · 연동 교구 대여 ${r.data?.removedRentals}건 함께 삭제`
              : ""),
        );
      else toast(r.error, "error");
    });
  };

  const instructorOptions = master.instructors;
  const institutionOptions = master.institutions;

  return (
    <div>
      {locked && (
        <div className="no-print mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <Lock size={14} /> 이 달은 정산 확정(잠금) 상태입니다. 강의
          등록·수정·삭제·지급 변경을 하려면{" "}
          <Link href={`/settlement?ym=${ym}`} className="underline">
            정산 화면
          </Link>
          에서 잠금을 해제하세요.
        </div>
      )}
      {period.mode === "range" && lockedMonths.length > 0 && (
        <div className="no-print mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <Lock size={14} /> 이 기간 중 {lockedMonths.map(fmtYm).join(", ")}은
          정산 확정(잠금) 상태라 해당 달의 강의는 변경할 수 없습니다.
        </div>
      )}
      <SummaryStrip
        items={[
          {
            label: `강의 건수${isFiltered ? " (필터)" : ""}`,
            value: `${summary.count}건`,
            sub: `${fmtSessions(summary.sessions)}차시`,
          },
          { label: "세전 합계", value: fmtWon(summary.gross) },
          { label: "세후 지급액", value: fmtWon(summary.net), tone: "brand" },
          {
            label: "미지급",
            value: `${summary.unpaid}건`,
            sub: fmtWon(summary.unpaidNet),
            tone: summary.unpaid ? "amber" : "default",
          },
          { label: "미완료 강의", value: `${summary.undone}건` },
          {
            label: "활동 강사 · 기관",
            value: `${summary.instructorsN}명 · ${summary.institutionsN}곳`,
          },
          {
            label: "확인 필요 ⚠",
            value: `${summary.warn}건`,
            tone: summary.warn ? "rose" : "default",
            onClick: () => setFilters({ ...filters, warn: !filters.warn }),
            active: filters.warn,
            title: filters.warn
              ? "클릭하면 전체 보기"
              : "클릭하면 확인 필요한 강의만 보기",
          },
        ]}
      />

      {/* 툴바 */}
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
          />
          <input
            className="input w-full pl-8 sm:w-56"
            placeholder="강사·기관·콘텐츠·비고 검색"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <select
          className="input w-40"
          value={filters.instructorId ?? ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              instructorId: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">강사 전체</option>
          <option value="0">— 미배정만 —</option>
          {instructorOptions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.isActive ? "" : " (out)"}
            </option>
          ))}
        </select>
        <select
          className="input w-44"
          value={filters.institutionId ?? ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              institutionId: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">기관 전체</option>
          {institutionOptions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select
          className="input w-32"
          value={filters.payType}
          onChange={(e) => setFilters({ ...filters, payType: e.target.value })}
        >
          <option value="">지급유형 전체</option>
          {master.payTypes.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code}
              {!p.isActive ? " (중지)" : ""}
            </option>
          ))}
          <option value="미지정">미지정(공란)</option>
        </select>
        <select
          className="input w-28"
          value={filters.paid}
          onChange={(e) =>
            setFilters({ ...filters, paid: e.target.value as Filters["paid"] })
          }
        >
          <option value="all">지급 전체</option>
          <option value="unpaid">미지급</option>
          <option value="paid">지급완료</option>
        </select>
        <select
          className="input w-28"
          value={filters.done}
          onChange={(e) =>
            setFilters({ ...filters, done: e.target.value as Filters["done"] })
          }
        >
          <option value="all">완료 전체</option>
          <option value="done">완료</option>
          <option value="undone">미완료</option>
        </select>
        <button
          type="button"
          className={`btn-secondary ${filters.warn ? "!border-rose-300 !bg-rose-50 !text-rose-700" : ""}`}
          onClick={() => setFilters({ ...filters, warn: !filters.warn })}
          title="지급유형 공란·차시 공란·직접입력 단가 누락·등급 미등록 등 확인이 필요한 강의만 보기"
        >
          <AlertTriangle size={14} /> 확인 필요만
          {summary.warn ? ` (${summary.warn})` : ""}
        </button>
        {filters.date && (
          <span className="chip bg-brand-50 text-brand-800 ring-brand-200">
            {fmtDateKo(filters.date)}
            <button
              className="ml-1"
              onClick={() => setFilters({ ...filters, date: null })}
              aria-label="날짜 필터 해제"
            >
              <X size={12} />
            </button>
          </span>
        )}
        {isFiltered && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => setFilters(EMPTY)}
          >
            <X size={13} /> 필터 해제
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white">
            <button
              className={`px-2.5 py-1.5 text-[13px] ${view === "list" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() => setView("list")}
              title="목록"
            >
              <List size={15} />
            </button>
            <button
              className={`px-2.5 py-1.5 text-[13px] ${view === "calendar" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
              onClick={() =>
                period.mode === "month"
                  ? setView("calendar")
                  : router.push(`/lectures?ym=${ym}&view=calendar`)
              }
              title={
                period.mode === "month" ? "달력" : "달력 (기간의 첫 달로 이동)"
              }
            >
              <CalendarDays size={15} />
            </button>
          </div>
          {canEdit && (
            <button
              className="btn-primary"
              onClick={() => setDrawer({ mode: "create", lecture: null })}
              disabled={locked}
            >
              <Plus size={15} /> 강의 등록
            </button>
          )}
        </div>
      </div>

      {view === "calendar" ? (
        <LectureCalendar
          ym={ym}
          lectures={filtered}
          onPickDate={(d) => {
            setFilters({ ...filters, date: d });
            setView("list");
          }}
          onNewAt={
            canEdit && !locked
              ? (d) =>
                  setDrawer({
                    mode: "create",
                    lecture: { date: d } as LectureRow,
                  })
              : undefined
          }
        />
      ) : (
        <div className="card">
          {/* 표 자체 스크롤(머리글 고정) — 필터·요약은 그대로 두고 목록만 내린다 */}
          <div className="table-scroll max-h-[max(420px,calc(100dvh-290px))]">
            <table className="dense w-full min-w-[1210px] table-fixed text-[13px]">
              <colgroup>
                <col className="w-[94px]" />
                <col className="w-[136px]" />
                <col className="w-[58px]" />
                <col />
                <col />
                <col className="w-[46px]" />
                <col className="w-[84px]" />
                <col className="w-[76px]" />
                <col className="w-[88px]" />
                <col className="w-[88px]" />
                <col className="w-[80px]" />
                <col className="w-[40px]" />
                <col className="w-[40px]" />
                <col className="w-[128px]" />
              </colgroup>
              <thead>
                <tr>
                  <SortableTh col="time" sort={sort} onSort={setSort}>
                    시간
                  </SortableTh>
                  <SortableTh col="instructor" sort={sort} onSort={setSort}>
                    강사
                  </SortableTh>
                  <th className="text-left">역할</th>
                  <SortableTh col="institution" sort={sort} onSort={setSort}>
                    기관
                  </SortableTh>
                  <SortableTh col="content" sort={sort} onSort={setSort}>
                    콘텐츠
                  </SortableTh>
                  <SortableTh
                    col="sessions"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  >
                    차시
                  </SortableTh>
                  <th className="text-left">지급유형</th>
                  <SortableTh
                    col="unit"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  >
                    단가
                  </SortableTh>
                  <SortableTh
                    col="gross"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  >
                    세전
                  </SortableTh>
                  <SortableTh
                    col="net"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  >
                    세후
                  </SortableTh>
                  <SortableTh
                    col="travel"
                    sort={sort}
                    onSort={setSort}
                    align="right"
                  >
                    교통비
                  </SortableTh>
                  <th className="text-center">완료</th>
                  <th className="text-center">지급</th>
                  <th className="text-right"></th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr>
                    <td
                      colSpan={14}
                      className="py-10 text-center text-slate-500"
                    >
                      {lectures.length === 0
                        ? "이 달에 등록된 강의가 없습니다. 오른쪽 위 '강의 등록'으로 시작하세요."
                        : "조건에 맞는 강의가 없습니다."}
                    </td>
                  </tr>
                )}
                {groups.map(([date, rows]) => {
                  const dow = weekdayOf(date);
                  const sub = rows.reduce(
                    (a, l) => ({
                      s: a.s + (l.sessions ?? 0),
                      n: a.n + l.netAmount,
                      t: a.t + l.travelFee,
                    }),
                    { s: 0, n: 0, t: 0 },
                  );
                  return [
                    <tr key={`h-${date}`} className="bg-slate-100/80">
                      <td colSpan={14} className="!py-1.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`font-semibold ${weekdayClass(dow)}`}
                          >
                            {fmtDateKo(date)}
                          </span>
                          <span className="text-[12px] text-slate-500">
                            {rows.length}건 · {fmtSessions(sub.s)}차시 · 세후{" "}
                            {fmtWon(sub.n)}
                            {sub.t > 0 && <> · 교통비 {fmtWon(sub.t)}</>}
                          </span>
                          <button
                            className="ml-auto text-[12px] text-brand-700 hover:underline"
                            onClick={() =>
                              setFilters({
                                ...filters,
                                date: filters.date === date ? null : date,
                              })
                            }
                          >
                            {filters.date === date
                              ? "날짜 필터 해제"
                              : "이 날짜만"}
                          </button>
                        </div>
                      </td>
                    </tr>,
                    ...rows.map((l) => {
                      const warns = lectureWarnings(l, rules);
                      const busy = busyIds.has(l.id);
                      return (
                        <tr
                          key={l.id}
                          className={warns.length ? "bg-rose-50/40" : ""}
                        >
                          <td className="whitespace-nowrap text-slate-600">
                            {fmtTimeRange(l.startTime, l.endTime) || (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="overflow-hidden whitespace-nowrap">
                            {l.instructorId == null ? (
                              <span
                                className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200"
                                title="강사 미배정 — 수정에서 지정하세요"
                              >
                                미배정
                              </span>
                            ) : (
                              <>
                                <Link
                                  href={`/instructors/${l.instructorId}`}
                                  className={`hover:underline ${l.instructorActive ? "" : "text-slate-400"}`}
                                  title="강사 상세 보기"
                                >
                                  {l.instructorName}
                                </Link>
                                {!l.instructorActive && (
                                  <span className="ml-1 text-[11px] text-slate-400">
                                    (out)
                                  </span>
                                )}{" "}
                                <GradeBadge gradeCode={l.gradeCode} />
                              </>
                            )}
                            {warns.length > 0 && (
                              <span
                                className="ml-1 inline-flex align-middle text-rose-500"
                                title={warns.join("\n")}
                              >
                                <AlertTriangle size={13} />
                              </span>
                            )}
                            {warns.length > 0 && (
                              <div
                                className="truncate text-[11px] leading-tight text-rose-600"
                                title={warns.join("\n")}
                              >
                                {warns.join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            <RoleText role={l.role} />
                          </td>
                          <td className="overflow-hidden">
                            <div className="flex items-center gap-1">
                              <div
                                className="min-w-0 truncate"
                                title={
                                  filters.institutionId === l.institutionId
                                    ? "기관 필터 해제"
                                    : `${l.institutionName} 만 보기`
                                }
                              >
                                <button
                                  className="hover:underline"
                                  onClick={() =>
                                    setFilters({
                                      ...filters,
                                      institutionId:
                                        filters.institutionId ===
                                        l.institutionId
                                          ? null
                                          : l.institutionId,
                                    })
                                  }
                                >
                                  {l.institutionName}
                                </button>{" "}
                                <InstitutionTypeChip type={l.institutionType} />
                              </div>
                              {(rentalCounts[l.id] ?? 0) > 0 && (
                                <Link
                                  href={`/equipment?tab=rentals&lec=${l.id}`}
                                  className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-teal-700 hover:underline"
                                  title={`이 강의와 연동된 교구 대여 ${rentalCounts[l.id]}건 보기`}
                                >
                                  <Package size={11} />
                                  {rentalCounts[l.id]}
                                </Link>
                              )}
                            </div>
                          </td>
                          <td className="overflow-hidden">
                            <div
                              className="truncate"
                              title={
                                l.contentRaw
                                  ? `원본 표기: ${l.contentRaw}`
                                  : (l.content ?? "")
                              }
                            >
                              {l.content ?? (
                                <span className="text-slate-300">—</span>
                              )}
                              {l.contentRaw && (
                                <span className="ml-1 text-[10px] text-slate-400">
                                  원본
                                </span>
                              )}
                            </div>
                            {l.note && (
                              <div
                                className="truncate text-[11px] text-slate-500"
                                title={l.note}
                              >
                                {l.note}
                              </div>
                            )}
                          </td>
                          <td className="num">
                            {l.sessions == null ? (
                              <span className="text-rose-500">—</span>
                            ) : (
                              fmtSessions(l.sessions)
                            )}
                          </td>
                          <td>
                            <PayTypeChip payType={l.payType} />
                          </td>
                          <td className="num text-slate-600">
                            {fmtWon(l.unitPrice)}
                          </td>
                          <td className="num">{fmtWon(l.grossAmount)}</td>
                          <td className="num font-medium">
                            {fmtWon(l.netAmount)}
                            {l.taxType !== "사업소득" && (
                              <div className="text-[10px] leading-tight font-normal text-violet-600">
                                {l.taxType === "비과세"
                                  ? "비과세 0%"
                                  : "기타 8.8%"}
                              </div>
                            )}
                          </td>
                          <td className="num text-slate-600">
                            {l.travelFee ? (
                              fmtWon(l.travelFee)
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-brand-600"
                              checked={l.isDone}
                              disabled={!canEdit || busy}
                              onChange={(e) =>
                                runToggle(l, "isDone", e.target.checked)
                              }
                              aria-label="완료"
                            />
                          </td>
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className={`h-4 w-4 accent-brand-600 ${isPayable(l) ? "" : "opacity-35"}`}
                              checked={l.isPaid}
                              disabled={!canEdit || busy || isLockedRow(l)}
                              onChange={(e) =>
                                runToggle(l, "isPaid", e.target.checked)
                              }
                              aria-label="지급"
                              title={
                                isInstitutionPaid(l)
                                  ? "기관지급 — 기관이 강사에게 직접 지급. 미지급 집계에서 제외 (체크는 가능)"
                                  : !isPayable(l)
                                    ? "세후 0원(연구원·단가 없음 등) — 미지급 집계에서 제외 (체크는 가능)"
                                    : undefined
                              }
                            />
                          </td>
                          <td className="whitespace-nowrap text-right">
                            {canEdit && (
                              <div className="inline-flex items-center gap-0.5">
                                <button
                                  className="btn-ghost btn-sm"
                                  title="수정"
                                  onClick={() =>
                                    setDrawer({ mode: "edit", lecture: l })
                                  }
                                  disabled={isLockedRow(l)}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="btn-ghost btn-sm"
                                  title="복제 (날짜만 바꿔 다시 등록)"
                                  onClick={() =>
                                    setDrawer({ mode: "copy", lecture: l })
                                  }
                                  disabled={locked}
                                >
                                  <Copy size={13} />
                                </button>
                                <ConfirmButton
                                  onConfirm={() => runDelete(l)}
                                  disabled={isLockedRow(l) || pending}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td colSpan={5} className="text-right text-slate-600">
                      합계 {filtered.length}건
                    </td>
                    <td className="num">{fmtSessions(summary.sessions)}</td>
                    <td></td>
                    <td></td>
                    <td className="num">{fmtWon(summary.gross)}</td>
                    <td className="num text-brand-700">
                      {fmtWon(summary.net)}
                    </td>
                    <td className="num">
                      {summary.travel ? fmtWon(summary.travel) : "-"}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {drawer && (
        <LectureForm
          equipment={equipment}
          linkedRentals={
            drawer && drawer.mode === "edit" && drawer.lecture?.id
              ? (rentalCounts[drawer.lecture.id] ?? 0)
              : 0
          }
          mode={drawer.mode}
          lecture={drawer.lecture}
          ym={ym}
          master={master}
          onClose={() => setDrawer(null)}
          onSaved={(msg) => {
            toast(msg);
            setDrawer(null);
          }}
        />
      )}
    </div>
  );
}
