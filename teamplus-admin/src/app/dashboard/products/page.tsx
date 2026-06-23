'use client';

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Package,
  CreditCard,
  Tag,
  ToggleLeft,
  ToggleRight,
  Archive,
  Star,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '@/services/api-client';
import type { ShopProduct, ShopCategory } from '@/types';

/**
 * TEAMPLUS 상품 관리 페이지
 * ShopProduct CRUD — GET/POST/PUT/DELETE /api/v1/shop/products
 *
 * Design 7 Principles:
 * 3. AI 스타일 절대 금지 — 그라디언트, backdrop-blur 미사용
 * 7. Tone & Manner — 존댓말, 한국어 레이블
 */

interface ProductFormData {
  categoryId: string;
  name: string;
  code: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  isActive: boolean;
  isFeatured: boolean;
  isNew: boolean;
}

const EMPTY_FORM: ProductFormData = {
  categoryId: '',
  name: '',
  code: '',
  description: '',
  price: '',
  salePrice: '',
  stock: '0',
  isActive: true,
  isFeatured: false,
  isNew: false,
};

const LIMIT = 20;

export default function ProductsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── 카테고리 로드 ──────────────────────────────────
  const loadCategories = useCallback(async () => {
    try {
      const res = await api.get<unknown>('/shop/categories');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = Array.isArray(res) ? res : ((res as any)?.data ?? []);
      setCategories(data as ShopCategory[]);
    } catch (err) {
      console.error('[Products] 카테고리 로드 실패:', err);
    }
  }, []);

  // ── 상품 목록 로드 ─────────────────────────────────
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: LIMIT };
      if (appliedSearch) params.search = appliedSearch;
      if (filterStatus === 'active') params.isActive = 'true';
      if (filterStatus === 'inactive') params.isActive = 'false';

      const res = await api.get<unknown>('/shop/products', { params });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = Array.isArray(res) ? res : ((res as any)?.data ?? []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalCount = Array.isArray(res) ? res.length : ((res as any)?.total ?? data.length);
      setProducts(data as ShopProduct[]);
      setTotal(totalCount);
    } catch (err) {
      console.error('[Products] 목록 로드 실패:', err);
      setProducts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, appliedSearch, filterStatus]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  // 필터 변경 시 페이지 초기화
  useEffect(() => { setPage(1); }, [appliedSearch, filterStatus]);

  // ── 검색 ───────────────────────────────────────────
  const handleSearch = () => {
    setAppliedSearch(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── 모달 열기 ──────────────────────────────────────
  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const handleOpenEdit = (product: ShopProduct) => {
    setEditingProduct(product);
    setFormData({
      categoryId: product.categoryId,
      name: product.name,
      code: product.code,
      description: product.description ?? '',
      price: product.price.toString(),
      salePrice: product.salePrice?.toString() ?? '',
      stock: product.stock.toString(),
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      isNew: product.isNew,
    });
    setShowModal(true);
  };

  // ── 저장 (등록/수정) ───────────────────────────────
  const handleSave = async () => {
    if (!formData.categoryId || !formData.name || !formData.code || !formData.price) {
      setActionMsg({ type: 'error', text: MESSAGES.product.requiredFields }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        categoryId: formData.categoryId,
        name: formData.name,
        code: formData.code,
        description: formData.description || undefined,
        price: parseInt(formData.price),
        salePrice: formData.salePrice ? parseInt(formData.salePrice) : undefined,
        stock: parseInt(formData.stock) || 0,
        minOrderQty: 1,
        isActive: formData.isActive,
        isFeatured: formData.isFeatured,
        isNew: formData.isNew,
      };

      if (editingProduct) {
        await api.put(`/shop/products/${editingProduct.id}`, payload);
      } else {
        await api.post('/shop/products', payload);
      }

      setShowModal(false);
      setEditingProduct(null);
      setFormData(EMPTY_FORM);
      loadProducts();
    } catch (err) {
      console.error('[Products] 저장 실패:', err);
      setActionMsg({ type: 'error', text: MESSAGES.product.saveError }); setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // ── 삭제 ───────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/shop/products/${id}`);
      setDeletingProductId(null);
      loadProducts();
    } catch (err) {
      console.error('[Products] 삭제 실패:', err);
      setActionMsg({ type: 'error', text: MESSAGES.product.deleteError }); setTimeout(() => setActionMsg(null), 3000);
    }
  };

  // ── 상태 토글 ──────────────────────────────────────
  const handleToggleStatus = async (product: ShopProduct) => {
    try {
      await api.put(`/shop/products/${product.id}`, {
        categoryId: product.categoryId,
        name: product.name,
        code: product.code,
        description: product.description,
        price: product.price,
        salePrice: product.salePrice,
        stock: product.stock,
        minOrderQty: 1,
        isActive: !product.isActive,
        isFeatured: product.isFeatured,
        isNew: product.isNew,
      });
      loadProducts();
    } catch (err) {
      console.error('[Products] 상태 변경 실패:', err);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const activeCount = products.filter((p) => p.isActive).length;
  const featuredCount = products.filter((p) => p.isFeatured).length;

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

      <PageHeader title="상품 관리" subtitle={`전체 ${total}개의 상품`} />

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 dark:bg-primary/20 rounded-lg">
              <Package className="w-5 h-5 text-primary dark:text-primary-light" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">전체 상품</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{total.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Tag className="w-5 h-5 text-green-700 dark:text-green-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">판매중</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{activeCount.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Star className="w-5 h-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">추천 상품</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{featuredCount.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 검색 & 필터 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 flex gap-2 w-full sm:max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="상품명, 코드로 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-10 h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
            />
          </div>
          <Button
            onClick={handleSearch}
            variant="outline"
            className="h-11 px-4 border-slate-200 dark:border-slate-600"
          >
            검색
          </Button>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  filterStatus === status
                    ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {status === 'all' ? '전체' : status === 'active' ? '판매중' : '미판매'}
              </button>
            ))}
          </div>
          <Button onClick={handleOpenAdd} className="gap-2 h-11 bg-primary hover:bg-primary-dark text-white">
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">상품 추가</span>
          </Button>
        </div>
      </div>

      {/* 상품 그리드 */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner message="상품 목록을 불러오는 중..." />
        </div>
      ) : products.length === 0 ? (
        <Card className="p-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {appliedSearch ? '검색 결과가 없습니다.' : '등록된 상품이 없습니다.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <Card
              key={product.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              {/* 헤더 */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{product.code}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        product.isActive
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200'
                          : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200'
                      }`}
                    >
                      {product.isActive ? '판매중' : '미판매'}
                    </Badge>
                    {product.isFeatured && (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        추천
                      </Badge>
                    )}
                    {product.isNew && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        신상품
                      </Badge>
                    )}
                  </div>
                </div>
                {product.category && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">{product.category.name}</span>
                )}
                {product.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">
                    {product.description}
                  </p>
                )}
              </div>

              {/* 본문 */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span className="text-slate-600 dark:text-slate-400">가격</span>
                  </div>
                  <div className="text-right">
                    {product.salePrice ? (
                      <div className="flex items-baseline gap-1.5 flex-wrap justify-end">
                        <span className="text-xs text-slate-400 line-through tabular-nums">
                          {product.price.toLocaleString()}원
                        </span>
                        <span className="text-lg font-bold text-primary dark:text-primary-light tabular-nums">
                          {product.salePrice.toLocaleString()}원
                        </span>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-primary dark:text-primary-light tabular-nums">
                        {product.price.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Archive className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span className="text-slate-600 dark:text-slate-400">재고</span>
                  </div>
                  <span
                    className={`font-semibold text-sm tabular-nums text-right ${
                      product.stock === 0
                        ? 'text-red-600 dark:text-red-400'
                        : product.stock < 10
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {product.stock === 0 ? '품절' : `${product.stock.toLocaleString()}개`}
                  </span>
                </div>
              </div>

              {/* 푸터 */}
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(product.createdAt).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleStatus(product)}
                    className={`p-2 rounded-lg transition-colors ${
                      product.isActive
                        ? 'hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                        : 'hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400'
                    }`}
                    title={product.isActive ? '판매 중지' : '판매 시작'}
                  >
                    {product.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleOpenEdit(product)}
                    className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    title="수정"
                  >
                    <Edit2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  </button>
                  <button
                    onClick={() => setDeletingProductId(product.id)}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border-slate-200 dark:border-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
            이전
          </Button>
          <span className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="border-slate-200 dark:border-slate-600"
          >
            다음
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* 상품 추가/수정 모달 */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingProduct(null); }}
        size="lg"
      >
        <ModalHeader title={editingProduct ? '상품 수정' : '새 상품 추가'} />
        <ModalBody scrollable maxHeight="70vh">
              <div className="space-y-4">
                {/* 카테고리 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    카테고리 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full h-11 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">카테고리를 선택하세요</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {categories.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">카테고리를 먼저 등록해주세요.</p>
                  )}
                </div>

                {/* 상품명 & 코드 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      상품명 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="상품명"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      상품 코드 (SKU) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="SKU-001"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white font-mono"
                    />
                  </div>
                </div>

                {/* 설명 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    설명
                  </label>
                  <Input
                    placeholder="상품 설명"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                </div>

                {/* 가격 & 재고 */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      정상가 (원) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      placeholder="50000"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      할인가 (원)
                    </label>
                    <Input
                      type="number"
                      placeholder="45000"
                      value={formData.salePrice}
                      onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
                      className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      재고 수량
                    </label>
                    <Input
                      type="number"
                      placeholder="100"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                    />
                  </div>
                </div>

                {/* 옵션 토글 */}
                <div className="flex items-center gap-6 pt-1">
                  {([
                    { key: 'isActive', label: '판매중' },
                    { key: 'isFeatured', label: '추천 상품' },
                    { key: 'isNew', label: '신상품' },
                  ] as const).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData[key]}
                        onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={() => { setShowModal(false); setEditingProduct(null); }}
            variant="outline"
            className="flex-1 h-11 border-slate-200 dark:border-slate-600"
            disabled={isSaving}
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : editingProduct ? '수정하기' : '추가하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={deletingProductId !== null}
        onClose={() => setDeletingProductId(null)}
        onConfirm={() => { if (deletingProductId) handleDelete(deletingProductId); }}
        title="상품을 삭제하시겠습니까?"
        description="이 작업은 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
      />
    </div>
  );
}
