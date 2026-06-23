'use client';

import { useState, useCallback, useId, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useToast } from '@/components/ui/Toast';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useAcademyDetail, useAcademyCoaches } from '@/hooks/useAcademy';
import { AcademyStudentsTab } from '@/components/academy/AcademyStudentsTab';
import { AcademyCoachList } from '@/components/academy/AcademyCoachList';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

type TabKey = 'overview' | 'students' | 'coaches' | 'notice';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '개요', icon: 'info' },
  { key: 'students', label: MESSAGES.academy.students.tabLabel, icon: 'group' },
  { key: 'coaches', label: '코치', icon: 'sports' },
  { key: 'notice', label: '공지', icon: 'campaign' },
];

function normalizeTabKey(raw: string | null): TabKey | null {
  if (!raw) return null;
  // backward-compat: 'members' → 'students'
  if (raw === 'members') return 'students';
  if (raw === 'overview' || raw === 'students' || raw === 'coaches' || raw === 'notice') {
    return raw;
  }
  return null;
}

/* ─── 공지 발송 폼 ─────────────────────────────── */
function NoticeForm({ academyId }: { academyId: string }) {
  const titleId = useId();
  const messageId = useId();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleSend = useCallback(async () => {
    if (!title.trim() || !message.trim()) {
      toast.error(MESSAGES.academy.noticeInputRequired);
      return;
    }
    setIsSending(true);
    try {
      const res = await api.post<{ sentCount: number }>(`/academies/${academyId}/notices`, {
        title: title.trim(),
        message: message.trim(),
      });
      if (res.success && res.data) {
        toast.success(MESSAGES.academy.noticeSent(res.data.sentCount));
        setTitle('');
        setMessage('');
      } else {
        toast.error(MESSAGES.error.general);
      }
    } catch {
      toast.error(MESSAGES.error.general);
    } finally {
      setIsSending(false);
    }
  }, [academyId, title, message, toast]);

  return (
    <section
      aria-label="공지 발송"
      className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm space-y-5"
    >
      <header>
        <h3 className="text-xl font-bold text-wtext-1 dark:text-white tracking-tight">
          새 공지 발송
        </h3>
        <p className="mt-1 text-card-body font-medium text-wtext-3 dark:text-rink-300">
          {MESSAGES.academy.noticeRecipientHint}
        </p>
      </header>

      <div>
        <label
          htmlFor={titleId}
          className="mb-1.5 flex items-center gap-1 text-card-body font-bold text-wtext-2 dark:text-rink-100"
        >
          {MESSAGES.academy.noticeTitle}
          <span className="text-red-500" aria-label="필수 입력">*</span>
        </label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={MESSAGES.academy.noticeTitlePlaceholder}
          maxLength={100}
          required
          aria-required="true"
          className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-rink-700 bg-wbg dark:bg-rink-900 text-card-body font-medium text-wtext-1 dark:text-white focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 motion-reduce:transition-none"
        />
      </div>

      <div>
        <label
          htmlFor={messageId}
          className="mb-1.5 flex items-center gap-1 text-card-body font-bold text-wtext-2 dark:text-rink-100"
        >
          {MESSAGES.academy.noticeContent}
          <span className="text-red-500" aria-label="필수 입력">*</span>
        </label>
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={MESSAGES.academy.noticeContentPlaceholder}
          maxLength={2000}
          rows={6}
          required
          aria-required="true"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-rink-700 bg-wbg dark:bg-rink-900 text-card-body font-medium text-wtext-1 dark:text-white focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 resize-none motion-reduce:transition-none"
        />
        <p className="mt-1.5 text-right text-card-meta font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
          {message.length} / 2000
        </p>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={isSending || !title.trim() || !message.trim()}
        className={cn(
          'w-full inline-flex h-12 items-center justify-center gap-1.5 rounded-xl text-card-emphasis font-bold transition-colors motion-reduce:transition-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
          isSending || !title.trim() || !message.trim()
            ? 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300 cursor-not-allowed'
            : 'bg-ice-500 text-white hover:bg-ice-700 active:brightness-95',
        )}
      >
        {!isSending && <Icon name="send" className="text-[18px]" aria-hidden="true" />}
        {isSending ? MESSAGES.academy.noticeSending : MESSAGES.academy.noticeSendButton}
      </button>
    </section>
  );
}

/**
 * AcademyDetailPage - 오픈클래스 상세 관리 (탭 UI)
 * Route: /academy/[id] (coach layout)
 */
