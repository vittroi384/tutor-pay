/**
 * DB 테이블 정의 (Drizzle). 마이그레이션 SQL 은 `npm run db:generate` 로 drizzle/ 폴더에 생성된다.
 * 테이블: grades(등급) · instructors(강사) · rate_tables/rate_items(단가표 버전/항목) · institutions(기관) · contents/content_aliases(콘텐츠 표준명/별칭)
 *        · lectures(강의배정, 금액 스냅샷 포함) · users(로그인 허용 계정) · audit_logs(변경 이력) · settlement_locks(월 정산 확정)
 * 원칙: 강의 행에는 저장 시점의 단가·세전·세후를 그대로 보관(스냅샷) — 등급·단가표가 바뀌어도 과거 정산은 변하지 않는다.
 */
import {
  real,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = () => timestamp({ withTimezone: true, mode: "date" });

/** 등급 코드 (S등급 / A등급 / B등급 / 아코연구원). 등급 없는 강사는 grade_id = null → 화면에서 '미등록' */
export const grades = pgTable("grades", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // 표시명 (S등급 …). 강사·단가표는 id 로 참조하므로 이름을 바꿔도 안전
  label: text("label").notNull(),
  sort: integer("sort").notNull().default(0),
  color: text("color").notNull().default("slate"), // 배지 색 키 (constants.CHIP_COLORS)
});

/**
 * 지급유형 (= 단가표 열의 종류). 기본 7종(관내·관외·아코센터·기관지급·주(주말교육)·교구정리·수동기입)은
 * 마이그레이션에서 넣고, 화면(단가표 → 지급유형 관리)에서 추가·이름 변경·비활성화할 수 있다.
 *  - roleBased: 주강사/보조강사 단가가 다른 유형 (단가표에 열이 2개 생김)
 *  - manual   : 강의 등록 시 강사별로 단가를 직접 입력 (단가표 열 없음)
 * code 값이 lectures.pay_type / rate_items.pay_type 에 그대로 저장되므로 이름을 바꾸면 그 두 곳도 함께 치환한다.
 */
export const payTypes = pgTable("pay_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  sort: integer("sort").notNull().default(0),
  roleBased: boolean("role_based").notNull().default(true),
  manual: boolean("manual").notNull().default(false),
  color: text("color").notNull().default("slate"),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
});

export const instructors = pgTable(
  "instructors",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(), // 지역접두+이름 (예: 원주나수영)
    gradeId: integer("grade_id").references(() => grades.id, {
      onDelete: "set null",
    }),
    phone: text("phone"),
    photo: text("photo"), // 프로필 사진 — 화면에서 축소한 작은 이미지(dataURL)를 그대로 저장 (백업에 포함)
    intro: text("intro"), // 한 줄 소개
    birthDate: date("birth_date", { mode: "string" }), // 생년월일 — 화면에서 만 나이로 표시
    email: text("email"), // 이메일 (명세서 공유 등 대비)
    certifications: text("certifications"), // 자격·수료 (줄바꿈으로 여러 개)
    specialty: text("specialty"), // 특기 교구·콘텐츠
    career: text("career"), // 주요 이력 (여러 줄)
    region: text("region"),
    isActive: boolean("is_active").notNull().default(true),
    note: text("note"),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [index("instructors_grade_idx").on(t.gradeId)],
);

/** 단가표 버전 — 강의 날짜 기준 effective_from <= date 인 최신 버전을 적용 */
export const rateTables = pgTable("rate_tables", {
  id: serial("id").primaryKey(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  memo: text("memo"),
  createdBy: text("created_by"),
  createdAt: ts().notNull().defaultNow(),
});

/** 단가 항목. role 이 null 이면 역할 무관(기관지급/주(주말교육)/교구정리) */
export const rateItems = pgTable(
  "rate_items",
  {
    id: serial("id").primaryKey(),
    rateTableId: integer("rate_table_id")
      .notNull()
      .references(() => rateTables.id, { onDelete: "cascade" }),
    gradeId: integer("grade_id")
      .notNull()
      .references(() => grades.id, { onDelete: "cascade" }),
    payType: text("pay_type").notNull(),
    role: text("role"),
    amount: integer("amount").notNull().default(0), // 기본 단가(구간형이면 1~2차시 단가)
    amountAfter: integer("amount_after"), // 3차시부터 단가 — null 이면 전 차시 동일(flat)
    tierLimit: real("tier_limit"), // 구간 경계 차시(기본 2) — amount_after 있을 때만 사용
    regionGroup: text("region_group"), // 지역 그룹 칸('강릉·동해') — null = 그 외 지역 기본
  },
  (t) => [index("rate_items_table_idx").on(t.rateTableId)],
);

export const institutions = pgTable("institutions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // 지역 접미(_동해 등) 포함한 이름 그대로 보존
  type: text("type").notNull().default("기타 기관"),
  region: text("region"),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});

export const contents = pgTable("contents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // 표준명
  isActive: boolean("is_active").notNull().default(true),
  needsReview: boolean("needs_review").notNull().default(false),
});

