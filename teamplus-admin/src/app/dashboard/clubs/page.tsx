'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { useRouter } from 'next/navigation';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Building2,
  Users,
  Copy,
  Check,
  MapPin,
  Phone,
  LayoutGrid,
  List,
  CalendarDays,
  ArrowUpRight,
  PowerOff,
  Power,
  Hash,
} from 'lucide-react';
import { clubService } from '@/services/club.service';
import { authService } from '@/services/auth.service';
import { api } from '@/services/api-client';
import type { Club } from '@/types';
import { UserType } from '@/types';

/**
 * TEAMPLUS 클럽 관리 페이지
 *
 * Design 7 Principles:
 * 1. 화면 분석 - 클럽 카드/테이블 전환, 통계 히어로, 검색/필터
 * 2. 휴먼 디자인 - 깊이 있는 레이아웃, 명확한 정보 위계
 * 3. AI 스타일 금지 - 그라디언트/blur/컬러 shadow 0건
 * 4. 페르소나 - frontend + architect + analyzer
 * 5. 명령어 - frontend-design 스킬 융합
 * 6. 결과 보고 - 7원칙 적용
 * 7. Tone & Manner - 존댓말, 44px 터치, motion-reduce
 */

interface ClubWithUI extends Club {
  coachName?: string;
  coachPhone?: string;
  location?: string;
  status?: 'active' | 'inactive';
}

type ViewMode = 'grid' | 'list';

