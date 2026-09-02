/**
 * 색 키 → 칩 클래스. 지급유형·등급을 화면에서 추가할 때 고르는 팔레트.
 * (Tailwind 는 클래스 문자열을 정적으로 찾으므로 여기 다 적어둬야 한다)
 */
export const CHIP_COLORS: Record<
  string,
  { chip: string; badge: string; label: string; hex: string }
> = {
  sky: {
    chip: "bg-sky-100 text-sky-800 ring-sky-200",
    badge: "bg-sky-100 text-sky-800",
    label: "하늘",
    hex: "#0ea5e9",
  },
  violet: {
    chip: "bg-violet-100 text-violet-800 ring-violet-200",
    badge: "bg-violet-100 text-violet-800",
    label: "보라",
    hex: "#8b5cf6",
  },
  teal: {
    chip: "bg-teal-100 text-teal-800 ring-teal-200",
    badge: "bg-teal-100 text-teal-800",
    label: "청록",
    hex: "#0d9488",
  },
  slate: {
    chip: "bg-slate-200 text-slate-700 ring-slate-300",
    badge: "bg-slate-200 text-slate-700",
    label: "회색",
    hex: "#94a3b8",
  },
  orange: {
    chip: "bg-orange-100 text-orange-800 ring-orange-200",
    badge: "bg-orange-100 text-orange-800",
    label: "주황",
    hex: "#f97316",
  },
  lime: {
    chip: "bg-lime-100 text-lime-800 ring-lime-200",
    badge: "bg-lime-100 text-lime-800",
    label: "연두",
    hex: "#84cc16",
  },
  amber: {
    chip: "bg-amber-100 text-amber-800 ring-amber-200",
    badge: "bg-amber-100 text-amber-800",
    label: "노랑",
    hex: "#f59e0b",
  },
  rose: {
    chip: "bg-rose-100 text-rose-800 ring-rose-200",
    badge: "bg-rose-100 text-rose-800",
    label: "빨강",
    hex: "#f43f5e",
  },
  blue: {
    chip: "bg-blue-100 text-blue-800 ring-blue-200",
    badge: "bg-blue-100 text-blue-800",
    label: "파랑",
    hex: "#3b82f6",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    badge: "bg-emerald-100 text-emerald-800",
    label: "초록",
    hex: "#10b981",
  },
  pink: {
    chip: "bg-pink-100 text-pink-800 ring-pink-200",
    badge: "bg-pink-100 text-pink-800",
    label: "분홍",
    hex: "#ec4899",
  },
  indigo: {
    chip: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    badge: "bg-indigo-100 text-indigo-800",
    label: "남색",
    hex: "#6366f1",
  },
  cyan: {
    chip: "bg-cyan-100 text-cyan-800 ring-cyan-200",
    badge: "bg-cyan-100 text-cyan-800",
    label: "청색",
    hex: "#06b6d4",
  },
  fuchsia: {
    chip: "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200",
    badge: "bg-fuchsia-100 text-fuchsia-800",
    label: "자홍",
    hex: "#d946ef",
  },
  ink: {
    chip: "bg-slate-800 text-white ring-slate-700",
    badge: "bg-slate-800 text-white",
    label: "진회색",
    hex: "#1e293b",
  },
};

/** 기본 지급유형의 색 키 (마이그레이션 시드와 동일) */
export const DEFAULT_PAY_TYPE_COLOR: Record<string, string> = {
  관내: "sky",
  관외: "violet",
  아코센터: "teal",
  기관지급: "slate",
  "주(주말교육)": "orange",
  교구정리: "lime",
  수동기입: "amber",
};
/** 기본 등급의 색 키 */
export const DEFAULT_GRADE_COLOR: Record<string, string> = {
  S등급: "amber",
  A등급: "teal",
  B등급: "slate",
  아코연구원: "ink",
};

/** 칩·배지 색 (7.1) — 기본값 표. 화면에서 추가한 유형/등급은 CHIP_COLORS 팔레트로 색을 고른다 */
export const PAY_TYPE_CLASS: Record<string, string> = {
  관내: "bg-sky-100 text-sky-800 ring-sky-200",
  관외: "bg-violet-100 text-violet-800 ring-violet-200",
  아코센터: "bg-teal-100 text-teal-800 ring-teal-200",
  기관지급: "bg-slate-200 text-slate-700 ring-slate-300",
  "주(주말교육)": "bg-orange-100 text-orange-800 ring-orange-200",
  교구정리: "bg-lime-100 text-lime-800 ring-lime-200",
  수동기입: "bg-amber-100 text-amber-800 ring-amber-200",
  미지정: "bg-rose-100 text-rose-800 ring-rose-200",
};

export const GRADE_CLASS: Record<string, string> = {
  S등급: "bg-amber-100 text-amber-800",
  A등급: "bg-teal-100 text-teal-800",
  B등급: "bg-slate-200 text-slate-700",
  아코연구원: "bg-slate-800 text-white",
  미등록: "bg-rose-100 text-rose-800",
};

export const GRADE_SHORT: Record<string, string> = {
  S등급: "S",
  A등급: "A",
  B등급: "B",
  아코연구원: "연구원",
  미등록: "미등록",
};

export const INSTITUTION_TYPE_CLASS: Record<string, string> = {
  초등: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  중등: "bg-blue-50 text-blue-700 ring-blue-200",
  고등: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  유치원: "bg-pink-50 text-pink-700 ring-pink-200",
  어린이집: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  "기타 기관": "bg-slate-100 text-slate-600 ring-slate-200",
};

/** 웹앱 이름 (표시용) */
export const APP_NAME = "TutorPay";
/** 한 줄 설명 */
export const APP_TAGLINE = "TutorPay 강사 급여정산";
/** 회사명 (명세서·문서 표기) */
export const COMPANY_NAME = "TutorPay";
