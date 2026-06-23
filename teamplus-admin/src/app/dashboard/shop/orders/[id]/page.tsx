'use client';

/**
 * 주문 상세 페이지
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 주문 정보, 배송 정보, 상품 목록, 결제 내역
 * 2. 휴먼 디자인: 섹션별 카드, 상태 타임라인, 명확한 레이블
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + backend
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  ArrowLeft,
  Package,
  User,
  Phone,
  CreditCard,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Printer,
  Edit,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { shopService, getOrderStatusLabel, getOrderStatusColor } from '@/services/shop.service';
import { ShopOrder, OrderStatus } from '@/types';

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<OrderStatus | ''>('');
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  // 배송 정보 수정
  const [isEditingShipping, setIsEditingShipping] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courierCode, setCourierCode] = useState('');

  const loadOrder = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shopService.getOrder(orderId);
      setOrder(data || null);
      // data가 있을 경우에만 배송 정보 설정
      if (data?.shippingInfo?.trackingNumber) {
        setTrackingNumber(data.shippingInfo.trackingNumber);
      }
      if (data?.shippingInfo?.courierCode) {
        setCourierCode(data.shippingInfo.courierCode);
      }
    } catch (err) {
      console.error('주문 조회 실패:', err);
      setError(err instanceof Error ? err.message : '주문 정보를 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleStatusChange = async () => {
    if (!newStatus || !order) return;

    setIsUpdatingStatus(true);
    try {
      await shopService.updateOrderStatus(orderId, { status: newStatus });
      setOrder({ ...order, status: newStatus });
      setNewStatus('');
      setActionMsg({ type: 'success', text: MESSAGES.shopOrder.statusChanged }); setTimeout(() => setActionMsg(null), 3000);
    } catch (err) {
      console.error('상태 변경 실패:', err);
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : MESSAGES.shopOrder.statusError }); setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelOrderConfirmed = async () => {
    if (!order) return;

    try {
      await shopService.cancelOrder(orderId);
      setOrder({ ...order, status: OrderStatus.CANCELLED });
      setConfirmAction(null);
      setActionMsg({ type: 'success', text: MESSAGES.shopOrder.cancelled }); setTimeout(() => setActionMsg(null), 3000);
    } catch (err) {
      console.error('주문 취소 실패:', err);
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : MESSAGES.shopOrder.cancelError }); setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setActionMsg({ type: 'success', text: MESSAGES.shopOrder.copied }); setTimeout(() => setActionMsg(null), 3000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  // 주문 상태에 따른 진행 단계
  const getOrderProgress = (status: OrderStatus) => {
    const steps = [
      { status: OrderStatus.PENDING, label: '결제 대기' },
      { status: OrderStatus.PAID, label: '결제 완료' },
      { status: OrderStatus.PREPARING, label: '상품 준비중' },
      { status: OrderStatus.SHIPPED, label: '배송중' },
      { status: OrderStatus.DELIVERED, label: '배송 완료' },
    ];

    if (status === OrderStatus.CANCELLED) {
      return { steps: [], currentIndex: -1, isCancelled: true };
    }
    if (status === OrderStatus.REFUNDED) {
      return { steps: [], currentIndex: -1, isRefunded: true };
    }

    const currentIndex = steps.findIndex((s) => s.status === status);
    return { steps, currentIndex, isCancelled: false, isRefunded: false };
  };

  // 다음 상태 옵션
  const getNextStatusOptions = (currentStatus: OrderStatus): OrderStatus[] => {
    switch (currentStatus) {
      case OrderStatus.PENDING:
        return [OrderStatus.PAID, OrderStatus.CANCELLED];
      case OrderStatus.PAID:
        return [OrderStatus.PREPARING, OrderStatus.CANCELLED, OrderStatus.REFUNDED];
      case OrderStatus.PREPARING:
        return [OrderStatus.SHIPPED, OrderStatus.CANCELLED, OrderStatus.REFUNDED];
      case OrderStatus.SHIPPED:
        return [OrderStatus.DELIVERED, OrderStatus.REFUNDED];
      case OrderStatus.DELIVERED:
        return [OrderStatus.REFUNDED];
      default:
        return [];
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="주문 정보를 불러오는 중..." />;
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            {error || '주문을 찾을 수 없습니다'}
          </h2>
          <div className="flex gap-3 justify-center mt-6">
            <Button type="button" variant="outline" onClick={() => router.back()} className="h-12 px-5 text-base font-bold">
              뒤로 가기
            </Button>
            <Button type="button" onClick={loadOrder} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white gap-2">
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              다시 시도
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const progress = getOrderProgress(order.status);
  const nextStatusOptions = getNextStatusOptions(order.status);

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
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                주문 #{order.orderNumber}
              </h1>
              <button
                type="button"
                onClick={() => copyToClipboard(order.orderNumber)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                title="주문번호 복사"
                aria-label="주문번호 복사"
              >
                <Copy className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </button>
            </div>
            <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
              {formatDate(order.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`${getOrderStatusColor(order.status)} text-sm px-3 py-1`}>
            {getOrderStatusLabel(order.status)}
          </Badge>
          <Button type="button" variant="outline" className="h-12 px-5 text-base font-bold gap-2">
            <Printer className="w-4 h-4" aria-hidden="true" />
            인쇄
          </Button>
        </div>
      </div>

      {/* 주문 진행 상태 */}
      {progress.steps.length > 0 && (
        <Card className="p-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-6">주문 진행 상태</h3>
          <div className="relative">
            <div className="flex justify-between">
              {progress.steps.map((step, index) => {
                const isCompleted = index <= progress.currentIndex;
                const isCurrent = index === progress.currentIndex;
                return (
                  <div key={step.status} className="flex flex-col items-center relative z-10">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isCompleted
                          ? 'bg-primary text-white'
                          : 'bg-slate-200 dark:bg-slate-600 text-slate-400 dark:text-slate-500'
                      } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5" aria-hidden="true" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span
                      className={`text-xs mt-2 ${
                        isCompleted
                          ? 'text-primary dark:text-primary-light font-medium'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-600 -z-0">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{
                  width: `${(progress.currentIndex / (progress.steps.length - 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* 취소/환불 상태 표시 */}
      {(progress.isCancelled || progress.isRefunded) && (
        <Card className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3">
            <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-300">
                {progress.isCancelled ? '주문이 취소되었습니다' : '환불이 완료되었습니다'}
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {formatDate(order.updatedAt || order.createdAt)}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 주문 상품 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 주문 상품 */}
          <Card className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5" aria-hidden="true" />
                주문 상품 ({order.items?.length || 0}개)
              </h3>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {order.items && order.items.length > 0 ? (
                order.items.map((item) => (
                  <div key={item.id} className="p-4 flex gap-4">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0 relative">
                      {item.product?.images && item.product.images.length > 0 ? (
                        <Image
                          src={item.product.images[0].imageUrl}
                          alt={item.product.name}
                          fill
                          sizes="80px"
                          className="object-cover rounded-lg"
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-400" aria-hidden="true" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-900 dark:text-white">
                        {item.product?.name || '상품명 없음'}
                      </h4>
                      {item.optionValue && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          옵션: {item.optionValue}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                          수량: {item.quantity}개
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white tabular-nums text-right">
                          {formatPrice((item.price || item.unitPrice) * item.quantity)}원
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <p className="text-slate-500 dark:text-slate-400">주문 상품 정보가 없습니다.</p>
                </div>
              )}
            </div>
          </Card>

          {/* 배송 정보 */}
          <Card className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-5 h-5" aria-hidden="true" />
                배송 정보
              </h3>
              {order.status === OrderStatus.PREPARING && (
                <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingShipping(!isEditingShipping)}>
                  <Edit className="w-4 h-4 mr-1" aria-hidden="true" />
                  {isEditingShipping ? '취소' : '운송장 입력'}
                </Button>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">수령인</p>
                  <p className="font-medium text-slate-900 dark:text-white mt-1">
                    {order.shippingInfo?.recipientName || order.user?.name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">연락처</p>
                  <p className="font-medium text-slate-900 dark:text-white mt-1">
                    {order.shippingInfo?.recipientPhone || order.user?.phone || '-'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">배송지</p>
                  <p className="font-medium text-slate-900 dark:text-white mt-1">
                    {order.shippingInfo?.address
                      ? `${order.shippingInfo.address} ${order.shippingInfo.addressDetail || ''}`
                      : '-'}
                  </p>
                </div>
                {order.shippingInfo?.memo && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-slate-500 dark:text-slate-400">배송 메모</p>
                    <p className="font-medium text-slate-900 dark:text-white mt-1">
                      {order.shippingInfo.memo}
                    </p>
                  </div>
                )}
              </div>

              {/* 운송장 정보 */}
              {(order.shippingInfo?.trackingNumber || isEditingShipping) && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  {isEditingShipping ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm text-slate-500 dark:text-slate-400">택배사</label>
                          <select
                            value={courierCode}
                            onChange={(e) => setCourierCode(e.target.value)}
                            className="w-full mt-1 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                          >
                            <option value="">택배사 선택</option>
                            <option value="cj">CJ대한통운</option>
                            <option value="hanjin">한진택배</option>
                            <option value="lotte">롯데택배</option>
                            <option value="logen">로젠택배</option>
                            <option value="post">우체국택배</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-slate-500 dark:text-slate-400">운송장 번호</label>
                          <Input
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            placeholder="운송장 번호 입력"
                            className="mt-1 h-10"
                          />
                        </div>
                      </div>
                      <Button type="button" className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white">
                        저장 및 배송 시작
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">운송장 번호</p>
                        <p className="font-medium text-slate-900 dark:text-white mt-1">
                          {order.shippingInfo?.courierName || '택배사'}: {order.shippingInfo?.trackingNumber}
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="gap-2">
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                        배송 조회
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 오른쪽: 고객 정보 & 결제 정보 */}
        <div className="space-y-6">
          {/* 고객 정보 */}
          <Card className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5" aria-hidden="true" />
                고객 정보
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-500" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {order.user?.name || '이름 없음'}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {order.user?.email || '-'}
                  </p>
                </div>
              </div>
              {order.user?.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  <span className="text-slate-600 dark:text-slate-300">{order.user.phone}</span>
                </div>
              )}
            </div>
          </Card>

          {/* 결제 정보 */}
          <Card className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5" aria-hidden="true" />
                결제 정보
              </h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">상품 금액</span>
                <span className="text-sm text-slate-900 dark:text-white tabular-nums text-right">
                  {formatPrice(order.totalAmount - order.shippingFee)}원
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">배송비</span>
                <span className="text-sm text-slate-900 dark:text-white tabular-nums text-right">
                  {order.shippingFee > 0 ? `${formatPrice(order.shippingFee)}원` : '무료'}
                </span>
              </div>
              {order.discountAmount && order.discountAmount > 0 && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-500 dark:text-slate-400">할인</span>
                  <span className="text-sm text-red-600 dark:text-red-400 tabular-nums text-right">
                    -{formatPrice(order.discountAmount)}원
                  </span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">총 결제 금액</span>
                  <span className="font-bold text-xl text-primary dark:text-primary-light tabular-nums text-right">
                    {formatPrice(order.totalAmount)}<span className="text-sm font-semibold ml-0.5">원</span>
                  </span>
                </div>
              </div>
              {order.paymentMethod && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">결제 수단</span>
                    <span className="text-slate-900 dark:text-white text-right">{order.paymentMethod}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* 상태 변경 */}
          {nextStatusOptions.length > 0 && (
            <Card className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5" aria-hidden="true" />
                  상태 변경
                </h3>
              </div>
              <div className="p-6 space-y-3">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">상태 선택</option>
                  {nextStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {getOrderStatusLabel(status)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  onClick={handleStatusChange}
                  disabled={!newStatus || isUpdatingStatus}
                  className="w-full h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white"
                >
                  {isUpdatingStatus ? '변경 중...' : '상태 변경'}
                </Button>
              </div>
            </Card>
          )}

          {/* 주문 취소 버튼 */}
          {(order.status === OrderStatus.PENDING || order.status === OrderStatus.PAID) && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmAction({ id: orderId, action: 'cancelOrder' })}
                className="w-full h-12 px-5 text-base font-bold text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                <XCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                주문 취소
              </Button>
              {confirmAction?.action === 'cancelOrder' && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <span className="text-sm text-red-700 dark:text-red-400">정말 이 주문을 취소하시겠습니까?</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
                  <Button type="button" size="sm" onClick={handleCancelOrderConfirmed} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">주문 취소하기</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
