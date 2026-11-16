"use client";
/**
 * 명세서 상단 버튼 — 왼쪽: 정산 목록·강사 상세·인쇄/PDF·강의배정 / 오른쪽 끝: 미지급 일괄 지급완료(확정된 달 포함 시 관리자만).
 */
import Link from "next/link";
import { useTransition } from "react";
import { ArrowLeft, CheckCheck, ExternalLink, Printer } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { markInstructorPeriodPaid } from "../../lectures/actions";

export function StatementActions({
  instructorId,
  from,
  to,
  query,
  unpaidCount,
  canEdit,
  locked,
  lockedLabel,
}: {
  instructorId: number;
  from: string;
  to: string;
  query: string;
  unpaidCount: number;
  canEdit: boolean;
  locked: boolean;
  lockedLabel: string;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 이동 버튼은 왼쪽, 지급완료 처리는 오른쪽 끝 — 뒤로 가려다 지급 버튼을 잘못 누르지 않게 서로 멀리 둔다 */}
      <Link className="btn-secondary" href={`/settlement?${query}`}>
        <ArrowLeft size={15} /> 정산 목록으로
      </Link>
      <Link className="btn-secondary" href={`/instructors/${instructorId}`}>
        강사 상세
      </Link>
      <span className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block" />
      <button
        className="btn-secondary"
        onClick={() => window.print()}
        title="인쇄 창에서 '대상: PDF로 저장'을 고르면 PDF 파일로 저장됩니다. 상단의 날짜·주소가 싫으면 '머리글 및 바닥글' 체크를 끄세요"
      >
        <Printer size={15} /> 인쇄 / PDF 저장
      </button>
      <Link
        className="btn-secondary"
        href={`/lectures?${query}&instructor=${instructorId}`}
      >
        <ExternalLink size={15} /> 강의배정에서 보기
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {locked && (
          <span className="text-[12px] text-amber-700">{lockedLabel}</span>
        )}
        {canEdit && (
          <button
            className="btn-primary"
            disabled={unpaidCount === 0 || pending || locked}
            onClick={() =>
              start(async () => {
                const r = await markInstructorPeriodPaid(
                  instructorId,
                  from,
                  to,
                );
                if (r.ok)
                  toast(`${r.data?.count ?? 0}건을 지급완료로 처리했어요`);
                else toast(r.error, "error");
              })
            }
          >
            <CheckCheck size={15} /> 미지급 {unpaidCount}건 지급완료 처리
          </button>
        )}
      </div>
    </div>
  );
}
