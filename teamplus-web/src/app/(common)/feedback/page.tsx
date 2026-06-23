'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useScreenMetrics } from '@/hooks/useScreenMetrics';
import { useRouter, useSearchParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
import { feedbackSchema, type FeedbackInput } from '@/lib/validation/schemas';

import { usePageReady } from '@/hooks/usePageReady';
/**
 * FeedbackPage — 피드백 보내기 + 내 피드백 내역 (탭 구성)
 *
 * Task #50 D-3 피드백 양방향 Web
 * - `/feedback?tab=write` (기본): 피드백 작성 폼
 * - `/feedback?tab=history`: 내 피드백 내역 + 관리자 답변 확인
 *
 * Backend:
 *   - POST /app/feedback              (작성)
 *   - GET  /app/feedback/mine         (목록)
 *   - GET  /app/feedback/mine/:id     (상세 — 확장 시 최신 상태 동기화)
 */

type TabKey = 'write' | 'history';
type Category = 'bug' | 'improvement' | 'question' | 'other';

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'bug', label: '오류 신고' },
  { value: 'improvement', label: '개선 제안' },
  { value: 'question', label: '문의' },
  { value: 'other', label: '기타' },
];

const CATEGORY_LABEL: Record<string, string> = {
  bug: '오류 신고',
  improvement: '개선 제안',
  question: '문의',
  other: '기타',
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: {
    label: '접수됨',
    color: 'bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-wtext-4',
  },
  reviewed: {
    label: '검토 중',
    color: 'bg-blue-100 text-ice-500 dark:bg-ice-500/25 dark:text-ice-500',
  },
  resolved: {
    label: '답변 완료',
    color:
      'bg-emerald-100 text-mint-500 dark:bg-emerald-900/30 dark:text-mint-500',
  },
};

