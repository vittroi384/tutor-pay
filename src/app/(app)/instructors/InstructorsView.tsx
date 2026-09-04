"use client";
/**
 * 강사 목록 (클라이언트) — 검색·등급·지역·활동 필터, 열 제목 클릭 정렬(오름/내림), 페이지네이션, 강의 목록/명세서 바로가기,
 * 강사 등록·수정 서랍(InstructorForm: 등급 변경 시 기존 강의 단가는 그대로라는 안내 포함).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, Coins, Pencil, Plus, Search } from "lucide-react";
import {
  SortableTh,
  compareValues,
  type SortState,
} from "@/components/ui/SortableTh";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Drawer } from "@/components/ui/Drawer";
import { GradeBadge } from "@/components/ui/Chips";
import { useToast } from "@/components/ui/Toast";
import { REGIONS } from "@/lib/calc";
import { fmtDateShort, fmtSessions, fmtWon } from "@/lib/format";
import type { Grade, Instructor } from "@/lib/types";
import {
  deleteInstructor,
  createInstructor,
  updateInstructor,
  type InstructorInput,
} from "./actions";

type Row = Instructor & {
  stat: {
    count: number;
    sessions: number;
    net: number;
    unpaid: number;
    last: string | null;
  };
};
type SortKey =
  | "name"
  | "grade"
  | "region"
  | "phone"
  | "count"
  | "sessions"
  | "net"
  | "unpaid"
  | "last";
const GRADE_ORDER: Record<string, number> = {
  S등급: 0,
  A등급: 1,
  B등급: 2,
  연구원: 3,
};
/** 정렬 키별 비교값 — 등급은 S→A→B→연구원→미등록 순이 되도록 숫자로 바꾼다 */
function sortValue(r: Row, key: SortKey): unknown {
  switch (key) {
    case "name":
      return r.name;
    case "grade":
      return r.gradeCode ? (GRADE_ORDER[r.gradeCode] ?? 8) : 9;
    case "region":
      return r.region;
    case "phone":
      return r.phone;
    case "count":
      return r.stat.count;
    case "sessions":
      return r.stat.sessions;
    case "net":
      return r.stat.net;
    case "unpaid":
      return r.stat.unpaid;
    case "last":
      return r.stat.last;
  }
}

