/**
 * 엑셀 내보내기 API (GET /api/export?type=...)
 * - type=lectures&ym=YYYY-MM   : 해당 월 강의배정 (시트 '강의배정기록'과 같은 열 구성)
 * - type=range&from=&to=       : 임의 기간 강의배정
 * - type=year&year=YYYY        : 연간 강의배정
 * - type=report&year=&from=&to=: 연간 강의배정 + 통합보고서(기관 유형별/월별) 시트
 * - type=all                   : 전체 백업 (강의·강사·기관·콘텐츠·단가표·교구·변경이력)
 * 로그인한 사용자만 내려받을 수 있다. exceljs 로 메모리에서 생성해 바로 응답.
 */
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { fmtTimeRange, isValidYm } from "@/lib/format";
import {
  getAllLectures,
  getContents,
  getEquipmentList,
  getEquipmentRentals,
  getInstitutions,
  getInstructors,
  getLecturesByMonth,
  getLecturesByRange,
  getPayTypes,
  getRateTables,
  getGrades,
} from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { rateColumns } from "@/lib/calc";
import { APP_NAME } from "@/lib/constants";
import type { LectureRow } from "@/lib/types";

const LECTURE_HEADER = [
  "날짜",
  "강사명",
  "시간",
  "강의기관",
  "교육 콘텐츠",
  "차시",
  "역할",
  "지급유형",
  "단가",
  "세전 합계",
  "세후 합계",
  "교통비",
  "지급 여부",
  "완료",
  "교육 인원",
  "기관 유형",
  "수동기입",
  "비고",
  "원본 콘텐츠 표기",
  "강사 등급",
];

