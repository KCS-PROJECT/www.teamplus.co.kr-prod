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
import { useAcademyDetail } from '@/hooks/useAcademy';
import { AcademyStudentsTab } from '@/components/academy/AcademyStudentsTab';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

type TabKey = 'overview' | 'students' | 'notice';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '개요', icon: 'info' },
  { key: 'students', label: MESSAGES.academy.students.tabLabel, icon: 'group' },
  { key: 'notice', label: '공지', icon: 'campaign' },
];

function normalizeTabKey(raw: string | null): TabKey | null {
  if (!raw) return null;
  // backward-compat: 'members' → 'students'
  if (raw === 'members') return 'students';
  if (raw === 'overview' || raw === 'students' || raw === 'notice') {
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
      className="bg-it-surface dark:bg-it-blue-950 px-5 py-5 space-y-5"
    >
      <header>
        <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white">
          새 공지 발송
        </h3>
        <p className="mt-1 text-card-body font-medium text-it-ink-500 dark:text-rink-300">
          {MESSAGES.academy.noticeRecipientHint}
        </p>
      </header>

      <div>
        <label
          htmlFor={titleId}
          className="mb-1.5 flex items-center gap-1 text-card-body font-bold text-it-ink-800 dark:text-rink-100"
        >
          {MESSAGES.academy.noticeTitle}
          <span className="text-it-red-500" aria-label="필수 입력">*</span>
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
          className="w-full h-12 px-4 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-card-body font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500 motion-reduce:transition-none"
        />
      </div>

      <div>
        <label
          htmlFor={messageId}
          className="mb-1.5 flex items-center gap-1 text-card-body font-bold text-it-ink-800 dark:text-rink-100"
        >
          {MESSAGES.academy.noticeContent}
          <span className="text-it-red-500" aria-label="필수 입력">*</span>
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
          className="w-full px-4 py-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-fill dark:bg-rink-900 text-card-body font-medium text-it-ink-800 dark:text-white focus:outline-none focus:border-it-blue-500 resize-none motion-reduce:transition-none"
        />
        <p className="mt-1.5 text-right text-card-meta font-semibold text-it-ink-500 dark:text-rink-300 tabular-nums">
          {message.length} / 2000
        </p>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={isSending || !title.trim() || !message.trim()}
        className={cn(
          'w-full inline-flex h-12 items-center justify-center gap-1.5 rounded-w-md text-card-emphasis font-bold transition-colors motion-reduce:transition-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900',
          isSending || !title.trim() || !message.trim()
            ? 'bg-it-line dark:bg-rink-700 text-it-ink-400 dark:text-rink-300 cursor-not-allowed'
            : 'bg-it-blue-500 text-white hover:bg-it-blue-600 active:brightness-95',
        )}
      >
        {!isSending && <Icon name="send" className="text-[18px]" aria-hidden="true" />}
        {isSending ? MESSAGES.academy.noticeSending : MESSAGES.academy.noticeSendButton}
      </button>
    </section>
  );
}

