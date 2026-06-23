'use client';

/**
 * 공지사항 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 공지사항/점검공지 통합 관리, 표시 위치 선택
 * 2. 휴먼 디자인: 체크박스 기반 위치 선택 UI
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback } from 'react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Megaphone, Plus, Edit2, Trash2, Eye, EyeOff, CheckCircle2,
  Search, Calendar, Pin, Wrench, MapPin, Filter
} from 'lucide-react';

interface Notice {
  id: string;
  type: 'notice' | 'maintenance';
  title: string;
  content: string;
  maintenanceReason: string;
  displayLocations: string[];
  isPinned: boolean;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  views: number;
}

interface ApiNotice {
  id: string;
  title: string;
  content?: string;
  maintenanceReason?: string | null;
  targetType: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
  startAt?: string | null;
  displayLocationsJson?: string;
  displayLocations?: string[];
  isPinned: boolean;
  isPublished: boolean;
}

const _pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 시스템 공지 시간은 **한국시간(KST · UTC+9 · DST 없음) 기준**으로 일관 처리한다.
 * 브라우저/서버 타임존과 무관하게: 입력·표시는 항상 KST 벽시계, 저장은 절대시각(UTC ISO).
 * 백엔드 점검 판정(startAt<=서버now<=expiresAt)은 절대시각 비교라 TZ-안전하며,
 * 여기서 KST 벽시계 ↔ UTC 변환만 명시 고정하면 입력값이 곧 한국시간으로 해석된다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO(UTC) → datetime-local 입력값 "YYYY-MM-DDTHH:mm" (한국시간 KST 고정) */
const isoToDatetimeLocal = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 인스턴트를 +9h 시프트한 뒤 UTC 파트를 읽으면 KST 벽시계가 된다(브라우저 TZ 무관).
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${_pad2(kst.getUTCMonth() + 1)}-${_pad2(kst.getUTCDate())}T${_pad2(kst.getUTCHours())}:${_pad2(kst.getUTCMinutes())}`;
};
/** ISO(UTC) → date 입력값 "YYYY-MM-DD" (한국시간 KST 고정) */
const isoToDateInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${_pad2(kst.getUTCMonth() + 1)}-${_pad2(kst.getUTCDate())}`;
};
/**
 * datetime-local("YYYY-MM-DDTHH:mm") 또는 date("YYYY-MM-DD") 입력값을
 * **한국시간(KST)으로 간주**하여 백엔드용 UTC ISO 문자열로 변환한다.
 * 브라우저 타임존에 의존하던 `new Date(input).toISOString()` 을 대체 — 어떤 환경에서
 * 등록하든 입력값이 항상 KST 벽시계로 해석되어 저장 인스턴트가 일정하다.
 */
const kstInputToUtcIso = (local?: string | null): string | undefined => {
  if (!local) return undefined;
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, hh = '00', mm = '00'] = m;
  // KST 벽시계 → UTC epoch: Date.UTC(KST 파트) - 9h
  const utcMs = Date.UTC(+y, +mo - 1, +d, +hh, +mm) - KST_OFFSET_MS;
  const dt = new Date(utcMs);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
};

/**
 * 공지/점검의 현재 상태 — **서버 판정과 동일하게 절대시각(KST 벽시계 → UTC)으로
 * now 와 비교**한다. isActive 플래그만으로는 만료된 점검도 "활성"으로 보이는 문제를
 * 막기 위해, 시작/종료 시간창을 함께 판정한다.
 *   inactive : 비활성(isActive=false)
 *   upcoming : 시작 전(예정)
 *   ongoing  : 진행 중(시간창 안 · 종료일 없으면 시작 이후 상시)
 *   ended    : 종료(종료일 지남)
 */
type NoticeLiveStatus = 'inactive' | 'upcoming' | 'ongoing' | 'ended';

