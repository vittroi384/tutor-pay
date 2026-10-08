/**
 * calc.ts 단위 테스트 — DB·Next 런타임 없이 순수 함수만 검증한다.
 *   npm run test:unit
 * 시트 수식과 대조한 실제 값(scripts/verify-calc.ts)과 별개로, 규칙의 경계 조건을 고정하는 용도.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PAY_TYPE_RULES,
  calcAmounts,
  classifyInstitution,
  findRateTable,
  grossOf,
  grossOfItem,
  isPayable,
  isUnpaid,
  lectureWarnings,
  lookupUnitPrice,
  netOf,
  parseTimeRange,
  pickRateItem,
  rateColumns,
  regionFromInstitutionName,
  regionGroupOf,
} from "./calc";
import type { RateItem, RateTable } from "./types";

// ---- 픽스처 (가상 단가) ----
const G = { S: 1, A: 2, 연구원: 4 };
const item = (
  gradeId: number,
  payType: string,
  role: string | null,
  amount: number,
  extra: Partial<RateItem> = {},
): RateItem =>
  ({
    gradeId,
    payType,
    role,
    regionGroup: null,
    amount,
    amountAfter: null,
    tierLimit: null,
    ...extra,
  }) as RateItem;

const items: RateItem[] = [
  item(G.S, "관내", "주강사", 50000, { amountAfter: 30000, tierLimit: 2 }),
  item(G.S, "관내", "보조강사", 30000),
  item(G.S, "관외", "주강사", 60000, { amountAfter: 40000, tierLimit: 2 }),
  item(G.S, "기관지급", null, 0),
  item(G.S, "교구정리", null, 20000),
  item(G.A, "관내", "주강사", 40000),
  item(G.연구원, "관내", "주강사", 0),
  // 나래·다솜 일괄 단가 칸 (지역 그룹 우선)
  item(G.S, "관내", "주강사", 50000, { regionGroup: "나래·다솜" }),
  item(G.S, "관내", "보조강사", 35000, { regionGroup: "나래·다솜" }),
];

const tables: RateTable[] = [
  { id: 1, effectiveFrom: "2026-01-01", memo: "초기" } as RateTable,
  { id: 2, effectiveFrom: "2026-08-26", memo: "개편" } as RateTable,
];

describe("findRateTable — 강의 날짜에 적용되는 버전", () => {
  it("적용 시작일 이후 날짜는 최신 버전", () => {
    assert.equal(findRateTable(tables, "2026-09-01")?.id, 2);
  });
  it("적용 시작일 당일도 새 버전", () => {
    assert.equal(findRateTable(tables, "2026-08-26")?.id, 2);
  });
  it("적용 시작일 전날은 이전 버전 (과거 강의가 개편에 흔들리지 않음)", () => {
    assert.equal(findRateTable(tables, "2026-08-25")?.id, 1);
  });
  it("모든 버전보다 이른 날짜는 가장 오래된 버전", () => {
    assert.equal(findRateTable(tables, "2025-12-01")?.id, 1);
  });
  it("버전이 없으면 undefined", () => {
    assert.equal(findRateTable([], "2026-09-01"), undefined);
  });
});

describe("pickRateItem / regionGroupOf — 칸 선택", () => {
  it("지역 그룹 칸이 있으면 우선", () => {
    const r = pickRateItem(items, G.S, "관내", "보조강사", "나래");
    assert.equal(r?.amount, 35000);
  });
  it("지역 그룹 칸이 없으면 기본 칸으로 폴백", () => {
    const r = pickRateItem(items, G.S, "관외", "주강사", "다솜");
    assert.equal(r?.amount, 60000);
  });
  it("일반 지역은 기본 칸", () => {
    assert.equal(pickRateItem(items, G.S, "관내", "보조강사", "가온")?.amount, 30000);
    assert.equal(regionGroupOf("가온"), null);
    assert.equal(regionGroupOf("나래"), "나래·다솜");
    assert.equal(regionGroupOf(null), null);
  });
});

describe("lookupUnitPrice — 단가 결정 규칙", () => {
  it("지급유형 공란이면 0", () => {
    assert.equal(lookupUnitPrice(items, G.S, null, "주강사", null), 0);
  });
  it("등급 미등록이면 0", () => {
    assert.equal(lookupUnitPrice(items, null, "관내", "주강사", null), 0);
  });
  it("수동기입은 입력 단가, 없으면 0", () => {
    assert.equal(lookupUnitPrice(items, G.S, "수동기입", null, 12345), 12345);
    assert.equal(lookupUnitPrice(items, G.S, "수동기입", null, null), 0);
  });
  it("역할 구분 유형: 보조강사만 보조 단가, 역할 미지정은 주강사 단가", () => {
    assert.equal(lookupUnitPrice(items, G.S, "관내", "보조강사", null), 30000);
    assert.equal(lookupUnitPrice(items, G.S, "관내", null, null), 50000);
    assert.equal(lookupUnitPrice(items, G.S, "관내", "주강사", null), 50000);
  });
  it("역할 무관 유형은 role 을 무시", () => {
    assert.equal(lookupUnitPrice(items, G.S, "교구정리", "보조강사", null), 20000);
  });
  it("규칙에 없는(옛/삭제된) 유형은 관내로 취급하되 역할은 유지(시트 SWITCH 기본값)", () => {
    assert.equal(lookupUnitPrice(items, G.S, "옛유형", "보조강사", null), 30000);
    assert.equal(lookupUnitPrice(items, G.S, "옛유형", null, null), 50000);
  });
  it("칸이 없으면 0", () => {
    assert.equal(lookupUnitPrice(items, G.A, "관외", "주강사", null), 0);
  });
});

describe("grossOfItem — 차시 구간 단가", () => {
  const tiered = items[0]; // 관내 주강사 5만, 2차시 초과 3만
  it("경계 이하는 기본 단가 × 차시", () => {
    assert.equal(grossOfItem(1, tiered, 0), 50000);
    assert.equal(grossOfItem(2, tiered, 0), 100000);
  });
  it("경계 초과분은 amountAfter (0.5차시 비례)", () => {
    assert.equal(grossOfItem(3, tiered, 0), 130000);
    assert.equal(grossOfItem(2.5, tiered, 0), 115000);
    assert.equal(grossOfItem(4, tiered, 0), 160000);
  });
  it("경계 이전의 0.5차시도 비례", () => {
    assert.equal(grossOfItem(1.5, tiered, 0), 75000);
  });
  it("amountAfter 가 없으면 단순 곱", () => {
    assert.equal(grossOfItem(3, items[1], 0), 90000);
  });
  it("칸이 없으면 폴백 단가로 곱", () => {
    assert.equal(grossOfItem(2, undefined, 12000), 24000);
  });
  it("차시 공란·NaN 은 0", () => {
    assert.equal(grossOfItem(null, tiered, 0), 0);
    assert.equal(grossOfItem(Number.NaN, tiered, 0), 0);
    assert.equal(grossOf(undefined, 50000), 0);
  });
});

describe("netOf — 세후 절사", () => {
  it("사업소득 3.3%: 원 단위 절사", () => {
    assert.equal(netOf(100000, "사업소득"), 96700);
    assert.equal(netOf(100001, "사업소득"), 96700); // 96700.967 → 절사
    assert.equal(netOf(33333, "사업소득"), 32233); // 32233.0… 절사
  });
  it("기타소득 8.8%", () => {
    assert.equal(netOf(100000, "기타소득"), 91200);
  });
  it("비과세 0%", () => {
    assert.equal(netOf(100000, "비과세"), 100000);
  });
  it("미지정·알 수 없는 구분은 사업소득 기본", () => {
    assert.equal(netOf(100000, null), 96700);
    assert.equal(netOf(100000, "없는구분"), 96700);
  });
  it("0 원은 0", () => {
    assert.equal(netOf(0, "사업소득"), 0);
  });
});

describe("calcAmounts — 단가·세전·세후 한 번에", () => {
  it("관내 주강사 3차시: 구간 단가 + 3.3% 절사", () => {
    const r = calcAmounts(items, {
      gradeId: G.S,
      payType: "관내",
      role: "주강사",
      manualPrice: null,
      sessions: 3,
    });
    assert.deepEqual(r, {
      unitPrice: 50000,
      grossAmount: 130000,
      netAmount: 125710,
      withholding: 4290,
    });
  });
  it("나래·다솜 보조강사는 일괄 칸", () => {
    const r = calcAmounts(items, {
      gradeId: G.S,
      payType: "관내",
      role: "보조강사",
      manualPrice: null,
      sessions: 2,
      region: "다솜",
    });
    assert.equal(r.unitPrice, 35000);
    assert.equal(r.grossAmount, 70000);
  });
  it("강사 미배정(등급 없음)은 0 원", () => {
    const r = calcAmounts(items, {
      gradeId: null,
      payType: "관내",
      role: "주강사",
      manualPrice: null,
      sessions: 2,
    });
    assert.deepEqual(r, { unitPrice: 0, grossAmount: 0, netAmount: 0, withholding: 0 });
  });
  it("수동기입은 입력 단가 × 차시, 세금 구분 반영", () => {
    const r = calcAmounts(items, {
      gradeId: G.S,
      payType: "수동기입",
      role: null,
      manualPrice: 70000,
      sessions: 2,
      taxType: "기타소득",
    });
    assert.equal(r.grossAmount, 140000);
    assert.equal(r.netAmount, 127680);
  });
  it("연구원 등급은 단가 0 → 지급 대상 아님", () => {
    const r = calcAmounts(items, {
      gradeId: G.연구원,
      payType: "관내",
      role: "주강사",
      manualPrice: null,
      sessions: 2,
    });
    assert.equal(r.netAmount, 0);
    assert.equal(isPayable({ payType: "관내", netAmount: r.netAmount }), false);
  });
  it("비활성 규칙 목록을 넘기면 그 규칙으로 판정", () => {
    const rules = DEFAULT_PAY_TYPE_RULES.map((x) =>
      x.code === "교구정리" ? { ...x, roleBased: true } : x,
    );
    // 교구정리를 역할 구분으로 바꾸면 role=null 칸을 못 찾아 0
    const r = calcAmounts(
      items,
      { gradeId: G.S, payType: "교구정리", role: null, manualPrice: null, sessions: 1 },
      rules,
    );
    assert.equal(r.unitPrice, 0);
  });
});

describe("isPayable / isUnpaid — 지급 집계 기준", () => {
  it("기관지급은 금액이 있어도 제외", () => {
    assert.equal(isPayable({ payType: "기관지급", netAmount: 50000 }), false);
  });
  it("세후 0 원은 제외, 양수는 포함", () => {
    assert.equal(isPayable({ payType: "관내", netAmount: 0 }), false);
    assert.equal(isPayable({ payType: "관내", netAmount: 1 }), true);
  });
  it("미지급 = 지급 체크 안 됨 + 지급 대상", () => {
    assert.equal(isUnpaid({ isPaid: false, payType: "관내", netAmount: 100 }), true);
    assert.equal(isUnpaid({ isPaid: true, payType: "관내", netAmount: 100 }), false);
    assert.equal(isUnpaid({ isPaid: false, payType: "기관지급", netAmount: 100 }), false);
  });
});

describe("lectureWarnings — 입력 경고", () => {
  it("미배정·유형 공란·차시 공란을 각각 경고", () => {
    const w = lectureWarnings({ instructorId: null, payType: null, sessions: null, gradeCode: null });
    assert.equal(w.length, 3);
  });
  it("등급 미등록은 역할 구분 유형에서만 경고 (기관지급·수동기입 제외)", () => {
    assert.ok(lectureWarnings({ payType: "관내", sessions: 1, gradeCode: null }).some((s) => s.includes("등급")));
    assert.equal(lectureWarnings({ payType: "기관지급", sessions: 1, gradeCode: null }).length, 0);
    assert.ok(lectureWarnings({ payType: "수동기입", sessions: 1, gradeCode: null, manualPrice: null }).some((s) => s.includes("단가가 비어")));
  });
  it("정상 입력은 경고 없음", () => {
    assert.deepEqual(lectureWarnings({ instructorId: 1, payType: "관내", sessions: 2, gradeCode: "S등급" }), []);
  });
});

describe("rateColumns — 단가표 열 순서", () => {
  it("주강사 열 → 보조강사 열 → 역할 무관 열, 수동기입 제외", () => {
    const keys = rateColumns().map((c) => c.key);
    assert.deepEqual(keys, ["주-관내", "주-관외", "주-센터", "보조-관내", "보조-관외", "보조-센터", "기관지급", "주(주말교육)", "교구정리"]);
  });
  it("비활성 유형 제외 옵션", () => {
    const rules = DEFAULT_PAY_TYPE_RULES.map((x) => (x.code === "센터" ? { ...x, isActive: false } : x));
    assert.equal(rateColumns(rules, false).some((c) => c.payType === "센터"), false);
    assert.equal(rateColumns(rules, true).some((c) => c.payType === "센터"), true);
  });
});

describe("기관 분류·지역·시간 파싱", () => {
  it("기관명 키워드로 유형 분류", () => {
    assert.equal(classifyInstitution("가온초등학교"), "초등");
    assert.equal(classifyInstitution("나래중학교"), "중등");
    assert.equal(classifyInstitution("보람유치원"), "유치원");
    assert.equal(classifyInstitution("라온과학관"), "기타 기관");
  });
  it("기관명 접미사로 지역", () => {
    assert.equal(regionFromInstitutionName("가온초등학교_다솜"), "다솜");
    assert.equal(regionFromInstitutionName("가온초등학교"), null);
  });
  it("시간 문자열 정규화", () => {
    assert.deepEqual(parseTimeRange("9:10~12:20"), ["09:10", "12:20"]);
    assert.deepEqual(parseTimeRange(" 10:00 ∼ 11:30 "), ["10:00", "11:30"]);
    assert.equal(parseTimeRange("25:00~26:00"), null);
    assert.equal(parseTimeRange("오전"), null);
    assert.equal(parseTimeRange(null), null);
  });
});
