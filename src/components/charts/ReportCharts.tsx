"use client";
/**
 * 통합보고서·대시보드에서 쓰는 Recharts 차트 모음 (클라이언트 컴포넌트).
 * - MonthlyTrendChart: 월별 막대(차시·건수) + 선(세후 강사료)
 * - DonutChart: 항목별 비중 도넛 + 옆 범례(금액·%). compact 모드는 좁은 카드용
 * - RankBarChart: 가로 막대 Top N (콘텐츠·강사·기관), SimpleBarChart: 세로 막대
 * - ReportCharts: 통합보고서 '차트' 탭 전체 구성
 * 색은 화면의 칩 색(TYPE_COLOR/PAY_COLOR/GRADE_COLOR)과 맞춰 표와 차트를 오가도 같은 색으로 읽히게 했다.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AggRow, ReportData } from "@/lib/report-data";
import { fmtSessions, fmtWon } from "@/lib/format";

/* 화면 칩 색과 맞춘 팔레트 */
const TYPE_COLOR: Record<string, string> = {
  초등: "#10b981",
  중등: "#3b82f6",
  고등: "#6366f1",
  유치원: "#ec4899",
  어린이집: "#d946ef",
  "기타 기관": "#94a3b8",
};
const PAY_COLOR: Record<string, string> = {
  관내: "#0ea5e9",
  관외: "#8b5cf6",
  아코센터: "#0d9488",
  기관지급: "#94a3b8",
  "주(주말교육)": "#f97316",
  교구정리: "#84cc16",
  수동기입: "#f59e0b",
  미지정: "#f43f5e",
};
const GRADE_COLOR: Record<string, string> = {
  S등급: "#f59e0b",
  A등급: "#0d9488",
  B등급: "#64748b",
  아코연구원: "#1e293b",
  미등록: "#f43f5e",
};
const BRAND = "#f5a800"; // TutorPay 로고 주황 (도넛 등 보조)
const GREEN = "#0d9488"; // 월별 추이 막대 (차시)
const GREEN_LIGHT = "#99f6e4"; // 월별 추이 막대 (건수)
const NET_LINE = "#f59e0b"; // 월별 추이 선 (세후 강사료)
const BLUE = "#3b82f6"; // 강사별 Top 10
const SERIES = [
  BRAND,
  "#0ea5e9",
  "#8b5cf6",
  "#0d9488",
  "#f43f5e",
  "#84cc16",
  "#f97316",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#64748b",
  "#a3e635",
];

const won = (v: number) => `${fmtWon(v)}원`;
const man = (v: number) =>
  v >= 10000 ? `${Math.round(v / 10000).toLocaleString()}만` : String(v);
const tick = { fontSize: 11, fill: "#64748b" };
const grid = (
  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
);
const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 12px rgba(15,23,42,.08)",
};

function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <div className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-slate-700">
          {title}
        </div>
        {sub && (
          <div className="text-right text-[11px] text-slate-500">{sub}</div>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-[240px] place-items-center text-[12px] text-slate-400">
      데이터가 없습니다
    </div>
  );
}