const _toEpochMs = (kstLocal?: string | null): number | null => {
  const iso = kstInputToUtcIso(kstLocal ?? undefined);
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

const getNoticeLiveStatus = (n: {
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
}): NoticeLiveStatus => {
  if (!n.isActive) return 'inactive';
  const now = Date.now();
  const startMs = _toEpochMs(n.startDate);
  const endMs = _toEpochMs(n.endDate);
  if (endMs !== null && now > endMs) return 'ended';
  if (startMs !== null && now < startMs) return 'upcoming';
  return 'ongoing';
};

/** 상태별 배지 라벨/스타일 (일반/점검 라벨 분리) */
const STATUS_BADGE: Record<
  NoticeLiveStatus,
  { label: string; maintLabel: string; cls: string }
> = {
  ongoing: {
    label: '활성',
    maintLabel: '점검 중',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  upcoming: {
    label: '예정',
    maintLabel: '점검 예정',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  ended: {
    label: '종료',
    maintLabel: '점검 종료',
    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  },
  inactive: {
    label: '비활성',
    maintLabel: '비활성',
    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  },
};

function mapApiNotice(item: ApiNotice): Notice {
  // 서비스가 파싱된 displayLocations 배열을 반환하지만, fallback으로 JSON도 처리
  let displayLocations: string[] = [];
  if (Array.isArray(item.displayLocations)) {
    displayLocations = item.displayLocations;
  } else if (item.displayLocationsJson) {
    try { displayLocations = JSON.parse(item.displayLocationsJson); } catch { displayLocations = []; }
  }
  // 점검 공지는 분 단위(datetime-local), 일반 공지는 날짜(date) 형식으로 입력값 복원.
  const isMaintenance = item.targetType === 'maintenance';
  const fmt = isMaintenance ? isoToDatetimeLocal : isoToDateInput;
  const startDate = item.startAt
    ? fmt(item.startAt)
    : item.createdAt ? isoToDateInput(item.createdAt) : '';
  return {
    id: item.id,
    type: isMaintenance ? 'maintenance' : 'notice',
    title: item.title,
    content: item.content ?? '',
    maintenanceReason: item.maintenanceReason ?? '',
    displayLocations,
    isPinned: item.isPinned,
    isActive: item.isActive,
    startDate,
    endDate: item.expiresAt ? fmt(item.expiresAt) : null,
    createdAt: item.createdAt ? item.createdAt.split('T')[0] : '',
    views: 0,
  };
}

const displayLocationOptions = [
  { value: 'app_home', label: '앱 홈', description: '앱 메인 화면' },
  { value: 'app_popup', label: '앱 팝업', description: '앱 실행 시 팝업' },
  { value: 'app_mypage', label: '앱 마이페이지', description: '마이페이지 상단' },
  { value: 'web_home', label: '웹 홈', description: '웹 메인 화면' },
  { value: 'web_popup', label: '웹 팝업', description: '웹 접속 시 팝업' },
  { value: 'web_dashboard', label: '웹 대시보드', description: '관리자 대시보드' },
];

const EMPTY_FORM = {
  type: 'notice' as 'notice' | 'maintenance',
  title: '',
  content: '',
  maintenanceReason: '',
  displayLocations: [] as string[],
  isPinned: false,
  startDate: '',
  endDate: '',
};

// 백엔드 CreateNoticeDto 검증 규칙 (teamplus-backend/src/notices/dto/create-notice.dto.ts 와 동기화 필수)
const NOTICE_VALIDATION = {
  TITLE_MIN: 2,
  TITLE_MAX: 200,
  CONTENT_MIN: 10,
  CONTENT_MAX: 10000,
} as const;

// 서버 검증 실패(400) 응답에서 사용자 친화적 메시지 추출
// 백엔드 응답: { errors?: [{ field, message }], message?: string }
const extractServerErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback;
  }
  const respData = (error as { response?: { data?: { message?: string; errors?: Array<{ field?: string; message?: string }> } } })
    .response?.data;
  const firstFieldError = respData?.errors?.find((e) => e?.message)?.message;
  if (firstFieldError) return firstFieldError;
  if (respData?.message) return respData.message;
  return fallback;
};

// 폼 입력에 대해 백엔드 DTO 검증 규칙을 사전 적용
const validateNoticeForm = (form: {
  title: string;
  content: string;
  type: 'notice' | 'maintenance';
  startDate: string;
  endDate: string;
}): string | null => {
  const title = form.title.trim();
  const content = form.content.trim();
  if (title.length < NOTICE_VALIDATION.TITLE_MIN) return `제목은 ${NOTICE_VALIDATION.TITLE_MIN}자 이상 입력해 주세요.`;
  if (title.length > NOTICE_VALIDATION.TITLE_MAX) return `제목은 ${NOTICE_VALIDATION.TITLE_MAX}자 이하로 입력해 주세요.`;
  if (content.length < NOTICE_VALIDATION.CONTENT_MIN) return `내용은 ${NOTICE_VALIDATION.CONTENT_MIN}자 이상 입력해 주세요.`;
  if (content.length > NOTICE_VALIDATION.CONTENT_MAX) return `내용은 ${NOTICE_VALIDATION.CONTENT_MAX.toLocaleString()}자 이하로 입력해 주세요.`;
  // 점검 공지: 시작/종료 일시 필수 + 시작 < 종료 (분 단위, 서버시간 기준 판정)
  if (form.type === 'maintenance') {
    if (!form.startDate) return '점검 시작 일시를 입력해 주세요.';
    if (!form.endDate) return '점검 종료 일시를 입력해 주세요.';
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return '점검 일시 형식이 올바르지 않습니다.';
    }
    if (start >= end) return '점검 시작 일시는 종료 일시보다 빨라야 합니다.';
  }
  return null;
};

