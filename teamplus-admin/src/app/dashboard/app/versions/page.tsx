'use client';

/**
 * 앱 버전 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: iOS/Android 앱 버전 관리
 * 2. 휴먼 디자인: 플랫폼별 명확한 구분
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusFilter } from '@/components/ui/admin-tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { GitBranch, Plus, Apple, Smartphone, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const ITEMS_PER_PAGE = 10;

interface VersionItem {
  id: string;
  platform: string;
  version: string;
  minVersion: string;
  forceUpdate: boolean;
  releaseNotes?: string;
  storeUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export default function AppVersionsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'ios' | 'android'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [formData, setFormData] = useState({
    platform: 'ios' as 'ios' | 'android',
    version: '',
    minVersion: '',
    forceUpdate: false,
    releaseNotes: '',
    storeUrl: '',
    isActive: true,
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<VersionItem[]>('/app/versions');
      setVersions(data ?? []);
    } catch (error) {
      console.error('[Versions] 로드 실패:', error);
      setVersions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  if (isLoading) {
    return <LoadingSpinner message="버전 정보를 불러오는 중..." />;
  }

  const filteredVersions = versions.filter(v => filter === 'all' || v.platform === filter);

  const totalPages = Math.ceil(filteredVersions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedVersions = filteredVersions.slice(startIndex, endIndex);

  const handleFilterChange = (value: 'all' | 'ios' | 'android') => {
    setFilter(value);
    setCurrentPage(1);
  };

  const getPageNumbers = () => {
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
    return pages;
  };

  const getStatusBadge = (item: VersionItem) => {
    if (item.isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
          활성
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-xs font-medium">
        <AlertCircle className="w-3 h-3" aria-hidden="true" />
        비활성
      </span>
    );
  };

  const handleOpenAddModal = () => {
    setFormData({
      platform: 'ios',
      version: '',
      minVersion: '',
      forceUpdate: false,
      releaseNotes: '',
      storeUrl: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleSaveVersion = async () => {
    if (!formData.version || !formData.minVersion) {
      setActionMsg({ type: 'error', text: MESSAGES.version.requiredFields });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    try {
      await api.post('/app/versions', {
        platform: formData.platform,
        version: formData.version,
        minVersion: formData.minVersion,
        forceUpdate: formData.forceUpdate,
        releaseNotes: formData.releaseNotes || undefined,
        storeUrl: formData.storeUrl || undefined,
        isActive: formData.isActive,
      });
      setShowModal(false);
      await loadVersions();
    } catch (error) {
      console.error('[Versions] 저장 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.version.createError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  // 플랫폼별 최신 버전 가져오기
  const latestIos = versions.find(v => v.platform === 'ios');
  const latestAndroid = versions.find(v => v.platform === 'android');

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

      {/* 페이지 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">앱 버전 관리</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">iOS 및 Android 앱 버전을 관리합니다</p>
      </div>
        {/* 현재 버전 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-900 dark:bg-slate-700 rounded-xl flex items-center justify-center">
                  <Apple className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">iOS 최신 버전</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{latestIos ? `v${latestIos.version}` : '-'}</p>
                </div>
              </div>
              {latestIos && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${latestIos.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {latestIos.isActive ? '활성' : '비활성'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">최소 버전</p>
                <p className="font-semibold text-slate-900 dark:text-white tabular-nums">{latestIos?.minVersion || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">강제 업데이트</p>
                <p className="font-semibold text-slate-900 dark:text-white">{latestIos?.forceUpdate ? '예' : '아니오'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <Smartphone className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Android 최신 버전</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{latestAndroid ? `v${latestAndroid.version}` : '-'}</p>
                </div>
              </div>
              {latestAndroid && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${latestAndroid.isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {latestAndroid.isActive ? '활성' : '비활성'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">최소 버전</p>
                <p className="font-semibold text-slate-900 dark:text-white tabular-nums">{latestAndroid?.minVersion || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">강제 업데이트</p>
                <p className="font-semibold text-slate-900 dark:text-white">{latestAndroid?.forceUpdate ? '예' : '아니오'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 버전 목록 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">버전 이력</h2>
              <div className="flex gap-2">
                <StatusFilter
                  options={[
                    { value: 'all', label: '전체' },
                    { value: 'ios', label: 'iOS' },
                    { value: 'android', label: 'Android' },
                  ]}
                  selected={filter}
                  onChange={(value) => handleFilterChange(value as 'all' | 'ios' | 'android')}
                />
                <Button type="button" onClick={handleOpenAddModal} className="bg-primary hover:bg-primary-dark gap-2 h-12 px-5 text-base font-bold">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  새 버전 등록
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-700/50">
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">번호</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">플랫폼</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">버전</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">최소 버전</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">강제 업데이트</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">등록일</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {paginatedVersions.map((version, index) => (
                  <tr key={version.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                    <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-300 tabular-nums">{filteredVersions.length - startIndex - index}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {version.platform === 'ios' ? (
                          <div className="w-8 h-8 bg-slate-900 dark:bg-slate-600 rounded-lg flex items-center justify-center">
                            <Apple className="w-4 h-4 text-white" aria-hidden="true" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                            <Smartphone className="w-4 h-4 text-white" aria-hidden="true" />
                          </div>
                        )}
                        <span className="font-medium text-slate-900 dark:text-white capitalize">{version.platform}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-slate-900 dark:text-white tabular-nums">v{version.version}</td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-300 tabular-nums">v{version.minVersion}</td>
                    <td className="px-6 py-4 text-center text-sm">
                      {version.forceUpdate ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">예</span>
                      ) : (
                        <span className="text-slate-400">아니오</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                      {version.createdAt ? new Date(version.createdAt).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-6 py-4 text-center">{getStatusBadge(version)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredVersions.length === 0 && (
            <div className="p-12 text-center">
              <GitBranch className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-slate-500 dark:text-slate-400">등록된 버전이 없습니다</p>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                    currentPage === 1
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="맨 처음"
                  aria-label="맨 처음 페이지"
                >
                  <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                    currentPage === 1
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="이전"
                  aria-label="이전 페이지"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <div className="flex items-center">
                  {getPageNumbers().map((page, idx) => (
                    <div key={page} className="flex items-center">
                      {idx > 0 && (
                        <span className="text-slate-300 dark:text-slate-600 mx-0.5">|</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        aria-label={`${page}페이지로 이동`}
                        aria-current={currentPage === page ? 'page' : undefined}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none tabular-nums ${
                          currentPage === page
                            ? 'bg-primary text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                    currentPage === totalPages
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="다음"
                  aria-label="다음 페이지"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                    currentPage === totalPages
                      ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="맨 끝"
                  aria-label="맨 끝 페이지"
                >
                  <ChevronsRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="text-center mt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  총 {filteredVersions.length}개 중 {startIndex + 1}-{Math.min(endIndex, filteredVersions.length)}개 표시
                </span>
              </div>
            </div>
          )}
        </div>

      {/* 버전 등록 모달 */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} size="lg">
        <ModalHeader
          title="새 버전 등록"
          icon={GitBranch}
        />
        <ModalBody>
          <div className="space-y-5">
            {/* 플랫폼 선택 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">플랫폼</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    formData.platform === 'ios'
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value="ios"
                    checked={formData.platform === 'ios'}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as 'ios' | 'android' })}
                    className="sr-only"
                  />
                  <div className="w-10 h-10 bg-slate-900 dark:bg-slate-700 rounded-xl flex items-center justify-center">
                    <Apple className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">iOS</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">App Store</p>
                  </div>
                </label>
                <label
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    formData.platform === 'android'
                      ? 'border-primary bg-primary/5 dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="platform"
                    value="android"
                    checked={formData.platform === 'android'}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as 'ios' | 'android' })}
                    className="sr-only"
                  />
                  <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">Android</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Google Play</p>
                  </div>
                </label>
              </div>
            </div>

            {/* 버전 정보 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">버전 번호 *</label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="예: 2.2.0"
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">최소 요구 버전 *</label>
                <Input
                  value={formData.minVersion}
                  onChange={(e) => setFormData({ ...formData, minVersion: e.target.value })}
                  placeholder="예: 2.1.0"
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>

            {/* 스토어 URL */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">스토어 URL</label>
              <Input
                value={formData.storeUrl}
                onChange={(e) => setFormData({ ...formData, storeUrl: e.target.value })}
                placeholder="https://apps.apple.com/... 또는 https://play.google.com/..."
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 릴리즈 노트 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">릴리즈 노트</label>
              <textarea
                value={formData.releaseNotes}
                onChange={(e) => setFormData({ ...formData, releaseNotes: e.target.value })}
                placeholder="이번 버전의 주요 변경 사항을 입력하세요..."
                rows={4}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {/* 강제 업데이트 */}
            <label className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.forceUpdate}
                onChange={(e) => setFormData({ ...formData, forceUpdate: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded border-slate-300 dark:border-slate-500 focus:ring-amber-500"
              />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">강제 업데이트</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">이전 버전 사용자에게 업데이트를 강제합니다</p>
              </div>
            </label>

            {/* 활성화 */}
            <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-500 focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">활성화</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">즉시 배포 상태로 설정합니다</p>
              </div>
            </label>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowModal(false)}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSaveVersion}
            className="flex-1 h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white"
          >
            등록하기
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