interface MyFeedback {
  id: string;
  category: string;
  content: string;
  rating: number | null;
  status: string;
  adminNote: string | null;
  adminReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ==============================
// 탭: 피드백 작성
// ==============================
function WriteTab({
  onSubmitted,
  onCancel,
}: {
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const contentId = useId();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');

  // RHF + Zod 통합 (2026-05-14 D-2 마이그레이션)
  // feedbackSchema: category(enum) + content(10~2000자)
  // schema 의 minLength 10 보다 짧으면 RHF 가 차단 → 기존 "contentRequired" 동작과 유사
  const {
    register,
    handleSubmit: handleFormSubmit,
    reset,
    setValue,
    watch,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<FeedbackInput>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { category: 'improvement', content: '' },
    mode: 'onSubmit',
  });
  const category = watch('category');
  const content = watch('content') ?? '';

  const onSubmit = async (data: FeedbackInput) => {
    setServerError('');
    const res = await api.post('/app/feedback', {
      category: data.category,
      content: data.content,
    });
    if (res.success) {
      setIsSubmitted(true);
      onSubmitted();
    } else {
      setServerError(MESSAGES.error.general);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-w-pill bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
          <Icon name="check_circle" className="text-4xl text-mint-500" aria-hidden="true" />
        </div>
        <h3 className="text-card-title font-bold text-wtext-1 dark:text-white mb-2">
          {MESSAGES.feedback.submitted}
        </h3>
        <p className="text-card-body text-wtext-3 dark:text-wtext-4 mb-6">
          {MESSAGES.feedback.thanks}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setIsSubmitted(false);
            reset({ category: 'improvement', content: '' });
          }}
        >
          {MESSAGES.feedback.newFeedback}
        </Button>
      </div>
    );
  }

  // RHF errors → 단일 inline 메시지로 표출 (UX 동등성)
  const inlineError =
    formErrors.content?.message ?? formErrors.category?.message ?? serverError;

  return (
    <form onSubmit={handleFormSubmit(onSubmit)} className="space-y-6" noValidate>
      {/* Intro */}
      <div>
        <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-1">
          의견을 들려주세요
        </h2>
        <p className="text-card-meta text-wtext-3 dark:text-wtext-4 leading-relaxed">
          서비스 개선을 위한 여러분의 소중한 의견을 기다리고 있어요.
        </p>
      </div>

      {/* 유형 */}
      <fieldset>
        <legend className="block text-card-body font-semibold text-wtext-1 dark:text-white mb-3">
          유형 <span className="text-flame-500" aria-hidden="true">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="피드백 유형">
          {CATEGORIES.map((cat) => {
            const isActive = category === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setValue('category', cat.value, { shouldValidate: false })}
                className={cn(
                  'min-h-[48px] py-3 px-4 rounded-w-md text-card-body font-semibold border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
                  isActive
                    ? 'bg-ice-500 text-white border-ice-500 shadow-sh-1'
                    : 'bg-wsurface dark:bg-rink-800 text-wtext-2 dark:text-wtext-4 border-wline-2 dark:border-rink-700 hover:border-ice-500/40 hover:text-ice-500 dark:hover:text-blue-300',
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* 내용 */}
      <div>
        <label
          htmlFor={contentId}
          className="block text-card-body font-semibold text-wtext-1 dark:text-white mb-2"
        >
          내용 <span className="text-flame-500" aria-hidden="true">*</span>
        </label>
        <textarea
          id={contentId}
          {...register('content')}
          placeholder={MESSAGES.placeholders.enterFeedback}
          rows={7}
          aria-required="true"
          aria-invalid={!!formErrors.content || !!serverError}
          className="w-full px-4 py-3 rounded-w-md border border-wline-2 dark:border-rink-700 bg-wsurface dark:bg-rink-800 text-wtext-1 dark:text-white text-card-body resize-none focus:outline-none focus:ring-2 focus:ring-ice-500/30 focus:border-ice-500 transition-colors motion-reduce:transition-none"
          maxLength={2000}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-card-meta text-wtext-3">최소 10자 · 최대 2000자</span>
          <span className="text-card-meta text-wtext-3 tabular-nums">
            <span className={cn('font-semibold', content.length > 1800 && 'text-sun-500 dark:text-sun-500')}>
              {content.length}
            </span>
            /2000
          </span>
        </div>
      </div>

      {inlineError && (
        <p className="text-card-body text-flame-500 dark:text-flame-500 flex items-center gap-1.5 p-3 rounded-lg bg-flame-100 dark:bg-flame-500/15 border border-red-100 dark:border-red-900/40" role="alert">
          <Icon name="error" className="text-card-emphasis" aria-hidden="true" />
          {inlineError}
        </p>
      )}

      {/* 버튼 — [취소 flex-1] [보내기 Primary flex-1.5]
          [수정 2026-05-14 D6] 취소 버튼 무동작 회귀 차단:
            · 이전: reset() + setServerError('') — 폼만 비우고 화면 변화가 없어 "취소" UX 기대 위반.
            · 수정: onCancel() 호출 → 부모 컨테이너가 router.back() 또는 /more 폴백 처리. */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            reset({ category: 'improvement', content: '' });
            setServerError('');
            onCancel();
          }}
          disabled={isSubmitting}
        >
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="flex-[1.5]"
          disabled={isSubmitting}
        >
          {isSubmitting ? MESSAGES.feedback.submitting : MESSAGES.feedback.sendFeedback}
        </Button>
      </div>
    </form>
  );
}

// ==============================
// 탭: 내 피드백 내역
// ==============================
function HistoryTab({
  feedbacks,
  isLoading,
  error,
  onRetry,
  onExpand,
  expandedId,
  onGoWrite,
}: {
  feedbacks: MyFeedback[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onExpand: (id: string) => void;
  expandedId: string | null;
  onGoWrite: () => void;
}) {
  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <div className="p-6 rounded-w-md bg-flame-100 dark:bg-flame-500/15 text-center">
        <Icon name="error_outline" className="text-3xl text-flame-500 mb-2" aria-hidden="true" />
        <p className="text-card-body text-wtext-1 dark:text-white">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-10 px-5 rounded-lg bg-ice-500 text-white text-card-body font-semibold hover:bg-ice-600 transition-colors motion-reduce:transition-none"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (feedbacks.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center mx-auto mb-4">
          <Icon name="feedback" className="text-3xl text-wtext-3 dark:text-wtext-4" aria-hidden="true" />
        </div>
        <p className="text-card-body font-medium text-wtext-2 dark:text-wtext-4 mb-1">
          아직 보낸 피드백이 없습니다
        </p>
        <p className="text-card-meta text-wtext-3 mb-5">의견이나 문의가 있으시면 언제든 남겨주세요</p>
        <Button type="button" variant="primary" onClick={onGoWrite}>
          {MESSAGES.feedback.newFeedback}
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {feedbacks.map((fb) => {
        const statusMeta = STATUS_META[fb.status] ?? STATUS_META.pending;
        const hasReply = !!fb.adminNote && !!fb.adminReplyAt;
        const isExpanded = expandedId === fb.id;
        return (
          <li
            key={fb.id}
            className={cn(
              'scroll-mt-20 rounded-w-md bg-wsurface dark:bg-rink-800 border overflow-hidden transition-all duration-200 motion-reduce:transition-none',
              isExpanded
                ? 'border-ice-500/40 dark:border-ice-500/50 shadow-sh-1'
                : 'border-wline-2 dark:border-rink-700 shadow-sh-1'
            )}
          >
            <button
              type="button"
              onClick={() => onExpand(fb.id)}
              aria-expanded={isExpanded}
              aria-controls={`fb-panel-${fb.id}`}
              className="w-full p-4 text-left hover:bg-wline-2/40 dark:hover:bg-rink-700/40 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40 focus-visible:ring-inset"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <span className={cn('text-card-meta font-bold px-2 py-0.5 rounded', statusMeta.color)}>
                    {statusMeta.label}
                  </span>
                  <span className="text-card-meta text-wtext-3 dark:text-wtext-4">
                    {CATEGORY_LABEL[fb.category] ?? fb.category}
                  </span>
                  {hasReply && (
                    <span
                      className="inline-flex items-center gap-1 text-card-meta font-bold px-2 py-0.5 rounded bg-blue-100 text-ice-500 dark:bg-ice-500/25 dark:text-ice-500"
                      aria-label="관리자 답변 있음"
                    >
                      <span className="w-1.5 h-1.5 rounded-w-pill bg-blue-500" aria-hidden="true" />
                      답변 있음
                    </span>
                  )}
                </div>
                <span className="text-card-meta text-wtext-3 shrink-0 tabular-nums">
                  {formatDate(fb.createdAt)}
                </span>
              </div>
              <p className="text-card-body text-wtext-1 dark:text-white line-clamp-2">
                {fb.content}
              </p>
            </button>

            {isExpanded && (
              <div
                id={`fb-panel-${fb.id}`}
                role="region"
                aria-label="피드백 상세"
                className="px-4 pb-4 space-y-3 border-t border-wline-2 dark:border-rink-700 bg-wbg/50 dark:bg-puck/20"
              >
                <div className="pt-3">
                  <p className="text-card-meta font-bold text-wtext-3 uppercase mb-1 tracking-wider">내 의견</p>
                  <p className="text-card-body text-wtext-1 dark:text-white whitespace-pre-wrap leading-relaxed">
                    {fb.content}
                  </p>
                </div>
                {hasReply ? (
                  <div className="p-3 rounded-lg bg-ice-50 dark:bg-ice-500/15 border border-blue-100 dark:border-blue-900/40">
                    <div className="flex items-center gap-1 mb-1">
                      <Icon name="support_agent" className="text-ice-500 dark:text-ice-500 text-[16px]" aria-hidden="true" />
                      <p className="text-card-meta font-bold text-ice-500 dark:text-ice-500 tabular-nums">
                        관리자 답변 · {formatDate(fb.adminReplyAt!)}
                      </p>
                    </div>
                    <p className="text-card-body text-wtext-1 dark:text-white whitespace-pre-wrap">
                      {fb.adminNote}
                    </p>
                  </div>
                ) : (
                  <p className="text-card-meta text-wtext-3 italic">
                    아직 답변이 등록되지 않았습니다
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ==============================
// 탭 컨테이너 (URL `?tab=history` 동기화)
// ==============================
function FeedbackTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab: TabKey = searchParams.get('tab') === 'history' ? 'history' : 'write';
  const [tab, setTab] = useState<TabKey>(initialTab);

  const [feedbacks, setFeedbacks] = useState<MyFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const res = await api.get<{
      data: MyFeedback[];
      pagination: { total: number };
    }>('/app/feedback/mine?limit=50');
    if (res.success && res.data) {
      setFeedbacks(res.data.data ?? []);
    } else {
      setLoadError(res.error?.message ?? MESSAGES.error.network);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  const switchTab = (next: TabKey) => {
    setTab(next);
    const qs = next === 'history' ? '?tab=history' : '';
    router.replace(`/feedback${qs}`, { scroll: false });
  };

  // 상세 API 호출 → 목록 내 최신 상태 동기화 후 expand
  const handleExpand = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      const res = await api.get<MyFeedback>(`/app/feedback/mine/${id}`);
      if (res.success && res.data) {
        setFeedbacks((prev) => prev.map((fb) => (fb.id === id ? { ...fb, ...res.data! } : fb)));
      }
    },
    [expandedId],
  );

  // 배지: 관리자 답변이 있는 피드백 수 (내역 탭에 표시)
  const replyCount = useMemo(
    () => feedbacks.filter((fb) => !!fb.adminNote && !!fb.adminReplyAt).length,
    [feedbacks],
  );

  // ─── 탭 슬라이딩 인디케이터 ───────────────────────
  const tabsNavRef = useRef<HTMLDivElement | null>(null);
  const writeTabRef = useRef<HTMLButtonElement | null>(null);
  const historyTabRef = useRef<HTMLButtonElement | null>(null);
  const [tabIndicator, setTabIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const updateTabIndicator = useCallback(() => {
    const btn = tab === 'write' ? writeTabRef.current : historyTabRef.current;
    const nav = tabsNavRef.current;
    if (!btn || !nav) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setTabIndicator({
      left: btnRect.left - navRect.left,
      width: btnRect.width,
    });
  }, [tab]);

  // 화면 폭 변경(회전·키보드·접힘 포함) 시 인디케이터 재측정 — SoT 단일 구독자
  // (2026-05-11) window.addEventListener('resize') 제거 — useScreenMetrics 사용
  const { width: screenWidth } = useScreenMetrics();

  // activeTab 변경 / replyCount(배지 너비) / 화면 폭 변경 시 재측정
  useLayoutEffect(() => {
    updateTabIndicator();
  }, [updateTabIndicator, replyCount, screenWidth]);

  return (
    <MobileContainer hasBottomNav>
      {/* [2026-05-13 이슈 D4 회귀 차단] Flutter WebView(isNative=true) 환경에서
          forceNative 미지정 시 PageAppBar 가 null 을 반환하고, 페이지의
          useNativeUI({ showAppBar: false }) 로 Native AppBar 도 그려지지 않아
          학부모/공통 사용자에게 "AppBar 영역 미표시" 증상이 발생했다.
          notifications/page.tsx 와 동일하게 forceNative 로 Web AppBar 를 강제 렌더한다. */}
      <PageAppBar title="피드백" forceNative />

      {/* 탭 바 */}
      <div
        ref={tabsNavRef}
        role="tablist"
        aria-label="피드백 탭"
        className="relative flex-none flex px-4 pt-2 bg-wsurface dark:bg-rink-800"
      >
        {/* 하단 가이드 라인 */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-0 right-0 h-px bg-wline-2 dark:bg-rink-700"
        />

        <button
          ref={writeTabRef}
          type="button"
          role="tab"
          aria-selected={tab === 'write'}
          onClick={() => switchTab('write')}
          className={cn(
            'flex-1 py-3 text-card-body transition-colors duration-200 motion-reduce:transition-none',
            tab === 'write'
              ? 'font-bold text-ice-500'
              : 'font-semibold text-wtext-3 dark:text-wtext-4 hover:text-wtext-1 dark:hover:text-wtext-4',
          )}
        >
          피드백 보내기
        </button>
        <button
          ref={historyTabRef}
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          onClick={() => switchTab('history')}
          className={cn(
            'relative flex-1 py-3 text-card-body transition-colors duration-200 motion-reduce:transition-none flex items-center justify-center gap-1.5',
            tab === 'history'
              ? 'font-bold text-ice-500'
              : 'font-semibold text-wtext-3 dark:text-wtext-4 hover:text-wtext-1 dark:hover:text-wtext-4',
          )}
        >
          내 피드백 내역
          {replyCount > 0 && (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-w-pill text-card-meta font-bold tabular-nums transition-colors motion-reduce:transition-none',
                tab === 'history'
                  ? 'bg-ice-500 text-white'
                  : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-wtext-4',
              )}
              aria-label={`답변 ${replyCount}건`}
            >
              {replyCount > 99 ? '99+' : replyCount}
            </span>
          )}
        </button>

        {/* 슬라이딩 인디케이터 */}
        <span
          aria-hidden="true"
          className="absolute bottom-0 h-[2px] rounded-t-full bg-ice-500 transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
          style={{
            left: `${tabIndicator.left}px`,
            width: `${tabIndicator.width}px`,
            opacity: tabIndicator.width > 0 ? 1 : 0,
          }}
        />
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-6 pb-30 hide-scrollbar">
        {tab === 'write' ? (
          <WriteTab
            onSubmitted={() => void loadHistory()}
            onCancel={() => {
              // [추가 2026-05-14 D6] history 가 있으면 router.back(), 없으면 /more 폴백.
              //   useNavigation 의 back() 은 진입점이 비어있을 때(딥링크/푸시 알림 진입)
              //   화면 변화가 없는 회귀가 발생할 수 있어 명시적 fallback 처리.
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.replace('/more');
              }
            }}
          />
        ) : (
          <HistoryTab
            feedbacks={feedbacks}
            isLoading={isLoading}
            error={loadError}
            onRetry={() => void loadHistory()}
            onExpand={(id) => void handleExpand(id)}
            expandedId={expandedId}
            onGoWrite={() => switchTab('write')}
          />
        )}
      </main>
    </MobileContainer>
  );
}

export default function FeedbackPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  return (
    <Suspense fallback={null}>
      <FeedbackTabs />
    </Suspense>
  );
}
