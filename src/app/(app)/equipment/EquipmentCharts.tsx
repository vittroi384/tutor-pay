"use client";
/**
 * 교구 관리 '통계' 탭 — 재고·대여를 한눈에 보는 차트 모음 (클라이언트, Recharts).
 *  - 교구별 재고 구성: 사용 가능/대여중/수리중/폐기 누적 가로 막대 (보유 상위)
 *  - 지금 대여중 Top 10 / 오래된 대여중 Top 5 (경과일)
 *  - 월별 대여 추이 (수량 막대 + 건수 선)
 *  - 대여처 Top 10 (누적 수량), 용도별·분류별 비중 도넛
 * 데이터는 화면이 이미 받아온 교구·대여 목록에서 그 자리에서 집계한다.
 */
import { useMemo } from "react";
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
import { fmtDateShort } from "@/lib/format";
import type { EquipmentRentalRow, EquipmentRow } from "@/lib/types";

const GREEN = "#0d9488";
const AMBER = "#f59e0b";
const ROSE = "#f43f5e";
const SLATE = "#94a3b8";
const BLUE = "#3b82f6";
const SERIES = [
  "#f5a800",
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
const tick = { fontSize: 11, fill: "#64748b" };

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-200 px-4 py-2.5">
        <div className="text-[13px] font-semibold text-slate-700">{title}</div>
        {sub && <div className="ml-auto text-[11px] text-slate-500">{sub}</div>}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

/** 출고일로부터 오늘까지 경과일 */
function daysSince(outDate: string, today: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(today + "T00:00:00Z").getTime() -
        new Date(outDate + "T00:00:00Z").getTime()) /
        86400000,
    ),
  );
}

