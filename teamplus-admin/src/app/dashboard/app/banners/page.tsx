'use client';

/**
 * 배너 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 앱 내 배너 이미지 관리
 * 2. 휴먼 디자인: 시각적 배너 미리보기
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Image as ImageIcon, Plus, Eye, Edit2, Trash2, GripVertical, ExternalLink, Calendar, ToggleLeft, ToggleRight, Upload, Link, AlertCircle, Users, Filter, MapPin } from 'lucide-react';

const displayLocationOptions = [
  { value: 'top', label: '상단', description: '화면 상단 영역' },
  { value: 'middle', label: '중단', description: '화면 중간 영역' },
  { value: 'bottom', label: '하단', description: '화면 하단 영역' },
];

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  linkType: string;
  targetRole?: string;       // deprecated (legacy)
  targetRolesJson: string;   // 신규: JSON 배열 '["PARENT","COACH"]'
  displayLocationsJson?: string;  // JSON 배열 '["app_home","web_home"]'
  displayLocations?: string[];    // 파싱된 노출 위치 배열
  sortOrder: number;
  isActive: boolean;
  startAt?: string;
  endAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function BannerManagementPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<string>('all');
  const [filterLocation, _setFilterLocation] = useState<string>('all');
  const [bannerList, setBannerList] = useState<Banner[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bannerToDelete, setBannerToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    linkUrl: '',
    linkType: 'none' as 'none' | 'internal' | 'external',
    imageUrl: '',
    targetRoles: ['all'] as string[],
    displayLocations: [] as string[],
    sortOrder: 1,
    startDate: '',
    endDate: '',
    isActive: true,
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadBanners = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<Banner[]>('/app/banners');
      setBannerList(data ?? []);
    } catch (error) {
      console.error('[Banners] 로드 실패:', error);
      setBannerList([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  if (isLoading) {
    return <LoadingSpinner message="배너 데이터를 불러오는 중..." />;
  }

  const toggleActive = async (banner: Banner) => {
    try {
      await api.put(`/app/banners/${banner.id}`, { isActive: !banner.isActive });
      setBannerList(bannerList.map((b) =>
        b.id === banner.id ? { ...b, isActive: !b.isActive } : b
      ));
    } catch (error) {
      console.error('[Banners] 상태 변경 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.banner.statusError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const ROLE_OPTIONS = [
    { value: 'all',      label: '전체' },
    { value: 'DIRECTOR', label: '감독' },
    { value: 'COACH',    label: '코치' },
    { value: 'PARENT',   label: '학부모' },
    { value: 'TEEN',     label: '10세이상학생' },
    { value: 'CHILD',    label: '10세미만학생' },
  ];

  const parseTargetRoles = (banner: Banner): string[] => {
    try {
      const parsed = JSON.parse(banner.targetRolesJson || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* ignore */ }
    // fallback: legacy targetRole
    const legacy = ['home', 'popup', 'mypage'];
    if (!banner.targetRole || legacy.includes(banner.targetRole)) return ['all'];
    return [banner.targetRole];
  };

  const parseDisplayLocations = (banner: Banner): string[] => {
    if (Array.isArray(banner.displayLocations) && banner.displayLocations.length > 0) {
      return banner.displayLocations;
    }
    if (banner.displayLocationsJson) {
      try {
        const parsed = JSON.parse(banner.displayLocationsJson);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* ignore */ }
    }
    return [];
  };

  const getLocationLabels = (banner: Banner): string[] => {
    const locations = parseDisplayLocations(banner);
    return locations.map(loc => displayLocationOptions.find(o => o.value === loc)?.label ?? loc);
  };

  const getRoleLabel = (banner: Banner): string => {
    const roles = parseTargetRoles(banner);
    return roles.map(r => ROLE_OPTIONS.find(o => o.value === r)?.label ?? r).join(', ');
  };

  const filteredBanners = bannerList.filter((b) => {
    const matchesRole = selectedPosition === 'all' || (() => {
      const roles = parseTargetRoles(b);
      return roles.includes('all') || roles.includes(selectedPosition);
    })();
    const matchesLocation = filterLocation === 'all' || parseDisplayLocations(b).includes(filterLocation);
    return matchesRole && matchesLocation;
  });

  const handleOpenAddModal = () => {
    setEditingBanner(null);
    setFormData({
      title: '',
      linkUrl: '',
      linkType: 'none',
      imageUrl: '',
      targetRoles: ['all'],
      displayLocations: [],
      sortOrder: bannerList.length + 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (banner: Banner) => {
    setEditingBanner(banner);
    setFormData({
      title: banner.title,
      linkUrl: banner.linkUrl || '',
      linkType: (banner.linkType as 'none' | 'internal' | 'external') || 'none',
      imageUrl: banner.imageUrl || '',
      targetRoles: parseTargetRoles(banner),
      displayLocations: parseDisplayLocations(banner),
      sortOrder: banner.sortOrder ?? 1,
      startDate: banner.startAt ? banner.startAt.split('T')[0] : '',
      endDate: banner.endAt ? banner.endAt.split('T')[0] : '',
      isActive: banner.isActive,
    });
    setShowModal(true);
  };

  const handleSaveBanner = async () => {
    if (!formData.title || (formData.linkType !== 'none' && !formData.linkUrl)) {
      setActionMsg({ type: 'error', text: MESSAGES.banner.requiredFields });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    const body = {
      title: formData.title,
      imageUrl: formData.imageUrl || '/images/banner_placeholder.jpg',
      linkUrl: formData.linkUrl,
      linkType: formData.linkType,
      targetRoles: formData.targetRoles,
      displayLocations: formData.displayLocations,
      sortOrder: formData.sortOrder,
      isActive: formData.isActive,
      startAt: formData.startDate || undefined,
      endAt: formData.endDate || undefined,
    };

    try {
      if (editingBanner) {
        await api.put(`/app/banners/${editingBanner.id}`, body);
      } else {
        await api.post('/app/banners', body);
      }
      setShowModal(false);
      await loadBanners();
    } catch (error) {
      console.error('[Banners] 저장 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.banner.saveError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleDeleteBanner = (id: string) => {
    setBannerToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (bannerToDelete) {
      try {
        await api.delete(`/app/banners/${bannerToDelete}`);
        setBannerToDelete(null);
        setShowDeleteConfirm(false);
        await loadBanners();
      } catch (error) {
        console.error('[Banners] 삭제 실패:', error);
        setActionMsg({ type: 'error', text: MESSAGES.banner.deleteError });
        setTimeout(() => setActionMsg(null), 3000);
      }
    }
  };

  const activeBanners = bannerList.filter(b => b.isActive);

  const FILTER_OPTIONS = [
    { value: 'all', label: '전체' },
    { value: 'DIRECTOR', label: '감독' },
    { value: 'COACH', label: '코치' },
    { value: 'PARENT', label: '학부모' },
    { value: 'TEEN', label: '10세+' },
    { value: 'CHILD', label: '10세-' },
  ];

  return (
    <div className="space-y-5">
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
      <PageHeader
        title="배너 관리"
        description="앱 내 배너를 등록하고 관리합니다"
      />

      {/* 통계 카드 */}
      <StatsGrid
        stats={[
          { label: '전체 배너', value: bannerList.length, icon: ImageIcon },
          { label: '활성 배너', value: activeBanners.length, icon: Eye },
          { label: '비활성 배너', value: bannerList.length - activeBanners.length, icon: ExternalLink },
          { label: '역할별 배너', value: new Set(bannerList.flatMap(b => { try { return JSON.parse(b.targetRolesJson || '[]'); } catch { return []; } })).size, icon: Users },
        ]}
      />

      {/* 배너 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        {/* 목록 헤더: 제목 + 필터 + 등록 버튼 */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 space-y-3">
          {/* 1행: 제목 + 등록 버튼 */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">배너 목록</h2>
            <Button type="button" onClick={handleOpenAddModal} className="bg-primary hover:bg-primary-dark gap-2 h-11 px-4 text-sm motion-reduce:transition-none">
              <Plus className="w-4 h-4" aria-hidden="true" />
              배너 등록
            </Button>
          </div>
          {/* 2행: 역할 필터 | 위치 필터 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* 역할 필터 */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" aria-hidden="true" />
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mb-0.5">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedPosition(opt.value)}
                    aria-pressed={selectedPosition === opt.value}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none ${
                      selectedPosition === opt.value
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* 배너 리스트 */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
          {filteredBanners.map((banner) => (
            <div key={banner.id} className="p-5 hover:bg-slate-50/50 dark:hover:bg-slate-750/30 transition-colors motion-reduce:transition-none">
              <div className="flex gap-4">
                {/* 드래그 핸들 */}
                <button type="button" aria-label="배너 순서 변경" className="pt-1 cursor-grab text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 flex-shrink-0">
                  <GripVertical className="w-4 h-4" aria-hidden="true" />
                </button>

                {/* 이미지 미리보기 */}
                <div className="w-36 h-[80px] bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden flex-shrink-0">
                  {banner.imageUrl && !banner.imageUrl.includes('placeholder') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-500" />
                    </div>
                  )}
                </div>

                {/* 배너 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-[15px] truncate">{banner.title}</h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                      banner.isActive
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${banner.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {banner.isActive ? '활성' : '비활성'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span>대상: <span className="font-medium text-slate-700 dark:text-slate-300">{getRoleLabel(banner)}</span></span>
                    {banner.linkUrl && (
                      <span className="flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        <span className="text-primary truncate max-w-[180px]">{banner.linkUrl}</span>
                      </span>
                    )}
                    {(banner.startAt || banner.endAt) && (
                      <span className="flex items-center gap-1 tabular-nums">
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        {banner.startAt ? banner.startAt.split('T')[0] : '시작 미정'} ~ {banner.endAt ? banner.endAt.split('T')[0] : '종료 미정'}
                      </span>
                    )}
                  </div>
                  {/* 노출 위치 배지 + 순서 */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {getLocationLabels(banner).length > 0 ? (
                      getLocationLabels(banner).map((label, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded text-xs font-medium"
                        >
                          <MapPin className="w-3 h-3" />
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">위치 미지정</span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-xs">
                      순서 {banner.sortOrder}
                    </span>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleActive(banner)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                    title={banner.isActive ? '비활성화' : '활성화'}
                    aria-label={banner.isActive ? '비활성화하기' : '활성화하기'}
                  >
                    {banner.isActive ? (
                      <ToggleRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(banner)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                    title="수정하기"
                    aria-label="수정하기"
                  >
                    <Edit2 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBanner(banner.id)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                    title="삭제하기"
                    aria-label="삭제하기"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 빈 상태 */}
        {filteredBanners.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-7 h-7 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {filterLocation !== 'all'
                ? `'${displayLocationOptions.find(o => o.value === filterLocation)?.label}' 위치에 해당하는 배너가 없습니다`
                : selectedPosition !== 'all'
                  ? `'${FILTER_OPTIONS.find(f => f.value === selectedPosition)?.label}' 대상 배너가 없습니다`
                  : '등록된 배너가 없습니다'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">배너 등록 버튼을 눌러 새 배너를 추가하세요</p>
          </div>
        )}
      </div>

      {/* 배너 등록/수정 모달 */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} size="lg">
        <ModalHeader
          title={editingBanner ? '배너 수정' : '새 배너 등록'}
          icon={ImageIcon}
        />
        <ModalBody scrollable maxHeight="70vh">
          <div className="space-y-5">
            {/* 이미지 URL 입력 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">배너 이미지 URL</label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 hover:border-primary dark:hover:border-primary transition-colors">
                <div className="flex items-center gap-3">
                  <Upload className="w-8 h-8 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                  <Input
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://example.com/banner.jpg"
                    className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-11">권장 크기: 1200 x 400px (3:1 비율)</p>
              </div>
            </div>

            {/* 배너 제목 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">배너 제목 *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="배너 제목을 입력하세요"
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 링크 타입 + URL */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">링크 유형</label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {([
                  { value: 'none',     label: '없음' },
                  { value: 'internal', label: '내부 링크' },
                  { value: 'external', label: '외부 링크' },
                ] as const).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-center justify-center gap-1.5 p-2.5 border rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                      formData.linkType === opt.value
                        ? 'border-primary bg-primary/5 text-primary dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="linkType"
                      value={opt.value}
                      checked={formData.linkType === opt.value}
                      onChange={() => setFormData({ ...formData, linkType: opt.value })}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">클릭 시 이동 링크 *</label>
              <div className="relative">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={formData.linkUrl}
                  onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                  placeholder={formData.linkType === 'internal' ? '/classes' : 'https://example.com'}
                  className="h-11 pl-10 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>

            {/* 노출 대상 역할 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">노출 대상</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.targetRoles.includes(option.value)
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.targetRoles.includes(option.value)}
                      onChange={(e) => {
                        if (option.value === 'all') {
                          setFormData({ ...formData, targetRoles: e.target.checked ? ['all'] : [] });
                        } else {
                          const newRoles = e.target.checked
                            ? [...formData.targetRoles.filter(r => r !== 'all'), option.value]
                            : formData.targetRoles.filter(r => r !== option.value);
                          setFormData({ ...formData, targetRoles: newRoles.length ? newRoles : ['all'] });
                        }
                      }}
                      className="w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-500 focus:ring-primary"
                    />
                    <span className={`text-sm font-medium ${
                      formData.targetRoles.includes(option.value) ? 'text-primary' : 'text-slate-700 dark:text-slate-300'
                    }`}>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 노출 위치 선택 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">노출 위치 선택</label>
              <p className="text-xs text-slate-500 dark:text-slate-400">배너가 노출될 위치를 선택하세요 (복수 선택 가능)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {displayLocationOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.displayLocations.includes(option.value)
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={formData.displayLocations.includes(option.value)}
                      onChange={() => {
                        setFormData(prev => ({
                          ...prev,
                          displayLocations: prev.displayLocations.includes(option.value)
                            ? prev.displayLocations.filter(l => l !== option.value)
                            : [...prev.displayLocations, option.value]
                        }));
                      }}
                      className="w-4 h-4 mt-0.5 text-primary rounded border-slate-300 dark:border-slate-500 focus:ring-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{option.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 노출 순서 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">노출 순서</label>
              <p className="text-xs text-slate-500 dark:text-slate-400">같은 위치에 여러 배너가 있으면 순서대로 노출됩니다 (숫자가 작을수록 먼저)</p>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData({ ...formData, sortOrder: val === '' ? 0 : parseInt(val) });
                }}
                className="w-32"
              />
            </div>

            {/* 노출 기간 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">시작일</label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">종료일</label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>

            {/* 활성화 여부 */}
            <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-500 focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">즉시 활성화</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">등록 후 바로 사용자에게 노출됩니다</p>
              </div>
            </label>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowModal(false)}
            className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            onClick={handleSaveBanner}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
          >
            {editingBanner ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
        <ModalHeader title="배너 삭제" icon={AlertCircle} />
        <ModalBody>
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              이 배너를 삭제하시겠습니까?
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              삭제된 배너는 복구할 수 없습니다.
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            onClick={confirmDelete}
            className="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white"
          >
            삭제하기
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
