'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { MESSAGES } from '@/lib/messages';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Plus, Search, Edit, Trash2, Copy, Users } from 'lucide-react';
import { api } from '@/services/api-client';

interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: 'FIXED' | 'PERCENTAGE';
  discountValue: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usagePerUser: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  targetType: 'ALL' | 'CATEGORY' | 'PRODUCT';
  createdAt: string;
}


export default function CouponsPage() {
  const couponSearchId = useId();
  const couponCodeId = useId();
  const couponNameId = useId();
  const couponDescriptionId = useId();
  const couponDiscountValueId = useId();
  const couponMinOrderId = useId();
  const couponMaxDiscountId = useId();
  const couponUsageLimitId = useId();
  const couponUsagePerUserId = useId();
  const couponStartDateId = useId();
  const couponEndDateId = useId();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 쿠폰 폼 상태
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    discountType: 'PERCENTAGE' as 'FIXED' | 'PERCENTAGE',
    discountValue: 0,
    minOrderAmount: 0,
    maxDiscountAmount: 0,
    usageLimit: 0,
    usagePerUser: 1,
    startDate: '',
    endDate: '',
    targetType: 'ALL' as 'ALL' | 'CATEGORY' | 'PRODUCT',
  });

  const loadCoupons = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{
        coupons?: Coupon[];
        data?: Coupon[];
      }>('/shop/coupons');
      setCoupons(res.coupons ?? res.data ?? []);
    } catch (error) {
      console.error('[CouponsPage] 쿠폰 목록 조회 실패:', error);
      setCoupons([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const filteredCoupons = coupons.filter((coupon) => {
    const matchesSearch =
      coupon.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coupon.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && coupon.isActive) ||
      (statusFilter === 'inactive' && !coupon.isActive);
    return matchesSearch && matchesStatus;
  });

  const handleOpenDialog = (coupon?: Coupon) => {
    setSaveError('');
    if (coupon) {
      setSelectedCoupon(coupon);
      setFormData({
        code: coupon.code,
        name: coupon.name,
        description: coupon.description || '',
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderAmount: coupon.minOrderAmount || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || 0,
        usageLimit: coupon.usageLimit || 0,
        usagePerUser: coupon.usagePerUser,
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        targetType: coupon.targetType,
      });
    } else {
      setSelectedCoupon(null);
      setFormData({
        code: '',
        name: '',
        description: '',
        discountType: 'PERCENTAGE',
        discountValue: 0,
        minOrderAmount: 0,
        maxDiscountAmount: 0,
        usageLimit: 0,
        usagePerUser: 1,
        startDate: '',
        endDate: '',
        targetType: 'ALL',
      });
    }
    setIsDialogOpen(true);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    // 필수 입력값 검증
    if (!formData.code.trim()) {
      setSaveError('쿠폰 코드를 입력해주세요.');
      return;
    }
    if (!formData.name.trim()) {
      setSaveError('쿠폰명을 입력해주세요.');
      return;
    }
    if (formData.discountValue <= 0) {
      setSaveError('할인 값은 0보다 커야 합니다.');
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      setSaveError('유효기간을 설정해주세요.');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    try {
      const payload = {
        code: formData.code.toUpperCase(),
        name: formData.name,
        description: formData.description || undefined,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        minOrderAmount: formData.minOrderAmount > 0 ? formData.minOrderAmount : undefined,
        maxDiscountAmount: formData.maxDiscountAmount > 0 ? formData.maxDiscountAmount : undefined,
        usageLimit: formData.usageLimit > 0 ? formData.usageLimit : undefined,
        usagePerUser: formData.usagePerUser,
        startDate: formData.startDate,
        endDate: formData.endDate,
        targetType: formData.targetType,
      };

      if (selectedCoupon) {
        await api.put(`/shop/coupons/${selectedCoupon.id}`, payload);
        setActionMsg({ type: 'success', text: MESSAGES.coupon.updated });
      } else {
        await api.post('/shop/coupons', payload);
        setActionMsg({ type: 'success', text: MESSAGES.coupon.created });
      }
      setTimeout(() => setActionMsg(null), 3000);

      setIsDialogOpen(false);
      await loadCoupons();
    } catch (error) {
      console.error('[CouponsPage] 쿠폰 저장 실패:', error);
      const msg = error instanceof Error ? error.message : '쿠폰 저장에 실패했습니다. 다시 시도해주세요.';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);

    try {
      await api.delete(`/shop/coupons/${deleteTargetId}`);
      setActionMsg({ type: 'success', text: MESSAGES.coupon.deleted });
      setTimeout(() => setActionMsg(null), 3000);
      await loadCoupons();
    } catch (error) {
      console.error('[CouponsPage] 쿠폰 삭제 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.coupon.deleteError });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setActionMsg({ type: 'success', text: MESSAGES.coupon.codeCopied }); setTimeout(() => setActionMsg(null), 3000);
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, code });
  };

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.discountType === 'PERCENTAGE') {
      return `${coupon.discountValue}%`;
    }
    return `${coupon.discountValue.toLocaleString()}원`;
  };

  const isExpired = (endDate: string) => {
    return new Date(endDate) < new Date();
  };

  if (isLoading) {
    return <LoadingSpinner message="쿠폰 정보를 불러오는 중..." />;
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
      <PageHeader
        title="쿠폰 관리"
        description="쇼핑몰 쿠폰을 생성하고 관리합니다."
      />

      {/* 필터 및 액션 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <label htmlFor={couponSearchId} className="sr-only">쿠폰 검색</label>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              id={couponSearchId}
              placeholder="쿠폰 코드 또는 쿠폰명을 입력해주세요"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="쿠폰 검색 (코드, 쿠폰명)"
              className="pl-10 w-full sm:w-64"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="inactive">비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          쿠폰 생성
        </Button>
      </div>

      {/* 쿠폰 테이블 */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">쿠폰 코드</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">쿠폰명</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">할인</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">사용/제한</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">유효기간</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">상태</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredCoupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    등록된 쿠폰이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredCoupons.map((coupon) => (
                  <tr key={coupon.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-sm font-mono text-slate-800 dark:text-slate-200">
                          {coupon.code}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(coupon.code)}
                          aria-label="쿠폰 코드 복사"
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 motion-reduce:transition-none"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-900 dark:text-white">{coupon.name}</p>
                      {coupon.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{coupon.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-semibold tabular-nums ${
                        coupon.discountType === 'PERCENTAGE'
                          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      }`}>
                        {formatDiscount(coupon)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 tabular-nums">
                        <Users className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        <span>
                          {coupon.usedCount.toLocaleString()}
                          {coupon.usageLimit && ` / ${coupon.usageLimit.toLocaleString()}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-slate-700 dark:text-slate-300 tabular-nums">{coupon.startDate}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">~ {coupon.endDate}</p>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {isExpired(coupon.endDate) ? (
                        <Badge variant="outline" className="text-slate-500 dark:text-slate-400 dark:border-slate-600">
                          만료됨
                        </Badge>
                      ) : coupon.isActive ? (
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">활성</Badge>
                      ) : (
                        <Badge variant="outline" className="dark:border-slate-600 dark:text-slate-400">비활성</Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(coupon)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTargetId(coupon.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 쿠폰 생성/수정 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedCoupon ? '쿠폰 수정' : '쿠폰 생성'}</DialogTitle>
            <DialogDescription>
              쿠폰 정보를 입력하세요. 코드는 영문 대문자와 숫자만 사용 가능합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={couponCodeId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">쿠폰 코드</label>
                <div className="flex gap-2">
                  <Input
                    id={couponCodeId}
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="예: WELCOME2024"
                    aria-label="쿠폰 코드"
                    aria-required="true"
                    className="uppercase"
                  />
                  <Button type="button" variant="outline" onClick={generateRandomCode}>
                    자동생성
                  </Button>
                </div>
              </div>
              <div>
                <label htmlFor={couponNameId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">쿠폰명</label>
                <Input
                  id={couponNameId}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="쿠폰 이름을 입력해주세요"
                  aria-label="쿠폰명"
                  aria-required="true"
                />
              </div>
            </div>

            <div>
              <label htmlFor={couponDescriptionId} className="text-sm font-medium mb-2 block">설명</label>
              <Input
                id={couponDescriptionId}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="쿠폰에 대한 설명을 입력해주세요"
                aria-label="쿠폰 설명"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">할인 유형</label>
                <Select
                  value={formData.discountType}
                  onValueChange={(value: 'FIXED' | 'PERCENTAGE') =>
                    setFormData({ ...formData, discountType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">정률 할인 (%)</SelectItem>
                    <SelectItem value="FIXED">정액 할인 (원)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor={couponDiscountValueId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                  할인 {formData.discountType === 'PERCENTAGE' ? '비율' : '금액'}
                </label>
                <Input
                  id={couponDiscountValueId}
                  type="number"
                  value={formData.discountValue}
                  onChange={(e) =>
                    setFormData({ ...formData, discountValue: parseInt(e.target.value) || 0 })
                  }
                  placeholder={formData.discountType === 'PERCENTAGE' ? '예: 10' : '예: 5000'}
                  aria-label={formData.discountType === 'PERCENTAGE' ? '할인 비율 (퍼센트)' : '할인 금액 (원)'}
                  aria-required="true"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={couponMinOrderId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">최소 주문금액</label>
                <Input
                  id={couponMinOrderId}
                  type="number"
                  value={formData.minOrderAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, minOrderAmount: parseInt(e.target.value) || 0 })
                  }
                  placeholder="예: 30000"
                  aria-label="쿠폰 사용 최소 주문금액 (원)"
                />
              </div>
              <div>
                <label htmlFor={couponMaxDiscountId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">최대 할인금액</label>
                <Input
                  id={couponMaxDiscountId}
                  type="number"
                  value={formData.maxDiscountAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, maxDiscountAmount: parseInt(e.target.value) || 0 })
                  }
                  placeholder="예: 10000"
                  aria-label="쿠폰 최대 할인금액 (원)"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor={couponUsageLimitId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">전체 사용 제한</label>
                <Input
                  id={couponUsageLimitId}
                  type="number"
                  value={formData.usageLimit}
                  onChange={(e) =>
                    setFormData({ ...formData, usageLimit: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0 = 무제한"
                  aria-label="쿠폰 전체 사용 제한 횟수 (0 입력 시 무제한)"
                />
              </div>
              <div>
                <label htmlFor={couponUsagePerUserId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">1인당 사용 제한</label>
                <Input
                  id={couponUsagePerUserId}
                  type="number"
                  value={formData.usagePerUser}
                  onChange={(e) =>
                    setFormData({ ...formData, usagePerUser: parseInt(e.target.value) || 1 })
                  }
                  placeholder="예: 1"
                  aria-label="1인당 쿠폰 사용 제한 횟수"
                  min={1}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">적용 대상</label>
                <Select
                  value={formData.targetType}
                  onValueChange={(value: 'ALL' | 'CATEGORY' | 'PRODUCT') =>
                    setFormData({ ...formData, targetType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">전체 상품</SelectItem>
                    <SelectItem value="CATEGORY">특정 카테고리</SelectItem>
                    <SelectItem value="PRODUCT">특정 상품</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor={couponStartDateId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">시작일</label>
                <Input
                  id={couponStartDateId}
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  aria-label="쿠폰 사용 시작일"
                />
              </div>
              <div>
                <label htmlFor={couponEndDateId} className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">종료일</label>
                <Input
                  id={couponEndDateId}
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  aria-label="쿠폰 사용 종료일"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col items-end gap-2">
            {saveError && (
              <p className="text-xs text-red-600 dark:text-red-400 w-full text-right">{saveError}</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); setSaveError(''); }}>
                취소
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? '저장 중...' : selectedCoupon ? '수정하기' : '생성하기'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteTargetId} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>쿠폰 삭제</DialogTitle>
            <DialogDescription>
              이 쿠폰을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)} disabled={isDeleting}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? '삭제 중...' : '삭제하기'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
