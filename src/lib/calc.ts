/**
 * 정산 계산 규칙의 '단일 진실 공급원'. 서버(저장 시 스냅샷)와 클라이언트(폼 실시간 미리보기)가 같은 함수를 쓴다.
 * - 코드값 상수(지급유형·역할·등급·기관유형·지역), 단가표 열 정의(RATE_COLUMNS)
 * - findRateTable: 강의 날짜에 적용되는 단가표 버전 선택
 * - lookupUnitPrice → grossOf → netOf → calcAmounts: 단가 → 세전 → 세후(3.3% 원천징수 절사)
 * - classifyInstitution / regionFromInstitutionName: 기관명으로 유형·지역 자동 판별
 * - isInstitutionPaid / isUnpaid: '기관지급'은 미지급 집계 제외
 * - lectureWarnings: 화면의 ⚠ 경고 문구, parseTimeRange: 시트 시간 문자열 파싱
 * 규칙을 바꿀 땐 이 파일만 고치고 scripts/verify-calc.ts 로 시트 값과 다시 대조할 것.
 */
import type { RateItem, RateTable } from "./types";

// ---- 코드 값 ----
/**
 * 지급유형 규칙. 실제 목록은 DB(pay_types)에 있고 화면에서 추가할 수 있다.
 * 아래 DEFAULT_PAY_TYPE_RULES 는 시트 이전 당시의 기본 7종 — DB 를 못 읽는 스크립트(시드·검증)와
 * 규칙 인자를 생략한 호출의 기본값으로 쓴다.
 */
export type PayTypeRule = {
  code: string;
  roleBased: boolean;
  manual: boolean;
  sort?: number;
  isActive?: boolean;
};
export const DEFAULT_PAY_TYPE_RULES: PayTypeRule[] = [
  { code: "관내", roleBased: true, manual: false, sort: 1 },
  { code: "관외", roleBased: true, manual: false, sort: 2 },
  { code: "센터", roleBased: true, manual: false, sort: 3 },
  { code: "기관지급", roleBased: false, manual: false, sort: 4 },
  { code: "주(주말교육)", roleBased: false, manual: false, sort: 5 },
  { code: "교구정리", roleBased: false, manual: false, sort: 6 },
  { code: "수동기입", roleBased: false, manual: true, sort: 7 },
];
/** @deprecated 기본 7종 코드 목록 — 화면·검증은 DB 의 pay_types 를 쓰세요 */
export const PAY_TYPES = DEFAULT_PAY_TYPE_RULES.map((r) => r.code);
export const ROLES = ["주강사", "보조강사"] as const;
export const GRADE_CODES = ["S등급", "A등급", "B등급", "연구원"] as const;
export const INSTITUTION_TYPES = [
  "초등",
  "중등",
  "고등",
  "유치원",
  "어린이집",
  "기타 기관",
] as const;
/** 일괄 단가(주 5만·보조 3.5만)가 적용되는 지역 — 강사의 지역 값으로 판별 */
export const FLAT_RATE_REGIONS = ["강릉", "동해"] as const;
export const FLAT_RATE_GROUP = "강릉·동해";
/** 강사 지역 → 단가표 지역 그룹 ('강릉·동해' 또는 null=기본) */
export function regionGroupOf(
  region: string | null | undefined,
): string | null {
  return region && (FLAT_RATE_REGIONS as readonly string[]).includes(region)
    ? FLAT_RATE_GROUP
    : null;
}

export const REGIONS = [
  "강북",
  "강릉",
  "춘천",
  "충청",
  "철원",
  "태백",
  "동해",
] as const;

export type RateColumn = {
  key: string;
  label: string;
  payType: string;
  role: string | null;
};
/**
 * 단가표 열 목록 (화면 표시·엑셀·새 버전 폼 공용).
 * 순서: 역할구분 유형의 주강사 열들 → 같은 유형들의 보조강사 열들 → 역할 무관 유형들. 수동기입(manual)은 열이 없다.
 * 비활성 유형도 과거 단가 확인을 위해 포함한다(includeInactive=false 로 제외 가능).
 */