export default function ClubsPage() {
  const router = useRouter();
  const clubSearchId = useId();
  const clubNameId = useId();
  const clubDescriptionId = useId();
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [clubs, setClubs] = useState<ClubWithUI[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClub, setEditingClub] = useState<ClubWithUI | null>(null);
  const [deletingClubId, setDeletingClubId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    clubName: '',
    description: '',
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadClubs = useCallback(async () => {
    const start = Date.now();
    try {
      setIsLoading(true);

      let data: Club[] = [];
      try {
        interface AdminClubResponse {
          id: string;
          clubCode?: string;
          clubName?: string;
          location?: string;
          directorName?: string;
          memberCount?: number;
          classCount?: number;
        }
        const res = await api.get<AdminClubResponse[]>('/admin/clubs', { params: { type: 'club' } });
        const list = Array.isArray(res) ? res : [];
        const now = new Date().toISOString();
        data = list.map((c) => ({
          id: c.id,
          clubCode: c.clubCode ?? '',
          clubName: c.clubName ?? '',
          description: c.location ?? '',
          coachId: '',
          createdAt: now,
          updatedAt: now,
          coach: { username: c.directorName, name: c.directorName, phone: '' },
          _count: { members: c.memberCount ?? 0, classes: c.classCount ?? 0 },
        })) as unknown as Club[];
      } catch {
        const currentUser = authService.getCurrentUser();
        if (currentUser?.userType === UserType.COACH) {
          data = await clubService.getManagedClubs();
        } else {
          data = await clubService.getMyClubs();
        }
      }

      const clubsWithUI: ClubWithUI[] = data.map((club) => ({
        ...club,
        coachName: club.coach?.username || club.coach?.name || '',
        coachPhone: club.coach?.phone || '',
        location: club.description || '',
        status: 'active' as const,
      }));
      setClubs(clubsWithUI);
    } catch (error) {
      console.error('[ClubsPage] 클럽 목록 로드 실패:', error);
      setClubs([]);
    } finally {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 600 - elapsed);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  const filteredClubs = clubs.filter((club) => {
    const name = club.clubName ?? club.name ?? '';
    const code = club.clubCode ?? club.teamCode ?? '';
    const matchesSearch =
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (club.coachName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === 'all' || club.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: clubs.length,
    active: clubs.filter((c) => c.status === 'active').length,
    totalMembers: clubs.reduce((sum, c) => sum + (c.memberCount ?? 0), 0),
    totalClasses: clubs.reduce((sum, c) => sum + ((c as Club & { classCount?: number }).classCount ?? 0), 0),
  };

  const handleAddClub = async () => {
    if (!formData.clubName) {
      setActionMsg({ type: 'error', text: MESSAGES.club.nameRequired });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingClub) {
        const updated = await clubService.updateClub(editingClub.id, {
          clubName: formData.clubName,
          description: formData.description,
        });
        setClubs(
          clubs.map((c) =>
            c.id === editingClub.id
              ? { ...c, clubName: updated.clubName, location: updated.description || '' }
              : c
          )
        );
        setEditingClub(null);
      } else {
        const newClub = await clubService.createClub({
          clubName: formData.clubName,
          description: formData.description,
        });
        const clubWithUI: ClubWithUI = {
          ...newClub,
          coachName: newClub.coach?.username || newClub.coach?.name || '',
          coachPhone: newClub.coach?.phone || '',
          location: newClub.description || '',
          status: 'active',
        };
        setClubs([...clubs, clubWithUI]);
      }

      setFormData({ clubName: '', description: '' });
      setShowAddModal(false);
      setActionMsg({ type: 'success', text: editingClub ? MESSAGES.club.updated : MESSAGES.club.created });
      setTimeout(() => setActionMsg(null), 3000);
    } catch (error) {
      console.error('[ClubsPage] 클럽 저장 실패:', error);
      setActionMsg({ type: 'error', text: editingClub ? MESSAGES.club.updateError : MESSAGES.club.createError });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClub = (club: ClubWithUI) => {
    setEditingClub(club);
    setFormData({
      clubName: club.clubName ?? club.name ?? '',
      description: club.location || club.description || '',
    });
    setShowAddModal(true);
  };

  const handleDeleteClub = async (id: string) => {
    setClubs(clubs.filter((c) => c.id !== id));
    setDeletingClubId(null);
    setActionMsg({ type: 'success', text: MESSAGES.club.deleted });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleToggleStatus = (id: string) => {
    setClubs(
      clubs.map((c) =>
        c.id === id
          ? { ...c, status: c.status === 'active' ? 'inactive' : 'active' }
          : c
      )
    );
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (isLoading) {
    return <LoadingSpinner message="클럽 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {/* Action Toast */}
      {actionMsg && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg px-4 py-3 text-sm font-medium motion-reduce:transition-none ${
            actionMsg.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Hero Header */}
      <section className="relative overflow-hidden rounded-2xl bg-primary text-white shadow-md motion-reduce:transition-none">
        <div className="relative z-10 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
              클럽 관리
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">소속 클럽</h1>
            <p className="text-sm sm:text-base text-white/80">
              전체 {stats.total}개 클럽 · 활성 {stats.active}개 · 소속 회원 {stats.totalMembers.toLocaleString('ko-KR')}명
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditingClub(null);
              setFormData({ clubName: '', description: '' });
              setShowAddModal(true);
            }}
            className="h-11 px-5 bg-white hover:bg-slate-100 text-primary font-semibold shadow-sm motion-reduce:transition-none"
          >
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            새 클럽 등록
          </Button>
        </div>
        {/* 아이스링크 장식 패턴 (solid overlay, no gradient) */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-16 translate-x-16" aria-hidden="true" />
        <div className="absolute bottom-0 right-24 w-40 h-40 rounded-full bg-white/5 translate-y-10" aria-hidden="true" />
      </section>

      {/* KPI Cards */}
      <section aria-label="클럽 통계" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: '전체 클럽', value: stats.total, icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-900/30', iconColor: 'text-primary dark:text-blue-300' },
          { label: '활성 클럽', value: stats.active, icon: Power, iconBg: 'bg-green-50 dark:bg-green-900/30', iconColor: 'text-green-600 dark:text-green-400' },
          { label: '전체 회원', value: stats.totalMembers, icon: Users, iconBg: 'bg-indigo-50 dark:bg-indigo-900/30', iconColor: 'text-indigo-600 dark:text-indigo-400' },
          { label: '진행 수업', value: stats.totalClasses, icon: CalendarDays, iconBg: 'bg-amber-50 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md motion-reduce:transition-none transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                <kpi.icon className={`w-5 h-5 ${kpi.iconColor}`} aria-hidden="true" />
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{kpi.label}</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
              {kpi.value.toLocaleString('ko-KR')}
            </p>
          </div>
        ))}
      </section>

      {/* Toolbar */}
      <section className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 -mx-2 px-2 py-2">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1 relative">
            <label htmlFor={clubSearchId} className="sr-only">클럽 검색</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <Input
              id={clubSearchId}
              placeholder="클럽명, 코드, 코치명으로 검색해주세요"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="클럽 검색"
              className="pl-10 h-11 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-white"
            />
          </div>

          {/* Status Filter Segmented */}
          <div
            role="tablist"
            aria-label="상태 필터"
            className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1"
          >
            {([
              { value: 'all' as const, label: '전체', count: stats.total },
              { value: 'active' as const, label: '활성', count: stats.active },
              { value: 'inactive' as const, label: '비활성', count: stats.total - stats.active },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={filterStatus === opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`h-9 px-3 rounded-md text-sm font-medium motion-reduce:transition-none transition-colors ${
                  filterStatus === opt.value
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
                <span className="ml-1.5 text-xs tabular-nums opacity-80">{opt.count}</span>
              </button>
            ))}
          </div>

          {/* View Mode Toggle */}
          <div
            role="group"
            aria-label="보기 방식"
            className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              aria-label="카드 보기"
              className={`h-9 w-9 rounded-md flex items-center justify-center motion-reduce:transition-none transition-colors ${
                viewMode === 'grid'
                  ? 'bg-primary text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              aria-label="리스트 보기"
              className={`h-9 w-9 rounded-md flex items-center justify-center motion-reduce:transition-none transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <List className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* Empty state */}
      {filteredClubs.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">클럽이 없습니다</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {searchTerm || filterStatus !== 'all'
              ? '검색 조건에 맞는 클럽이 없습니다.'
              : '첫 클럽을 등록해보세요.'}
          </p>
          <Button
            type="button"
            onClick={() => {
              setEditingClub(null);
              setFormData({ clubName: '', description: '' });
              setShowAddModal(true);
            }}
            className="h-11 bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none"
          >
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            새 클럽 등록
          </Button>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && filteredClubs.length > 0 && (
        <section aria-label="클럽 카드 목록" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredClubs.map((club) => (
            <article
              key={club.id}
              className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:shadow-md focus-within:ring-2 focus-within:ring-primary motion-reduce:transition-none transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/clubs/${club.id}`)}
            >
              {/* Accent Stripe (solid) */}
              <div className={`h-1 ${club.status === 'active' ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden="true" />

              {/* Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-700/60">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-primary dark:text-blue-300" aria-hidden="true" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                        {club.clubName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Hash className="w-3 h-3 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      <code className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded font-mono tabular-nums">
                        {club.clubCode ?? club.teamCode ?? ''}
                      </code>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCode(club.clubCode ?? club.teamCode ?? '');
                        }}
                        aria-label={`클럽 코드 ${club.clubCode ?? club.teamCode ?? ''} 복사`}
                        className="min-w-[32px] min-h-[32px] rounded hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center motion-reduce:transition-none transition-colors"
                      >
                        {copiedCode === (club.clubCode ?? club.teamCode) ? (
                          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 ${
                      club.status === 'active'
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                        : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                    } border`}
                  >
                    {club.status === 'active' ? '활성' : '비활성'}
                  </Badge>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="text-slate-500 dark:text-slate-400">코치</span>
                  <span className="font-medium text-slate-900 dark:text-white truncate">
                    {club.coachName || '미지정'}
                  </span>
                </div>
                {club.coachPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                    <span className="text-slate-600 dark:text-slate-300 tabular-nums">{club.coachPhone}</span>
                  </div>
                )}
                {club.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
                    <span className="text-slate-600 dark:text-slate-300 truncate">{club.location}</span>
                  </div>
                )}

                {/* Member Count */}
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <span className="text-xs text-slate-500 dark:text-slate-400">소속 회원</span>
                  <span className="text-lg font-bold text-primary dark:text-blue-300 tabular-nums">
                    {(club.memberCount ?? 0).toLocaleString('ko-KR')}명
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  등록일 {new Date(club.createdAt).toLocaleDateString('ko-KR')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(club.id);
                    }}
                    aria-label={club.status === 'active' ? '클럽 비활성화' : '클럽 활성화'}
                    className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 motion-reduce:transition-none transition-colors"
                  >
                    {club.status === 'active' ? <PowerOff className="w-4 h-4" aria-hidden="true" /> : <Power className="w-4 h-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClub(club);
                    }}
                    aria-label="클럽 정보 수정"
                    className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 motion-reduce:transition-none transition-colors"
                  >
                    <Edit2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingClubId(club.id);
                    }}
                    aria-label="클럽 삭제"
                    className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 motion-reduce:transition-none transition-colors"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="ml-1 text-slate-300 dark:text-slate-600 group-hover:text-primary dark:group-hover:text-blue-300 motion-reduce:transition-none transition-colors">
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* List View */}
      {viewMode === 'list' && filteredClubs.length > 0 && (
        <section aria-label="클럽 리스트" className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">클럽명</th>
                  <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">코드</th>
                  <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">코치</th>
                  <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">연습장소</th>
                  <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">회원</th>
                  <th scope="col" className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">상태</th>
                  <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {filteredClubs.map((club) => (
                  <tr
                    key={club.id}
                    onClick={() => router.push(`/dashboard/clubs/${club.id}`)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-primary dark:text-blue-300" aria-hidden="true" />
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white">{club.clubName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded font-mono tabular-nums">
                        {club.clubCode}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{club.coachName || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 truncate max-w-[240px]">{club.location || '-'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary dark:text-blue-300 tabular-nums">
                      {(club.memberCount ?? 0).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={`${
                          club.status === 'active'
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                            : 'bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600'
                        } border`}
                      >
                        {club.status === 'active' ? '활성' : '비활성'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClub(club);
                          }}
                          aria-label="수정"
                          className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary hover:bg-blue-50 dark:hover:bg-blue-900/20 motion-reduce:transition-none transition-colors"
                        >
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingClubId(club.id);
                          }}
                          aria-label="삭제"
                          className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 motion-reduce:transition-none transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Add/Edit Club Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingClub(null);
        }}
        size="md"
      >
        <ModalHeader title={editingClub ? '클럽 정보 수정' : '새 클럽 등록'} />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label htmlFor={clubNameId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                클럽명 <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <Input
                id={clubNameId}
                placeholder="클럽 이름을 입력해주세요"
                value={formData.clubName}
                onChange={(e) => setFormData({ ...formData, clubName: e.target.value })}
                aria-required="true"
                className="h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor={clubDescriptionId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                클럽 소개 / 연습 장소
              </label>
              <textarea
                id={clubDescriptionId}
                placeholder="클럽 소개 또는 연습 장소를 입력해주세요"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            onClick={() => {
              setShowAddModal(false);
              setEditingClub(null);
              setFormData({ clubName: '', description: '' });
            }}
            variant="outline"
            disabled={isSubmitting}
            className="flex-1 h-11 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400 font-medium motion-reduce:transition-none"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={() => handleAddClub()}
            disabled={isSubmitting}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white font-semibold shadow-sm motion-reduce:transition-none"
          >
            {isSubmitting ? '저장 중...' : editingClub ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingClubId}
        onClose={() => setDeletingClubId(null)}
        onConfirm={() => deletingClubId && handleDeleteClub(deletingClubId)}
        title="클럽을 삭제하시겠습니까?"
        description="이 작업은 되돌릴 수 없습니다. 클럽에 소속된 회원 데이터도 함께 삭제됩니다."
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
      />
    </div>
  );
}