export default function NoticeManagementPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'notice' | 'maintenance'>('all');
  const [filterLocation, setFilterLocation] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newNotice, setNewNotice] = useState({ ...EMPTY_FORM });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);

  const loadNotices = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data: ApiNotice[]; pagination: unknown }>('/notices/admin/list?scope=service&limit=100');
      setNotices((res.data ?? []).map(mapApiNotice));
    } catch (error) {
      console.error('[NoticeManagementPage] 공지사항 로드 실패:', error);
      setNotices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  const filteredNotices = notices.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || n.type === filterType;
    const matchesLocation = filterLocation === 'all' || n.displayLocations.includes(filterLocation);
    return matchesSearch && matchesType && matchesLocation;
  });

  const handleLocationToggle = (location: string) => {
    setNewNotice(prev => ({
      ...prev,
      displayLocations: prev.displayLocations.includes(location)
        ? prev.displayLocations.filter(l => l !== location)
        : [...prev.displayLocations, location]
    }));
  };

  const handleCreate = async () => {
    const validationError = validateNoticeForm(newNotice);
    if (validationError) {
      setActionMsg({ type: 'error', text: validationError });
      setTimeout(() => setActionMsg(null), 4000);
      return;
    }
    setIsSaving(true);
    try {
      await api.post('/notices', {
        title: newNotice.title.trim(),
        content: newNotice.content.trim(),
        type: newNotice.type === 'maintenance' ? 'maintenance' : 'general',
        maintenanceReason: newNotice.type === 'maintenance'
          ? (newNotice.maintenanceReason.trim() || undefined)
          : undefined,
        displayLocations: newNotice.displayLocations,
        // 입력값을 한국시간(KST)으로 간주해 UTC ISO 로 변환(브라우저 TZ 무관).
        startDate: kstInputToUtcIso(newNotice.startDate),
        endDate: kstInputToUtcIso(newNotice.endDate),
        isPinned: newNotice.isPinned,
      });
      setActionMsg({ type: 'success', text: MESSAGES.adminNotice.created });
      setTimeout(() => setActionMsg(null), 3000);
      setShowAddModal(false);
      setNewNotice({ ...EMPTY_FORM });
      await loadNotices();
    } catch (error) {
      console.error('[NoticeManagementPage] 공지사항 등록 실패:', error);
      setActionMsg({ type: 'error', text: extractServerErrorMessage(error, MESSAGES.adminNotice.createError) });
      setTimeout(() => setActionMsg(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditStart = (notice: Notice) => {
    setEditingId(notice.id);
    setNewNotice({
      type: notice.type,
      title: notice.title,
      content: notice.content,
      maintenanceReason: notice.maintenanceReason,
      displayLocations: notice.displayLocations,
      isPinned: notice.isPinned,
      startDate: notice.startDate,
      endDate: notice.endDate ?? '',
    });
    setShowAddModal(true);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    const validationError = validateNoticeForm(newNotice);
    if (validationError) {
      setActionMsg({ type: 'error', text: validationError });
      setTimeout(() => setActionMsg(null), 4000);
      return;
    }
    setIsSaving(true);
    try {
      await api.patch(`/notices/${editingId}`, {
        title: newNotice.title.trim(),
        content: newNotice.content.trim(),
        type: newNotice.type === 'maintenance' ? 'maintenance' : 'general',
        maintenanceReason: newNotice.type === 'maintenance'
          ? (newNotice.maintenanceReason.trim() || '')
          : undefined,
        displayLocations: newNotice.displayLocations,
        // 입력값을 한국시간(KST)으로 간주해 UTC ISO 로 변환(브라우저 TZ 무관).
        startDate: kstInputToUtcIso(newNotice.startDate),
        endDate: kstInputToUtcIso(newNotice.endDate),
        isPinned: newNotice.isPinned,
      });
      setActionMsg({ type: 'success', text: MESSAGES.adminNotice.updated });
      setTimeout(() => setActionMsg(null), 3000);
      setShowAddModal(false);
      setEditingId(null);
      setNewNotice({ ...EMPTY_FORM });
      await loadNotices();
    } catch (error) {
      console.error('[NoticeManagementPage] 공지사항 수정 실패:', error);
      setActionMsg({ type: 'error', text: extractServerErrorMessage(error, MESSAGES.adminNotice.updateError) });
      setTimeout(() => setActionMsg(null), 4000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/notices/${id}`);
      await loadNotices();
    } catch (error) {
      console.error('[NoticeManagementPage] 공지사항 삭제 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.adminNotice.deleteError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingId(null);
    setNewNotice({ ...EMPTY_FORM });
  };

  const getLocationBadges = (locations: string[]) => {
    return locations.map(loc => {
      const option = displayLocationOptions.find(o => o.value === loc);
      return option?.label || loc;
    });
  };

  if (isLoading) {
    return <LoadingSpinner message="공지사항을 불러오는 중..." />;
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

      {/* 페이지 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">공지사항 관리</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">공지사항 및 점검 공지를 관리하고 표시 위치를 설정합니다</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{notices.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">전체 공지</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{notices.filter(n => getNoticeLiveStatus(n) === 'ongoing').length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">진행 중</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{notices.filter(n => n.type === 'maintenance' && (getNoticeLiveStatus(n) === 'ongoing' || getNoticeLiveStatus(n) === 'upcoming')).length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">점검 예정·진행</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Eye className="w-5 h-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{notices.reduce((sum, n) => sum + n.views, 0).toLocaleString()}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">총 조회수</p>
            </div>
          </div>
        </div>
      </div>

      {/* 공지사항 등록/수정 모달 */}
      {showAddModal && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                {editingId ? <Edit2 className="w-5 h-5 text-primary" aria-hidden="true" /> : <Plus className="w-5 h-5 text-primary" aria-hidden="true" />}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {editingId ? '공지사항 수정' : '새 공지사항 등록'}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">공지사항 또는 점검 공지를 {editingId ? '수정' : '등록'}합니다</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseModal}
              aria-label="모달 닫기"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              ✕
            </button>
          </div>

          <div className="space-y-5">
            {/* 공지 유형 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">공지 유형</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="noticeType"
                    checked={newNotice.type === 'notice'}
                    onChange={() => setNewNotice({ ...newNotice, type: 'notice' })}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">일반 공지사항</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="noticeType"
                    checked={newNotice.type === 'maintenance'}
                    onChange={() => setNewNotice({ ...newNotice, type: 'maintenance' })}
                    className="w-4 h-4 text-primary"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">점검 공지</span>
                </label>
              </div>
            </div>

            {/* 제목 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                제목 <span className="text-red-500">*</span>
              </label>
              <Input
                value={newNotice.title}
                onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                placeholder={`공지사항 제목을 입력하세요 (${NOTICE_VALIDATION.TITLE_MIN}~${NOTICE_VALIDATION.TITLE_MAX}자)`}
                maxLength={NOTICE_VALIDATION.TITLE_MAX}
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                {newNotice.title.trim().length} / {NOTICE_VALIDATION.TITLE_MAX}자
              </p>
            </div>

            {/* 내용 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={newNotice.content}
                onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                placeholder={`공지사항 내용을 입력하세요 (${NOTICE_VALIDATION.CONTENT_MIN}~${NOTICE_VALIDATION.CONTENT_MAX.toLocaleString()}자)`}
                rows={4}
                maxLength={NOTICE_VALIDATION.CONTENT_MAX}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 text-right">
                {newNotice.content.trim().length} / {NOTICE_VALIDATION.CONTENT_MAX.toLocaleString()}자 (최소 {NOTICE_VALIDATION.CONTENT_MIN}자)
              </p>
            </div>

            {/* 표시 위치 선택 - 체크박스 그룹 */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">표시 위치 선택</label>
              <p className="text-xs text-slate-500 dark:text-slate-400">공지사항이 표시될 위치를 선택하세요 (복수 선택 가능)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {displayLocationOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      newNotice.displayLocations.includes(option.value)
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={newNotice.displayLocations.includes(option.value)}
                      onChange={() => handleLocationToggle(option.value)}
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

            {/* 기간 설정 — 점검 공지는 분 단위(datetime-local), 일반 공지는 날짜만 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {newNotice.type === 'maintenance' ? '점검 시작 일시' : '시작일'}
                </label>
                <Input
                  type={newNotice.type === 'maintenance' ? 'datetime-local' : 'date'}
                  value={newNotice.startDate}
                  onChange={(e) => setNewNotice({ ...newNotice, startDate: e.target.value })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {newNotice.type === 'maintenance' ? '점검 종료 일시' : '종료일 (선택)'}
                </label>
                <Input
                  type={newNotice.type === 'maintenance' ? 'datetime-local' : 'date'}
                  value={newNotice.endDate}
                  onChange={(e) => setNewNotice({ ...newNotice, endDate: e.target.value })}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            </div>
            {newNotice.type === 'maintenance' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  점검 사유 <span className="text-xs font-normal text-slate-400">(선택 · 앱 점검 화면 ‘점검사유’ 행에 표시)</span>
                </label>
                <Input
                  type="text"
                  value={newNotice.maintenanceReason}
                  onChange={(e) => setNewNotice({ ...newNotice, maintenanceReason: e.target.value })}
                  placeholder="예: 보안 업데이트"
                  maxLength={100}
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
            )}
            {newNotice.type === 'maintenance' && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                점검 공지는 시작·종료 일시(분 단위)가 모두 필요합니다. 서버 시간 기준으로 해당 기간 동안 앱 진입이 차단됩니다.
              </p>
            )}

            {/* 고정 여부 */}
            <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={newNotice.isPinned}
                onChange={(e) => setNewNotice({ ...newNotice, isPinned: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-500 focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">상단 고정</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">공지사항을 목록 상단에 고정합니다</p>
              </div>
            </label>

            {/* 버튼 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSaving} className="h-12 px-5 text-base font-bold dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                취소
              </Button>
              <Button
                type="button"
                className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark"
                disabled={isSaving}
                onClick={editingId ? handleUpdate : handleCreate}
              >
                {isSaving ? '처리 중...' : editingId ? '수정하기' : '등록하기'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 공지사항 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 space-y-3">
          {/* 1행: 제목 + 검색 + 등록 버튼 */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex-shrink-0">공지사항 목록</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <Input
                  placeholder="검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 w-40 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white text-sm"
                />
              </div>
              <Button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="bg-primary hover:bg-primary-dark gap-2 h-9 px-4 text-sm"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                공지 등록
              </Button>
            </div>
          </div>

          {/* 2행: 유형 필터 + 위치 필터 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* 유형 필터 */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
              {[
                { value: 'all', label: '전체' },
                { value: 'notice', label: '공지' },
                { value: 'maintenance', label: '점검' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilterType(opt.value as 'all' | 'notice' | 'maintenance')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                    filterType === opt.value
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-600" />

            {/* 표시 위치 필터 */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mb-0.5">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
              <button
                type="button"
                onClick={() => setFilterLocation('all')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  filterLocation === 'all'
                    ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                전체 위치
              </button>
              {displayLocationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilterLocation(opt.value)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    filterLocation === opt.value
                      ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredNotices.map((notice) => (
            <div key={notice.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                {/* 아이콘 및 정보 */}
                <div className="flex items-start gap-4 flex-1">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    notice.type === 'maintenance' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10'
                  }`}>
                    {notice.type === 'maintenance' ? (
                      <Wrench className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    ) : (
                      <Megaphone className="w-5 h-5 text-primary" aria-hidden="true" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {notice.isPinned && (
                        <Pin className="w-4 h-4 text-red-500 dark:text-red-400" aria-hidden="true" />
                      )}
                      <h3 className="font-semibold text-slate-900 dark:text-white">{notice.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        notice.type === 'maintenance'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {notice.type === 'maintenance' ? '점검' : '공지'}
                      </span>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{notice.content}</p>

                    {/* 표시 위치 배지 */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {getLocationBadges(notice.displayLocations).map((label, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs"
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* 메타 정보 */}
                    <div className="flex items-center gap-4 mt-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Calendar className="w-4 h-4" aria-hidden="true" />
                        {notice.startDate.replace('T', ' ')}
                        {notice.endDate ? ` ~ ${notice.endDate.replace('T', ' ')}` : ''}
                        {notice.type === 'maintenance' ? ' (KST)' : ''}
                      </span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Eye className="w-4 h-4" aria-hidden="true" />
                        {notice.views.toLocaleString()}회
                      </span>
                    </div>
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex items-center gap-2 lg:flex-shrink-0">
                  {(() => {
                    // isActive 플래그가 아니라 '서버시각 기준 시간창' 상태로 표시.
                    const st = getNoticeLiveStatus(notice);
                    const meta = STATUS_BADGE[st];
                    const label =
                      notice.type === 'maintenance' ? meta.maintLabel : meta.label;
                    const Icon =
                      st === 'ongoing'
                        ? CheckCircle2
                        : st === 'upcoming'
                          ? Calendar
                          : EyeOff;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${meta.cls}`}
                      >
                        <Icon className="w-3 h-3" aria-hidden="true" />
                        {label}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => handleEditStart(notice)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                    title="수정하기"
                    aria-label="수정하기"
                  >
                    <Edit2 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ id: notice.id, action: 'delete' })}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                    title="삭제하기"
                    aria-label="삭제하기"
                  >
                    <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {confirmAction?.id === notice.id && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <span className="text-sm text-red-700 dark:text-red-400">공지사항을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
                  <Button type="button" size="sm" onClick={() => { handleDelete(notice.id); setConfirmAction(null); }} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredNotices.length === 0 && (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Megaphone className="w-7 h-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {filterLocation !== 'all'
                ? `'${displayLocationOptions.find(o => o.value === filterLocation)?.label}' 위치에 해당하는 공지사항이 없습니다`
                : filterType !== 'all'
                  ? `${filterType === 'maintenance' ? '점검' : '일반'} 공지사항이 없습니다`
                  : '등록된 공지사항이 없습니다'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">공지 등록 버튼을 눌러 새 공지사항을 추가하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
