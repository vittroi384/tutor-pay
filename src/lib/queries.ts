/**
 * DB 조회 모음 (읽기 전용). 페이지(서버 컴포넌트)와 API 라우트에서 사용한다.
 * - 마스터 데이터: 등급·강사·기관·콘텐츠(별칭 포함)·단가표 버전
 * - 강의 조회: 월/기간/연/강사별/전체, 항상 강사·기관·등급을 조인한 LectureRow 형태로 반환하고 sortLectures 로 정렬
 * - 잠금: isMonthLocked / getLockedMonths (settlement_locks)
 * - 보조: getYears(연도 목록), getLectureDateBounds(강의 최소~최대 날짜)
 * 'server-only' 라 클라이언트 컴포넌트에서는 import 할 수 없다.
 */
import "server-only";
import { and, asc, between, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contentAliases,
  contents,
  equipment,
  equipmentRentals,
  grades,
  institutions,
  instructors,
  lectures,
  payTypes,
  rateItems,
  rateTables,
  settlementLocks,
  instructorFiles,
} from "@/db/schema";
import type {
  Content,
  EquipmentRentalRow,
  EquipmentRow,
  Grade,
  Institution,
  Instructor,
  LectureRow,
  MasterData,
  PayTypeMeta,
  RateTable,
} from "./types";
import { ymRange } from "./format";

/** 지급유형 목록 (sort 순, 비활성 포함 — 화면에서 필요에 따라 걸러 쓴다) */
export async function getPayTypes(): Promise<PayTypeMeta[]> {
  return db
    .select()
    .from(payTypes)
    .orderBy(asc(payTypes.sort), asc(payTypes.id));
}

/** 등급 목록 (S/A/B/아코연구원, sort 순) */
export async function getGrades(): Promise<Grade[]> {
  return db.select().from(grades).orderBy(asc(grades.sort));
}

/** 강사 전체 (등급 코드 조인, 이름순). 비활성(out) 강사도 포함 — 화면에서 흐리게 표시 */
export async function getInstructors(): Promise<Instructor[]> {
  const rows = await db
    .select({
      id: instructors.id,
      name: instructors.name,
      gradeId: instructors.gradeId,
      gradeCode: grades.code,
      phone: instructors.phone,
      region: instructors.region,
      isActive: instructors.isActive,
      note: instructors.note,
      photo: instructors.photo,
      intro: instructors.intro,
      birthDate: instructors.birthDate,
      email: instructors.email,
      certifications: instructors.certifications,
      specialty: instructors.specialty,
      career: instructors.career,
    })
    .from(instructors)
    .leftJoin(grades, eq(grades.id, instructors.gradeId))
    .orderBy(desc(instructors.isActive), asc(instructors.name));
  return rows.map((r) => ({ ...r, gradeCode: r.gradeCode ?? null }));
}

/** 기관 전체 (이름순) */
export async function getInstitutions(): Promise<Institution[]> {
  return db
    .select()
    .from(institutions)
    .orderBy(desc(institutions.isActive), asc(institutions.name))
    .then((rows) => rows.map(({ createdAt: _c, updatedAt: _u, ...r }) => r));
}

/** 콘텐츠 표준명 + 별칭 목록 (폼 자동완성·정규화에 사용) */
export async function getContents(): Promise<Content[]> {
  const rows = await db.select().from(contents).orderBy(asc(contents.name));
  const aliases = await db.select().from(contentAliases);
  const map = new Map<number, string[]>();
  for (const a of aliases)
    map.set(a.contentId, [...(map.get(a.contentId) ?? []), a.alias]);
  return rows.map((r) => ({ ...r, aliases: map.get(r.id) ?? [] }));
}

/** 단가표 버전 전체 (항목 포함). 적용 버전 선택은 calc.findRateTable 이 한다 */
export async function getRateTables(): Promise<RateTable[]> {
  const tables = await db
    .select()
    .from(rateTables)
    .orderBy(desc(rateTables.effectiveFrom));
  const items = await db.select().from(rateItems);
  return tables.map((t) => ({
    id: t.id,
    effectiveFrom: t.effectiveFrom,
    memo: t.memo,
    createdBy: t.createdBy,
    items: items
      .filter((i) => i.rateTableId === t.id)
      .map((i) => ({
        gradeId: i.gradeId,
        payType: i.payType,
        role: i.role,
        amount: i.amount,
        amountAfter: i.amountAfter,
        tierLimit: i.tierLimit,
        regionGroup: i.regionGroup,
      })),
  }));
}

