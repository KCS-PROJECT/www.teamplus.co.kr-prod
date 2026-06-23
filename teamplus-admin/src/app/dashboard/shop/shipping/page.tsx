'use client';

/**
 * 쇼핑몰 배송 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 배송 방법/지역/설정 3탭 관리
 * 2. 휴먼 디자인: 탭 기반 간결한 UI
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import {
  Plus,
  Edit2,
  Trash2,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  Package,
  Settings,
  AlertCircle,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import {
  getShippingPolicies,
  createShippingPolicy,
  updateShippingPolicy,
  deleteShippingPolicy,
  type ShippingPolicy,
  type ShippingPolicyPayload,
} from '@/services/shop.service';

// ShippingPolicy 타입은 @/services/shop.service 에서 import
// Backend Prisma 모델: model ShippingPolicy (schema.prisma:1056)
// Backend DTO: CreateShippingPolicyDto / UpdateShippingPolicyDto (shipping.dto.ts)

const EMPTY_METHOD_FORM = {
  name: '',
  shippingFee: 0,
  freeShippingThreshold: 0,
  additionalFee: 0,
  estimatedDays: '',
  isDefault: false,
  isActive: true,
};

export default function ShopShippingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'methods' | 'regions' | 'settings'>('methods');
  const [policies, setPolicies] = useState<ShippingPolicy[]>([]);
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ShippingPolicy | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string; name?: string } | null>(null);

  // 배송 정책 폼 상태
  const [methodForm, setMethodForm] = useState({ ...EMPTY_METHOD_FORM });

  // 배송 설정 폼 상태 — 기본 정책(isDefault=true)과 연동되어 실 API 로 저장됩니다.
  // - defaultShippingMethod: 기본 배송 정책 ID (변경 시 해당 정책을 isDefault=true 로 PATCH)
  // - processingDays: 기본 정책의 estimatedDays 필드에 숫자 문자열로 저장
  const [settingsForm, setSettingsForm] = useState({
    defaultPolicyId: '',
    processingDays: '',
  });

  // 메시지 자동 초기화 (3초)
  useEffect(() => {
    if (!errorMessage && !successMessage) return;
    const timer = setTimeout(() => {
      setErrorMessage(null);
      setSuccessMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [errorMessage, successMessage]);

  // 배송 정책 목록 로드 (shop.service.ts 경유)
  const loadPolicies = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getShippingPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('[ShippingPage] 배송 정책 로드 실패:', error);
      const msg = error instanceof Error ? error.message : '배송 정책을 불러오지 못했습니다.';
      setErrorMessage(`${msg} 잠시 후 다시 시도해 주세요.`);
      setPolicies([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  // 정책 변경 시 설정 폼 동기화 (기본 정책의 값을 반영)
  useEffect(() => {
    const defaultPolicy = policies.find((p) => p.isDefault);
    setSettingsForm({
      defaultPolicyId: defaultPolicy?.id ?? '',
      processingDays: defaultPolicy?.estimatedDays ?? '',
    });
  }, [policies]);

  // 추가 모달 열기
  const handleAddMethod = () => {
    setMethodForm({ ...EMPTY_METHOD_FORM });
    setEditingPolicy(null);
    setShowMethodModal(true);
  };

  // 수정 모달 열기
  const handleEditMethod = (policy: ShippingPolicy) => {
    setMethodForm({
      name: policy.name,
      shippingFee: policy.shippingFee,
      freeShippingThreshold: policy.freeShippingThreshold ?? 0,
      additionalFee: policy.additionalFee,
      estimatedDays: policy.estimatedDays ?? '',
      isDefault: policy.isDefault,
      isActive: policy.isActive,
    });
    setEditingPolicy(policy);
    setShowMethodModal(true);
  };

  // 저장 (생성 또는 수정)
  const handleSaveMethod = async () => {
    if (!methodForm.name.trim()) {
      setErrorMessage('배송 방법명을 입력해 주세요.');
      return;
    }
    setIsSaving(true);
    try {
      const payload: ShippingPolicyPayload = {
        name: methodForm.name.trim(),
        shippingFee: methodForm.shippingFee,
        freeShippingThreshold: methodForm.freeShippingThreshold || undefined,
        additionalFee: methodForm.additionalFee,
        estimatedDays: methodForm.estimatedDays.trim() || undefined,
        isDefault: methodForm.isDefault,
        isActive: methodForm.isActive,
      };

      if (editingPolicy) {
        await updateShippingPolicy(editingPolicy.id, payload);
        setSuccessMessage('배송 방법이 수정되었습니다.');
      } else {
        await createShippingPolicy(payload);
        setSuccessMessage('배송 방법이 추가되었습니다.');
      }

      setShowMethodModal(false);
      setEditingPolicy(null);
      await loadPolicies();
    } catch (error) {
      console.error('[ShippingPage] 저장 실패:', error);
      const msg = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setErrorMessage(`${msg} 다시 시도해 주세요.`);
    } finally {
      setIsSaving(false);
    }
  };

  // 삭제
  const handleDeleteMethod = (policyId: string, policyName: string) => {
    setConfirmAction({ id: policyId, action: 'delete', name: policyName });
  };

  const handleDeleteMethodConfirmed = async (policyId: string) => {
    try {
      await deleteShippingPolicy(policyId);
      setSuccessMessage('배송 방법이 삭제되었습니다.');
      setConfirmAction(null);
      await loadPolicies();
    } catch (err: unknown) {
      console.error('[ShippingPage] 삭제 실패:', err);
      const msg = err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.';
      setErrorMessage(`${msg} 다시 시도해 주세요.`);
      setConfirmAction(null);
    }
  };

  // 활성/비활성 토글
  const handleToggleMethodActive = async (policy: ShippingPolicy) => {
    try {
      await updateShippingPolicy(policy.id, { isActive: !policy.isActive });
      await loadPolicies();
    } catch (error) {
      console.error('[ShippingPage] 활성화 토글 실패:', error);
      const msg = error instanceof Error ? error.message : '상태 변경 중 오류가 발생했습니다.';
      setErrorMessage(msg);
    }
  };

  /**
   * 배송 설정 저장 — ShippingPolicy 실 API 연동
   * - defaultPolicyId 변경: 해당 정책을 isDefault=true 로 PATCH
   * - processingDays 변경: 기본 정책의 estimatedDays 필드를 PATCH
   *
   * 주의: 반품 기간/반품 주소/고객센터 연락처 필드는 현재 Backend `ShippingPolicy`
   * 모델에 저장할 수 없습니다. 배송 설정 탭은 배송 정책과 직접 연관된 항목만 관리합니다.
   */
  const handleSaveSettings = async () => {
    const targetId = settingsForm.defaultPolicyId;
    if (!targetId) {
      setErrorMessage('기본 배송 방법을 선택해 주세요.');
      return;
    }
    const targetPolicy = policies.find((p) => p.id === targetId);
    if (!targetPolicy) {
      setErrorMessage('선택한 배송 방법을 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const trimmedEstimatedDays = settingsForm.processingDays.trim();
      const payload: ShippingPolicyPayload = {
        isDefault: true,
        // estimatedDays 는 빈 문자열 전송 시 검증 실패 위험 → undefined 로 생략
        ...(trimmedEstimatedDays ? { estimatedDays: trimmedEstimatedDays } : {}),
      };

      await updateShippingPolicy(targetId, payload);
      setSuccessMessage('배송 설정이 저장되었습니다.');
      await loadPolicies();
    } catch (error) {
      console.error('[ShippingPage] 배송 설정 저장 실패:', error);
      const msg = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.';
      setErrorMessage(`${msg} 다시 시도해 주세요.`);
    } finally {
      setIsSaving(false);
    }
  };

  const activePolicies = useMemo(() => policies.filter((p) => p.isActive), [policies]);
  const defaultPolicy = useMemo(() => policies.find((p) => p.isDefault), [policies]);

  if (isLoading) {
    return <LoadingSpinner message="배송 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="배송 정보 관리"
        subtitle="배송 방법, 지역별 요금, 배송 설정을 관리합니다"
      />

      {/* 피드백 메시지 배너 */}
      {errorMessage && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{policies.length.toLocaleString()}<span className="text-sm font-semibold ml-1">개</span></p>
              <p className="text-sm text-slate-500 dark:text-slate-400">배송 방법</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-700 dark:text-green-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {activePolicies.length.toLocaleString()}<span className="text-sm font-semibold ml-1">개</span>
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">활성 배송</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {defaultPolicy ? '설정됨' : '미설정'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">기본 정책</p>
            </div>
          </div>
        </Card>
        <Card className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-purple-700 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                {defaultPolicy ? <>{defaultPolicy.shippingFee.toLocaleString()}<span className="text-sm font-semibold ml-1">원</span></> : '-'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">기본 배송비</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg w-fit">
        {[
          { id: 'methods', label: '배송 방법', icon: Truck },
          { id: 'regions', label: '지역별 요금', icon: MapPin },
          { id: 'settings', label: '배송 설정', icon: Settings },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shipping Methods Tab */}
      {activeTab === 'methods' && (
        <>
          <div className="flex justify-end">
            <Button
              onClick={handleAddMethod}
              className="bg-primary hover:bg-primary-dark text-white gap-2"
            >
              <Plus className="w-4 h-4" />
              배송 방법 추가
            </Button>
          </div>

          {policies.length === 0 ? (
            <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center gap-3">
              <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">등록된 배송 방법이 없습니다.</p>
              <Button
                onClick={handleAddMethod}
                variant="outline"
                className="border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                첫 번째 배송 방법 추가하기
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies.map((policy) => {
                const regions: string[] = policy.regions ? JSON.parse(policy.regions) : [];
                return (
                  <Card
                    key={policy.id}
                    className={`p-5 bg-white dark:bg-slate-800 border rounded-xl ${
                      policy.isActive
                        ? 'border-slate-200 dark:border-slate-700'
                        : 'border-slate-100 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Truck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white">{policy.name}</h3>
                            {policy.isDefault && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                기본
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{policy.type}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleToggleMethodActive(policy)}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          policy.isActive
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        {policy.isActive ? '활성' : '비활성'}
                      </button>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-baseline text-sm">
                        <span className="text-slate-500 dark:text-slate-400">기본 배송비</span>
                        <span className="font-semibold text-slate-900 dark:text-white tabular-nums text-right">
                          {policy.shippingFee === 0 ? '무료' : `${policy.shippingFee.toLocaleString()}원`}
                        </span>
                      </div>
                      {policy.freeShippingThreshold != null && (
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-slate-500 dark:text-slate-400">무료배송 기준</span>
                          <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums text-right">
                            {policy.freeShippingThreshold.toLocaleString()}원 이상
                          </span>
                        </div>
                      )}
                      {policy.additionalFee > 0 && (
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-slate-500 dark:text-slate-400">도서산간 추가비</span>
                          <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums text-right">
                            +{policy.additionalFee.toLocaleString()}원
                          </span>
                        </div>
                      )}
                      {policy.estimatedDays && (
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-slate-500 dark:text-slate-400">예상 배송일</span>
                          <span className="font-medium text-slate-900 dark:text-white flex items-center gap-1 tabular-nums">
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            {policy.estimatedDays}일
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-baseline text-sm">
                        <span className="text-slate-500 dark:text-slate-400">적용 지역</span>
                        <span className="text-slate-600 dark:text-slate-300 text-right tabular-nums">
                          {regions.length > 0 ? `${regions.length}개 지역` : '전국'}
                        </span>
                      </div>
                    </div>

                    {regions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {regions.slice(0, 5).map((region) => (
                          <Badge
                            key={region}
                            variant="outline"
                            className="text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-slate-300"
                          >
                            {region}
                          </Badge>
                        ))}
                        {regions.length > 5 && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-slate-300"
                          >
                            +{regions.length - 5}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 justify-center">
                      <button
                        onClick={() => handleEditMethod(policy)}
                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary-light hover:bg-primary/5 dark:hover:bg-primary/20 transition-colors border border-slate-200 dark:border-slate-600"
                      >
                        <Edit2 className="w-4 h-4" />
                        <span className="text-[10px] font-medium">수정</span>
                      </button>
                      <button
                        onClick={() => handleDeleteMethod(policy.id, policy.name)}
                        disabled={policy.isDefault}
                        title={policy.isDefault ? '기본 정책은 삭제할 수 없습니다' : '삭제'}
                        className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors border border-slate-200 dark:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-500"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-[10px] font-medium">삭제</span>
                      </button>
                    </div>
                    {confirmAction?.id === policy.id && (
                      <div className="flex items-center gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span className="text-sm text-red-700 dark:text-red-400">&quot;{confirmAction.name}&quot; 배송 방법을 삭제하시겠습니까?</span>
                        <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
                        <Button size="sm" onClick={() => handleDeleteMethodConfirmed(policy.id)} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Regions Tab — 지역별 추가 배송비는 각 배송 정책의 additionalFee 필드로 관리됩니다 */}
      {activeTab === 'regions' && (
        <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-8 rounded-xl">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
              <MapPin className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">지역별 추가 배송비 안내</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
                제주 및 도서산간 지역의 추가 배송비는 각 배송 방법(정책)의{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">도서산간 추가비</span> 필드에서 설정합니다.
                <br />
                배송 방법 탭에서 해당 정책을 수정해 주세요.
              </p>
            </div>
            <Button
              onClick={() => setActiveTab('methods')}
              variant="outline"
              className="border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 gap-2"
            >
              <Truck className="w-4 h-4" />
              배송 방법 탭으로 이동
            </Button>
          </div>
        </Card>
      )}

      {/* Settings Tab — ShippingPolicy 기반 배송 설정 */}
      {activeTab === 'settings' && (
        <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">배송 설정</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            기본 배송 정책과 예상 처리일수를 관리합니다. 설정은 서버에 즉시 저장됩니다.
          </p>

          {policies.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Truck className="w-10 h-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                먼저 배송 방법을 하나 이상 등록해 주세요.
              </p>
              <Button
                onClick={() => setActiveTab('methods')}
                variant="outline"
                className="border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                배송 방법 탭으로 이동
              </Button>
            </div>
          ) : (
            <div className="space-y-6 max-w-xl">
              <div>
                <label
                  htmlFor="default-policy-select"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  기본 배송 방법 <span className="text-red-500">*</span>
                </label>
                <select
                  id="default-policy-select"
                  value={settingsForm.defaultPolicyId}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, defaultPolicyId: e.target.value })
                  }
                  className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="">선택하세요</option>
                  {activePolicies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}
                      {policy.isDefault ? ' (현재 기본)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  선택한 정책이 주문 시 기본 배송 방법으로 사용됩니다.
                </p>
              </div>

              <div>
                <label
                  htmlFor="processing-days-input"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  예상 배송일 (영업일 기준)
                </label>
                <Input
                  id="processing-days-input"
                  value={settingsForm.processingDays}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, processingDays: e.target.value })
                  }
                  className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                  placeholder="예: 2-3"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  기본 정책의 예상 배송일 값이 주문 화면에 노출됩니다. 비워두면 미표기됩니다.
                </p>
              </div>

              {/* 반품/교환 정책 안내 — 쇼핑몰 운영정책 문서 연동 예정 */}
              <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    반품/교환 정책 및 고객센터 안내
                  </p>
                  <p>
                    반품/교환 가능 기간, 반품 배송 주소, 고객센터 연락처는 앱 운영 정책에서 관리됩니다.
                    공지사항과 쇼핑몰 하단 안내 영역을 통해 고객에게 노출됩니다.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <Button
                  onClick={handleSaveSettings}
                  className="bg-primary hover:bg-primary-dark text-white"
                  disabled={isSaving || !settingsForm.defaultPolicyId}
                >
                  {isSaving ? '저장 중...' : '설정 저장하기'}
                </Button>
                <Button
                  onClick={() => {
                    const dp = policies.find((p) => p.isDefault);
                    setSettingsForm({
                      defaultPolicyId: dp?.id ?? '',
                      processingDays: dp?.estimatedDays ?? '',
                    });
                  }}
                  variant="outline"
                  className="border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  disabled={isSaving}
                >
                  되돌리기
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 배송 방법 추가/수정 모달 */}
      <Modal
        isOpen={showMethodModal}
        onClose={() => {
          setShowMethodModal(false);
          setEditingPolicy(null);
        }}
        size="md"
      >
        <ModalHeader
          title={editingPolicy ? '배송 방법 수정' : '배송 방법 추가'}
          icon={Truck}
        />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                배송 방법명 <span className="text-red-500">*</span>
              </label>
              <Input
                value={methodForm.name}
                onChange={(e) => setMethodForm({ ...methodForm, name: e.target.value })}
                placeholder="예: 일반 배송"
                className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  기본 배송비 (원)
                </label>
                <Input
                  type="number"
                  value={methodForm.shippingFee}
                  onChange={(e) =>
                    setMethodForm({ ...methodForm, shippingFee: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                  min={0}
                  className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  무료배송 기준 (원)
                </label>
                <Input
                  type="number"
                  value={methodForm.freeShippingThreshold}
                  onChange={(e) =>
                    setMethodForm({
                      ...methodForm,
                      freeShippingThreshold: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="0 (없음)"
                  min={0}
                  className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">0이면 무료배송 조건 없음</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  도서산간 추가비 (원)
                </label>
                <Input
                  type="number"
                  value={methodForm.additionalFee}
                  onChange={(e) =>
                    setMethodForm({ ...methodForm, additionalFee: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                  min={0}
                  className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  예상 배송일 (일 단위)
                </label>
                <Input
                  value={methodForm.estimatedDays}
                  onChange={(e) => setMethodForm({ ...methodForm, estimatedDays: e.target.value })}
                  placeholder="예: 2-3"
                  className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={methodForm.isDefault}
                  onChange={(e) => setMethodForm({ ...methodForm, isDefault: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">기본 배송 정책으로 설정</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={methodForm.isActive}
                  onChange={(e) => setMethodForm({ ...methodForm, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">활성화 상태</span>
              </label>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowMethodModal(false);
              setEditingPolicy(null);
            }}
            className="flex-1 h-11 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            disabled={isSaving}
          >
            취소
          </Button>
          <Button
            onClick={handleSaveMethod}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
            disabled={isSaving}
          >
            {isSaving ? '저장 중...' : editingPolicy ? '수정하기' : '추가하기'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
