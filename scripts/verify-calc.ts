/** 검증 도구(npm run db:verify) — 저장된 전 강의의 세전·세후를 계산식으로 다시 계산해 불일치 건수를 보고한다 */
import fs from "node:fs";
import { calcAmounts, classifyInstitution } from "../src/lib/calc";
import type { RateItem } from "../src/lib/types";

/**
 * data/tutorpay-seed.json 의 558건을 TS 계산 규칙(src/lib/calc.ts)으로 재계산해 시트 값과 대조한다.
 * 파이썬 추출 스크립트와 별개로, 웹앱이 실제로 쓰는 코드가 시트와 같은 결과를 내는지 확인하는 용도.
 */
const seed = JSON.parse(
  fs.readFileSync(process.argv[2] ?? "data/tutorpay-seed.json", "utf8"),
);
const gradeIds = new Map<string, number>(
  seed.grades.map((g: { code: string }, i: number) => [g.code, i + 1]),
);
const items: RateItem[] = seed.rateTable.items.map(
  (i: {
    grade: string;
    payType: string;
    role: string | null;
    amount: number;
  }) => ({
    gradeId: gradeIds.get(i.grade)!,
    payType: i.payType,
    role: i.role || null,
    amount: i.amount,
  }),
);
const gradeOf = new Map<string, string | null>(
  seed.instructors.map((i: { name: string; grade: string | null }) => [
    i.name,
    i.grade,
  ]),
);

let mismatch = 0;
let typeMismatch = 0;
const monthly = new Map<
  string,
  { count: number; sessions: number; gross: number; net: number }
>();
for (const l of seed.lectures) {
  const g = gradeOf.get(l.instructor) ?? null;
  const a = calcAmounts(items, {
    gradeId: g ? (gradeIds.get(g) ?? null) : null,
    payType: l.payType,
    role: l.role,
    manualPrice: l.manualPrice,
    sessions: l.sessions,
  });
  if (
    a.unitPrice !== l.unitPrice ||
    a.grossAmount !== l.grossAmount ||
    a.netAmount !== l.netAmount
  ) {
    mismatch++;
    console.log("mismatch", l.date, l.instructor, a, {
      unit: l.unitPrice,
      gross: l.grossAmount,
      net: l.netAmount,
    });
  }
  const m = monthly.get(l.date.slice(0, 7)) ?? {
    count: 0,
    sessions: 0,
    gross: 0,
    net: 0,
  };
  m.count++;
  m.sessions += l.sessions ?? 0;
  m.gross += l.grossAmount;
  m.net += l.netAmount;
  monthly.set(l.date.slice(0, 7), m);
}
for (const inst of seed.institutions)
  if (classifyInstitution(inst.name) !== inst.type) typeMismatch++;
console.log(
  `강의 ${seed.lectures.length}건 재계산: 불일치 ${mismatch}건 / 기관유형 불일치 ${typeMismatch}건`,
);
for (const [ym, m] of [...monthly.entries()].sort())
  console.log(
    `  ${ym}: ${m.count}건 ${m.sessions}차시 세전 ${m.gross.toLocaleString()} 세후 ${m.net.toLocaleString()}`,
  );
if (mismatch || typeMismatch) process.exit(1);
