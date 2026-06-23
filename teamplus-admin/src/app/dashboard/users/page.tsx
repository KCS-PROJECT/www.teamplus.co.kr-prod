'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { MiniStatsCard, type MiniStatsCardVariant } from '@/components/ui/mini-stats-card';
import {
  Users, Search, Shield, UserCheck, UserX,
  ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, RefreshCw, Eye, Edit2, Activity,
} from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { userService } from '@/services';
import { UserType } from '@/types';
import type { User } from '@/types';

// ─── 역할 레이블 ────────────────────────────────────
const USER_TYPE_LABELS: Record<UserType, string> = {
  [UserType.ADMIN]:             '관리자',
  [UserType.COACH]:             '코치',
  [UserType.PARENT]:            '학부모',
  [UserType.CHILD]:             '어린이',
  [UserType.TEEN]:              'TEEN',
  [UserType.DIRECTOR]:          '감독',
  [UserType.ACADEMY_DIRECTOR]:  '오픈클래스 감독',
};

// ─── 역할별 스타일 (Tailwind purge 대응: 전체 문자열 사용) ──
const TYPE_CONFIG: Record<UserType, {
  topBorder:  string;
  leftBorder: string;
  avatarBg:   string;
  avatarText: string;
  badge:      string;
}> = {
  [UserType.ADMIN]: {
    topBorder:  'border-t-slate-800 dark:border-t-slate-400',
    leftBorder: 'border-l-slate-800 dark:border-l-slate-400',
    avatarBg:   'bg-slate-800 dark:bg-slate-600',
    avatarText: 'text-white',
    badge:      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-500',
  },
  [UserType.COACH]: {
    topBorder:  'border-t-blue-600',
    leftBorder: 'border-l-blue-600',
    avatarBg:   'bg-blue-600',
    avatarText: 'text-white',
    badge:      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  },
  [UserType.PARENT]: {
    topBorder:  'border-t-emerald-600',
    leftBorder: 'border-l-emerald-600',
    avatarBg:   'bg-emerald-600',
    avatarText: 'text-white',
    badge:      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  },
  [UserType.CHILD]: {
    topBorder:  'border-t-amber-500',
    leftBorder: 'border-l-amber-500',
    avatarBg:   'bg-amber-400',
    avatarText: 'text-slate-900',
    badge:      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  },
  [UserType.TEEN]: {
    topBorder:  'border-t-violet-500',
    leftBorder: 'border-l-violet-500',
    avatarBg:   'bg-violet-500',
    avatarText: 'text-white',
    badge:      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700',
  },
  [UserType.DIRECTOR]: {
    topBorder:  'border-t-rose-600',
    leftBorder: 'border-l-rose-600',
    avatarBg:   'bg-rose-600',
    avatarText: 'text-white',
    badge:      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
  },
  [UserType.ACADEMY_DIRECTOR]: {
    topBorder:  'border-t-indigo-600',
    leftBorder: 'border-l-indigo-600',
    avatarBg:   'bg-indigo-600',
    avatarText: 'text-white',
    badge:      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700',
  },
};

// ─── 통계 카드 설정 ─────────────────────────────────
const STAT_CARDS: Array<{
  key:     'total' | 'admin' | 'coach' | 'parent' | 'active';
  label:   string;
  icon:    typeof Users;
  variant: MiniStatsCardVariant;
}> = [
  { key: 'total',  label: '전체 사용자', icon: Users,     variant: 'primary' },
  { key: 'admin',  label: '관리자',     icon: Shield,    variant: 'neutral' },
  { key: 'coach',  label: '코치',       icon: UserCheck, variant: 'info'    },
  { key: 'parent', label: '학부모',     icon: Users,     variant: 'success' },
  { key: 'active', label: '오늘 활동',   icon: Activity,  variant: 'warning' },
];

// ─── 타입 필터 목록 ─────────────────────────────────
const TYPE_FILTERS: { value: UserType | ''; label: string }[] = [
  { value: '',                           label: '전체' },
  { value: UserType.ADMIN,               label: '관리자' },
  { value: UserType.DIRECTOR,            label: '감독' },
  { value: UserType.ACADEMY_DIRECTOR,    label: '오픈클래스 감독' },
  { value: UserType.COACH,               label: '코치' },
  { value: UserType.PARENT,              label: '학부모' },
  { value: UserType.TEEN,                label: 'TEEN' },
  { value: UserType.CHILD,               label: '어린이' },
];

