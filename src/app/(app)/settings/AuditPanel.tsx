"use client";
/**
 * 변경 이력 + 삭제 복원 패널 (설정 화면).
 *  - 최근 이력을 표로: 일시·사용자·대상·동작·요약, 대상/동작/검색 필터, 페이지
 *  - '삭제' 이력에는 [복원] 버튼 — restoreDeleted 가 삭제 당시 내용을 그대로 되살린다
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { fmtDateTime } from "@/lib/format";
import { restoreDeleted } from "./actions";

export type AuditRow = {
  id: number;
  at: string;
  userEmail: string | null;
  tableName: string;
  recordId: string | null;
  action: string;
  summary: string | null;
};

const TABLE_LABEL: Record<string, string> = {
  lectures: "강의",
  instructors: "강사",
  institutions: "기관",
  contents: "콘텐츠",
  content_aliases: "별칭",
  rate_tables: "단가표",
  rate_items: "단가항목",
  pay_types: "지급유형",
  grades: "등급",
  users: "사용자",
  settlement_locks: "정산잠금",
  equipment: "교구",
  equipment_rentals: "교구대여",
  instructor_files: "강사 파일",
};
const ACTION_LABEL: Record<string, string> = {
  create: "등록",
  update: "수정",
  delete: "삭제",
  merge: "병합",
  toggle: "변경",
  "bulk-paid": "일괄지급",
  lock: "잠금",
  unlock: "해제",
  import: "가져오기",
  "grade-change": "등급변경",
  return: "반납",
  restore: "복원",
};
/** 복원을 지원하는 테이블 (settings/actions.ts 의 RESTORE_LABEL 과 동일해야 함) */
const RESTORABLE = new Set([
  "lectures",
  "contents",
  "pay_types",
  "grades",
  "users",
  "equipment",
  "equipment_rentals",
]);

export function AuditPanel({
  rows,
  canEdit,
}: {
  rows: AuditRow[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [table, setTable] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  useEffect(() => setPage(1), [table, action, q, pageSize]);

  const tables = useMemo(
    () => [...new Set(rows.map((r) => r.tableName))].sort(),
    [rows],
  );
  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!table || r.tableName === table) &&
        (!action || r.action === action) &&
        (!qq ||
          (r.summary ?? "").toLowerCase().includes(qq) ||
          (r.userEmail ?? "").toLowerCase().includes(qq)),
    );
  }, [rows, table, action, q]);
  const pageRows = useMemo(
    () => visible.slice((page - 1) * pageSize, page * pageSize),
    [visible, page, pageSize],
  );

  const runRestore = (r: AuditRow) => {
    setBusyIds((s) => new Set(s).add(r.id));
    start(async () => {
      const res = await restoreDeleted(r.id);
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(r.id);
        return n;
      });
      res.ok
        ? toast(res.data?.summary ?? "복원했어요")
        : toast(res.error, "error");
    });
  };

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <div className="text-[13px] font-semibold text-slate-700">
          변경 이력 · 삭제 복원
        </div>
        <div className="relative ml-2">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="input w-48 pl-7"
            placeholder="요약·사용자 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="input w-32"
          value={table}
          onChange={(e) => setTable(e.target.value)}
        >
          <option value="">대상 전체</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {TABLE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <select
          className="input w-28"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">동작 전체</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-slate-500">
          {visible.length}건 (최근 400건 안에서)
        </span>
      </div>
      <table className="dense w-full min-w-[860px] table-fixed text-[12.5px]">
        <colgroup>
          <col className="w-[104px]" />
          <col className="w-[168px]" />
          <col className="w-[96px]" />
          <col className="w-[76px]" />
          <col />
          <col className="w-[86px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="text-left">일시</th>
            <th className="text-left">사용자</th>
            <th className="text-left">대상</th>
            <th className="text-left">동작</th>
            <th className="text-left">요약</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-slate-500">
                조건에 맞는 이력이 없습니다.
              </td>
            </tr>
          )}
          {pageRows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-slate-500">
                {fmtDateTime(r.at)}
              </td>
              <td className="overflow-hidden whitespace-nowrap text-slate-600">
                <span className="truncate" title={r.userEmail ?? ""}>
                  {(r.userEmail ?? "").split("@")[0] || "-"}
                </span>
              </td>
              <td
                className="overflow-hidden whitespace-nowrap text-ellipsis"
                title={r.tableName}
              >
                {TABLE_LABEL[r.tableName] ?? r.tableName}
              </td>
              <td className="whitespace-nowrap">
                <span
                  className={
                    r.action === "delete"
                      ? "text-rose-700"
                      : r.action === "restore"
                        ? "text-brand-700"
                        : ""
                  }
                >
                  {ACTION_LABEL[r.action] ?? r.action}
                </span>
              </td>
              <td className="overflow-hidden">
                <div className="truncate" title={r.summary ?? ""}>
                  {r.summary ?? ""}
                </div>
              </td>
              <td className="whitespace-nowrap text-right">
                {canEdit &&
                  r.action === "delete" &&
                  RESTORABLE.has(r.tableName) && (
                    <button
                      className="btn-secondary btn-sm"
                      title="삭제 당시 내용 그대로 되살리기"
                      disabled={busyIds.has(r.id)}
                      onClick={() => runRestore(r)}
                    >
                      <RotateCcw size={12} /> 복원
                    </button>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={visible.length}
        onPage={setPage}
        onPageSize={setPageSize}
      />
      <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] text-slate-500">
        [복원] 은 삭제 당시 저장된 내용을 원래 번호 그대로 되살립니다. 이름이
        그새 다른 항목에 쓰였거나, 강의가 정산 확정(잠금)된 달이거나, 연결된
        강사·기관·교구가 함께 삭제된 경우에는 이유를 알려주고 복원하지 않습니다.
        (단가표 버전은 복원 대상이 아님)
      </p>
    </div>
  );
}