export function EquipmentStats({
  equipment,
  rentals,
  today,
}: {
  equipment: EquipmentRow[];
  rentals: EquipmentRentalRow[];
  today: string;
}) {
  // 교구별 재고 구성 (보유 상위 14종). 음수 사용 가능은 0으로 잘라 그림만 안정시키고 툴팁에 원값 표시
  const comp = useMemo(
    () =>
      [...equipment]
        .filter((e) => e.totalStock > 0)
        .sort((a, b) => b.totalStock - a.totalStock)
        .slice(0, 14)
        .map((e) => ({
          name: e.name,
          사용가능: Math.max(0, e.available),
          대여중: e.rentedNow,
          수리중: e.repairCount,
          폐기: e.discardCount,
          total: e.totalStock,
        })),
    [equipment],
  );
  const rentedTop = useMemo(
    () =>
      equipment
        .filter((e) => e.rentedNow > 0)
        .sort((a, b) => b.rentedNow - a.rentedNow)
        .slice(0, 10)
        .map((e) => ({ name: e.name, qty: e.rentedNow })),
    [equipment],
  );
  const openRentals = useMemo(
    () => rentals.filter((r) => !r.inDate),
    [rentals],
  );
  const oldest = useMemo(
    () =>
      [...openRentals]
        .sort((a, b) => (a.outDate < b.outDate ? -1 : 1))
        .slice(0, 5),
    [openRentals],
  );
  const monthly = useMemo(() => {
    const m = new Map<string, { ym: string; qty: number; count: number }>();
    for (const r of rentals) {
      const ym = r.outDate.slice(0, 7);
      if (!m.has(ym)) m.set(ym, { ym, qty: 0, count: 0 });
      const x = m.get(ym)!;
      x.qty += r.quantity;
      x.count += 1;
    }
    return [...m.values()]
      .sort((a, b) => (a.ym < b.ym ? -1 : 1))
      .map((x) => ({ ...x, label: `${Number(x.ym.slice(5))}월` }));
  }, [rentals]);
  const renterTop = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rentals)
      m.set(r.renter, (m.get(r.renter) ?? 0) + r.quantity);
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, qty]) => ({ name, qty }));
  }, [rentals]);
  const purposeAgg = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rentals) {
      const k = r.purpose?.trim() || "기타";
      m.set(k, (m.get(k) ?? 0) + r.quantity);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [rentals]);
  const categoryAgg = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of equipment) {
      const k = e.category ?? "미분류";
      m.set(k, (m.get(k) ?? 0) + e.totalStock);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [equipment]);
  const totalStock = equipment.reduce((a, e) => a + e.totalStock, 0);
  const totalQtyRented = rentals.reduce((a, r) => a + r.quantity, 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card
        title="교구별 재고 구성"
        sub="보유 수량 상위 14종 · 초록=사용 가능, 노랑=대여중, 빨강=수리중, 회색=폐기"
      >
        <ResponsiveContainer
          width="100%"
          height={Math.max(220, comp.length * 27 + 40)}
        >
          <BarChart
            data={comp}
            layout="vertical"
            margin={{ left: 4, right: 24, top: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} stroke="#f1f5f9" />
            <XAxis
              type="number"
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={128}
              tick={{ ...tick, fill: "#334155" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) =>
                v.length > 11 ? v.slice(0, 10) + "…" : v
              }
            />
            <Tooltip
              formatter={(v: unknown, n: unknown) => [`${v}개`, String(n)]}
              labelFormatter={(l) =>
                `${l} (총 ${comp.find((c) => c.name === l)?.total ?? 0}개)`
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="사용가능" stackId="s" fill={GREEN} />
            <Bar dataKey="대여중" stackId="s" fill={AMBER} />
            <Bar dataKey="수리중" stackId="s" fill={ROSE} />
            <Bar
              dataKey="폐기"
              stackId="s"
              fill={SLATE}
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        <Card
          title="지금 대여중 Top 10"
          sub={`대여중 합계 ${equipment.reduce((a, e) => a + e.rentedNow, 0)}개`}
        >
          {rentedTop.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-500">
              지금 대여중인 교구가 없습니다.
            </p>
          ) : (
            <ResponsiveContainer
              width="100%"
              height={Math.max(160, rentedTop.length * 26 + 20)}
            >
              <BarChart
                data={rentedTop}
                layout="vertical"
                margin={{ left: 4, right: 28, top: 4, bottom: 4 }}
              >
                <XAxis
                  type="number"
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={128}
                  tick={{ ...tick, fill: "#334155" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) =>
                    v.length > 11 ? v.slice(0, 10) + "…" : v
                  }
                />
                <Tooltip formatter={(v: unknown) => [`${v}개`, "대여중"]} />
                <Bar
                  dataKey="qty"
                  fill={AMBER}
                  radius={[0, 3, 3, 0]}
                  label={{ position: "right", fontSize: 11, fill: "#475569" }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card
          title="오래된 대여중 Top 5"
          sub="출고일이 오래된 순 — 회수 확인용"
        >
          {oldest.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-500">
              대여중인 기록이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 text-[13px]">
              {oldest.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-1 py-1.5">
                  <span className="w-14 shrink-0 text-slate-500">
                    {fmtDateShort(r.outDate)}
                  </span>
                  <span className="truncate font-medium">{r.renter}</span>
                  <span className="truncate text-slate-600">
                    {r.equipmentName}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    ×{r.quantity}
                  </span>
                  <span className="ml-auto shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 ring-1 ring-amber-200">
                    {daysSince(r.outDate, today)}일째
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="월별 대여 추이"
        sub="막대 = 대여 수량 · 선 = 대여 건수 (출고일 기준)"
      >
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart
            data={monthly}
            margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis yAxisId="l" tick={tick} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="r"
              orientation="right"
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v: unknown, n: unknown) => [
                `${v}${n === "대여 수량" ? "개" : "건"}`,
                String(n),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              yAxisId="l"
              dataKey="qty"
              name="대여 수량"
              fill={GREEN}
              radius={[3, 3, 0, 0]}
              maxBarSize={34}
            />
            <Line
              yAxisId="r"
              type="monotone"
              dataKey="count"
              name="대여 건수"
              stroke={AMBER}
              strokeWidth={2.5}
              dot={{ r: 3, fill: AMBER }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card
        title="대여처 Top 10"
        sub={`누적 대여 수량 기준 · 전체 ${totalQtyRented.toLocaleString()}개`}
      >
        <ResponsiveContainer
          width="100%"
          height={Math.max(180, renterTop.length * 26 + 20)}
        >
          <BarChart
            data={renterTop}
            layout="vertical"
            margin={{ left: 4, right: 30, top: 4, bottom: 4 }}
          >
            <XAxis
              type="number"
              tick={tick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={128}
              tick={{ ...tick, fill: "#334155" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: string) =>
                v.length > 11 ? v.slice(0, 10) + "…" : v
              }
            />
            <Tooltip formatter={(v: unknown) => [`${v}개`, "누적 수량"]} />
            <Bar
              dataKey="qty"
              fill={BLUE}
              radius={[0, 3, 3, 0]}
              label={{ position: "right", fontSize: 11, fill: "#475569" }}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="용도별 대여 비중" sub="누적 대여 수량 기준">
        <Donut data={purposeAgg} unit="개" />
      </Card>
      <Card
        title="분류별 보유 수량"
        sub={`총 ${totalStock.toLocaleString()}개`}
      >
        <Donut data={categoryAgg} unit="개" />
      </Card>
    </div>
  );
}

/** 간단 도넛 + 옆 범례 */
function Donut({
  data,
  unit,
}: {
  data: { name: string; value: number }[];
  unit: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ResponsiveContainer width={190} height={190}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={86}
            paddingAngle={1.5}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={SERIES[i % SERIES.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: unknown, n: unknown) => [
              `${Number(v).toLocaleString()}${unit}`,
              String(n),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="min-w-[180px] flex-1 space-y-1 text-[12.5px]">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SERIES[i % SERIES.length] }}
            />
            <span className="truncate">{d.name}</span>
            <span className="ml-auto tabular-nums text-slate-700">
              {d.value.toLocaleString()}
              {unit}
            </span>
            <span className="w-10 text-right tabular-nums text-slate-400">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