// ════════════════════════════════════════════════════
export default function UsersPage() {
  const [isLoading, setIsLoading]   = useState(true);
  const [users, setUsers]           = useState<User[]>([]);
  const [pagination, setPagination] = useState({
    page: 1, pageSize: 12, totalPages: 1, totalItems: 0,
  });
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedType, setSelectedType] = useState<UserType | ''>('');
  const [detailUser,    setDetailUser]    = useState<User | null>(null);
  const [editUser,      setEditUser]      = useState<User | null>(null);
  const [editForm,      setEditForm]      = useState({ name: '', phone: '', userType: '' as UserType });
  const [confirmUser,   setConfirmUser]   = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState({
    totalUsers:       0,
    byType:           [] as { type: UserType; count: number }[],
    newUsersThisMonth: 0,
    activeUsersToday: 0,
  });

  // ── 데이터 로드 ──────────────────────────────────
  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await userService.getUsers({
        page:      pagination.page,
        pageSize:  pagination.pageSize,
        userType:  selectedType || undefined,
        search:    searchQuery  || undefined,
      });
      setUsers(res.data ?? []);
      setPagination(prev => ({
        ...prev,
        totalPages: res.meta?.totalPages ?? 1,
        totalItems: res.meta?.totalItems ?? 0,
      }));
    } catch (error) {
      console.error('사용자 목록 조회 실패:', error);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.pageSize, searchQuery, selectedType]);

  const loadStats = useCallback(async () => {
    try {
      const data = await userService.getUserStats();
      setStats(data);
    } catch (error) {
      console.error('사용자 통계 조회 실패:', error);
    }
  }, []);

  useEffect(() => { loadUsers(); loadStats(); }, [loadUsers, loadStats]);

  useEffect(() => {
    const t = setTimeout(() => { if (searchQuery !== '') loadUsers(); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, loadUsers]);

  const handlePageChange  = (p: number) => setPagination(prev => ({ ...prev, page: p }));
  const handleTypeFilter  = (t: UserType | '') => { setSelectedType(t); setPagination(prev => ({ ...prev, page: 1 })); };
  const handleRefresh     = () => { loadUsers(); loadStats(); };

  const handleDetail = (user: User) => setDetailUser(user);

  const handleEdit = (user: User) => {
    setEditUser(user);
    setEditForm({ name: user.name || '', phone: user.phone || '', userType: user.userType });
  };

  const handleSave = async () => {
    if (!editUser) return;
    setActionLoading(true);
    try {
      await userService.updateUser(editUser.id, {
        name:     editForm.name  || undefined,
        phone:    editForm.phone || undefined,
        userType: editForm.userType,
      });
      setEditUser(null);
      loadUsers();
    } catch (e) { console.error('[Users] 수정 실패:', e); }
    finally     { setActionLoading(false); }
  };

  const handleDeactivate = async () => {
    if (!confirmUser) return;
    setActionLoading(true);
    try {
      await userService.deactivateUser(confirmUser.id);
      setConfirmUser(null);
      loadUsers();
    } catch (e) { console.error('[Users] 비활성화 실패:', e); }
    finally     { setActionLoading(false); }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });

  const formatDateTime = (s: string | undefined) => {
    if (!s) return '기록 없음';
    const diff = Date.now() - new Date(s).getTime();
    const h    = Math.floor(diff / 3_600_000);
    const d    = Math.floor(diff / 86_400_000);
    if (h < 1)   return '방금 전';
    if (h < 24)  return `${h}시간 전`;
    if (d < 7)   return `${d}일 전`;
    return formatDate(s);
  };

  const getTypeCount = (type: UserType) =>
    stats.byType.find(t => t.type === type)?.count ?? 0;

  const statValues: Record<typeof STAT_CARDS[number]['key'], number> = {
    total:  stats.totalUsers,
    admin:  getTypeCount(UserType.ADMIN),
    coach:  getTypeCount(UserType.COACH),
    parent: getTypeCount(UserType.PARENT),
    active: stats.activeUsersToday,
  };

  if (isLoading && users.length === 0) {
    return <LoadingSpinner message="사용자 목록을 불러오는 중..." />;
  }

  return (
    <div className="space-y-6 pb-10">

      {/* ── 페이지 헤더 ─────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">사용자 관리</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">시스템에 등록된 모든 사용자를 조회하고 관리합니다</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="h-12 px-5 flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          새로고침
        </button>
      </div>

      {/* ── 통계 카드 ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {STAT_CARDS.map(({ key, label, icon: Icon, variant }) => (
          <MiniStatsCard
            key={key}
            title={label}
            value={statValues[key]}
            icon={<Icon className="w-5 h-5" />}
            variant={variant}
          />
        ))}
      </div>

      {/* ── 검색 + 필터 ──────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-md">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 검색 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="이름, 이메일, 전화번호로 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-slate-50 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-sm"
            />
          </div>
          {/* 타입 필터 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {TYPE_FILTERS.map(f => (
              <button
                type="button"
                key={f.value}
                onClick={() => handleTypeFilter(f.value)}
                aria-pressed={selectedType === f.value}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors motion-reduce:transition-none ${
                  selectedType === f.value
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 결과 요약 ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          총 <span className="font-semibold text-slate-800 dark:text-slate-200">{pagination.totalItems}</span>명
          {selectedType && <span> · <span className="text-primary font-medium">{USER_TYPE_LABELS[selectedType as UserType]}</span> 필터 적용</span>}
        </p>
        {searchQuery && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">&ldquo;{searchQuery}&rdquo;</span> 검색 결과
          </p>
        )}
      </div>

      {/* ── 사용자 목록 ─────────────────────────────── */}
      {users.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 py-20 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <Users className="w-7 h-7 text-slate-300 dark:text-slate-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {searchQuery || selectedType ? '검색 결과가 없습니다' : '등록된 사용자가 없습니다'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {searchQuery || selectedType ? '검색 조건을 변경하거나 필터를 해제해 보세요.' : '사용자가 가입하면 이곳에 표시됩니다.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
            {/* 테이블 헤더 */}
            <div className="hidden sm:grid sm:grid-cols-[48px_1fr_100px_140px_140px_120px_110px] gap-0 px-5 py-3.5 bg-slate-50 dark:bg-slate-900/50 border-b-2 border-slate-200 dark:border-slate-600">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center">#</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-3">사용자</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-3">역할</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-3">연락처</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-3">마지막 활동</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-3">가입일</span>
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-center">관리</span>
            </div>

            {/* 사용자 행 */}
            {users.map((user, index) => {
              const cfg = TYPE_CONFIG[user.userType];
              const isEven = index % 2 === 0;
              const rowNumber = (pagination.page - 1) * pagination.pageSize + index + 1;

              // 온라인 상태: 최근 15분 이내 활동 시 온라인
              const isOnline = user.lastLoginAt
                ? (Date.now() - new Date(user.lastLoginAt).getTime()) < 15 * 60 * 1000
                : false;

              return (
                <div
                  key={user.id}
                  className={`group transition-colors duration-150 border-l-[3px] ${cfg.leftBorder} ${
                    isEven
                      ? 'bg-white dark:bg-slate-800'
                      : 'bg-slate-50 dark:bg-slate-800/50'
                  } hover:bg-blue-50 dark:hover:bg-slate-700/60 border-b border-slate-200 dark:border-slate-700`}
                >
                  {/* 데스크톱 레이아웃 */}
                  <div className="hidden sm:grid sm:grid-cols-[48px_1fr_100px_140px_140px_120px_110px] gap-0 items-center px-5 py-4">
                    {/* 번호 */}
                    <div className="flex items-center justify-center border-r border-slate-100 dark:border-slate-700 mr-1">
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 tabular-nums">
                        {rowNumber}
                      </span>
                    </div>

                    {/* 사용자 정보 */}
                    <div className="flex items-center gap-3 min-w-0 pl-3">
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cfg.avatarBg}`}>
                          <span className={`text-sm font-bold ${cfg.avatarText}`}>
                            {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        {/* 온라인/오프라인 인디케이터 */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                            isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                          title={isOnline ? '온라인' : '오프라인'}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate leading-tight">
                          {user.name || '이름 미등록'}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5 font-normal">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    {/* 역할 */}
                    <div className="pl-3 border-l border-slate-100 dark:border-slate-700">
                      <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 ${cfg.badge}`}>
                        {USER_TYPE_LABELS[user.userType]}
                      </Badge>
                    </div>

                    {/* 연락처 */}
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate pl-3 border-l border-slate-100 dark:border-slate-700">
                      {user.phone || '-'}
                    </span>

                    {/* 마지막 활동 */}
                    <div className="flex items-center gap-1.5 pl-3 border-l border-slate-100 dark:border-slate-700">
                      <span className={`text-sm ${
                        isOnline
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {isOnline ? '활동 중' : formatDateTime(user.lastLoginAt)}
                      </span>
                    </div>

                    {/* 가입일 */}
                    <span className="text-sm text-slate-500 dark:text-slate-400 pl-3 border-l border-slate-100 dark:border-slate-700">
                      {formatDate(user.createdAt)}
                    </span>

                    {/* 액션 */}
                    <div className="flex items-center justify-center gap-0.5 pl-3 border-l border-slate-100 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => handleDetail(user)}
                        className="relative p-2 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none group/btn"
                        title="상세"
                        aria-label={`${user.name || user.email} 상세보기`}
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium text-white bg-slate-800 dark:bg-slate-600 rounded-md whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity motion-reduce:transition-none pointer-events-none">
                          상세보기
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(user)}
                        className="relative p-2 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors motion-reduce:transition-none group/btn"
                        title="수정"
                        aria-label={`${user.name || user.email} 수정하기`}
                      >
                        <Edit2 className="w-4 h-4" aria-hidden="true" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium text-white bg-slate-800 dark:bg-slate-600 rounded-md whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity motion-reduce:transition-none pointer-events-none">
                          수정하기
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmUser(user)}
                        className="relative p-2 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors motion-reduce:transition-none group/btn"
                        title="비활성화"
                        aria-label={`${user.name || user.email} 비활성화`}
                      >
                        <UserX className="w-4 h-4" aria-hidden="true" />
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium text-white bg-slate-800 dark:bg-slate-600 rounded-md whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity motion-reduce:transition-none pointer-events-none">
                          비활성화
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* 모바일 레이아웃 */}
                  <div className="sm:hidden px-4 py-4">
                    <div className="flex items-center gap-3">
                      {/* 순번 */}
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 tabular-nums w-5 text-center shrink-0">
                        {rowNumber}
                      </span>
                      <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.avatarBg}`}>
                          <span className={`text-sm font-bold ${cfg.avatarText}`}>
                            {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${
                            isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {user.name || '이름 미등록'}
                          </p>
                          <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 shrink-0 ${cfg.badge}`}>
                            {USER_TYPE_LABELS[user.userType]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {user.email}
                          </p>
                          {user.phone && (
                            <>
                              <span className="text-slate-300 dark:text-slate-600 text-[10px]">|</span>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                                {user.phone}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button type="button" onClick={() => handleDetail(user)} aria-label={`${user.name || user.email} 상세보기`} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors motion-reduce:transition-none">
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => handleEdit(user)} aria-label={`${user.name || user.email} 수정하기`} className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors motion-reduce:transition-none">
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── 페이지네이션 ── */}
          {(() => {
            const PAGE_GROUP_SIZE = 10;
            const currentGroup = Math.floor((pagination.page - 1) / PAGE_GROUP_SIZE);
            const groupStart = currentGroup * PAGE_GROUP_SIZE + 1;
            const groupEnd = Math.min(groupStart + PAGE_GROUP_SIZE - 1, pagination.totalPages);
            const pages = Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i);

            return (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
                <div className="flex items-center justify-center gap-0.5">
                  {/* << 첫 페이지 */}
                  <button
                    type="button"
                    onClick={() => handlePageChange(1)}
                    disabled={pagination.page === 1}
                    className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                      pagination.page === 1
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="첫 페이지"
                    aria-label="첫 페이지"
                  >
                    <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {/* < 이전 페이지 */}
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                      pagination.page === 1
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="이전 페이지"
                    aria-label="이전 페이지"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {/* 페이지 번호 (10개 그룹) */}
                  <div className="flex items-center mx-1">
                    {pages.map((page, idx) => (
                      <div key={page} className="flex items-center">
                        <button
                          type="button"
                          onClick={() => handlePageChange(page)}
                          aria-current={pagination.page === page ? 'page' : undefined}
                          className={`min-w-[36px] h-9 px-2 rounded-lg text-sm font-semibold transition-colors motion-reduce:transition-none ${
                            pagination.page === page
                              ? 'bg-primary text-white shadow-md'
                              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {page}
                        </button>
                        {idx < pages.length - 1 && (
                          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* > 다음 페이지 */}
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                      pagination.page === pagination.totalPages
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="다음 페이지"
                    aria-label="다음 페이지"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>

                  {/* >> 마지막 페이지 */}
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.totalPages)}
                    disabled={pagination.page === pagination.totalPages}
                    className={`p-2 rounded-lg transition-colors motion-reduce:transition-none ${
                      pagination.page === pagination.totalPages
                        ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    title="마지막 페이지"
                    aria-label="마지막 페이지"
                  >
                    <ChevronsRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <p className="text-center mt-2 text-xs text-slate-400 dark:text-slate-500">
                  총 {pagination.totalItems}명 중{' '}
                  {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalItems)}명 표시
                  {pagination.totalPages > PAGE_GROUP_SIZE && (
                    <span className="ml-2 text-slate-300 dark:text-slate-600">
                      ({currentGroup + 1}/{Math.ceil(pagination.totalPages / PAGE_GROUP_SIZE)} 그룹)
                    </span>
                  )}
                </p>
              </div>
            );
          })()}
        </>
      )}

      {/* ── 상세보기 모달 ────────────────────────────────── */}
      <Modal isOpen={!!detailUser} onClose={() => setDetailUser(null)} size="md">
        {detailUser && (
          <>
            <ModalHeader title="사용자 상세" />
            <ModalBody>
              <div className="space-y-3.5">
                {([
                  { label: 'ID',        value: detailUser.id },
                  { label: '이메일',    value: detailUser.email },
                  { label: '전화번호',  value: detailUser.phone || '미등록' },
                  { label: '이름',      value: detailUser.name || '미등록' },
                  { label: '역할',      value: USER_TYPE_LABELS[detailUser.userType] },
                  { label: '가입일',    value: formatDate(detailUser.createdAt) },
                  { label: '마지막 활동', value: formatDateTime(detailUser.lastLoginAt) },
                ] as { label: string; value: string }[]).map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <span className="w-24 text-xs font-medium text-slate-400 dark:text-slate-500 shrink-0 pt-0.5">{label}</span>
                    <span className="text-sm text-slate-800 dark:text-slate-200 break-all">{value}</span>
                  </div>
                ))}
              </div>
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={() => setDetailUser(null)} className="w-full py-2.5 min-h-[44px] rounded-lg bg-slate-100 dark:bg-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors motion-reduce:transition-none">
                닫기
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* ── 수정 모달 ───────────────────────────────────── */}
      <Modal isOpen={!!editUser} onClose={() => setEditUser(null)} size="md">
        {editUser && (
          <>
            <ModalHeader title="사용자 수정" />
            <ModalBody>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">이름</label>
                  <Input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="이름 입력"
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">전화번호</label>
                  <Input
                    value={editForm.phone}
                    onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="01012345678"
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">역할</label>
                  <select
                    value={editForm.userType}
                    onChange={e => setEditForm(f => ({ ...f, userType: e.target.value as UserType }))}
                    className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 px-3 focus:outline-none focus:ring-2 focus:ring-blue-800"
                  >
                    {TYPE_FILTERS.filter(f => f.value !== '').map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={() => setEditUser(null)} className="flex-1 py-2.5 min-h-[44px] rounded-lg bg-slate-100 dark:bg-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors motion-reduce:transition-none">
                취소
              </button>
              <button type="button" onClick={handleSave} disabled={actionLoading} className="flex-1 py-2.5 min-h-[44px] rounded-lg bg-primary text-sm font-semibold text-white hover:bg-primary-dark shadow-md disabled:opacity-60 transition-colors motion-reduce:transition-none">
                {actionLoading ? '저장 중...' : '저장하기'}
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* ── 비활성화 확인 모달 ──────────────────────────── */}
      <ConfirmModal
        isOpen={!!confirmUser}
        onClose={() => setConfirmUser(null)}
        onConfirm={handleDeactivate}
        title="비활성화 확인"
        description={`${confirmUser?.name || confirmUser?.email || ''} 계정을 비활성화하시겠습니까?`}
        variant="danger"
        confirmText="비활성화"
        cancelText="취소"
        isLoading={actionLoading}
        size="sm"
      />

    </div>
  );
}
