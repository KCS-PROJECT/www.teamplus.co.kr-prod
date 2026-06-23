'use client';

/**
 * 쇼핑몰 통계 페이지
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 매출 통계, 기간별 분석, 인기 상품
 * 2. 휴먼 디자인: 명확한 숫자 지표, 추이 그래프, 배지
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + analyzer
 * 5. Tone & Manner: 존댓말, 전문적 표현
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Package,
  ShoppingCart,
  DollarSign,
  BarChart3,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Star,
  XCircle,
} from 'lucide-react';
import { shopService } from '@/services/shop.service';
import { ShopStats } from '@/types';

type PeriodType = 'daily' | 'weekly' | 'monthly';

export default function ShopStatsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('weekly');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const start = Date.now();
    try {
      setIsLoading(true);
      setError(null);
      const data = await shopService.getStats();
      setStats(data);
    } catch (err) {
      console.error('통계 조회 실패:', err);
      setError(err instanceof Error ? err.message : '통계를 불러오는 데 실패했습니다.');
    } finally {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 600 - elapsed);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      setIsLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  // 기본 통계 데이터 (API 데이터가 없을 때 사용)
  const defaultStats: ShopStats = {
    totalSales: 12540000,
    totalOrders: 156,
    averageOrderValue: 80384,
    totalProducts: 48,
    pendingOrders: 12,
    shippedOrders: 8,
    completedOrders: 128,
    cancelledOrders: 8,
    topProducts: [
      { id: '1', name: 'CCM Tacks AS-V Pro 스케이트', salesCount: 24, revenue: 5280000 },
      { id: '2', name: 'Bauer Vapor Hyperlite 스틱', salesCount: 18, revenue: 2520000 },
      { id: '3', name: '팀플러스 주니어 헬멧', salesCount: 32, revenue: 1920000 },
      { id: '4', name: 'CCM Super Tacks X 글러브', salesCount: 15, revenue: 1275000 },
      { id: '5', name: 'Bauer Re-Akt 150 헬멧', salesCount: 12, revenue: 1440000 },
    ],
    salesByCategory: [
      { categoryId: '1', categoryName: '스케이트', sales: 5280000, percentage: 42.1 },
      { categoryId: '2', categoryName: '스틱', sales: 2520000, percentage: 20.1 },
      { categoryId: '3', categoryName: '보호장비', sales: 2640000, percentage: 21.1 },
      { categoryId: '4', categoryName: '의류', sales: 1200000, percentage: 9.6 },
      { categoryId: '5', categoryName: '악세서리', sales: 900000, percentage: 7.2 },
    ],
    salesTrend: [
      { date: '2024-01-08', amount: 1850000 },
      { date: '2024-01-09', amount: 2120000 },
      { date: '2024-01-10', amount: 1680000 },
      { date: '2024-01-11', amount: 2340000 },
      { date: '2024-01-12', amount: 1920000 },
      { date: '2024-01-13', amount: 2630000 },
    ],
  };

  // stats가 있어도 배열 속성이 없을 수 있으므로 기본값 병합
  const displayStats: ShopStats = {
    ...defaultStats,
    ...stats,
    topProducts: stats?.topProducts?.length ? stats.topProducts : defaultStats.topProducts,
    salesByCategory: stats?.salesByCategory?.length ? stats.salesByCategory : defaultStats.salesByCategory,
    salesTrend: stats?.salesTrend?.length ? stats.salesTrend : defaultStats.salesTrend,
  };

  // 성장률 계산 (임시 데이터)
  const growthRates = {
    sales: 12.5,
    orders: 8.3,
    avgOrderValue: 4.2,
    products: 15.0,
  };

  if (isLoading) {
    return <LoadingSpinner message="통계를 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">오류가 발생했습니다</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <Button type="button" onClick={loadStats} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white gap-2">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  // 최대 매출액 (차트 스케일용)
  const maxSales = Math.max(...(displayStats.salesTrend || []).map((t) => t.amount));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">쇼핑몰 통계</h1>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
            매출 및 주문 현황을 확인하세요
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={loadStats} className="h-12 px-5 text-base font-bold gap-2">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            새로고침
          </Button>
          <Button type="button" variant="outline" className="h-12 px-5 text-base font-bold gap-2">
            <Download className="w-4 h-4" aria-hidden="true" />
            리포트 다운로드
          </Button>
        </div>
      </div>

      {/* 주요 지표 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 총 매출 */}
        <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
            <Badge
              className={`${growthRates.sales >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
            >
              {growthRates.sales >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" aria-hidden="true" /> : <ArrowDownRight className="w-3 h-3 mr-1" aria-hidden="true" />}
              {Math.abs(growthRates.sales)}%
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">총 매출</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {formatPrice(displayStats.totalSales || 0)}<span className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-1">원</span>
            </p>
          </div>
        </Card>

        {/* 총 주문 */}
        <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-blue-600 dark:text-primary-light" aria-hidden="true" />
            </div>
            <Badge
              className={`${growthRates.orders >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
            >
              {growthRates.orders >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" aria-hidden="true" /> : <ArrowDownRight className="w-3 h-3 mr-1" aria-hidden="true" />}
              {Math.abs(growthRates.orders)}%
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">총 주문</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {formatNumber(displayStats.totalOrders)}<span className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-1">건</span>
            </p>
          </div>
        </Card>

        {/* 평균 주문 금액 */}
        <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            </div>
            <Badge
              className={`${growthRates.avgOrderValue >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
            >
              {growthRates.avgOrderValue >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" aria-hidden="true" /> : <ArrowDownRight className="w-3 h-3 mr-1" aria-hidden="true" />}
              {Math.abs(growthRates.avgOrderValue)}%
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">평균 주문 금액</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {formatPrice(displayStats.averageOrderValue || 0)}<span className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-1">원</span>
            </p>
          </div>
        </Card>

        {/* 등록 상품 */}
        <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            </div>
            <Badge
              className={`${growthRates.products >= 0 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
            >
              {growthRates.products >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" aria-hidden="true" /> : <ArrowDownRight className="w-3 h-3 mr-1" aria-hidden="true" />}
              {Math.abs(growthRates.products)}%
            </Badge>
          </div>
          <div className="mt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">등록 상품</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
              {formatNumber(displayStats.totalProducts)}<span className="text-sm font-semibold text-slate-500 dark:text-slate-400 ml-1">개</span>
            </p>
          </div>
        </Card>
      </div>

      {/* 주문 상태 요약 */}
      <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">주문 상태 현황</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">
              {displayStats.pendingOrders.toLocaleString()}
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">대기중</p>
          </div>
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-2xl font-bold text-blue-600 dark:text-primary-light tabular-nums">
              {(displayStats.shippedOrders || 0).toLocaleString()}
            </p>
            <p className="text-sm text-blue-700 dark:text-primary-light mt-1">배송중</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
              {(displayStats.completedOrders || 0).toLocaleString()}
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">완료</p>
          </div>
          <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
              {(displayStats.cancelledOrders || 0).toLocaleString()}
            </p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">취소/환불</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 매출 추이 */}
        <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 dark:text-white">매출 추이</h3>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as PeriodType[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    selectedPeriod === period
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {period === 'daily' ? '일별' : period === 'weekly' ? '주별' : '월별'}
                </button>
              ))}
            </div>
          </div>

          {/* 간단한 바 차트 */}
          <div className="space-y-3">
            {(displayStats.salesTrend || []).map((item, index) => {
              const percentage = (item.amount / maxSales) * 100;
              const date = new Date(item.date);
              const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
              return (
                <div key={index} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{formattedDate}</span>
                  <div className="flex-1 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-lg transition-all duration-500 motion-reduce:transition-none"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatPrice(item.amount)}원
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 카테고리별 매출 */}
        <Card className="p-6 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-6">카테고리별 매출</h3>
          <div className="space-y-4">
            {(displayStats.salesByCategory || []).map((category, index) => {
              const colors = [
                'bg-blue-500',
                'bg-green-500',
                'bg-purple-500',
                'bg-orange-500',
                'bg-pink-500',
              ];
              return (
                <div key={category.categoryId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {category.categoryName}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums text-right">
                      {formatPrice(category.sales)}원 · {category.percentage}%
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[index % colors.length]} rounded-full transition-all duration-500 motion-reduce:transition-none`}
                      style={{ width: `${category.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* 베스트 셀러 상품 */}
      <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-500" aria-hidden="true" />
              베스트 셀러 상품
            </h3>
            <Button type="button" variant="outline" size="sm" className="gap-2">
              <Eye className="w-4 h-4" aria-hidden="true" />
              전체 보기
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700">
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  순위
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  상품명
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  판매 수량
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  매출액
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {(displayStats.topProducts || []).map((product, index) => (
                <tr key={product.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index === 0
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : index === 1
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-300'
                          : index === 2
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}
                    >
                      {index + 1}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-medium text-slate-900 dark:text-white">{product.name}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-600 dark:text-slate-400 tabular-nums">{formatNumber(product.salesCount)}개</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatPrice(product.revenue)}원</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
