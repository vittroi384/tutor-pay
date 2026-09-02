/**
 * 표시용 포맷/날짜 유틸. 모든 날짜는 Asia/Seoul 기준의 "YYYY-MM-DD" 문자열로 다룬다.
 * - 금액/차시/날짜/연월/시간대 포맷 (fmtWon, fmtDateKo, fmtYm, fmtTimeRange …)
 * - 오늘/이번 달/달 이동/월의 시작~끝 (todaySeoul, currentYm, shiftYm, ymRange)
 * - 기간(Period): URL 의 ym= 또는 from=&to= 를 해석(parsePeriod)하고 표시(fmtPeriod)·쿼리스트링(periodQuery)·걸친 달 목록(monthsBetween)
 */
/** 금액: 1234567 → "1,234,567" (null 은 "-") */
export const fmtWon = (n: number | null | undefined) =>
  n == null ? "-" : n.toLocaleString("ko-KR");
export const fmtNum = (n: number | null | undefined) =>
  n == null ? "-" : Number.isInteger(n) ? String(n) : String(n);
/** 차시: 2.5 → "2.5" (null 은 "—") */
export const fmtSessions = (n: number | null | undefined) =>
  n == null ? "—" : String(n);

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-06-16" → Date (로컬 자정) */
export function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
/** 요일 숫자 (0=일 … 6=토) */
export function weekdayOf(dateStr: string): number {
  return toDate(dateStr).getDay();
}
export function weekdayLabel(dateStr: string): string {
  return WEEKDAYS[weekdayOf(dateStr)];
}
/** 요일 색 클래스: 토=파랑, 일=빨강 (요구사항 7.1) */
export function weekdayClass(dow: number): string {
  return dow === 0
    ? "text-rose-600"
    : dow === 6
      ? "text-blue-600"
      : "text-slate-700";
}
/** "2026-06-16" → "6월 16일 (화)" */
export function fmtDateKo(dateStr: string, withYear = false): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${withYear ? `${y}년 ` : ""}${m}월 ${d}일 (${weekdayLabel(dateStr)})`;
}
/** "2026-06-16" → "6/16" */
export function fmtDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}
/** "2026-06" → "2026년 6월" */
export function fmtYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${y}년 ${m}월`;
}
/** 오늘 날짜 (Asia/Seoul 기준 "YYYY-MM-DD") — 서버가 어느 시간대에 있든 한국 날짜 */
export function todaySeoul(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}
/** 이번 달 "YYYY-MM" (Asia/Seoul) */
export function currentYm(): string {
  return todaySeoul().slice(0, 7);
}
/** 연월 이동: shiftYm("2026-01", -1) → "2025-12" */
export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** 연월의 시작일~마지막날 ("2026-02" → 02-01 ~ 02-28) 과 일수 */
export function ymRange(ym: string): {
  from: string;
  to: string;
  year: number;
  month: number;
  days: number;
} {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(days).padStart(2, "0")}`,
    year: y,
    month: m,
    days,
  };
}
/** "YYYY-MM" 형식 검사 (URL 파라미터 검증용) */
export function isValidYm(s: string | undefined): s is string {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
/** "09:10" + "12:20" → "09:10~12:20" (둘 다 없으면 "") */
export function fmtTimeRange(a: string | null, b: string | null): string {
  if (!a && !b) return "";
  return `${a ?? "?"}~${b ?? "?"}`;
}
/** 일시 → "8. 18. 16:48" 형태 (감사로그·최근 로그인 표시) */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
}

/** ---------- 기간(월 또는 날짜 범위) ---------- */
export type Period =
  | { mode: "month"; ym: string; from: string; to: string }
  | { mode: "range"; from: string; to: string; ym: string };

/** "YYYY-MM-DD" 형식 + 실제 존재하는 날짜인지 검사 */
export function isValidDate(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * URL 파라미터에서 기간을 해석한다.
 *  - from&to 가 모두 유효하면 범위 모드 (from>to 이면 서로 바꿈, 최대 3년)
 *  - 아니면 ym 월 모드 (없으면 이번 달)
 * 범위 모드에서도 ym 은 from 이 속한 달로 채워 달력·명세서 링크에 쓴다.
 */
export function parsePeriod(sp: {
  ym?: string;
  from?: string;
  to?: string;
}): Period {
  if (isValidDate(sp.from) && isValidDate(sp.to)) {
    let [from, to] = sp.from < sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    const max = new Date(from + "T00:00:00Z");
    max.setUTCFullYear(max.getUTCFullYear() + 3);
    if (to > max.toISOString().slice(0, 10))
      to = max.toISOString().slice(0, 10);
    return { mode: "range", from, to, ym: from.slice(0, 7) };
  }
  const ym = isValidYm(sp.ym) ? sp.ym : currentYm();
  const r = ymRange(ym);
  return { mode: "month", ym, from: r.from, to: r.to };
}

/** "2026년 6월" 또는 "2026년 4월 1일 ~ 6월 30일" */
export function fmtPeriod(p: Period): string {
  if (p.mode === "month") return fmtYm(p.ym);
  const a = p.from.split("-").map(Number);
  const b = p.to.split("-").map(Number);
  const right =
    a[0] === b[0] ? `${b[1]}월 ${b[2]}일` : `${b[0]}년 ${b[1]}월 ${b[2]}일`;
  return `${a[0]}년 ${a[1]}월 ${a[2]}일 ~ ${right}`;
}

/** 기간에 걸친 연월 목록 (잠금 확인용) */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let ym = from.slice(0, 7);
  while (ym <= to.slice(0, 7)) {
    out.push(ym);
    ym = shiftYm(ym, 1);
  }
  return out;
}

/** 기간 쿼리스트링 (월 모드: ym=, 범위 모드: from=&to=) */
export function periodQuery(p: Period): string {
  return p.mode === "month" ? `ym=${p.ym}` : `from=${p.from}&to=${p.to}`;
}
