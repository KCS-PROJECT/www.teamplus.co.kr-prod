'use client';

/**
 * 쇼핑몰 주문 관리 페이지
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 주문 목록, 상태 필터, 일괄 처리, 검색
 * 2. 휴먼 디자인: 체크박스 선택, 상태 배지, 정렬 기능
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + backend
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  Eye,
  Calendar,
  RefreshCw,
  Download,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  ArrowUpDown,
} from 'lucide-react';
import { MiniStatsCard } from '@/components/ui/mini-stats-card';
import { shopService, getOrderStatusLabel, getOrderStatusColor } from '@/services/shop.service';
import { ShopOrder, OrderStatus } from '@/types';

export default function OrdersPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  // 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: '',
  });
  const [sortBy, setSortBy] = useState<'createdAt' | 'totalAmount'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 페이지네이션
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 선택 상태
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // orders가 없을 경우 빈 배열 사용 (안전한 접근)
  const safeOrders = orders || [];

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const start = Date.now();
    try {
      setIsLoading(true);
      setError(null);
      const data = await shopService.getOrders();
      // API 응답이 배열이 아닐 경우 빈 배열로 처리
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('주문 조회 실패:', err);
      setError(err instanceof Error ? err.message : '주문 목록을 불러오는 데 실패했습니다.');
    } finally {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 600 - elapsed);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      setIsLoading(false);
    }
  };

  // 필터링된 주문 목록
  const filteredOrders = safeOrders.filter((order) => {
    // 검색 필터
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesOrderNumber = order.orderNumber.toLowerCase().includes(query);
      const matchesUser = order.user?.email?.toLowerCase().includes(query) ||
                         order.user?.name?.toLowerCase().includes(query);
      if (!matchesOrderNumber && !matchesUser) return false;
    }

    // 상태 필터
    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }

    // 날짜 필터
    if (dateRange.start) {
      const orderDate = new Date(order.createdAt);
      const startDate = new Date(dateRange.start);
      if (orderDate < startDate) return false;
    }
    if (dateRange.end) {
      const orderDate = new Date(order.createdAt);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      if (orderDate > endDate) return false;
    }

    return true;
  });

  // 정렬
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sortBy === 'createdAt') {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    } else {
      return sortOrder === 'desc' ? b.totalAmount - a.totalAmount : a.totalAmount - b.totalAmount;
    }
  });

  // 페이지네이션
  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const paginatedOrders = sortedOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // 전체 선택
  const handleSelectAll = () => {
    if (selectedOrders.length === paginatedOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(paginatedOrders.map((o) => o.id));
    }
  };

  // 개별 선택
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrders((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  // 일괄 상태 변경
  const handleBulkStatusChange = (newStatus: OrderStatus) => {
    if (selectedOrders.length === 0) {
      setActionMsg({ type: 'error', text: MESSAGES.shopOrder.selectRequired }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    setConfirmAction({ id: newStatus, action: 'bulkStatusChange' });
  };

  const handleBulkStatusChangeConfirmed = async () => {
    if (!confirmAction) return;
    const newStatus = confirmAction.id as OrderStatus;
    try {
      await Promise.all(
        selectedOrders.map((orderId) =>
          shopService.updateOrderStatus(orderId, { status: newStatus })
        )
      );
      setActionMsg({ type: 'success', text: MESSAGES.shopOrder.statusChanged }); setTimeout(() => setActionMsg(null), 3000);
      setSelectedOrders([]);
      setConfirmAction(null);
      loadOrders();
    } catch (err) {
      console.error('상태 변경 실패:', err);
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : MESSAGES.shopOrder.statusError }); setTimeout(() => setActionMsg(null), 3000);
      setConfirmAction(null);
    }
  };

  // 주문 상태 아이콘
  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING:
        return <Clock className="w-4 h-4" />;
      case OrderStatus.PAID:
        return <CreditCard className="w-4 h-4" />;
      case OrderStatus.PREPARING:
        return <Package className="w-4 h-4" />;
      case OrderStatus.SHIPPED:
        return <Truck className="w-4 h-4" />;
      case OrderStatus.DELIVERED:
        return <CheckCircle className="w-4 h-4" />;
      case OrderStatus.CANCELLED:
      case OrderStatus.REFUNDED:
        return <XCircle className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  // 날짜 포맷
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // 금액 포맷
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  // 상태 필터 옵션
  const statusOptions = [
    { value: 'all', label: '전체' },
    { value: OrderStatus.PENDING, label: '결제 대기' },
    { value: OrderStatus.PAID, label: '결제 완료' },
    { value: OrderStatus.PREPARING, label: '상품 준비중' },
    { value: OrderStatus.SHIPPED, label: '배송중' },
    { value: OrderStatus.DELIVERED, label: '배송 완료' },
    { value: OrderStatus.CANCELLED, label: '주문 취소' },
    { value: OrderStatus.REFUNDED, label: '환불 완료' },
  ];

  // 통계 데이터
  const stats = {
    total: safeOrders.length,
    pending: safeOrders.filter((o) => o.status === OrderStatus.PENDING).length,
    paid: safeOrders.filter((o) => o.status === OrderStatus.PAID).length,
    preparing: safeOrders.filter((o) => o.status === OrderStatus.PREPARING).length,
    shipped: safeOrders.filter((o) => o.status === OrderStatus.SHIPPED).length,
    delivered: safeOrders.filter((o) => o.status === OrderStatus.DELIVERED).length,
  };

  if (isLoading) {
    return <LoadingSpinner message="주문 목록을 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">오류가 발생했습니다</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <Button onClick={loadOrders} className="bg-primary hover:bg-primary-dark text-white gap-2">
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">주문 관리</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            총 {safeOrders.length}개의 주문
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={loadOrders} className="h-12 px-5 text-base font-bold gap-2">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            새로고침
          </Button>
          <Button type="button" variant="outline" className="h-12 px-5 text-base font-bold gap-2">
            <Download className="w-4 h-4" aria-hidden="true" />
            내보내기
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MiniStatsCard title="전체 주문" value={stats.total} icon={<Package className="w-5 h-5" />} variant="primary" />
        <MiniStatsCard title="결제 대기" value={stats.pending} icon={<Clock className="w-5 h-5" />} variant="warning" />
        <MiniStatsCard title="결제 완료" value={stats.paid} icon={<CreditCard className="w-5 h-5" />} variant="info" />
        <MiniStatsCard title="상품 준비중" value={stats.preparing} icon={<Package className="w-5 h-5" />} variant="info" />
        <MiniStatsCard title="배송중" value={stats.shipped} icon={<Truck className="w-5 h-5" />} variant="info" />
        <MiniStatsCard title="배송 완료" value={stats.delivered} icon={<CheckCircle className="w-5 h-5" />} variant="success" />
      </div>

      {/* 필터 및 검색 */}
      <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* 검색 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="주문번호, 고객명, 이메일로 검색"
              className="pl-10 h-11"
            />
          </div>

          {/* 상태 필터 */}
          <div className="flex gap-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as OrderStatus | 'all');
                setCurrentPage(1);
              }}
              className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white min-w-[140px]"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {/* 날짜 필터 */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDateRange({ ...dateRange, start: e.target.value });
                    setCurrentPage(1);
                  }}
                  className="h-11 pl-10 pr-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <span className="text-slate-400">~</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => {
                  setDateRange({ ...dateRange, end: e.target.value });
                  setCurrentPage(1);
                }}
                className="h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* 일괄 작업 */}
        {selectedOrders.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {selectedOrders.length}개 선택됨
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkStatusChange(OrderStatus.PREPARING)}
                >
                  상품 준비중
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkStatusChange(OrderStatus.SHIPPED)}
                >
                  배송중
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBulkStatusChange(OrderStatus.DELIVERED)}
                >
                  배송 완료
                </Button>
              </div>
            </div>
            {confirmAction?.action === 'bulkStatusChange' && (
              <div className="flex items-center gap-2 mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <span className="text-sm text-yellow-700 dark:text-yellow-400">선택한 {selectedOrders.length}개 주문의 상태를 &quot;{getOrderStatusLabel(confirmAction.id as OrderStatus)}&quot;으로 변경하시겠습니까?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
                <Button size="sm" onClick={handleBulkStatusChangeConfirmed} className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700 text-white">변경하기</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 주문 테이블 */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={paginatedOrders.length > 0 && selectedOrders.length === paginatedOrders.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  주문번호
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  고객
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  상품
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortBy === 'totalAmount') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSortBy('totalAmount');
                        setSortOrder('desc');
                      }
                    }}
                    className="ml-auto flex items-center gap-1 hover:text-slate-900 dark:hover:text-white motion-reduce:transition-none"
                  >
                    금액
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortBy === 'createdAt') {
                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSortBy('createdAt');
                        setSortOrder('desc');
                      }
                    }}
                    className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white motion-reduce:transition-none"
                  >
                    주문일시
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                  상세
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400">
                      {searchQuery || statusFilter !== 'all' || dateRange.start || dateRange.end
                        ? '검색 조건에 맞는 주문이 없습니다.'
                        : '등록된 주문이 없습니다.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => handleSelectOrder(order.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                        {order.orderNumber}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {order.user?.name || '이름 없음'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {order.user?.email || '-'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-slate-900 dark:text-white">
                        {order.items && order.items.length > 0 ? (
                          <>
                            {order.items[0].product?.name || '상품명 없음'}
                            {order.items.length > 1 && (
                              <span className="text-slate-500 dark:text-slate-400">
                                {' '}외 {order.items.length - 1}개
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                          {formatPrice(order.totalAmount)}<span className="text-slate-400 dark:text-slate-500 font-normal ml-0.5">원</span>
                        </p>
                        {order.shippingFee > 0 && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            배송비 {formatPrice(order.shippingFee)}원
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge className={`${getOrderStatusColor(order.status)} inline-flex items-center gap-1`}>
                        {getStatusIcon(order.status)}
                        {getOrderStatusLabel(order.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {formatDate(order.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/shop/orders/${order.id}`)}
                        className="hover:bg-slate-100 dark:hover:bg-slate-600"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {filteredOrders.length}개 중 {(currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, filteredOrders.length)}개 표시
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={currentPage === pageNum ? 'bg-primary hover:bg-primary-dark text-white' : ''}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
