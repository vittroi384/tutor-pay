"use client";
/**
 * 작은 표시용 칩/배지 — 지급유형(PayTypeChip), 등급(GradeBadge), 기관유형(InstitutionTypeChip), 역할(RoleText).
 * 지급유형·등급 색은 코드표(CodesProvider → DB pay_types/grades 의 color)에서 읽고,
 * 코드표에 없는 값은 lib/constants.ts 의 기본 표 → 회색 순으로 떨어진다.
 */
import { useCodes } from "@/components/CodesProvider";
import {
  CHIP_COLORS,
  GRADE_CLASS,
  GRADE_SHORT,
  INSTITUTION_TYPE_CLASS,
  PAY_TYPE_CLASS,
} from "@/lib/constants";

/** 지급유형 칩 (색은 지급유형 관리에서 고른 색) */
export function PayTypeChip({
  payType,
}: {
  payType: string | null | undefined;
}) {
  const { payTypes } = useCodes();
  const key = payType || "미지정";
  const meta = payTypes.find((p) => p.code === key);
  const cls = meta
    ? (CHIP_COLORS[meta.color]?.chip ?? CHIP_COLORS.slate.chip)
    : (PAY_TYPE_CLASS[key] ??
      (key === "미지정" ? PAY_TYPE_CLASS["미지정"] : CHIP_COLORS.slate.chip));
  return (
    <span
      className={`chip ${cls}`}
      title={meta && !meta.isActive ? `${key} (사용 중지된 유형)` : undefined}
    >
      {key}
    </span>
  );
}

/** 등급 배지 (색은 등급 관리에서 고른 색). full=true 면 "A등급" 처럼 전체 표기, 아니면 짧게(S/A/B/연구원) */
export function GradeBadge({
  gradeCode,
  full = false,
}: {
  gradeCode: string | null | undefined;
  full?: boolean;
}) {
  const { grades } = useCodes();
  const key = gradeCode || "미등록";
  const meta = grades.find((g) => g.code === key);
  const cls = meta
    ? (CHIP_COLORS[meta.color]?.badge ?? CHIP_COLORS.slate.badge)
    : (GRADE_CLASS[key] ?? GRADE_CLASS["미등록"]);
  const short = GRADE_SHORT[key] ?? key.replace(/등급$/, "");
  return (
    <span className={`badge ${cls}`} title={key}>
      {full ? key : short}
    </span>
  );
}

/** 기관유형 칩 (초등/중등/고등/유치원/어린이집/기타 기관) */
export function InstitutionTypeChip({ type }: { type: string }) {
  return (
    <span
      className={`chip ${INSTITUTION_TYPE_CLASS[type] ?? INSTITUTION_TYPE_CLASS["기타 기관"]}`}
    >
      {type}
    </span>
  );
}

/** 역할 표시 — 보조강사는 흐리게 */
export function RoleText({ role }: { role: string }) {
  return (
    <span
      className={
        role === "보조강사" ? "text-slate-500" : "text-slate-800 font-medium"
      }
    >
      {role}
    </span>
  );
}
