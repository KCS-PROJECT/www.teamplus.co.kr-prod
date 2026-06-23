'use client';

/**
 * 쇼핑몰 상품 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 상품 목록/등록/수정/삭제 관리
 * 2. 휴먼 디자인: 그리드 카드 레이아웃, 시각적 상품 이미지
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { StatusFilter } from '@/components/ui/admin-tabs';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { shopService } from '@/services';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Package,
  Eye,
  Archive,
  Image as ImageIcon,
  AlertCircle,
  TrendingUp,
  FileText,
} from 'lucide-react';

interface ShopProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  salePrice?: number;
  stock: number;
  sku: string;
  status: 'active' | 'inactive' | 'soldout';
  imageUrl?: string;
  description?: string;
  createdAt: string;
  soldCount: number;
}

export default function ShopProductsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'soldout'>('all');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    categoryId: '',
    price: 0,
    salePrice: 0,
    stock: 0,
    sku: '',
    status: 'active' as 'active' | 'inactive' | 'soldout',
    description: '',
  });

  const categories = [
    { id: '1', name: '스케이트' },
    { id: '1-1', name: '아이스하키 스케이트' },
    { id: '1-2', name: '피겨 스케이트' },
    { id: '2', name: '보호장비' },
    { id: '2-1', name: '헬멧' },
    { id: '2-2', name: '글러브' },
    { id: '2-3', name: '패드' },
    { id: '3', name: '스틱' },
    { id: '4', name: '의류' },
    { id: '5', name: '액세서리' },
  ];

  useEffect(() => {
    // DashboardLayout에서 이미 인증 체크 완료
    const start = Date.now();

    setTimeout(() => {
      setProducts([
        {
          id: '1',
          name: 'CCM 타랙스 AS-V 프로 스케이트',
          categoryId: '1-1',
          categoryName: '아이스하키 스케이트',
          price: 890000,
          salePrice: 799000,
          stock: 12,
          sku: 'SKT-CCM-001',
          status: 'active',
          description: 'CCM 프리미엄 하키 스케이트',
          createdAt: '2026-01-01',
          soldCount: 45,
        },
        {
          id: '2',
          name: 'Bauer 바포 하이퍼라이트 스케이트',
          categoryId: '1-1',
          categoryName: '아이스하키 스케이트',
          price: 950000,
          stock: 8,
          sku: 'SKT-BAUER-001',
          status: 'active',
          description: 'Bauer 최상위 모델 하키 스케이트',
          createdAt: '2026-01-02',
          soldCount: 38,
        },
        {
          id: '3',
          name: 'CCM 타랙스 헬멧 (케이지 포함)',
          categoryId: '2-1',
          categoryName: '헬멧',
          price: 320000,
          salePrice: 289000,
          stock: 25,
          sku: 'HLM-CCM-001',
          status: 'active',
          description: '안전한 CCM 헬멧 케이지 포함',
          createdAt: '2026-01-03',
          soldCount: 67,
        },
        {
          id: '4',
          name: 'Warrior 알파 LX2 글러브',
          categoryId: '2-2',
          categoryName: '글러브',
          price: 180000,
          stock: 0,
          sku: 'GLV-WAR-001',
          status: 'soldout',
          description: '프로 선수용 글러브',
          createdAt: '2026-01-04',
          soldCount: 120,
        },
        {
          id: '5',
          name: 'CCM 제트스피드 FT6 프로 스틱',
          categoryId: '3',
          categoryName: '스틱',
          price: 420000,
          salePrice: 378000,
          stock: 30,
          sku: 'STK-CCM-001',
          status: 'active',
          description: '경량 카본 하키 스틱',
          createdAt: '2026-01-05',
          soldCount: 89,
        },
        {
          id: '6',
          name: '주니어 연습용 스케이트 세트',
          categoryId: '1-1',
          categoryName: '아이스하키 스케이트',
          price: 250000,
          stock: 45,
          sku: 'SKT-JR-001',
          status: 'inactive',
          description: '입문자용 주니어 스케이트',
          createdAt: '2026-01-06',
          soldCount: 156,
        },
        {
          id: '7',
          name: '하키 팀 유니폼 세트 (맞춤 제작)',
          categoryId: '4',
          categoryName: '의류',
          price: 150000,
          stock: 100,
          sku: 'UNI-TEAM-001',
          status: 'active',
          description: '팀 로고 맞춤 제작 유니폼',
          createdAt: '2026-01-07',
          soldCount: 234,
        },
      ]);
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 600 - elapsed);
      if (delay > 0) {
        setTimeout(() => setIsLoading(false), delay);
      } else {
        setIsLoading(false);
      }
    }, 500);
  }, [router]);

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.categoryId === filterCategory;
    const matchesStatus = filterStatus === 'all' || product.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    totalProducts: products.length,
    activeProducts: products.filter((p) => p.status === 'active').length,
    soldoutProducts: products.filter((p) => p.status === 'soldout').length,
    totalStock: products.reduce((sum, p) => sum + p.stock, 0),
    totalSold: products.reduce((sum, p) => sum + p.soldCount, 0),
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
            판매중
          </Badge>
        );
      case 'inactive':
        return (
          <Badge variant="outline" className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-600">
            비활성
          </Badge>
        );
      case 'soldout':
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800">
            품절
          </Badge>
        );
      default:
        return null;
    }
  };

  const handleAddProduct = () => {
    router.push('/dashboard/shop/products/new');
  };

  const handleViewProduct = (productId: string) => {
    router.push(`/dashboard/shop/products/${productId}`);
  };

  const handleEditProduct = (product: ShopProduct) => {
    setFormData({
      name: product.name,
      categoryId: product.categoryId,
      price: product.price,
      salePrice: product.salePrice || 0,
      stock: product.stock,
      sku: product.sku,
      status: product.status,
      description: product.description || '',
    });
    setEditingProduct(product);
    setShowAddModal(true);
  };

  const handleSaveProduct = () => {
    setShowAddModal(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = (productId: string) => {
    setConfirmAction({ id: productId, action: 'delete' });
  };

  const handleDeleteProductConfirmed = async (productId: string) => {
    try {
      setDeletingId(productId);
      await shopService.deleteProduct(productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setConfirmAction(null);
      setActionMsg({ type: 'success', text: MESSAGES.shopProduct.deleted });
      setTimeout(() => setActionMsg(null), 2500);
    } catch (err) {
      console.error('상품 삭제 실패:', err);
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : MESSAGES.error.general,
      });
      setTimeout(() => setActionMsg(null), 3500);
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="상품 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <PageHeader
        title="쇼핑몰 상품 관리"
        description={`전체 ${stats.totalProducts}개 상품을 관리합니다`}
      />

      {/* 액션 결과 안내 */}
      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-3 rounded-lg border text-sm font-medium ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* 통계 카드 */}
      <StatsGrid
        stats={[
          { label: '전체 상품', value: stats.totalProducts, icon: Package },
          { label: '판매중', value: stats.activeProducts, icon: Eye },
          { label: '총 재고', value: stats.totalStock, icon: Archive },
          { label: '총 판매량', value: stats.totalSold, icon: TrendingUp },
        ]}
      />

      {/* 상품 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">상품 목록</h2>
            <div className="flex flex-wrap gap-2">
              {/* 필터 */}
              <StatusFilter
                options={[
                  { value: 'all', label: '전체' },
                  { value: 'active', label: '판매중' },
                  { value: 'soldout', label: '품절' },
                  { value: 'inactive', label: '비활성' },
                ]}
                selected={filterStatus}
                onChange={(value) => setFilterStatus(value as 'all' | 'active' | 'inactive' | 'soldout')}
              />
              {/* 카테고리 필터 */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 min-w-[140px]"
              >
                <option value="all">전체 카테고리</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              {/* 검색 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="상품명, SKU 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10 w-full sm:w-48 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              {/* 등록 버튼 */}
              <Button onClick={handleAddProduct} className="bg-primary hover:bg-primary-dark gap-2">
                <Plus className="w-4 h-4" />
                상품 등록
              </Button>
            </div>
          </div>
        </div>

        {/* 상품 그리드 */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 motion-reduce:transition-none"
              >
                {/* 상품 이미지 */}
                <div className="relative aspect-square bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                      unoptimized
                    />
                  ) : (
                    <ImageIcon className="w-16 h-16 text-slate-300 dark:text-slate-600" />
                  )}
                  {product.salePrice && product.salePrice < product.price && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                      {Math.round((1 - product.salePrice / product.price) * 100)}% OFF
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    {getStatusBadge(product.status)}
                  </div>
                </div>

                {/* 상품 정보 */}
                <div className="p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{product.categoryName}</p>
                  <h3 className="font-medium text-slate-900 dark:text-white line-clamp-2 mb-2">{product.name}</h3>

                  <div className="flex items-baseline gap-2 mb-2 justify-end flex-wrap">
                    {product.salePrice && product.salePrice < product.price ? (
                      <>
                        <span className="text-sm text-slate-400 dark:text-slate-500 line-through tabular-nums">
                          {product.price.toLocaleString()}원
                        </span>
                        <span className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                          {product.salePrice.toLocaleString()}원
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                        {product.price.toLocaleString()}원
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm mb-3">
                    <span className="text-slate-500 dark:text-slate-400 font-mono text-xs">SKU {product.sku}</span>
                    <span className={`font-semibold tabular-nums text-right ${
                      product.stock === 0
                        ? 'text-red-600 dark:text-red-400'
                        : product.stock < 10
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}>
                      재고 {product.stock.toLocaleString()}개
                    </span>
                  </div>

                  {product.stock > 0 && product.stock < 10 && (
                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs mb-3">
                      <AlertCircle className="w-3 h-3" />
                      재고 부족
                    </div>
                  )}

                  {/* 액션 버튼 */}
                  <div className="flex gap-2 justify-center pt-3 border-t border-slate-100 dark:border-slate-700">
                    <button
                      onClick={() => handleViewProduct(product.id)}
                      className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors border border-slate-200 dark:border-slate-600"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="text-[10px] font-medium">상세</span>
                    </button>
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors border border-slate-200 dark:border-slate-600"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span className="text-[10px] font-medium">수정</span>
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-slate-200 dark:border-slate-600"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-[10px] font-medium">삭제</span>
                    </button>
                  </div>
                  {confirmAction?.id === product.id && (
                    <div className="flex items-center gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <span className="text-sm text-red-700 dark:text-red-400">정말 삭제하시겠습니까?</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction(null)}
                        disabled={deletingId === product.id}
                        className="h-7 text-xs"
                      >
                        취소
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDeleteProductConfirmed(product.id)}
                        disabled={deletingId === product.id}
                        className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                      >
                        {deletingId === product.id ? '삭제 중...' : '삭제하기'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="p-12 text-center">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">등록된 상품이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 상품 추가/수정 모달 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setEditingProduct(null); }}
        size="lg"
      >
        <ModalHeader
          title={editingProduct ? '상품 수정' : '상품 등록'}
          description="상품 정보를 입력합니다"
          icon={Package}
        />
        <ModalBody scrollable maxHeight="60vh">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                상품명 <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="상품명을 입력하세요"
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                카테고리 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="">카테고리 선택</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  정상가 (원) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">할인가 (원)</label>
                <Input
                  type="number"
                  value={formData.salePrice}
                  onChange={(e) => setFormData({ ...formData, salePrice: parseInt(e.target.value) || 0 })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  SKU <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="SKU-001"
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">재고 수량</label>
                <Input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">상태</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' | 'soldout' })}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white"
              >
                <option value="active">판매중</option>
                <option value="inactive">비활성</option>
                <option value="soldout">품절</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">상품 설명</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="상품 설명을 입력하세요"
                rows={3}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => { setShowAddModal(false); setEditingProduct(null); }}
            className="flex-1 h-11 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            onClick={handleSaveProduct}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
          >
            {editingProduct ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