export default function AcademyDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const academyId = typeof params?.id === 'string' ? params.id : null;

  const { academy, isLoading: isDetailLoading } = useAcademyDetail(academyId);
  const { coaches, isLoading: isCoachesLoading, refresh: refreshCoaches } = useAcademyCoaches(academyId);
  const { navigate } = useNavigation();
  const { toast } = useToast();

  const initialTab = normalizeTabKey(searchParams?.get('tab') ?? null) ?? 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [codeCopied, setCodeCopied] = useState(false);

  // URL ?tab= 변경 시 탭 상태 동기화 (backward-compat: members → students)
  useEffect(() => {
    const next = normalizeTabKey(searchParams?.get('tab') ?? null);
    if (next && next !== activeTab) {
      setActiveTab(next);
    }
    // activeTab 은 의도적으로 deps 에서 제외 — URL 변경만 추적
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // [수정 2026-05-18 SPEC v3] 'students' 탭일 때는 AcademyStudentsTab 이 자체적으로
  //   usePageReady(검색 모드별 데이터 + layout stable 합성) 호출함. 본 page 의 신호가
  //   먼저 fire 되면 LoadingContext 가 첫 신호로 사이클 종료해 Tab 의 보수적 신호를
  //   덮어쓸 수 있어 LOADING_TIMING_POLICY v16 §11 위반 가능. activeTab='students'
  //   일 때만 page 신호 발화를 보류하고, Tab 에 위임.
  usePageReady(!isDetailLoading && activeTab !== 'students');

  // 상세 뷰 — SPEC §5 Step D 권고에 따라 isDataLoaded 가드 제거.
  //  fetch 실패 시 status bar 영구 숨김 회귀 방지.
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: academy?.name ?? MESSAGES.academy.manage,
    showBottomNav: true,
  });

  const handleCopyCode = useCallback(async () => {
    if (!academy?.code) return;
    try {
      await navigator.clipboard.writeText(academy.code);
      setCodeCopied(true);
      toast.success(MESSAGES.academy.codeCopied);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast.error(MESSAGES.error.general);
    }
  }, [academy?.code, toast]);

  const handleEdit = useCallback(() => {
    if (!academyId) return;
    navigate(`/academy/create?edit=${academyId}`);
  }, [academyId, navigate]);

  const handleRemoveCoach = useCallback(async (coachId: string) => {
    const res = await api.delete(`/academies/${academyId}/coaches/${coachId}`);
    if (res.success) {
      toast.success(MESSAGES.academy.coachRemoved);
      refreshCoaches();
    } else {
      toast.error(MESSAGES.error.general);
    }
  }, [academyId, toast, refreshCoaches]);

  if (isDetailLoading) return null;

  if (!academy) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={MESSAGES.academy.manage} />
        <div className="flex flex-col items-center justify-center px-6 py-20">
          <Icon name="error_outline" className="text-4xl text-wtext-4 dark:text-rink-500 mb-3" />
          <p className="text-card-body text-wtext-3 dark:text-rink-300">{MESSAGES.error.general}</p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={academy.name} />

      <main className="flex-1 overflow-y-auto hide-scrollbar">
        {/* Hero 섹션 */}
        <section className="px-5 pt-6 pb-5">
          <p className="text-card-meta font-bold uppercase tracking-[0.18em] text-ice-500 mb-2">
            Academy Detail
          </p>
          <h2 className="text-3xl font-black text-wtext-1 dark:text-white leading-tight tracking-tight line-clamp-2">
            {academy.name}
          </h2>
          {academy.region && (
            <p className="mt-2 inline-flex items-center gap-1 text-card-body font-semibold text-wtext-3 dark:text-rink-300">
              <Icon name="place" className="text-[16px]" aria-hidden="true" />
              {academy.region}
            </p>
          )}
        </section>

        {/* 탭 네비게이션 */}
        <div
          className="sticky top-0 z-10 bg-wbg dark:bg-rink-900 border-b border-wline-2 dark:border-rink-800"
          role="tablist"
          aria-label="오픈클래스 섹션"
        >
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-card-body font-bold transition-colors motion-reduce:transition-none',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-inset',
                  activeTab === tab.key
                    ? 'text-ice-500 border-b-2 border-ice-500'
                    : 'text-wtext-3 dark:text-rink-300 border-b-2 border-transparent',
                )}
              >
                <Icon name={tab.icon} className="text-card-emphasis" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-6 pb-28">
          {/* ── 개요 탭 ── */}
          {activeTab === 'overview' && (
            <div className="space-y-6" role="tabpanel">
              {/* 오픈클래스 코드 */}
              <section
                aria-label="오픈클래스 코드"
                className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-5 shadow-sm"
              >
                <p className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-2">
                  {MESSAGES.academy.codeLabel}
                </p>
                <div className="flex items-center gap-3">
                  <code className="flex-1 text-2xl font-mono font-black text-ice-500 tracking-[0.2em]">
                    {academy.code}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="shrink-0 inline-flex h-10 items-center gap-1 rounded-xl bg-wline-2 dark:bg-rink-700 px-3 text-card-body font-bold text-wtext-2 dark:text-rink-100 hover:bg-wline dark:hover:bg-rink-500 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
                    aria-label="오픈클래스 코드 복사"
                  >
                    <Icon name={codeCopied ? 'check' : 'content_copy'} className="text-[16px]" aria-hidden="true" />
                    {codeCopied ? '복사됨' : '복사'}
                  </button>
                </div>
              </section>

              {/* 통계 — 대담한 숫자 */}
              <section aria-label="오픈클래스 통계" className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 text-center shadow-sm">
                  <p className="text-3xl font-black text-ice-500 tabular-nums">
                    {academy._count?.members ?? 0}
                  </p>
                  <p className="mt-1 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                    수강생
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 text-center shadow-sm">
                  <p className="text-3xl font-black text-ice-500 tabular-nums">
                    {academy._count?.coaches ?? 0}
                  </p>
                  <p className="mt-1 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                    코치
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 p-4 text-center shadow-sm">
                  <p className="text-3xl font-black text-ice-500 tabular-nums">
                    {academy._count?.classes ?? 0}
                  </p>
                  <p className="mt-1 text-card-meta font-bold text-wtext-3 dark:text-rink-300">
                    수업
                  </p>
                </div>
              </section>

              {/* 오픈클래스 정보 */}
              <section
                aria-label="오픈클래스 정보"
                className="rounded-2xl border border-gray-200 dark:border-rink-700 bg-white dark:bg-rink-800 shadow-sm overflow-hidden"
              >
                <h3 className="border-b border-wline-2 dark:border-rink-700 px-5 py-3.5 text-card-emphasis font-bold text-wtext-1 dark:text-white">
                  오픈클래스 정보
                </h3>
                <dl className="divide-y divide-slate-100 dark:divide-slate-700">
                  {academy.description && (
                    <div className="px-5 py-4">
                      <dt className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-1">
                        소개
                      </dt>
                      <dd className="text-card-body font-medium text-wtext-1 dark:text-white leading-relaxed">
                        {academy.description}
                      </dd>
                    </div>
                  )}
                  {academy.region && (
                    <div className="px-5 py-4">
                      <dt className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-1">
                        지역
                      </dt>
                      <dd className="text-card-body font-semibold text-wtext-1 dark:text-white">
                        {academy.region}
                      </dd>
                    </div>
                  )}
                  {academy.contactPhone && (
                    <div className="px-5 py-4">
                      <dt className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-1">
                        연락처
                      </dt>
                      <dd className="text-card-body font-semibold text-wtext-1 dark:text-white tabular-nums">
                        {academy.contactPhone}
                      </dd>
                    </div>
                  )}
                  {academy.contactEmail && (
                    <div className="px-5 py-4">
                      <dt className="text-card-meta font-bold uppercase tracking-wider text-wtext-3 dark:text-rink-300 mb-1">
                        이메일
                      </dt>
                      <dd className="text-card-body font-semibold text-wtext-1 dark:text-white break-all">
                        {academy.contactEmail}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* 편집 버튼 */}
              <button
                type="button"
                onClick={handleEdit}
                className="w-full inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border-2 border-ice-500 text-ice-500 text-card-emphasis font-bold hover:bg-ice-500/5 dark:hover:bg-ice-500/10 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="edit" className="text-[18px]" aria-hidden="true" />
                수정하기
              </button>
            </div>
          )}

          {/* ── 수강생 탭 (Master-Detail Drill-down) ── */}
          {activeTab === 'students' && academyId && (
            <AcademyStudentsTab academyId={academyId} />
          )}

          {/* ── 코치 탭 ── */}
          {activeTab === 'coaches' && (
            <AcademyCoachList
              coaches={coaches}
              onRemove={handleRemoveCoach}
              isLoading={isCoachesLoading}
            />
          )}

          {/* 공지 발송 탭 */}
          {activeTab === 'notice' && academyId && (
            <NoticeForm academyId={academyId} />
          )}
        </div>
      </main>
    </MobileContainer>
  );
}