/* ─── 개요 탭 섹션 제목 ─── 팀 정보 탭과 동일: 3px it-blue 막대 + 굵은 제목 */
function OverviewSectionTitle({ title }: { title: string }) {
  return (
    <div className="pb-2 flex items-center gap-2">
      <span
        className="inline-block w-[3px] h-[14px] rounded-[2px] bg-it-blue-500"
        aria-hidden="true"
      />
      <h3 className="text-card-body font-extrabold text-it-ink-800 dark:text-white tracking-tight">
        {title}
      </h3>
    </div>
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
  const { navigate } = useNavigation();
  const { toast } = useToast();

  const initialTab = normalizeTabKey(searchParams?.get('tab') ?? null) ?? 'overview';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

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

  const handleEdit = useCallback(() => {
    if (!academyId) return;
    navigate(`/academy/create?edit=${academyId}`);
  }, [academyId, navigate]);

  if (isDetailLoading) return null;

  if (!academy) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title={MESSAGES.academy.manage} />
        <div className="flex flex-col items-center justify-center px-6 py-20 bg-it-canvas dark:bg-puck">
          <Icon name="error_outline" className="text-4xl text-it-ink-400 dark:text-rink-500 mb-3" />
          <p className="text-card-body text-it-ink-500 dark:text-rink-300">{MESSAGES.error.general}</p>
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={academy.name} />

      <main className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8">
        {/* Hero — ICETIMES navy 히어로 (팀 상세 /team/[id] 와 통일).
            full-bleed navy 밴드 + 72px 흰 로고박스 + 이름 + 지역 chip + 코드 + Since 태그라인.
            8 절대 규칙 준수: gradient/backdrop-blur/colored shadow 0, it-* 토큰만. */}
        <div className="bg-it-blue-800 dark:bg-it-blue-950 px-5 pt-6 pb-7 text-white">
          <div className="flex items-center gap-4">
            {/* 로고 박스 — 72×72, 흰 배경 */}
            <div className="flex size-[72px] shrink-0 items-center justify-center rounded-w-2xl bg-white dark:bg-it-surface">
              {resolveImageSrc(academy.imageUrl) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveImageSrc(academy.imageUrl)}
                  alt=""
                  className="size-full rounded-w-2xl object-cover"
                />
              ) : (
                <Icon name="school" aria-hidden="true" className="text-[32px] text-it-blue-500" />
              )}
            </div>

            {/* 텍스트 영역 — 위계 3단계 (이름+지역 / 코드 / Since 태그라인) */}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 truncate text-w-h2 font-extrabold tracking-[-0.025em] text-white">
                  {academy.name}
                </h2>
                {academy.region && (
                  <span className="mt-1 inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-w-pill border border-white/30 bg-white/15 px-2.5 py-1">
                    <Icon name="place" size={13} className="shrink-0 text-white" aria-hidden="true" />
                    <span className="truncate text-card-meta font-bold tracking-tight text-white">
                      {academy.region}
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-card-meta font-medium text-white/75">
                Since {new Date(academy.createdAt).getFullYear()}
              </div>
            </div>
          </div>
        </div>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 탭 네비게이션 — 팀 상세 탭바와 통일(아이콘 제거 · grid · inset 밑줄 2.5px) */}
        <div
          className="bg-it-surface dark:bg-it-blue-950 px-5 pt-2"
          role="tablist"
          aria-label="오픈클래스 섹션"
        >
          <div className="grid grid-cols-3 border-b border-it-line dark:border-it-blue-900">
            {TABS.map((tab) => {
              const on = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'relative h-11 inline-flex items-center justify-center text-[15px] font-extrabold tracking-tight transition-colors motion-reduce:transition-none',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-inset',
                    on
                      ? 'text-it-blue-500'
                      : 'text-it-ink-400 dark:text-it-ink-300 hover:text-it-ink-600 dark:hover:text-it-ink-200',
                  )}
                >
                  {tab.label}
                  {on && (
                    <span
                      className="absolute inset-x-3 -bottom-px h-[2.5px] rounded-t-w-pill bg-it-blue-500"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-6">
          {/* ── 개요 탭 ── 팀 정보 탭과 통일: 막대형 섹션 제목 + it-fill 인셋 박스 */}
          {activeTab === 'overview' && (
            <div className="space-y-6" role="tabpanel">
              {/* 1) 운영 감독 — 개요 탭 최상단. 감독 프로필 사진(User.avatarUrl) 또는 이니셜 + 이름 */}
              {academy.director && (
                <section aria-label="운영 감독">
                  <OverviewSectionTitle title="운영 감독" />
                  <div className="rounded-w-md bg-it-fill dark:bg-it-blue-900/40 border-[1.5px] border-it-line dark:border-it-blue-900 px-4 py-4">
                    <div className="flex items-center gap-3">
                      {resolveImageSrc(academy.director.avatarUrl) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolveImageSrc(academy.director.avatarUrl)}
                          alt=""
                          className="size-12 rounded-w-pill object-cover shrink-0 border border-it-line dark:border-it-blue-900"
                        />
                      ) : (
                        <div
                          className="size-12 rounded-w-pill bg-it-blue-500/10 text-it-blue-500 flex items-center justify-center text-card-emphasis font-extrabold shrink-0"
                          aria-hidden="true"
                        >
                          {`${academy.director.lastName ?? ''}${academy.director.firstName ?? ''}`.trim().charAt(0) || '원'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-card-emphasis font-extrabold text-it-ink-800 dark:text-white truncate">
                            {`${academy.director.lastName ?? ''}${academy.director.firstName ?? ''}`.trim() || '오픈클래스 감독'}
                          </span>
                          <span className="shrink-0 px-2 py-0.5 rounded-w-pill text-[11px] font-bold bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500">
                            감독
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 2) 소개 — 독립 블록 + whitespace-pre-wrap(줄바꿈 보존). 팀 '팀 소개'와 동일 */}
              {academy.description && (
                <section aria-label="오픈클래스 소개">
                  <OverviewSectionTitle title="소개" />
                  <div className="rounded-w-md bg-it-fill dark:bg-it-blue-900/40 border-[1.5px] border-it-line dark:border-it-blue-900 p-4">
                    <p className="text-card-body font-medium leading-relaxed text-it-ink-800 dark:text-white whitespace-pre-wrap">
                      {academy.description}
                    </p>
                  </div>
                </section>
              )}

              {/* 3) 정보 — 지역 · 오픈클래스 코드만 (인셋 박스, 라벨좌/값우) */}
              <section aria-label="오픈클래스 정보">
                <OverviewSectionTitle title="정보" />
                <div className="rounded-w-md bg-it-fill dark:bg-it-blue-900/40 border-[1.5px] border-it-line dark:border-it-blue-900 px-4">
                  {(() => {
                    const rows: Array<{ k: string; v: string; mono?: boolean }> = [];
                    if (academy.region) rows.push({ k: '지역', v: academy.region });
                    rows.push({ k: MESSAGES.academy.codeLabel, v: academy.code, mono: true });
                    return rows.map((row, i) => (
                      <div
                        key={row.k}
                        className={cn(
                          'flex items-center justify-between gap-3 py-3',
                          i < rows.length - 1 && 'border-b border-it-line dark:border-it-blue-900',
                        )}
                      >
                        <span className="shrink-0 text-card-body font-semibold text-it-ink-500 dark:text-it-ink-300">
                          {row.k}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 text-right text-card-body font-extrabold text-it-ink-800 dark:text-white tracking-tight',
                            row.mono && 'tabular-nums uppercase tracking-wider',
                          )}
                        >
                          {row.v}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </section>

              {/* 4) 운영 현황 — 부가 지표라 하단 배치(사용자 요청). 제목 막대 + 단일 인셋 박스(팀 스타일 큰 숫자) */}
              <section aria-label="운영 현황">
                <OverviewSectionTitle title="운영 현황" />
                <div className="rounded-w-md bg-it-fill dark:bg-it-blue-900/40 border-[1.5px] border-it-line dark:border-it-blue-900 px-4 py-5 grid grid-cols-2 gap-2">
                  {[
                    { label: '수강생', v: academy._count?.members ?? 0, unit: '명', accent: true },
                    { label: '수업', v: academy._count?.classes ?? 0, unit: '개', accent: false },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="mb-1.5 text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300 tracking-wider">
                        {s.label}
                      </div>
                      <div className="inline-flex items-baseline gap-[3px]">
                        <span
                          className={cn(
                            'text-w-h2 font-extrabold tabular-nums leading-none tracking-[-0.03em]',
                            s.accent ? 'text-it-blue-500' : 'text-it-ink-500 dark:text-it-ink-300',
                          )}
                        >
                          {s.v}
                        </span>
                        <span className="text-card-meta font-bold text-it-ink-500 dark:text-it-ink-300">
                          {s.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 편집 버튼 — 개요 탭 안 유지(사용자 선택). it-blue outline */}
              <button
                type="button"
                onClick={handleEdit}
                className="w-full inline-flex h-12 items-center justify-center gap-1.5 rounded-w-md border-[1.5px] border-it-line-strong text-it-blue-600 text-card-emphasis font-bold hover:bg-it-blue-500/5 dark:hover:bg-it-blue-500/10 active:brightness-95 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                <Icon name="edit" className="text-[18px]" aria-hidden="true" />
                수정하기
              </button>
            </div>
          )}

          {/* ── 수강생 탭 (Master-Detail Drill-down) ── */}
          {activeTab === 'students' && academyId && (
            <AcademyStudentsTab academyId={academyId} iceTheme />
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
