/**
 * 화면·서버가 공유하는 데이터 타입.
 * - Grade/Instructor/Institution/Content/RateTable: 마스터 데이터
 * - LectureRow: 강의 1건 + 조인된 강사·기관·등급 정보 (queries.ts 가 이 형태로 반환)
 * - MasterData: 폼 드롭다운용 묶음, ActionResult: 서버 액션 공통 반환 타입 ({ok:true,data} | {ok:false,error})
 */
/** 등급 (S등급/A등급/B등급/연구원) */
export type Grade = {
  id: number;
  code: string;
  label: string;
  sort: number;
  color: string;
};

/** 지급유형 규칙 — roleBased(주/보조 구분) · manual(단가 직접 입력) · color(칩 색 키) */
export type PayTypeMeta = {
  id: number;
  code: string;
  sort: number;
  roleBased: boolean;
  manual: boolean;
  color: string;
  isActive: boolean;
  note: string | null;
};

/** 강사 — gradeCode 가 null 이면 화면에서 "미등록"(단가 0) */
export type Instructor = {
  id: number;
  name: string;
  gradeId: number | null;
  gradeCode: string | null;
  phone: string | null;
  region: string | null;
  isActive: boolean;
  note: string | null;
  photo: string | null; // 프로필 사진 (작게 축소된 dataURL)
  intro: string | null; // 한 줄 소개
  birthDate: string | null; // 생년월일(YYYY-MM-DD) — 만 나이 표시용
  email: string | null;
  certifications: string | null; // 자격·수료 (여러 줄)
  specialty: string | null; // 특기 교구·콘텐츠
  career: string | null; // 주요 이력
};

/** 교육기관 — type 은 초등/중등/고등/유치원/어린이집/기타 기관 */
export type Institution = {
  id: number;
  name: string;
  type: string;
  region: string | null;
  isActive: boolean;
  note: string | null;
};

/** 콘텐츠 표준명 + 별칭. needsReview 는 강의 저장 시 모르는 표기가 자동 등록된 것 */
export type Content = {
  id: number;
  name: string;
  isActive: boolean;
  needsReview: boolean;
  aliases: string[];
};

/** 단가표 항목: 등급 × 지급유형 × 역할(null=역할 무관) → 금액 */
export type RateItem = {
  gradeId: number;
  payType: string;
  role: string | null;
  amount: number; // 기본 단가 (구간형이면 1~2차시)
  amountAfter?: number | null; // 3차시부터 단가 — null/없음 = 전 차시 동일
  tierLimit?: number | null; // 구간 경계 차시 (기본 2)
  regionGroup?: string | null; // '강릉·동해' 등 지역 그룹 칸 — null = 기본
};
/** 단가표 버전 (effectiveFrom 이후 강의에 적용) */
export type RateTable = {
  id: number;
  effectiveFrom: string;
  memo: string | null;
  createdBy: string | null;
  items: RateItem[];
};

/**
 * 강의 1건 (강사 1명 기준) + 조인 정보.
 * unitPrice/grossAmount/netAmount 는 저장 시점 스냅샷이며, 이후 등급·단가표 변경에 영향받지 않는다.
 * contentRaw 는 시트/입력 원본 표기, content 는 정규화된 표준명.
 */
export type LectureRow = {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  instructorId: number | null; // null = 미배정
  instructorName: string | null;
  gradeCode: string | null;
  instructorActive: boolean | null;
  instructorRegion: string | null;
  institutionId: number;
  institutionName: string;
  institutionType: string;
  institutionRegion: string | null;
  content: string | null;
  contentRaw: string | null;
  sessions: number | null;
  role: string;
  payType: string | null;
  manualPrice: number | null;
  unitPrice: number;
  grossAmount: number;
  netAmount: number;
  travelFee: number; // 교통비(원) — 세후와 별도, 지급액 = 세후 + 교통비
  taxType: string; // 세금 구분 — 사업소득(3.3%)/기타소득(8.8%)/비과세(0%)
  isPaid: boolean;
  isDone: boolean;
  headcount: number | null;
  note: string | null;
};

/** 교구 1종 + 계산된 재고 (rentedNow = 미반납 대여 수량 합, available = total − rented − repair − discard) */
export type EquipmentRow = {
  id: number;
  code: string | null;
  name: string;
  category: string | null;
  totalStock: number;
  repairCount: number;
  discardCount: number;
  note: string | null;
  isActive: boolean;
  sort: number;
  rentedNow: number;
  available: number;
};

/** 교구 대여 1건 (inDate null = 대여중) */
/** lectureInstructorName/lectureRole = 강의 연동 대여일 때 그 강의의 담당 강사(주강사 우선 연결) */
export type EquipmentRentalRow = {
  id: number;
  equipmentId: number;
  equipmentName: string;
  quantity: number;
  renter: string;
  purpose: string | null;
  outDate: string;
  inDate: string | null;
  lectureId: number | null;
  lectureRole: string | null;
  lectureInstructorName: string | null;
  note: string | null;
};

/** 폼·필터용 마스터 데이터 묶음 */
export type MasterData = {
  payTypes: PayTypeMeta[];
  grades: Grade[];
  instructors: Instructor[];
  institutions: Institution[];
  contents: Content[];
  rateTables: RateTable[];
};

/** 서버 액션 공통 반환. 화면은 r.ok 로 분기해 토스트에 성공/오류 문구를 띄운다 */
export type ActionResult<T = undefined> =
  { ok: true; data?: T; message?: string } | { ok: false; error: string };
