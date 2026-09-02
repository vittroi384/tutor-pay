"use client";
/**
 * 강사 상세 화면의 '수정' 버튼 + 서랍 (클라이언트 부분만 분리).
 */
import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Grade, Instructor } from "@/lib/types";
import { InstructorForm } from "../InstructorsView";

export function InstructorDetailClient({
  instructor,
  grades,
  canEdit,
}: {
  instructor: Instructor;
  grades: Grade[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return null;
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        <Pencil size={14} /> 정보 수정
      </button>
      {open && (
        <InstructorForm
          grades={grades}
          instructor={instructor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
