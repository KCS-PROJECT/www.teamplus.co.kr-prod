'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter, useParams } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { sanitizeHtml } from '@/lib/sanitize';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Package,
  TrendingUp,
  Clock,
  Copy,
  Star,
  AlertCircle,
} from 'lucide-react';
import { shopService } from '@/services';
import { ShopProduct } from '@/types';

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  const loadProduct = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await shopService.getProduct(productId);
      setProduct(data);
      // 메인 이미지 인덱스 설정
      const mainIdx = data?.images?.findIndex((img) => img.isMain) ?? 0;
      setSelectedImageIndex(mainIdx >= 0 ? mainIdx : 0);
    } catch (err) {
      console.error('상품 조회 실패:', err);
      setError(err instanceof Error ? err.message : '상품을 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await shopService.deleteProduct(productId);
      setActionMsg({ type: 'success', text: MESSAGES.shopProduct.deleted }); setTimeout(() => { setActionMsg(null); router.push('/dashboard/shop/products'); }, 1500);
    } catch (err) {
      console.error('상품 삭제 실패:', err);
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : MESSAGES.shopProduct.deleteError }); setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!product) return;

    try {
      const newStatus = !product.isActive;
      await shopService.updateProduct(productId, { isActive: newStatus });
      setProduct({
        ...product,
        isActive: newStatus,
      });
    } catch (err) {
      console.error('상태 변경 실패:', err);
      setActionMsg({ type: 'error', text: err instanceof Error ? err.message : MESSAGES.shopProduct.statusError }); setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setActionMsg({ type: 'success', text: MESSAGES.shopProduct.copied }); setTimeout(() => setActionMsg(null), 3000);
  };

  if (isLoading) {
    return <LoadingSpinner message="상품 정보를 불러오는 중..." />;
  }

  if (error || !product) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" aria-hidden="true" />
          <p className="text-slate-600 dark:text-slate-400">{error || '상품을 찾을 수 없습니다.'}</p>
          <Button type="button" onClick={() => router.push('/dashboard/shop/products')} className="mt-4 h-12 px-5 text-base font-bold">
            목록으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const discountRate = product.salePrice && product.price
    ? Math.round((1 - product.salePrice / product.price) * 100)
    : 0;

  // ShopProduct 타입 맵핑
  const images = product.images || [];
  const options = product.options || [];

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
            aria-label="뒤로가기"
            onClick={() => router.push('/dashboard/shop/products')}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">상품 상세</h1>
              <Badge variant="outline" className={product.isActive ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'}>
                {product.isActive ? '판매중' : '판매중지'}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">SKU: {product.code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleToggleStatus}
            className="h-12 px-5 text-base font-bold gap-2"
          >
            {product.isActive ? (
              <>
                <EyeOff className="w-4 h-4" aria-hidden="true" />
                판매중지
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" aria-hidden="true" />
                판매시작
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/shop/products/${productId}/edit`)}
            className="h-12 px-5 text-base font-bold gap-2"
          >
            <Edit2 className="w-4 h-4" aria-hidden="true" />
            수정
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmAction({ id: productId, action: 'delete' })}
            disabled={isDeleting}
            className="h-12 px-5 text-base font-bold gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            {isDeleting ? '삭제 중...' : '삭제'}
          </Button>
        </div>
      </div>
      {confirmAction?.action === 'delete' && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <span className="text-sm text-red-700 dark:text-red-400">정말 이 상품을 삭제하시겠습니까?</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
          <Button type="button" size="sm" onClick={() => { handleDelete(); setConfirmAction(null); }} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 이미지 갤러리 */}
        <div className="lg:col-span-1">
          <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* 메인 이미지 */}
            <div className="relative aspect-square bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              {images.length > 0 ? (
                <Image
                  src={images[selectedImageIndex]?.imageUrl}
                  alt={images[selectedImageIndex]?.altText || product.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <ImageIcon className={`w-20 h-20 text-slate-300 ${images.length > 0 ? 'hidden' : ''}`} aria-hidden="true" />

              {/* 이미지 네비게이션 */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전 이미지"
                    onClick={() => setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm hover:bg-white dark:hover:bg-slate-700 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 이미지"
                    onClick={() => setSelectedImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-slate-800/80 rounded-full shadow-sm hover:bg-white dark:hover:bg-slate-700 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  </button>
                </>
              )}

              {/* 할인 뱃지 */}
              {discountRate > 0 && (
                <div className="absolute top-3 left-3 bg-red-500 text-white text-sm font-bold px-3 py-1 rounded">
                  {discountRate}% OFF
                </div>
              )}

              {/* 뱃지들 */}
              <div className="absolute top-3 right-3 flex flex-col gap-1">
                {product.isFeatured && (
                  <Badge className="bg-amber-500 text-white border-0">
                    <Star className="w-3 h-3 mr-1" aria-hidden="true" />
                    추천
                  </Badge>
                )}
                {product.isNew && (
                  <Badge className="bg-primary dark:bg-primary/80 text-white border-0">NEW</Badge>
                )}
              </div>
            </div>

            {/* 썸네일 */}
            {images.length > 1 && (
              <div className="p-3 flex gap-2 overflow-x-auto border-t border-slate-200 dark:border-slate-700">
                {images.map((img, index) => (
                  <button
                    key={img.id || index}
                    type="button"
                    aria-label={`이미지 ${index + 1} 보기`}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 ${
                      selectedImageIndex === index ? 'border-primary dark:border-primary-light' : 'border-transparent'
                    }`}
                  >
                    <Image
                      src={img.imageUrl}
                      alt={img.altText || `이미지 ${index + 1}`}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* 통계 */}
          <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">상품 통계</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <Eye className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto mb-1" aria-hidden="true" />
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{(product.viewCount || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">조회수</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <TrendingUp className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto mb-1" aria-hidden="true" />
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{(product.salesCount || 0).toLocaleString()}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">판매량</p>
              </div>
            </div>
          </Card>
        </div>

        {/* 우측: 상품 정보 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 기본 정보 */}
          <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">기본 정보</h2>
            <div className="space-y-4">
              {/* 상품명 */}
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">상품명</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{product.name}</p>
              </div>

              {/* 카테고리 */}
              {product.category && (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">카테고리:</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{product.category.name}</p>
                </div>
              )}

              {/* 상품 코드 */}
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">상품 코드 (SKU):</p>
                <code className="text-sm bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-mono text-slate-900 dark:text-slate-200">{product.code}</code>
                <button type="button" aria-label="상품 코드 복사" onClick={() => copyToClipboard(product.code)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                  <Copy className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                </button>
              </div>

              {/* 브랜드/제조사 정보 */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">브랜드</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{product.brand || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">제조사</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{product.manufacturer || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">원산지</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{product.origin || '-'}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* 가격 정보 */}
          <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">가격 정보</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">정상가</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{product.price.toLocaleString()}<span className="text-sm font-medium ml-0.5">원</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">판매가</p>
                {product.salePrice && product.salePrice < product.price ? (
                  <div>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">{product.salePrice.toLocaleString()}<span className="text-sm font-medium ml-0.5">원</span></p>
                    <p className="text-xs text-red-600 dark:text-red-400 tabular-nums">{discountRate}% 할인</p>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{product.price.toLocaleString()}<span className="text-sm font-medium ml-0.5">원</span></p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">원가</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{product.costPrice ? `${product.costPrice.toLocaleString()}` : '-'}{product.costPrice && <span className="text-sm font-medium ml-0.5">원</span>}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">마진</p>
                {product.costPrice && product.salePrice ? (
                  <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
                    {((1 - product.costPrice / (product.salePrice || product.price)) * 100).toFixed(1)}%
                  </p>
                ) : (
                  <p className="text-lg font-bold text-slate-400 dark:text-slate-500">-</p>
                )}
              </div>
            </div>
          </Card>

          {/* 재고 정보 */}
          <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">재고 및 배송</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">재고 수량</p>
                <p className={`text-lg font-bold tabular-nums ${product.stock === 0 ? 'text-red-600 dark:text-red-400' : product.stock < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                  {product.stock.toLocaleString()}<span className="text-sm font-medium ml-0.5">개</span>
                </p>
                {product.stock > 0 && product.stock < 10 && (
                  <div className="flex items-center justify-end gap-1 text-amber-600 dark:text-amber-400 text-xs mt-1">
                    <AlertCircle className="w-3 h-3" aria-hidden="true" />
                    재고 부족
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">최소 주문</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{product.minOrderQty}<span className="text-sm font-medium ml-0.5">개</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">최대 주문</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{product.maxOrderQty ? <>{product.maxOrderQty.toLocaleString()}<span className="text-sm font-medium ml-0.5">개</span></> : '제한없음'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">무게</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{product.weight ? <>{product.weight.toLocaleString()}<span className="text-sm font-medium ml-0.5">g</span></> : '-'}</p>
              </div>
            </div>
          </Card>

          {/* 옵션 */}
          {options.length > 0 && (
            <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">상품 옵션</h2>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="grid grid-cols-5 gap-4 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-600 uppercase tracking-wider">
                  <span>옵션명</span>
                  <span>옵션값</span>
                  <span className="text-right">추가금액</span>
                  <span className="text-right">재고</span>
                  <span className="text-center">상태</span>
                </div>
                {options.map((option, index) => (
                  <div key={option.id || index} className="grid grid-cols-5 gap-4 px-4 py-3 items-center border-b border-slate-100 dark:border-slate-700 last:border-b-0 bg-white dark:bg-slate-800">
                    <span className="text-sm text-slate-900 dark:text-white">{option.optionName}</span>
                    <span className="text-sm text-slate-900 dark:text-white">{option.optionValue}</span>
                    <span className="text-sm text-slate-900 dark:text-white text-right tabular-nums">
                      {option.additionalPrice > 0 ? `+${option.additionalPrice.toLocaleString()}원` : '-'}
                    </span>
                    <span className={`text-sm text-right tabular-nums font-medium ${option.stock === 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                      {option.stock.toLocaleString()}개
                    </span>
                    <span className="text-center">
                      <Badge variant="outline" className={option.isActive ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600'}>
                        {option.isActive ? '판매중' : '품절'}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* 상세 설명 — XSS 방지: DOMPurify sanitize 적용 */}
          {product.description && (
            <Card className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">상세 설명</h2>
              <div
                className="prose prose-slate dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
              />
            </Card>
          )}

          {/* 등록/수정 정보 */}
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            {product.createdAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" aria-hidden="true" />
                등록일: {new Date(product.createdAt).toLocaleDateString('ko-KR')}
              </div>
            )}
            {product.updatedAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" aria-hidden="true" />
                수정일: {new Date(product.updatedAt).toLocaleDateString('ko-KR')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