/** 월별 추이: 막대 = 차시, 선 = 세후 강사료 */
export function MonthlyTrendChart({
  months,
  height = 260,
}: {
  months: ReportData["months"];
  height?: number;
}) {
  if (!months.some((m) => m.count)) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={months}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        {grid}
        <XAxis
          dataKey="key"
          tick={tick}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={6}
        />
        <YAxis
          yAxisId="l"
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <YAxis
          yAxisId="r"
          orientation="right"
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={man}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) =>
            name === "세후 강사료"
              ? [won(Number(v)), name]
              : name === "차시"
                ? [`${fmtSessions(Number(v))}차시`, name]
                : [`${v}건`, name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="l"
          dataKey="sessions"
          name="차시"
          fill={GREEN}
          radius={[3, 3, 0, 0]}
          maxBarSize={36}
        />
        <Bar
          yAxisId="l"
          dataKey="count"
          name="강의 건수"
          fill={GREEN_LIGHT}
          radius={[3, 3, 0, 0]}
          maxBarSize={36}
        />
        <Line
          yAxisId="r"
          type="monotone"
          dataKey="net"
          name="세후 강사료"
          stroke={NET_LINE}
          strokeWidth={2.5}
          dot={{ r: 3, fill: NET_LINE }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** 도넛: 항목별 비중 (기본 세후 금액, metric 으로 차시 등 선택) */
export function DonutChart({
  rows,
  colors,
  metric = "net",
  height = 240,
  compact = false,
}: {
  rows: AggRow[];
  colors: Record<string, string>;
  metric?: "net" | "sessions" | "count";
  height?: number;
  compact?: boolean;
}) {
  const data = rows.filter((r) => r[metric] > 0);
  const total = data.reduce((a, r) => a + r[metric], 0);
  if (!data.length) return <Empty />;
  const fmt = (v: number) =>
    metric === "net"
      ? won(v)
      : metric === "sessions"
        ? `${fmtSessions(v)}차시`
        : `${v}건`;
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row">
      <div
        className={`w-full ${compact ? "sm:w-[46%] sm:min-w-[150px]" : "sm:w-1/2 sm:min-w-[200px]"} shrink-0`}
        style={{ height }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={metric}
              nameKey="key"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={1.5}
              stroke="#fff"
            >
              {data.map((r, i) => (
                <Cell
                  key={r.key}
                  fill={colors[r.key] ?? SERIES[i % SERIES.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, name) => [
                `${fmt(Number(v))} (${Math.round((Number(v) / total) * 100)}%)`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1 text-[12px]">
        {data.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colors[r.key] ?? SERIES[i % SERIES.length] }}
            />
            <span
              className="min-w-0 truncate text-slate-700"
              title={`${r.key} · ${fmt(r[metric])}`}
            >
              {r.key}
            </span>
            {!compact && (
              <span className="num ml-auto shrink-0 text-slate-500">
                {fmt(r[metric])}
              </span>
            )}
            <span
              className={`num shrink-0 text-slate-400 ${compact ? "ml-auto" : "w-10"}`}
            >
              {Math.round((r[metric] / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 가로 막대: 상위 N (콘텐츠·강사 등) */
export function RankBarChart({
  rows,
  metric,
  top = 10,
  color = GREEN,
  labelWidth = 92,
  unit,
  colorOf,
}: {
  rows: AggRow[];
  metric: "count" | "sessions" | "net" | "headcount";
  top?: number;
  color?: string;
  labelWidth?: number;
  unit?: string;
  colorOf?: (row: AggRow) => string;
}) {
  const data = [...rows].sort((a, b) => b[metric] - a[metric]).slice(0, top);
  if (!data.length || !data.some((d) => d[metric] > 0)) return <Empty />;
  const fmt = (v: number) =>
    metric === "net"
      ? won(v)
      : metric === "sessions"
        ? `${fmtSessions(v)}차시`
        : `${v}${unit ?? (metric === "count" ? "회" : "명")}`;
  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(160, data.length * 26 + 30)}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, left: 4, bottom: 0 }}
        barCategoryGap={5}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e2e8f0"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={tick}
          axisLine={false}
          tickLine={false}
          tickFormatter={metric === "net" ? man : undefined}
        />
        <YAxis
          type="category"
          dataKey="key"
          width={labelWidth}
          tick={{ ...tick, fill: "#334155" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) =>
            v.length > 12 ? v.slice(0, 11) + "…" : v
          }
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [fmt(Number(v)), ""]}
          cursor={{ fill: "#f1f5f9" }}
        />
        <Bar
          dataKey={metric}
          fill={color}
          radius={[0, 3, 3, 0]}
          label={{
            position: "right",
            fontSize: 11,
            fill: "#475569",
            formatter: (v: unknown) =>
              metric === "net" ? man(Number(v)) : String(v),
          }}
        >
          {colorOf && data.map((r) => <Cell key={r.key} fill={colorOf(r)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 세로 막대 (지역별 등) */
export function SimpleBarChart({
  rows,
  metric,
  color = "#0ea5e9",
  height = 240,
}: {
  rows: AggRow[];
  metric: "count" | "sessions" | "net" | "headcount";
  color?: string;
  height?: number;
}) {
  if (!rows.length || !rows.some((d) => d[metric] > 0)) return <Empty />;
  const fmt = (v: number) =>
    metric === "net"
      ? won(v)
      : metric === "sessions"
        ? `${fmtSessions(v)}차시`
        : `${v}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis
          dataKey="key"
          tick={tick}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={4}
        />
        <YAxis
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={metric === "net" ? man : undefined}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [fmt(Number(v)), ""]}
          cursor={{ fill: "#f1f5f9" }}
        />
        <Bar
          dataKey={metric}
          radius={[3, 3, 0, 0]}
          maxBarSize={44}
          label={{
            position: "top",
            fontSize: 11,
            fill: "#475569",
            formatter: (v: unknown) =>
              metric === "net" ? man(Number(v)) : String(v),
          }}
        >
          {rows.map((r, i) => (
            <Cell
              key={r.key}
              fill={color === "auto" ? SERIES[i % SERIES.length] : color}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** 통합보고서 상단 차트 묶음 */
export function ReportCharts({
  data,
  periodLabel,
}: {
  data: ReportData;
  periodLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card
        title="월별 추이"
        sub={`${periodLabel} · 막대 = 차시·건수, 선 = 세후 강사료`}
        className="xl:col-span-2"
      >
        <MonthlyTrendChart months={data.months} />
      </Card>
      <Card title="기관 유형별 차시 비중" sub="총 차시 기준">
        <DonutChart rows={data.byType} colors={TYPE_COLOR} metric="sessions" />
      </Card>
      <Card
        title="지급유형별 세후 강사료"
        sub="기관지급은 0원이라 표시되지 않음"
      >
        <DonutChart rows={data.byPayType} colors={PAY_COLOR} metric="net" />
      </Card>
      <Card title="콘텐츠별 교육 횟수 Top 10">
        <RankBarChart
          rows={data.byContent}
          metric="count"
          color="#8b5cf6"
          labelWidth={100}
        />
      </Card>
      <Card title="강사별 세후 강사료 Top 10">
        <RankBarChart
          rows={data.byInstructor.map((r) => ({
            ...r,
            key: `${r.key}${r.grade ? ` (${r.grade.replace("등급", "")})` : ""}`,
          }))}
          metric="net"
          color={BLUE}
          labelWidth={110}
        />
      </Card>
      <Card
        title="기관별 교육 횟수 Top 10"
        sub="색 = 기관 유형 · 어느 기관에 강의가 집중되는지"
      >
        <RankBarChart
          rows={data.byInstitution}
          metric="count"
          colorOf={(r) =>
            TYPE_COLOR[(r as { type?: string }).type ?? ""] ?? "#94a3b8"
          }
          labelWidth={132}
          unit="회"
        />
      </Card>
      <Card title="등급별 세후 강사료" sub="아코연구원·미등록은 단가 0">
        <DonutChart rows={data.byGrade} colors={GRADE_COLOR} metric="net" />
      </Card>
    </div>
  );
}
