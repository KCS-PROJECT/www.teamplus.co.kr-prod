"use client";

import { Icon } from "@/components/ui/Icon";
import { CountUp } from "@/components/ui/CountUp";

export interface MonthlyPerformanceData {
  totalRevenue: number;
  revenueChange: number;
  totalOrders: number;
  ordersChange: number;
  newMembers: number;
  membersChange: number;
  attendanceRate: number;
  attendanceChange: number;
  revenueByMonth?: { month: string; revenue: number }[];
}

interface MonthlyPerformanceReportProps {
  data: MonthlyPerformanceData;
}

function MetricItem({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  unit,
  change,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  unit: string;
  change: number;
}) {
  const isPositive = change >= 0;

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-wtext-3 dark:text-rink-300">
          {label}
        </span>
        <div className={`p-1.5 rounded-lg ${iconBg}`}>
          <Icon name={icon} className={`text-lg ${iconColor}`} />
        </div>
      </div>
      <div>
        <div className="flex items-baseline gap-1 justify-end">
          <span className="text-2xl font-extrabold text-wtext-1 dark:text-white tracking-tight">
            <CountUp end={value} duration={1200} />
          </span>
          <span className="text-sm font-medium text-wtext-3 dark:text-rink-300">
            {unit}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Icon
            name={isPositive ? "trending_up" : "trending_down"}
            className={`text-sm ${isPositive ? "text-green-500" : "text-red-500"}`}
          />
          <span
            className={`text-xs font-semibold ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            전월 대비 {isPositive ? "+" : ""}
            {change}%
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * SVG 월간 매출 추이 차트
 * 순수 SVG 구현 · 외부 라이브러리 미사용
 * Design 7 Principles 적용 · AI 스타일 금지
 */
function RevenueChart({
  data,
}: {
  data: { month: string; revenue: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-wtext-3">
        데이터 없음
      </div>
    );
  }

  // 데이터 정규화: 0-50 범위로 변환 (SVG viewBox 기준)
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 50 - (d.revenue / maxRevenue) * 40;
    return { x, y, revenue: d.revenue };
  });

  // Polygon과 Polyline 포인트 문자열
  const polygonPoints = [
    "0,50",
    ...points.map((p) => `${p.x},${p.y}`),
    "100,50",
  ].join(" ");

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="flex flex-col gap-3">
      {/* 차트 제목 */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm text-wtext-1 dark:text-white">
          월간 매출 추이
        </h3>
        <span className="text-xs font-medium text-wtext-3 dark:text-rink-300">
          최근 {data.length}개월
        </span>
      </div>

      {/* SVG Area Chart */}
      <div className="w-full relative h-32">
        <svg
          className="w-full h-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 50"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Filled area */}
          <polygon fill="#1E3FAE" fillOpacity="0.08" points={polygonPoints} />

          {/* Line */}
          <polyline
            fill="none"
            stroke="#1E3FAE"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="1.5"
              fill="white"
              stroke="#1E3FAE"
              strokeWidth="0.5"
            />
          ))}
        </svg>
      </div>

      {/* X축 레이블 */}
      <div className="flex justify-between text-xs text-wtext-3 dark:text-rink-300">
        {data.map((d, i) => (
          <span key={i}>{d.month}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * 월간 성과 보고 영역
 * Design 7 Principles 적용 · AI 스타일 금지
 */
export function MonthlyPerformanceReport({
  data,
}: MonthlyPerformanceReportProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* 4개 메트릭 (2x2 그리드) */}
      <div className="grid grid-cols-2 gap-3">
        <MetricItem
          icon="payments"
          iconBg="bg-blue-50 dark:bg-blue-900/20"
          iconColor="text-ice-500 dark:text-blue-400"
          label="월간 매출"
          value={Math.round(data.totalRevenue / 10000)}
          unit="만원"
          change={data.revenueChange}
        />
        <MetricItem
          icon="receipt_long"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label="결제 건수"
          value={data.totalOrders}
          unit="건"
          change={data.ordersChange}
        />
        <MetricItem
          icon="person_add"
          iconBg="bg-indigo-50 dark:bg-indigo-900/20"
          iconColor="text-indigo-600 dark:text-indigo-400"
          label="신규 회원"
          value={data.newMembers}
          unit="명"
          change={data.membersChange}
        />
        <MetricItem
          icon="check_circle"
          iconBg="bg-amber-50 dark:bg-amber-900/20"
          iconColor="text-amber-600 dark:text-amber-400"
          label="출석률"
          value={data.attendanceRate}
          unit="%"
          change={data.attendanceChange}
        />
      </div>

      {/* SVG Area Chart - 월간 매출 추이 */}
      {data.revenueByMonth && data.revenueByMonth.length > 0 && (
        <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline dark:border-rink-700 p-4">
          <RevenueChart data={data.revenueByMonth} />
        </div>
      )}
    </div>
  );
}