export function rateColumns(
  rules: PayTypeRule[] = DEFAULT_PAY_TYPE_RULES,
  includeInactive = true,
): RateColumn[] {
  const list = [...rules]
    .filter((r) => !r.manual && (includeInactive || r.isActive !== false))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const cols: RateColumn[] = [];
  for (const r of list)
    if (r.roleBased)
      cols.push({
        key: `주-${r.code}`,
        label: `주(${r.code})`,
        payType: r.code,
        role: "주강사",
      });
  for (const r of list)
    if (r.roleBased)
      cols.push({
        key: `보조-${r.code}`,
        label: `보조(${r.code})`,
        payType: r.code,
        role: "보조강사",
      });
  for (const r of list)
    if (!r.roleBased)
      cols.push({ key: r.code, label: r.code, payType: r.code, role: null });
  return cols;
}
/** 기본 7종 기준 단가표 열 (스크립트·엑셀 기본값) */
export const RATE_COLUMNS: RateColumn[] = rateColumns();

/** 규칙 목록에서 코드로 찾기 (없으면 undefined) */
export function payTypeRule(
  rules: PayTypeRule[],
  code: string | null | undefined,
): PayTypeRule | undefined {
  return code ? rules.find((r) => r.code === code) : undefined;
}
/** 단가를 직접 입력하는 유형인지 */
export function isManualPayType(
  code: string | null | undefined,
  rules: PayTypeRule[] = DEFAULT_PAY_TYPE_RULES,
): boolean {
  return !!payTypeRule(rules, code)?.manual;
}

/** 강의 날짜에 적용되는 단가표 버전 (effective_from <= date 인 최신, 없으면 가장 오래된 버전) */
export function findRateTable(
  tables: RateTable[],
  dateStr: string,
): RateTable | undefined {
  if (!tables.length) return undefined;
  const sorted = [...tables].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? 1 : -1,
  );
  return (
    sorted.find((t) => t.effectiveFrom <= dateStr) ?? sorted[sorted.length - 1]
  );
}

/**
 * 4.3 단가 결정 규칙 (시트 I열 수식과 동일)
 * - 지급유형 공란 → 0 (경고), 수동기입 → 직접 입력값, 등급 미등록 → 0 (경고)
 * - 관내/관외/센터: 보조강사면 보조 단가, 아니면(역할 미지정 포함) 주강사 단가
 * - 기관지급/주(주말교육)/교구정리: 역할 무관
 * - 그 외 알 수 없는 유형: 주(관내) (시트 SWITCH 기본값)
 */
export function lookupUnitPrice(
  items: RateItem[],
  gradeId: number | null | undefined,
  payType: string | null | undefined,
  role: string | null | undefined,
  manualPrice: number | null | undefined,
  rules: PayTypeRule[] = DEFAULT_PAY_TYPE_RULES,
): number {
  if (!payType) return 0; // 지급유형 미지정 → 0 (⚠)
  const rule = payTypeRule(rules, payType);
  if (rule?.manual) return manualPrice ?? 0; // 수동기입 계열: 강의 등록 시 입력한 단가
  if (gradeId == null) return 0; // 등급 미등록 → 0 (⚠)
  // 규칙에 없는(옛/삭제된) 유형은 시트 규칙대로 관내 주강사 취급
  const pt = rule ? payType : "관내";
  const roleBased = rule ? rule.roleBased : true;
  const r = roleBased ? (role === "보조강사" ? "보조강사" : "주강사") : null;
  const item = pickRateItem(items, gradeId, pt, r, null);
  return item?.amount ?? 0;
}

/** 등급×유형×역할 칸 찾기 — 강사 지역 그룹('강릉·동해') 칸이 있으면 우선, 없으면 기본(null) 칸 */
export function pickRateItem(
  items: RateItem[],
  gradeId: number,
  payType: string,
  role: string | null,
  region: string | null | undefined,
): RateItem | undefined {
  const match = (rg: string | null) =>
    items.find(
      (i) =>
        i.gradeId === gradeId &&
        i.payType === payType &&
        (i.role ?? null) === role &&
        (i.regionGroup ?? null) === rg,
    );
  const rg = regionGroupOf(region);
  return (rg ? match(rg) : undefined) ?? match(null);
}