export const contentAliases = pgTable(
  "content_aliases",
  {
    id: serial("id").primaryKey(),
    contentId: integer("content_id")
      .notNull()
      .references(() => contents.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
  },
  (t) => [uniqueIndex("content_aliases_alias_uq").on(t.alias)],
);

/** 강의배정 — 강의 1건 = 강사 1명 1행. 단가·세전·세후는 저장 시점 스냅샷 */
export const lectures = pgTable(
  "lectures",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    startTime: text("start_time"), // "HH:MM"
    endTime: text("end_time"),
    // null = 강사 미배정(강의만 먼저 등록, 나중에 수정에서 지정)
    instructorId: integer("instructor_id").references(() => instructors.id, {
      onDelete: "restrict",
    }),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    content: text("content"), // 표준명, 여러 개면 " / " 로 결합
    contentRaw: text("content_raw"), // 이전 시 원본 표기(정규화 결과와 다를 때만)
    sessions: doublePrecision("sessions"), // 차시 (0.5 단위 허용, 공란은 null → 경고)
    role: text("role").notNull().default("주강사"),
    payType: text("pay_type"), // 지급유형 (공란은 null → 경고)
    manualPrice: integer("manual_price"), // 수동기입 단가 입력값
    unitPrice: integer("unit_price").notNull().default(0),
    grossAmount: integer("gross_amount").notNull().default(0),
    netAmount: integer("net_amount").notNull().default(0),
    // 세금 구분 — 사업소득(3.3%)/기타소득(8.8%)/비과세(0%). 세후 계산에 사용, 강의별 저장
    taxType: text("tax_type").notNull().default("사업소득"),
    travelFee: integer("travel_fee").notNull().default(0), // 교통비(원) — 세금 계산과 무관, 정산 지급액에 세후와 합산
    isPaid: boolean("is_paid").notNull().default(false),
    paidAt: ts(),
    isDone: boolean("is_done").notNull().default(false),
    headcount: integer("headcount"),
    note: text("note"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [
    index("lectures_date_idx").on(t.date),
    index("lectures_instructor_date_idx").on(t.instructorId, t.date),
    index("lectures_institution_idx").on(t.institutionId),
  ],
);

/**
 * 교구 (교육 장비) — 시트 '교구정보'.
 * totalStock(총 보유)·repairCount(수리중)·discardCount(폐기)는 입력값이고,
 * 대여중은 equipment_rentals 에서 미반납(in_date IS NULL) 수량 합으로 자동 계산한다.
 * 사용 가능 = totalStock − 대여중 − repairCount − discardCount.
 */
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  code: text("code"), // 교구 ID (LGO-001 등, 없을 수 있음)
  name: text("name").notNull().unique(), // 교구명 (대여 기록과 이름으로 연결되므로 유일)
  category: text("category"), // 분류 (레고 시리즈/로봇류/스마트기기 …)
  totalStock: integer("total_stock").notNull().default(0),
  repairCount: integer("repair_count").notNull().default(0),
  discardCount: integer("discard_count").notNull().default(0),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true), // 끄면 새 대여 등록 목록에서 숨김
  sort: integer("sort").notNull().default(0),
});

/**
 * 교구 대여 기록 — 시트 '교구 대여'(연구용 등) + '교육 교구 대여'(수업용) 통합.
 * inDate 가 비어 있으면 '대여중'. 반납 처리 = inDate 채우기.
 */
export const equipmentRentals = pgTable(
  "equipment_rentals",
  {
    id: serial("id").primaryKey(),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    renter: text("renter").notNull(), // 대여처 (기관명 또는 강사명 — 자유 입력)
    purpose: text("purpose"), // 용도 (교육(수업)/강사 연구용/타기관 대여용 …)
    outDate: date("out_date", { mode: "string" }).notNull(), // 출고일
    inDate: date("in_date", { mode: "string" }), // 반납일 (null = 대여중)
    lectureId: integer("lecture_id").references(() => lectures.id, {
      onDelete: "set null",
    }), // 강의 등록에서 함께 만든 대여면 그 강의. 강의가 지워져도 대여 기록은 남는다
    note: text("note"),
    updatedBy: text("updated_by"),
    updatedAt: ts(),
  },
  (t) => [
    index("equipment_rentals_equipment_idx").on(t.equipmentId),
    index("equipment_rentals_open_idx").on(t.inDate),
  ],
);

/** 강사 첨부 파일 — 이력서·자격증 사본 등. 내용은 base64 로 DB 에 저장(별도 파일 서버 불필요, 백업에 포함) */
export const instructorFiles = pgTable("instructor_files", {
  id: serial("id").primaryKey(),
  instructorId: integer("instructor_id")
    .notNull()
    .references(() => instructors.id, { onDelete: "cascade" }), // 강사 삭제 시 파일도 함께
  name: text("name").notNull(), // 원본 파일명
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), // 바이트
  data: text("data").notNull(), // base64 (다운로드 시 원본으로 복원)
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("admin"), // admin | viewer
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: ts(),
  createdAt: ts().notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userEmail: text("user_email"),
    tableName: text("table_name").notNull(),
    recordId: text("record_id"),
    action: text("action").notNull(), // create | update | delete | toggle | lock ...
    before: jsonb("before"),
    after: jsonb("after"),
    summary: text("summary"),
    at: ts().notNull().defaultNow(),
  },
  (t) => [index("audit_logs_at_idx").on(t.at)],
);

/** 월 정산 확정(잠금) */
export const settlementLocks = pgTable(
  "settlement_locks",
  {
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    lockedBy: text("locked_by"),
    lockedAt: ts().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.year, t.month] })],
);
