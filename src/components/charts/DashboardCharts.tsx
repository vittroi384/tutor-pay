"use client";
/**
 * 대시보드 상단 요약 차트 (올해 월별 추이 + 기관 유형 비중). ReportCharts 의 부품을 재사용한다.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DonutChart, MonthlyTrendChart } from "./ReportCharts";
import type { ReportData } from "@/lib/report-data";

const TYPE_COLOR: Record<string, string> = {
  초등: "#10b981",
  중등: "#3b82f6",
  고등: "#6366f1",
  유치원: "#ec4899",
  어린이집: "#d946ef",
  "기타 기관": "#94a3b8",
};

/** 대시보드용 요약 차트: 월별 추이 + 기관 유형 비중 */
export function DashboardCharts({
  data,
  year,
}: {
  data: ReportData;
  year: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="card lg:col-span-3">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div className="text-[13px] font-semibold text-slate-700">
            {year}년 월별 추이
          </div>
          <Link
            href={`/reports?year=${year}`}
            className="inline-flex items-center gap-1 text-[12px] text-brand-700 hover:underline"
          >
            통합보고서 <ArrowRight size={12} />
          </Link>
        </div>
        <div className="p-3">
          <MonthlyTrendChart months={data.months} height={230} />
        </div>
      </div>
      <div className="card lg:col-span-2">
        <div className="border-b border-slate-200 px-4 py-2.5 text-[13px] font-semibold text-slate-700">
          기관 유형별 차시 비중
        </div>
        <div className="p-3">
          <DonutChart
            rows={data.byType}
            colors={TYPE_COLOR}
            metric="sessions"
            height={230}
            compact
          />
        </div>
      </div>
    </div>
  );
}