/**
 * 구간 단가의 세전: 경계(tierLimit, 기본 2차시)까지는 기본 단가,
 * 그 이후 차시는 amountAfter 로 계산. 0.5차시는 비례(예: 관내 2.5차시 = 5+5+1.5만).
 */
export function grossOfItem(
  sessions: number | null | undefined,
  item: Pick<RateItem, "amount" | "amountAfter" | "tierLimit"> | undefined,
  fallbackUnit: number,
): number {
  if (sessions == null || Number.isNaN(sessions)) return 0;
  if (!item) return Math.round(sessions * fallbackUnit);
  const after = item.amountAfter ?? null;
  if (after == null) return Math.round(sessions * item.amount);
  const limit = item.tierLimit ?? 2;
  const first = Math.min(sessions, limit);
  const rest = Math.max(0, sessions - limit);
  return Math.round(first * item.amount + rest * after);
}

/** 세전 = 차시 × 단가 (차시 공란이면 0) */
export function grossOf(
  sessions: number | null | undefined,
  unitPrice: number,
): number {
  if (sessions == null || Number.isNaN(sessions)) return 0;
  return Math.round(sessions * unitPrice);
}

/** 세금 구분 — 강의별 선택. 기본은 사업소득 3.3% */
export const TAX_TYPES = [
  { code: "사업소득", label: "사업소득 3.3%", per1000: 967 },
  { code: "기타소득", label: "기타소득 8.8%", per1000: 912 },
  { code: "비과세", label: "비과세 0%", per1000: 1000 },
] as const;
export type TaxType = (typeof TAX_TYPES)[number]["code"];
export const DEFAULT_TAX_TYPE: TaxType = "사업소득";
export function taxRateLabel(t: string | null | undefined): string {
  return TAX_TYPES.find((x) => x.code === t)?.label ?? "사업소득 3.3%";
}

/** 세후 = floor(세전 × (1000−세율)/1000) — 건별 원 단위 절사, 정수 연산으로 오차 방지 */
export function netOf(gross: number, taxType?: string | null): number {
  const per =
    TAX_TYPES.find((x) => x.code === (taxType ?? DEFAULT_TAX_TYPE))?.per1000 ??
    967;
  return Math.floor((gross * per) / 1000);
}

export type CalcInput = {
  gradeId: number | null;
  payType: string | null;
  role: string | null;
  manualPrice: number | null;
  sessions: number | null;
  /** 세금 구분 — 없으면 사업소득(3.3%) */
  taxType?: string | null;
  /** 강사 지역 — 강릉·동해면 일괄 단가 칸을 우선 사용 (없으면 기본 칸) */
  region?: string | null;
};

export function calcAmounts(
  items: RateItem[],
  input: CalcInput,
  rules: PayTypeRule[] = DEFAULT_PAY_TYPE_RULES,
) {
  // 어떤 칸을 쓸지(지역 그룹 포함) 먼저 정한 뒤, 그 칸의 구간 규칙으로 세전을 계산한다
  const rule = payTypeRule(rules, input.payType);
  let item: RateItem | undefined;
  let unitPrice: number;
  if (!input.payType) unitPrice = 0;
  else if (rule?.manual) unitPrice = input.manualPrice ?? 0;
  else if (input.gradeId == null) unitPrice = 0;
  else {
    const pt = rule ? input.payType : "관내";
    const roleBased = rule ? rule.roleBased : true;
    const r = roleBased
      ? input.role === "보조강사"
        ? "보조강사"
        : "주강사"
      : null;
    item = pickRateItem(items, input.gradeId, pt, r, input.region ?? null);
    unitPrice = item?.amount ?? 0;
  }
  const grossAmount = grossOfItem(input.sessions, item, unitPrice);
  const netAmount = netOf(grossAmount, input.taxType);
  return {
    unitPrice,
    grossAmount,
    netAmount,
    withholding: grossAmount - netAmount,
  };
}

