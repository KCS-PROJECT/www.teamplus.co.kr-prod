'use client';

import { useId, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { useToast } from '@/components/ui/Toast';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import { usePageReady } from '@/hooks/usePageReady';
import { cn } from '@/lib/utils';

interface NoticeDetail {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  isPinned?: boolean;
  /** 노출 시작/종료일 (ISO) — 백엔드 SystemNotice.startAt/expiresAt */
  startAt?: string | null;
  expiresAt?: string | null;
}

/** ISO 문자열을 date input 용 YYYY-MM-DD 로 변환 (타임존 시프트 방지 위해 앞 10자 슬라이스). */
function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export default function NoticeCreatePage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지).
  // 작성 페이지는 입력 집중 모드 — Native BottomNav 숨김으로 하단 Action Bar 가려짐 방지.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const { back } = useNavigation();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const editId = searchParams?.get('edit') ?? null;
  const isEditMode = Boolean(editId);

  const titleId = useId();
  const contentId = useId();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(isEditMode);
  // [2026-06-09] 상단 고정 옵션 — 최대 2개. pinnedFull 이면 신규 고정 불가.
  const [isPinned, setIsPinned] = useState(false);
  const [pinnedFull, setPinnedFull] = useState(false);
  // [2026-06-18] 공지 노출 기간 (등록기간) — 비우면 상시 노출. 백엔드 startDate/endDate 로 전송.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // edit 모드일 때 isPrefilling 도착 대기.
  usePageReady(!isPrefilling);

  const prefillFromEdit = useCallback(async () => {
    if (!editId) return;
    setIsPrefilling(true);
    try {
      const res = await api.get<NoticeDetail>(`/notices/${editId}`);
      if (res.success && res.data) {
        const n = res.data;
        setTitle(n.title ?? '');
        setContent(n.content ?? '');
        setIsPinned(n.pinned ?? n.isPinned ?? false);
        setStartDate(toDateInput(n.startAt));
        setEndDate(toDateInput(n.expiresAt));
      }
    } finally {
      setIsPrefilling(false);
    }
  }, [editId]);

  useEffect(() => {
    if (isEditMode) {
      prefillFromEdit();
    }
  }, [isEditMode, prefillFromEdit]);

  // [2026-06-09] 신규 작성 시 현재 상단 고정 공지 개수 확인 — 2개면 고정 불가.
  useEffect(() => {
    if (isEditMode) return;
    (async () => {
      const res = await api.get<{ notices?: unknown[]; data?: unknown[] } | unknown[]>(
        '/notices?limit=50&page=1&isActive=true&scope=team',
      );
      if (res.success && res.data) {
        const arr = Array.isArray(res.data)
          ? res.data
          : ((res.data as { notices?: unknown[] }).notices ??
            (res.data as { data?: unknown[] }).data ??
            []);
        const cnt = (arr as Array<{ pinned?: boolean; priority?: number }>).filter(
          (n) => n.pinned || (n.priority ?? 0) > 0,
        ).length;
        setPinnedFull(cnt >= 2);
      }
    })();
  }, [isEditMode]);

  const handleClose = () => {
    back();
  };

  const handleSubmit = async () => {
    // 백엔드 CreateNoticeDto 검증 규칙을 프론트에서 먼저 적용 (영어 class-validator 메시지 노출 방지).
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length < 2) {
      toast.error(MESSAGES.noticesCreate.titleMinLength);
      return;
    }
    if (trimmedTitle.length > 200) {
      toast.error(MESSAGES.noticesCreate.titleMaxLength);
      return;
    }
    if (trimmedContent.length < 10) {
      toast.error(MESSAGES.noticesCreate.contentMinLength);
      return;
    }
    if (trimmedContent.length > 10000) {
      toast.error(MESSAGES.noticesCreate.contentMaxLength);
      return;
    }
    // 노출 기간 — 둘 다 입력 시 시작일 ≤ 종료일 검증.
    if (startDate && endDate && startDate > endDate) {
      toast.error(MESSAGES.noticesCreate.periodInvalid);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        title: trimmedTitle,
        content: trimmedContent,
        isPinned,
        // 노출 기간 — date(YYYY-MM-DD) → ISO. 시작일 00:00, 종료일 23:59:59 까지 노출.
        startDate: startDate ? `${startDate}T00:00:00.000Z` : undefined,
        endDate: endDate ? `${endDate}T23:59:59.999Z` : undefined,
      };
      const response = isEditMode
        ? await api.patch(`/notices/${editId}`, payload)
        : await api.post('/notices', payload);
      if (response.success) {
        toast.success(isEditMode ? MESSAGES.notice.updated : MESSAGES.notice.created);
        // 공지 등록/수정 후 listing 페이지 invalidation —
        //   director-notices / notices-manage / notice/list 구독 시 즉시 갱신.
        emitRefresh(REFRESH_KEYS.NOTICES);
        emitRefresh(['notices', 'admin']);
        back();
      } else {
        toast.error(
          isEditMode ? MESSAGES.noticesCreate.updateError : MESSAGES.noticesCreate.createError,
        );
      }
    } catch {
      toast.error(
        isEditMode ? MESSAGES.noticesCreate.updateError : MESSAGES.noticesCreate.createError,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MobileContainer hasBottomNav>
      {/* PageAppBar forceNative — Native(Flutter WebView) 환경에서도 상단바 강제 렌더. */}
      <PageAppBar title={isEditMode ? '공지 수정' : '공지 작성'} className="z-50" onBack={handleClose} forceNative />

      {/* main 스크롤 영역 — !pb-0 으로 MobileContainer 의 [&>main]:pb-30 강제 무력화.
          (CTA 가 sibling footer 로 분리되므로 main 내부 pb 불필요 — gap 0 으로 자연 연결) */}
      <main
        className="flex-1 overflow-y-auto !pb-0 w-full max-w-md mx-auto bg-it-canvas dark:bg-puck"
        style={{ WebkitOverflowScrolling: 'touch' as never }}
      >
        {/* 제목·내용 — flat 흰 섹션 (카드 박스 제거) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5 space-y-5" aria-label="공지 내용">
          {/* Title Input — 컨테이너형 (iceTheme Input) */}
          <div>
            <label
              htmlFor={titleId}
              className="block text-[14px] font-bold text-it-ink-800 dark:text-white mb-2"
            >
              제목
            </label>
            <input
              id={titleId}
              className="w-full px-4 h-[50px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
              placeholder={MESSAGES.placeholders.enterTitleSimple}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          {/* Body Textarea — 컨테이너형 (고정 높이) */}
          <div>
            <label
              htmlFor={contentId}
              className="block text-[14px] font-bold text-it-ink-800 dark:text-white mb-2"
            >
              내용
            </label>
            <textarea
              id={contentId}
              rows={10}
              className="w-full px-4 py-3 bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios resize-none"
              placeholder="내용을 입력하세요..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              aria-required="true"
            />
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 옵션 — flat 흰 섹션 (상단 고정 + 노출 기간, hairline 구분) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6" aria-label="공지 옵션">
          {/* [2026-06-09] 상단 고정 옵션 — 최대 2개까지. */}
          <label
            className={cn(
              'flex items-center gap-3 pb-4 border-b border-it-line dark:border-rink-700',
              !isPinned && pinnedFull ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <input
              type="checkbox"
              checked={isPinned}
              disabled={!isPinned && pinnedFull}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-it-blue-500"
            />
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-it-ink-800 dark:text-white">
                상단 고정
              </span>
              <span className="block text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5">
                {!isPinned && pinnedFull
                  ? '이미 2개가 고정되어 있어 추가할 수 없습니다.'
                  : '공지 목록 상단에 고정해 노출합니다 (최대 2개).'}
              </span>
            </span>
          </label>

          {/* [2026-06-18] 공지 등록기간(노출 기간) — 비워두면 상시 노출. */}
          <div className="pt-4">
            <span className="block text-[14px] font-bold text-it-ink-800 dark:text-white">
              노출 기간
            </span>
            <span className="mt-0.5 block text-card-meta text-it-ink-500 dark:text-rink-300">
              설정한 기간에만 공지가 노출됩니다. 비워두면 상시 노출됩니다.
            </span>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="notice-start-date"
                  className="block text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 mb-1.5"
                >
                  시작일
                </label>
                <input
                  id="notice-start-date"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
                />
              </div>
              <div>
                <label
                  htmlFor="notice-end-date"
                  className="block text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 mb-1.5"
                >
                  종료일
                </label>
                <input
                  id="notice-end-date"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
                />
              </div>
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="mt-2.5 inline-flex items-center gap-1 text-card-meta font-semibold text-it-ink-500 dark:text-rink-300 underline"
              >
                <Icon name="close" className="text-[14px]" aria-hidden="true" />
                기간 초기화 (상시 노출)
              </button>
            )}
          </div>
        </section>
      </main>

      {/* CTA Footer — main 외부 sibling. it-canvas 배경 상속으로 자연 연결.
          MobileContainer 의 outer pb(60px+safe-area) 가 RoleBottomNav 영역 보장. */}
      <div className="w-full max-w-md mx-auto px-5 py-3 bg-it-canvas dark:bg-puck">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || isPrefilling}
          className="w-full h-[54px] rounded-w-md bg-it-blue-500 text-white font-extrabold text-[16px] hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none flex items-center justify-center gap-2 disabled:bg-it-line-strong dark:disabled:bg-rink-700 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? isEditMode
              ? '수정 중...'
              : '등록 중...'
            : isEditMode
              ? '수정하기'
              : '등록하기'}
          <Icon name={isEditMode ? 'edit' : 'check'} className="text-[20px]" aria-hidden="true" />
        </button>
      </div>
    </MobileContainer>
  );
}