/** 강의 등록 폼 등에서 한 번에 필요한 마스터 데이터 묶음 (등급·강사·기관·콘텐츠·단가표) */
export async function getMasterData(): Promise<MasterData> {
  const [p, g, i, ins, c, r] = await Promise.all([
    getPayTypes(),
    getGrades(),
    getInstructors(),
    getInstitutions(),
    getContents(),
    getRateTables(),
  ]);
  return {
    payTypes: p,
    grades: g,
    instructors: i,
    institutions: ins,
    contents: c,
    rateTables: r,
  };
}

const lectureSelect = {
  id: lectures.id,
  date: lectures.date,
  startTime: lectures.startTime,
  endTime: lectures.endTime,
  instructorId: lectures.instructorId,
  instructorName: instructors.name,
  gradeCode: grades.code,
  instructorActive: instructors.isActive,
  instructorRegion: instructors.region,
  institutionId: lectures.institutionId,
  institutionName: institutions.name,
  institutionType: institutions.type,
  institutionRegion: institutions.region,
  content: lectures.content,
  contentRaw: lectures.contentRaw,
  sessions: lectures.sessions,
  role: lectures.role,
  payType: lectures.payType,
  manualPrice: lectures.manualPrice,
  unitPrice: lectures.unitPrice,
  grossAmount: lectures.grossAmount,
  netAmount: lectures.netAmount,
  travelFee: lectures.travelFee,
  taxType: lectures.taxType,
  isPaid: lectures.isPaid,
  isDone: lectures.isDone,
  headcount: lectures.headcount,
  note: lectures.note,
};

function baseLectureQuery() {
  return db
    .select(lectureSelect)
    .from(lectures)
    .leftJoin(instructors, eq(instructors.id, lectures.instructorId))
    .leftJoin(grades, eq(grades.id, instructors.gradeId))
    .innerJoin(institutions, eq(institutions.id, lectures.institutionId));
}

function fixRow(
  r: Awaited<
    ReturnType<ReturnType<typeof baseLectureQuery>["execute"]>
  >[number],
): LectureRow {
  return { ...r, gradeCode: r.gradeCode ?? null };
}

/** 정렬: 날짜 → 시작시간 → 기관 → 역할(주강사 먼저) → 강사명 */
export function sortLectures<
  T extends Pick<
    LectureRow,
    "date" | "startTime" | "institutionName" | "role" | "instructorName"
  >,
>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime ?? "99").localeCompare(b.startTime ?? "99") ||
      a.institutionName.localeCompare(b.institutionName, "ko") ||
      (a.role === "주강사" ? 0 : 1) - (b.role === "주강사" ? 0 : 1) ||
      (a.instructorName ?? "").localeCompare(b.instructorName ?? "", "ko"),
  );
}

/** 해당 연월(YYYY-MM)의 강의 */
export async function getLecturesByMonth(ym: string): Promise<LectureRow[]> {
  const { from, to } = ymRange(ym);
  const rows = await baseLectureQuery().where(between(lectures.date, from, to));
  return sortLectures(rows.map(fixRow));
}

/** 날짜 범위(from~to, 양끝 포함)의 강의 — 기간 조회·보고서·엑셀 공용 */
export async function getLecturesByRange(
  from: string,
  to: string,
): Promise<LectureRow[]> {
  const rows = await baseLectureQuery().where(
    and(gte(lectures.date, from), lte(lectures.date, to)),
  );
  return sortLectures(rows.map(fixRow));
}

/** 해당 연도의 강의 (대시보드 누계·강사 실적) */
export async function getLecturesByYear(year: number): Promise<LectureRow[]> {
  return getLecturesByRange(`${year}-01-01`, `${year}-12-31`);
}

/** 강사 1명의 전체 강의 (강사 상세) */
export async function getLecturesByInstructor(
  instructorId: number,
): Promise<LectureRow[]> {
  const rows = await baseLectureQuery().where(
    eq(lectures.instructorId, instructorId),
  );
  return sortLectures(rows.map(fixRow));
}

/** 전체 강의 (엑셀 전체 백업용) */
export async function getAllLectures(): Promise<LectureRow[]> {
  const rows = await baseLectureQuery();
  return sortLectures(rows.map(fixRow));
}

/** 강의 1건 */
export async function getLecture(id: number): Promise<LectureRow | null> {
  const rows = await baseLectureQuery().where(eq(lectures.id, id));
  return rows[0] ? fixRow(rows[0]) : null;
}

/** 해당 달이 정산 확정(잠금) 상태인지 */
export async function isMonthLocked(ym: string): Promise<boolean> {
  const { year, month } = ymRange(ym);
  const row = await db.query.settlementLocks.findFirst({
    where: and(
      eq(settlementLocks.year, year),
      eq(settlementLocks.month, month),
    ),
  });
  return !!row;
}

