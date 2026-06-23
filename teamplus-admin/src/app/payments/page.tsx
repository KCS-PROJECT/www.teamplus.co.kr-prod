'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, CreditCard, Check } from 'lucide-react';
import { paymentService } from '@/services/payment.service';
import { authService } from '@/services/auth.service';
import type { ClassProduct } from '@/types';


export default function PaymentsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [products, setProducts] = useState<ClassProduct[]>([]);

  useEffect(() => {
    // 수업 상품 목록 — TODO_REGISTRY P2-GAP-BE-001 (Payments Phase B 이관) 진행 후
    // `/api/v1/class-products` 또는 `/api/v1/payments/products` 엔드포인트로 연동 예정.
    // 현재는 Phase B 완료 시까지 빈 목록으로 유지 (UX: "판매 중인 수업 상품이 없습니다" 안내).
    setProducts([]);
  }, []);

  const handlePayment = async () => {
    if (!selectedProduct) {
      setError('상품을 선택해주세요.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const product = products.find(p => p.id === selectedProduct);
      if (!product) {
        throw new Error('선택한 상품을 찾을 수 없습니다.');
      }

      // 로그인 세션에서 실제 회원 ID 획득 — 미로그인 시 에러 throw
      const currentUser = authService.getCurrentUser();
      const memberId = currentUser?.id;
      if (!memberId) {
        throw new Error('로그인이 필요합니다. 다시 로그인 후 시도해주세요.');
      }

      const result = await paymentService.createPayment({
        memberId,
        productId: product.id,
        amount: product.price,
        returnUrl: `${window.location.origin}/payments/success`,
        cancelUrl: `${window.location.origin}/payments/cancel`,
      });

      if (result.success && result.redirectUrl) {
        // KG이니시스 결제 페이지로 리다이렉트
        window.location.href = result.redirectUrl;
      } else {
        throw new Error(result.message || '결제 생성에 실패했습니다.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '결제 처리 중 오류가 발생했습니다.';
      setError(message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
            aria-label="대시보드로 돌아가기"
          >
            <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">결제하기</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">수업 상품을 선택하고 결제를 진행하세요</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Product Selection */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
            상품 선택
          </h2>

          {products.length === 0 ? (
            <Card className="p-10 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <CreditCard className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" aria-hidden="true" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                판매 중인 수업 상품이 없습니다.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {products.map((product) => {
                const isSelected = selectedProduct === product.id;
                return (
                  <Card
                    key={product.id}
                    onClick={() => setSelectedProduct(product.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedProduct(product.id);
                      }
                    }}
                    aria-pressed={isSelected}
                    className={`p-6 cursor-pointer border-2 rounded-xl transition-colors motion-reduce:transition-none ${
                      isSelected
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* Selection Indicator */}
                    <div className="flex items-start justify-between mb-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          isSelected
                            ? 'bg-primary/10 border-primary/30 text-primary dark:text-primary-light'
                            : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        월 {product.sessionsPerMonth}회
                      </Badge>
                      {isSelected && (
                        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center" aria-hidden="true">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                      {product.productName}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      {product.description}
                    </p>

                    {/* Price */}
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-700 text-right">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                        {product.price.toLocaleString()}원
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                        1회당 {Math.floor(product.price / product.sessionsPerMonth).toLocaleString()}원
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Summary */}
        {selectedProduct && (
          <Card className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              결제 정보
            </h3>
            <div className="space-y-3">
              {(() => {
                const product = products.find(p => p.id === selectedProduct);
                if (!product) return null;

                return (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">상품명</span>
                      <span className="font-medium text-slate-900 dark:text-white">{product.productName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">수업 횟수</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">월 {product.sessionsPerMonth}회</span>
                    </div>
                    <div className="flex justify-between items-baseline text-sm pt-3 border-t border-slate-200 dark:border-slate-700">
                      <span className="text-slate-900 dark:text-white font-semibold">총 결제 금액</span>
                      <span className="text-xl font-bold text-primary tabular-nums">
                        {product.price.toLocaleString()}원
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <div
            className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Payment Button */}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={() => router.push('/dashboard')}
            variant="outline"
            className="flex-1 h-12 font-semibold"
          >
            취소하기
          </Button>
          <Button
            type="button"
            onClick={handlePayment}
            disabled={!selectedProduct || isLoading}
            className="flex-1 h-12 bg-primary hover:bg-primary-dark text-white font-semibold transition-colors motion-reduce:transition-none"
          >
            <CreditCard className="w-5 h-5 mr-2" aria-hidden="true" />
            {isLoading ? '처리 중...' : '결제하기'}
          </Button>
        </div>

        {/* Payment Info */}
        <div className="mt-8 p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">결제 안내</h4>
          <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 leading-relaxed">
            <li>• 결제는 KG이니시스를 통해 안전하게 처리됩니다.</li>
            <li>• 결제 완료 후 크레딧이 자동으로 충전됩니다.</li>
            <li>• 크레딧은 90일간 유효하며, 출석 시 1회당 1크레딧이 차감됩니다.</li>
            <li>• 결제 취소는 결제일로부터 7일 이내 가능합니다.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