/** 4.5 기관유형 자동 분류 (키워드 포함 여부, 순서대로) */
export function classifyInstitution(name: string): string {
  if (name.includes("초등학교")) return "초등";
  if (name.includes("중학교")) return "중등";
  if (name.includes("고등학교")) return "고등";
  if (name.includes("유치원")) return "유치원";
  if (name.includes("어린이집")) return "어린이집";
  return "기타 기관";
}

const REGION_SUFFIX = ["_동해", "_횡성", "_철원", "_정선"];
export function regionFromInstitutionName(name: string): string | null {
  for (const s of REGION_SUFFIX) if (name.endsWith(s)) return s.slice(1);
  return null;
}

/**
 * "기관지급" = 강사료를 TutorPay이 아니라 교육기관이 강사에게 직접 지급하는 유형.
 */
export const INSTITUTION_PAID = "기관지급";
export function isInstitutionPaid(l: { payType: string | null }): boolean {
  return l.payType === INSTITUTION_PAID;
}
/**
 * TutorPay이 실제로 지급할 강의인지 (= 미지급 집계·일괄 지급의 대상).
 *  - 기관지급: 기관이 직접 지급 → 제외
 *  - 세후 금액 0원: 연구원(단가 0), 등급 미등록, 단가 누락 등 → 줄 돈이 없으니 제외
 *    (연구원이 교구정리처럼 단가가 있는 강의를 하면 금액이 생기므로 자연히 포함된다)
 * 지급 체크박스 자체는 어떤 행이든 그대로 바꿀 수 있고, 여기서는 "세는 기준"만 정한다.
 * 기준을 바꾸고 싶으면 이 함수 하나만 고치면 전 화면(목록·정산·명세서·대시보드·강사·일괄지급)에 반영된다.
 */
export function isPayable(l: {
  payType: string | null;
  netAmount: number;
}): boolean {
  return !isInstitutionPaid(l) && l.netAmount > 0;
}
/** 미지급으로 집계할 강의인지: 지급 체크가 안 됐고 지급 대상(isPayable)인 것 */
export function isUnpaid(l: {
  isPaid: boolean;
  payType: string | null;
  netAmount: number;
}): boolean {
  return !l.isPaid && isPayable(l);
}

/** 강의 1건의 경고 목록 (7.2) */
export function lectureWarnings(
  l: {
    instructorId?: number | null;
    payType: string | null;
    sessions: number | null;
    gradeCode: string | null;
    manualPrice?: number | null;
    unitPrice?: number;
  },
  rules: PayTypeRule[] = DEFAULT_PAY_TYPE_RULES,
): string[] {
  const w: string[] = [];
  if (l.instructorId === null)
    w.push("강사 미배정 — 수정에서 강사를 지정하세요");
  const manual = isManualPayType(l.payType, rules);
  if (!l.payType) w.push("지급유형이 비어 있어 단가 0으로 계산됨");
  if (l.sessions == null) w.push("차시가 비어 있음");
  if (manual && (l.manualPrice == null || l.unitPrice === 0))
    w.push(`${l.payType} 단가가 비어 있음`);
  if (
    l.payType &&
    l.gradeCode == null &&
    !manual &&
    l.payType !== INSTITUTION_PAID
  )
    w.push("등급 미등록 강사 — 단가 0으로 계산됨");
  return w;
}

/** 5.3 시간 문자열 정규화: "9:10~12:20", "10:00∼11:30 " → ["09:10","12:20"] */
export function parseTimeRange(
  raw: string | null | undefined,
): [string, string] | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, "").replace(/[∼～\-–]/g, "~");
  const m = s.match(/^(\d{1,3}):(\d{1,2})~(\d{1,3}):(\d{1,2})$/);
  if (!m) return null;
  const fix = (h: string, mi: string) => {
    const hh = parseInt(h.replace(/^0+/, "") || "0", 10);
    const mm = parseInt(mi.length === 1 ? mi + "0" : mi, 10);
    if (hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  const a = fix(m[1], m[2]);
  const b = fix(m[3], m[4]);
  return a && b ? [a, b] : null;
}