/** 잠긴 달 전체 집합 ("YYYY-MM") — 기간 조회 시 행 단위 잠금 판단에 사용 */
export async function getLockedMonths(): Promise<Set<string>> {
  const rows = await db.select().from(settlementLocks);
  return new Set(
    rows.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`),
  );
}

/** 연도 목록 (강의가 존재하는 연도, 현재 연도 포함) */
export async function getYears(currentYear: number): Promise<number[]> {
  const rows = await db
    .select({ y: sql<string>`distinct substr(${lectures.date}::text, 1, 4)` })
    .from(lectures);
  const set = new Set<number>(rows.map((r) => Number(r.y)));
  set.add(currentYear);
  return [...set].sort((a, b) => b - a);
}

/** 강의 날짜 범위 (기간 선택 '전체' 프리셋용). 강의가 없으면 null */
export async function getLectureDateBounds(): Promise<{
  min: string;
  max: string;
} | null> {
  const [r] = await db
    .select({
      min: sql<string | null>`min(${lectures.date})::text`,
      max: sql<string | null>`max(${lectures.date})::text`,
    })
    .from(lectures);
  return r?.min && r?.max ? { min: r.min, max: r.max } : null;
}

/** 교구 목록 + 계산된 재고. rentedNow = 미반납 대여 수량 합, available = 총 보유 − 대여중 − 수리중 − 폐기 */
export async function getEquipmentList(): Promise<EquipmentRow[]> {
  const [rows, open] = await Promise.all([
    db.select().from(equipment).orderBy(asc(equipment.sort), asc(equipment.id)),
    db
      .select({
        equipmentId: equipmentRentals.equipmentId,
        qty: sql<number>`coalesce(sum(${equipmentRentals.quantity}), 0)::int`,
      })
      .from(equipmentRentals)
      .where(sql`${equipmentRentals.inDate} is null`)
      .groupBy(equipmentRentals.equipmentId),
  ]);
  const rented = new Map(open.map((o) => [o.equipmentId, o.qty]));
  return rows.map((e) => {
    const rentedNow = rented.get(e.id) ?? 0;
    return {
      ...e,
      rentedNow,
      available: e.totalStock - rentedNow - e.repairCount - e.discardCount,
    };
  });
}

/** 교구 대여 기록 전체 (교구명 + 연동 강의의 담당 강사 조인, 출고일 내림차순) */
export async function getEquipmentRentals(): Promise<EquipmentRentalRow[]> {
  return db
    .select({
      id: equipmentRentals.id,
      equipmentId: equipmentRentals.equipmentId,
      equipmentName: equipment.name,
      quantity: equipmentRentals.quantity,
      renter: equipmentRentals.renter,
      purpose: equipmentRentals.purpose,
      outDate: equipmentRentals.outDate,
      inDate: equipmentRentals.inDate,
      lectureId: equipmentRentals.lectureId,
      lectureRole: lectures.role,
      lectureInstructorName: instructors.name,
      note: equipmentRentals.note,
    })
    .from(equipmentRentals)
    .innerJoin(equipment, eq(equipment.id, equipmentRentals.equipmentId))
    .leftJoin(lectures, eq(lectures.id, equipmentRentals.lectureId))
    .leftJoin(instructors, eq(instructors.id, lectures.instructorId))
    .orderBy(desc(equipmentRentals.outDate), desc(equipmentRentals.id));
}

/** 강의 id → 연동된 교구 대여 건수 (강의 목록의 배지·수정 서랍 안내용) */
export async function getLectureRentalCounts(): Promise<
  Record<number, number>
> {
  const rows = await db
    .select({
      lectureId: equipmentRentals.lectureId,
      n: sql<number>`count(*)::int`,
    })
    .from(equipmentRentals)
    .where(sql`${equipmentRentals.lectureId} is not null`)
    .groupBy(equipmentRentals.lectureId);
  const out: Record<number, number> = {};
  for (const r of rows) if (r.lectureId != null) out[r.lectureId] = r.n;
  return out;
}

/** 강사 첨부 파일 목록 (내용 제외 — 다운로드는 /api/instructor-file/[id]) */
export async function getInstructorFiles(instructorId: number) {
  return db
    .select({
      id: instructorFiles.id,
      name: instructorFiles.name,
      mimeType: instructorFiles.mimeType,
      size: instructorFiles.size,
      uploadedAt: instructorFiles.uploadedAt,
    })
    .from(instructorFiles)
    .where(eq(instructorFiles.instructorId, instructorId))
    .orderBy(desc(instructorFiles.uploadedAt));
}
