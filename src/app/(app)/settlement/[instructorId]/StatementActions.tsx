"use client";
/**
 * 명세서 상단 버튼 — 미지급 일괄 지급완료(잠긴 달 포함 시 불가), 인쇄/PDF, 강의배정에서 보기.
 */
import Link from "next/link";
import { useTransition } from "react";
import { CheckCheck, ExternalLink, Printer } from "lucide-react";
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
      {canEdit && (
        <button
          className="btn-primary"
          disabled={unpaidCount === 0 || pending || locked}
          onClick={() =>
            start(async () => {
              const r = await markInstructorPeriodPaid(instructorId, from, to);
              if (r.ok)
                toast(`${r.data?.count ?? 0}건을 지급완료로 처리했어요`);
              else toast(r.error, "error");
            })
          }
        >
          <CheckCheck size={15} /> 미지급 {unpaidCount}건 지급완료 처리
        </button>
      )}
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
      {locked && (
        <span className="text-[12px] text-amber-700">{lockedLabel}</span>
      )}
    </div>
  );
}