export function InstructorsView({
  rows,
  grades,
  year,
  canEdit,
  initialGrade,
  initialQ,
}: {
  rows: Row[];
  grades: Grade[];
  year: number;
  canEdit: boolean;
  initialGrade: string;
  initialQ: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [grade, setGrade] = useState(initialGrade);
  const [region, setRegion] = useState("");
  const [active, setActive] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<Instructor | null | "new">(null);
  const [sort, setSort] = useState<SortState<SortKey>>({
    key: "name",
    dir: "asc",
  });
  // 필터 → 정렬 (열 클릭) 순서로 계산 — 페이지 없이 전체를 표 안 스크롤로 본다
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (
          qq &&
          !`${r.name} ${r.phone ?? ""} ${r.note ?? ""}`
            .toLowerCase()
            .includes(qq)
        )
          return false;
        if (grade && (r.gradeCode ?? "미등록") !== grade) return false;
        if (region && r.region !== region) return false;
        if (active === "active" && !r.isActive) return false;
        if (active === "inactive" && r.isActive) return false;
        return true;
      })
      .sort(
        (a, b) =>
          compareValues(
            sortValue(a, sort.key),
            sortValue(b, sort.key),
            sort.dir,
          ) || a.name.localeCompare(b.name, "ko"),
      );
  }, [rows, q, grade, region, active, sort]);

  const regions = [
    ...new Set(rows.map((r) => r.region).filter(Boolean)),
  ] as string[];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400"
          />
          <input
            className="input w-52 pl-8"
            placeholder="이름·연락처·비고 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input w-32"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">등급 전체</option>
          {grades.map((g) => (
            <option key={g.id} value={g.code}>
              {g.code}
            </option>
          ))}
          <option value="미등록">미등록</option>
        </select>
        <select
          className="input w-28"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">지역 전체</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="input w-32"
          value={active}
          onChange={(e) => setActive(e.target.value as typeof active)}
        >
          <option value="all">활동여부 전체</option>
          <option value="active">활동</option>
          <option value="inactive">비활성(out)</option>
        </select>
        <span className="text-[12px] text-slate-500">{visible.length}명</span>
        {canEdit && (
          <button
            className="btn-primary ml-auto"
            onClick={() => setEditing("new")}
          >
            <Plus size={15} /> 강사 등록
          </button>
        )}
      </div>
      <div className="card">
        {/* table-fixed + colgroup: 정렬·페이지를 바꿔 내용이 달라져도 열 너비가 고정되어 표가 흔들리지 않는다. 표는 자체 스크롤(머리글 고정) */}
        <div className="table-scroll max-h-[max(420px,calc(100dvh-158px))]">
          <table className="dense w-full min-w-[1000px] table-fixed text-[13px]">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-[92px]" />
              <col className="w-[64px]" />
              <col className="w-[122px]" />
              <col className="w-[86px]" />
              <col className="w-[64px]" />
              <col className="w-[104px]" />
              <col className="w-[70px]" />
              <col className="w-[78px]" />
              <col />
              <col className="w-[104px]" />
            </colgroup>
            <thead>
              <tr>
                <SortableTh col="name" sort={sort} onSort={setSort}>
                  강사명
                </SortableTh>
                <SortableTh col="grade" sort={sort} onSort={setSort}>
                  등급
                </SortableTh>
                <SortableTh col="region" sort={sort} onSort={setSort}>
                  지역
                </SortableTh>
                <SortableTh col="phone" sort={sort} onSort={setSort}>
                  연락처
                </SortableTh>
                <SortableTh
                  col="count"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                >
                  {year}년 강의
                </SortableTh>
                <SortableTh
                  col="sessions"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                >
                  차시
                </SortableTh>
                <SortableTh
                  col="net"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                >
                  세후 누계
                </SortableTh>
                <SortableTh
                  col="unpaid"
                  sort={sort}
                  onSort={setSort}
                  align="right"
                >
                  미지급
                </SortableTh>
                <SortableTh col="last" sort={sort} onSort={setSort}>
                  최근 강의
                </SortableTh>
                <th className="text-left">비고</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={r.isActive ? "" : "text-slate-400"}>
                  <td className="overflow-hidden whitespace-nowrap">
                    <Link
                      href={`/instructors/${r.id}`}
                      className="inline-flex items-center gap-1.5 align-middle font-medium hover:text-brand-700 hover:underline"
                      title={r.name}
                    >
                      {r.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.photo}
                          alt=""
                          className="h-5 w-5 rounded-full object-cover ring-1 ring-slate-200"
                        />
                      ) : null}
                      {r.name}
                    </Link>
                    {!r.isActive && (
                      <span className="ml-1 text-[11px]">(out)</span>
                    )}
                  </td>
                  <td className="overflow-hidden whitespace-nowrap">
                    <GradeBadge gradeCode={r.gradeCode} full />
                  </td>
                  <td className="overflow-hidden whitespace-nowrap">
                    {r.region ?? "-"}
                  </td>
                  <td className="overflow-hidden whitespace-nowrap tabular-nums">
                    {r.phone ?? "-"}
                  </td>
                  <td className="num">{r.stat.count}</td>
                  <td className="num">{fmtSessions(r.stat.sessions)}</td>
                  <td className="num">{fmtWon(r.stat.net)}</td>
                  <td className="num">
                    {r.stat.unpaid ? (
                      <span className="text-amber-700">{r.stat.unpaid}건</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.stat.last ? fmtDateShort(r.stat.last) : "-"}
                  </td>
                  <td className="overflow-hidden">
                    <div className="truncate" title={r.note ?? ""}>
                      {r.note ?? ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Link
                      className="btn-ghost btn-sm"
                      href={`/lectures?from=${year}-01-01&to=${year}-12-31&instructor=${r.id}`}
                      title={`${year}년 강의 목록`}
                    >
                      <CalendarDays size={13} />
                    </Link>
                    <Link
                      className="btn-ghost btn-sm"
                      href={`/settlement/${r.id}`}
                      title="이번 달 명세서"
                    >
                      <Coins size={13} />
                    </Link>
                    {canEdit && (
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setEditing(r)}
                        title="수정"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    조건에 맞는 강사가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <InstructorForm
          grades={grades}
          instructor={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function InstructorForm({
  grades,
  instructor,
  onClose,
}: {
  grades: Grade[];
  instructor: Instructor | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(instructor?.name ?? "");
  const [gradeId, setGradeId] = useState<string>(
    instructor?.gradeId ? String(instructor.gradeId) : "",
  );
  const [phone, setPhone] = useState(instructor?.phone ?? "");
  const [region, setRegion] = useState(instructor?.region ?? "");
  const [isActive, setIsActive] = useState(instructor?.isActive ?? true);
  const [note, setNote] = useState(instructor?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const input: InstructorInput = {
      name,
      gradeId: gradeId ? Number(gradeId) : null,
      phone: phone.trim() || null,
      region: region || null,
      isActive,
      note: note.trim() || null,
    };
    const r = instructor
      ? await updateInstructor(instructor.id, input)
      : await createInstructor(input);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    toast(
      instructor
        ? `강사 정보를 저장했어요 · ${name}`
        : `강사를 등록했어요 · ${name}`,
    );
    onClose();
  };

  return (
    <Drawer
      open
      title={instructor ? "강사 수정" : "강사 등록"}
      onClose={onClose}
      width="max-w-md"
      footer={
        <div className="flex items-center gap-2">
          {instructor && (
            <ConfirmButton
              className="btn-ghost text-rose-600 hover:bg-rose-50"
              label="삭제"
              confirmLabel="삭제 확정 — 첨부 파일도 함께"
              onConfirm={async () => {
                const r = await deleteInstructor(instructor.id);
                if (r.ok) {
                  toast(`강사를 삭제했어요 · ${instructor.name}`);
                  onClose();
                  if (window.location.pathname !== "/instructors")
                    window.location.href = "/instructors";
                  else router.refresh();
                } else setError(r.error);
              }}
            />
          )}
          <span className="mr-auto text-[12px] text-rose-600">{error}</span>
          <button className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">
            강사명 * (지역 접두 + 이름, 예: 강북홍길동)
          </label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">등급</label>
            <select
              className="input"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
            >
              <option value="">미등록 (단가 0)</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">지역</label>
            <Combobox
              value={region}
              onChange={setRegion}
              allowCustom
              placeholder="선택하거나 새 지역 입력 (예: 속초)"
              options={[...new Set([...REGIONS, instructor?.region ?? ""])]
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, "ko"))
                .map((r) => ({ value: r, label: r }))}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              강릉·동해 강사는 단가가 일괄 적용됩니다(주 5만 · 보조 3.5만).
            </p>
          </div>
        </div>
        <div>
          <label className="label">연락처</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
          />
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
          활동 중 (해제하면 out — 목록 뒤로 가고 배정 시 (out) 표시)
        </label>
        {instructor &&
          instructor.gradeId !== (gradeId ? Number(gradeId) : null) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              등급을 바꾸면 이후 새로 저장하는 강의부터 새 단가가 적용됩니다.
              이미 저장된 강의의 단가는 그대로 유지됩니다(스냅샷).
            </p>
          )}
      </div>
    </Drawer>
  );
}
