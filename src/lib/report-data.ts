import type { LectureRow } from "./types";

/** 차트·표 공용 집계 (서버에서 계산해 클라이언트 차트로 전달) */
export type AggRow = {
  key: string;
  count: number;
  sessions: number;
  headcount: number;
  gross: number;
  net: number;
};
export type ReportData = {
  months: (AggRow & { m: number })[]; // 월별 (범위 내 모든 달, 0 포함)
  byType: AggRow[]; // 기관 유형별 (고정 순서)
  byPayType: AggRow[]; // 지급유형별
  byContent: AggRow[]; // 콘텐츠별 (횟수 내림차순)
  byRegion: AggRow[]; // 지역별 (차시 내림차순)
  byInstructor: (AggRow & { instructorId: number; grade: string | null })[]; // 강사별 세후 내림차순
  byGrade: AggRow[]; // 등급별
  byInstitution: (AggRow & { institutionId: number; type: string })[]; // 기관별 교육 횟수 내림차순
  byWeekday: AggRow[]; // 요일별 (월~일)
  total: AggRow;
};

const INSTITUTION_TYPES = [
  "초등",
  "중등",
  "고등",
  "유치원",
  "어린이집",
  "기타 기관",
];
const PAY_TYPES = [
  "관내",
  "관외",
  "아코센터",
  "기관지급",
  "주(주말교육)",
  "교구정리",
  "수동기입",
  "미지정",
];

function empty(key: string): AggRow {
  return { key, count: 0, sessions: 0, headcount: 0, gross: 0, net: 0 };
}
function add(r: AggRow, l: LectureRow) {
  r.count++;
  r.sessions += l.sessions ?? 0;
  r.headcount += l.headcount ?? 0;
  r.gross += l.grossAmount;
  r.net += l.netAmount;
}

export function buildReportData(
  lectures: LectureRow[],
  fromMonth: number,
  toMonth: number,
): ReportData {
  const months = new Map<number, AggRow & { m: number }>();
  for (let m = fromMonth; m <= toMonth; m++)
    months.set(m, { ...empty(`${m}월`), m });
  const byType = new Map(INSTITUTION_TYPES.map((t) => [t, empty(t)]));
  const byPayType = new Map(PAY_TYPES.map((t) => [t, empty(t)]));
  const byContent = new Map<string, AggRow>();
  const byRegion = new Map<string, AggRow>();
  const byInstructor = new Map<
    number,
    AggRow & { instructorId: number; grade: string | null }
  >();
  const byGrade = new Map<string, AggRow>();
  const byInstitution = new Map<
    number,
    AggRow & { institutionId: number; type: string }
  >();
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const byWeekday = new Map(
    ["월", "화", "수", "목", "금", "토", "일"].map((d) => [d, empty(d)]),
  );
  const total = empty("합계");
  for (const l of lectures) {
    if (l.instructorId == null) continue; // 미배정 제외
    add(total, l);
    const m = Number(l.date.slice(5, 7));
    if (!months.has(m)) months.set(m, { ...empty(`${m}월`), m });
    add(months.get(m)!, l);
    if (!byType.has(l.institutionType))
      byType.set(l.institutionType, empty(l.institutionType));
    add(byType.get(l.institutionType)!, l);
    const pt = l.payType || "미지정";
    if (!byPayType.has(pt)) byPayType.set(pt, empty(pt));
    add(byPayType.get(pt)!, l);
    for (const c of l.content ? l.content.split(" / ") : ["(미입력)"]) {
      if (!byContent.has(c)) byContent.set(c, empty(c));
      add(byContent.get(c)!, l);
    }
    const region = l.institutionRegion ?? l.instructorRegion ?? "미지정";
    if (!byRegion.has(region)) byRegion.set(region, empty(region));
    add(byRegion.get(region)!, l);
    if (l.instructorId == null) continue; // 강사별 통계에서만 미배정 제외
    if (!byInstructor.has(l.instructorId))
      byInstructor.set(l.instructorId, {
        ...empty(l.instructorName ?? "미배정"),
        instructorId: l.instructorId,
        grade: l.gradeCode,
      });
    add(byInstructor.get(l.instructorId)!, l);
    const g = l.gradeCode ?? "미등록";
    if (!byGrade.has(g)) byGrade.set(g, empty(g));
    add(byGrade.get(g)!, l);
    if (!byInstitution.has(l.institutionId))
      byInstitution.set(l.institutionId, {
        ...empty(l.institutionName),
        institutionId: l.institutionId,
        type: l.institutionType,
      });
    add(byInstitution.get(l.institutionId)!, l);
    const wd = WD[new Date(l.date + "T00:00:00Z").getUTCDay()];
    add(byWeekday.get(wd)!, l);
  }
  return {
    months: [...months.values()].sort((a, b) => a.m - b.m),
    byType: [...byType.values()],
    byPayType: [...byPayType.values()].filter(
      (r) => r.count > 0 || r.key !== "미지정",
    ),
    byContent: [...byContent.values()].sort(
      (a, b) => b.count - a.count || b.sessions - a.sessions,
    ),
    byRegion: [...byRegion.values()].sort((a, b) => b.sessions - a.sessions),
    byInstructor: [...byInstructor.values()].sort(
      (a, b) => b.net - a.net || b.sessions - a.sessions,
    ),
    byGrade: [...byGrade.values()].sort((a, b) => b.net - a.net),
    byInstitution: [...byInstitution.values()].sort(
      (a, b) => b.count - a.count || b.sessions - a.sessions,
    ),
    byWeekday: [...byWeekday.values()],
    total,
  };
}