/** 강의 목록 → 엑셀 시트 한 장 (시트 "강의배정기록"과 같은 열 순서, 금액 열은 #,##0 서식, 1행 고정) */
function lectureSheet(wb: ExcelJS.Workbook, name: string, rows: LectureRow[]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(LECTURE_HEADER);
  ws.getRow(1).font = { bold: true };
  for (const l of rows) {
    ws.addRow([
      l.date,
      l.instructorName,
      fmtTimeRange(l.startTime, l.endTime),
      l.institutionName,
      l.content ?? "",
      l.sessions ?? "",
      l.role,
      l.payType ?? "",
      l.unitPrice,
      l.grossAmount,
      l.netAmount,
      l.travelFee,
      l.isPaid ? "TRUE" : "FALSE",
      l.isDone ? "완료" : "",
      l.headcount ?? "",
      l.institutionType,
      l.manualPrice ?? "",
      l.note ?? "",
      l.contentRaw ?? "",
      l.gradeCode ?? "미등록",
    ]);
  }
  ws.columns.forEach((c, i) => {
    c.width =
      [12, 12, 13, 22, 18, 6, 9, 11, 10, 12, 12, 9, 6, 8, 9, 10, 30, 16, 9][
        i
      ] ?? 12;
    if ([8, 9, 10, 11, 16].includes(i)) c.numFmt = "#,##0";
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "all";
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  let filename = `${APP_NAME}.xlsx`;

  if (type === "lectures") {
    const ym = url.searchParams.get("ym");
    if (!isValidYm(ym ?? undefined))
      return NextResponse.json({ error: "ym" }, { status: 400 });
    lectureSheet(wb, `${ym} 강의배정`, await getLecturesByMonth(ym!));
    filename = `강의배정_${ym}.xlsx`;
  } else if (type === "range") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from > to
    )
      return NextResponse.json({ error: "range" }, { status: 400 });
    lectureSheet(wb, "강의배정", await getLecturesByRange(from, to));
    filename = `강의배정_${from}_${to}.xlsx`;
  } else if (type === "year" || type === "report") {
    const year = Number(
      url.searchParams.get("year") ?? new Date().getFullYear(),
    );
    const from = Number(url.searchParams.get("from") ?? 1);
    const to = Number(url.searchParams.get("to") ?? 12);
    const rows = await getLecturesByRange(
      `${year}-${String(from).padStart(2, "0")}-01`,
      `${year}-${String(to).padStart(2, "0")}-${new Date(year, to, 0).getDate()}`,
    );
    lectureSheet(wb, `${year}년 강의배정`, rows);
    if (type === "report") {
      const ws = wb.addWorksheet("통합보고서");
      ws.addRow([
        "기관 유형",
        "교육 횟수",
        "총 차시",
        "총 교육 인원",
        "세후 강사료",
      ]).font = { bold: true };
      const byType = new Map<string, number[]>();
      const byMonth = new Map<number, number[]>();
      for (const l of rows) {
        const t = byType.get(l.institutionType) ?? [0, 0, 0, 0];
        t[0]++;
        t[1] += l.sessions ?? 0;
        t[2] += l.headcount ?? 0;
        t[3] += l.netAmount;
        byType.set(l.institutionType, t);
        const m = byMonth.get(Number(l.date.slice(5, 7))) ?? [0, 0, 0, 0];
        m[0]++;
        m[1] += l.sessions ?? 0;
        m[2] += l.headcount ?? 0;
        m[3] += l.netAmount;
        byMonth.set(Number(l.date.slice(5, 7)), m);
      }
      for (const [k, v] of byType) ws.addRow([k, ...v]);
      ws.addRow([]);
      ws.addRow(["월", "건수", "총 차시", "총 인원", "세후 강사료"]).font = {
        bold: true,
      };
      for (const k of [...byMonth.keys()].sort((a, b) => a - b))
        ws.addRow([`${k}월`, ...byMonth.get(k)!]);
    }
    filename = `${type === "report" ? "통합보고서" : "강의배정"}_${year}.xlsx`;
  } else {
    // 전체 백업
    const [
      lectures,
      instructors,
      institutions,
      contents,
      rates,
      grades,
      logs,
      ptypes,
      equipment,
      equipmentRentals,
    ] = await Promise.all([
      getAllLectures(),
      getInstructors(),
      getInstitutions(),
      getContents(),
      getRateTables(),
      getGrades(),
      db.select().from(auditLogs).orderBy(desc(auditLogs.at)).limit(5000),
      getPayTypes(),
      getEquipmentList(),
      getEquipmentRentals(),
    ]);
    const RATE_COLUMNS = rateColumns(
      ptypes.map((p) => ({
        code: p.code,
        roleBased: p.roleBased,
        manual: p.manual,
        sort: p.sort,
        isActive: p.isActive,
      })),
      true,
    );
    lectureSheet(wb, "강의배정기록", lectures);
    const wi = wb.addWorksheet("강사 정보");
    wi.addRow(["강사명", "등급", "연락처", "지역", "활동", "비고"]).font = {
      bold: true,
    };
    for (const i of instructors)
      wi.addRow([
        i.name,
        i.gradeCode ?? "",
        i.phone ?? "",
        i.region ?? "",
        i.isActive ? "활동" : "out",
        i.note ?? "",
      ]);
    const wn = wb.addWorksheet("기관");
    wn.addRow(["기관명", "유형", "지역", "사용", "비고"]).font = { bold: true };
    for (const n of institutions)
      wn.addRow([
        n.name,
        n.type,
        n.region ?? "",
        n.isActive ? "Y" : "N",
        n.note ?? "",
      ]);
    const wc = wb.addWorksheet("콘텐츠");
    wc.addRow(["표준명", "별칭", "사용", "검수필요"]).font = { bold: true };
    for (const c of contents)
      wc.addRow([
        c.name,
        c.aliases.join(", "),
        c.isActive ? "Y" : "N",
        c.needsReview ? "Y" : "",
      ]);
    const wr = wb.addWorksheet("등급별 단가표");
    for (const t of rates) {
      wr.addRow([`적용 시작일 ${t.effectiveFrom}`, t.memo ?? ""]).font = {
        bold: true,
      };
      wr.addRow(["등급", ...RATE_COLUMNS.map((c) => c.label)]).font = {
        bold: true,
      };
      for (const g of grades)
        wr.addRow([
          g.code,
          ...RATE_COLUMNS.map(
            (c) =>
              t.items.find(
                (i) =>
                  i.gradeId === g.id &&
                  i.payType === c.payType &&
                  (i.role ?? null) === c.role,
              )?.amount ?? 0,
          ),
        ]);
      wr.addRow([]);
    }
    const we = wb.addWorksheet("교구 현황");
    we.addRow([
      "코드",
      "교구명",
      "분류",
      "총 보유",
      "대여중",
      "수리중",
      "폐기",
      "사용 가능",
      "사용",
      "비고",
    ]).font = { bold: true };
    for (const e of equipment)
      we.addRow([
        e.code ?? "",
        e.name,
        e.category ?? "",
        e.totalStock,
        e.rentedNow,
        e.repairCount,
        e.discardCount,
        e.available,
        e.isActive ? "Y" : "N",
        e.note ?? "",
      ]);
    we.getRow(1).alignment = { vertical: "middle" };
    we.views = [{ state: "frozen", ySplit: 1 }];
    const wer = wb.addWorksheet("교구 대여");
    wer.addRow([
      "출고일",
      "대여처",
      "담당 강사(연동)",
      "용도",
      "교구",
      "수량",
      "반납일",
      "상태",
      "비고",
    ]).font = { bold: true };
    for (const r of equipmentRentals)
      wer.addRow([
        r.outDate,
        r.renter,
        r.lectureInstructorName ?? "",
        r.purpose ?? "",
        r.equipmentName,
        r.quantity,
        r.inDate ?? "",
        r.inDate ? "반납" : "대여중",
        r.note ?? "",
      ]);
    wer.views = [{ state: "frozen", ySplit: 1 }];
    const wl = wb.addWorksheet("변경 이력");
    wl.addRow(["일시", "사용자", "테이블", "레코드", "동작", "요약"]).font = {
      bold: true,
    };
    for (const g of logs)
      wl.addRow([
        g.at.toISOString(),
        g.userEmail ?? "",
        g.tableName,
        g.recordId ?? "",
        g.action,
        g.summary ?? "",
      ]);
    filename = `${APP_NAME}_전체백업_${new Date().toISOString().slice(0, 10)}.xlsx`;
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
export const dynamic = "force-dynamic";
