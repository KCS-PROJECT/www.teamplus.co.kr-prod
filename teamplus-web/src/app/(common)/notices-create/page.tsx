'use client';

import { useId, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { DatePickerModal, formatDateLabel, isoToLocalDate } from '@/components/ui/DatePickerModal';
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

/** `GET /notices/admin/list` 행 중 고정 카운트에 필요한 필드만 */
interface AdminListNotice {
  id: string;
  isPinned?: boolean;
}

/** ISO 문자열을 date input 용 YYYY-MM-DD 로 변환 (타임존 시프트 방지 위해 앞 10자 슬라이스). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 절대시각(ISO) → date 입력값 "YYYY-MM-DD" (**KST 달력일**).
 *
 * `startAt`/`expiresAt` 은 A군 절대 시점(`@db.Timestamptz`)이라 Prisma·API 는 UTC 로 준다.
 * 앞 10자를 그대로 자르면 KST 오전 9시 이전 값이 하루 앞당겨진다
 * (예: KST 자정 = 전날 15:00Z → "전날"로 읽힘).
 * → `+9h` 시프트 후 **`getUTC*` getter** 로 읽는다 (규약: +9h 트릭은 반드시 getUTC* 와 짝).
 * teamplus-admin 의 `isoToDateInput` 과 동일 규약.
 */
function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const kst = new Date(ms + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

/**
 * date 입력값 "YYYY-MM-DD" → **KST 벽시계 기준 절대시각 ISO**.
 *
 * 규약(`CLAUDE_STANDARDS.md` ⏰): 절대 시점은 UTC 로 저장하고 벽시계 변환은 입력 화면 책임.
 * 오프셋 없는 파싱(`new Date("2026-08-06")`)은 UTC 자정으로 해석돼 KST 오전 9시가 되므로 금지.
 *
 * @param boundary 'start' = 그날 KST 00:00 · 'end' = 그날 KST 23:59:59.999 (종료일 당일까지 노출)
 */
function kstDateToIso(
  date: string,
  boundary: 'start' | 'end',
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [, y, mo, d] = m;
  const base = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const ms =
    boundary === 'start'
      ? base - KST_OFFSET_MS
      : base + 24 * 60 * 60 * 1000 - 1 - KST_OFFSET_MS;
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
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
  // [2026-06-09] 상단 고정 옵션 — 최대 2개.
  const [isPinned, setIsPinned] = useState(false);
  // 대상 팀 풀의 고정 한도 도달 여부 — 정확한 사전 안내용(아래 풀 카운트 effect).
  // 최종 판정은 여전히 서버 409(NOTICE_PIN_LIMIT) — 사전 판정과 등록 사이의 레이스 백스톱.
  const [pinnedFull, setPinnedFull] = useState(false);
  // [R6-02] 프리필 원값과 현재 체크 상태의 구분 — **원래 고정돼 있던 공지의 수정**은
  // full 판정과 무관하게 체크박스를 살려 고정 해제가 가능해야 한다(자기 제외로 full 도 아님).
  // 반대로 신규·원래 미고정 수정은 full 이면 체크를 강제 해제하고 비활성화한다.
  const [wasPinned, setWasPinned] = useState(false);
  // [2026-06-18] 공지 노출 기간 (등록기간) — 비우면 상시 노출. 백엔드 startDate/endDate 로 전송.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // 노출 기간 달력 대상 — 'start' | 'end'. null 이면 닫힘.
  const [openPicker, setOpenPicker] = useState<'start' | 'end' | null>(null);
  // [Phase 3] 팀 공지는 TeamPost(/community-notice/create)로 이관 완결 —
  //   이 화면은 **서비스 공지 전용**이라 대상 팀 후보 조회·선택기를 제거했다.
  usePageReady(!isPrefilling);

  useEffect(() => {
    // [R7-02·R8-01] 프리필 소유 상태 전체가 editId 와 결합 — editId 변경(수정→작성 전환
    // 포함) 즉시 이전 공지의 identity(wasPinned)와 폼 값(체크·제목·본문·기간)을
    // 모두 폐기한다. 남기면 이전 공지의 내용·체크가 새 identity 의 POST/PATCH 에 실린다.
    // 늦게 도착한 이전 프리필 응답은 cancelled 로 무시 (A→B 전환 역순 도착 보호).
    setWasPinned(false);
    setIsPinned(false);
    setTitle('');
    setContent('');
    setStartDate('');
    setEndDate('');
    if (!editId) {
      setIsPrefilling(false);
      return;
    }
    let cancelled = false;
    setIsPrefilling(true);
    (async () => {
      try {
        const res = await api.get<NoticeDetail>(`/notices/${editId}`);
        if (cancelled) return;
        if (res.success && res.data) {
          const n = res.data;
          setTitle(n.title ?? '');
          setContent(n.content ?? '');
          setIsPinned(n.pinned ?? n.isPinned ?? false);
          setWasPinned(n.pinned ?? n.isPinned ?? false);
          setStartDate(toDateInput(n.startAt));
          setEndDate(toDateInput(n.expiresAt));
        }
      } finally {
        if (!cancelled) setIsPrefilling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  // ── 고정 한도 사전 안내 — 서비스 공지 풀(scope=service) 단일 (한도 2).
  //   pinned 우선 정렬이라 limit 5 안에 풀의 모든 고정(≤2)이 들어온다.
  //   서버 409(NOTICE_PIN_LIMIT) 는 레이스 백스톱으로 유지.
  useEffect(() => {
    setPinnedFull(false);
    // 수정 모드는 프리필(wasPinned 확정) 후에만 판정 — 자기 제외 계산이 흔들리지 않게
    if (isEditMode && isPrefilling) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ data?: AdminListNotice[] }>(
          `/notices/admin/list?scope=service&page=1&limit=5`,
        );
        if (cancelled) return;
        const rows = res.success ? (res.data?.data ?? []) : [];
        // 수정 중인 공지 자신은 제외 — 이미 고정된 공지의 수정을 막지 않는다 (서버 불변식과 동일)
        const pinnedCount = rows.filter(
          (n) => n.isPinned && n.id !== editId,
        ).length;
        const full = pinnedCount >= 2;
        setPinnedFull(full);
        // [R6-02] full 확정 시 신규·원래 미고정 수정의 체크를 강제 해제 —
        // 응답 대기 중 체크했거나 여유 풀에서 체크 후 full 팀으로 전환한 경우의 우회 차단.
        if (full && !wasPinned) setIsPinned(false);
      } catch {
        if (!cancelled) setPinnedFull(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, isPrefilling, editId, wasPinned]);

  /**
   * 시작일이 오늘(KST) 이후인가 — 예약 노출 안내 표시용.
   * 날짜 선택 값(YYYY-MM-DD)은 사용자의 달력 날짜라 KST 오늘과 문자열로 비교하면 충분하다.
   */
  const isScheduledStart = (() => {
    if (!startDate) return false;
    const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return startDate > kstToday;
  })();

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
        // [R6-02] 제출 방어 — full 확정 상태에서 신규·원래 미고정의 고정 요청은 보내지 않는다
        // (강제 해제와 이중 방어). 레이스의 최종 판정은 여전히 서버 409.
        isPinned: pinnedFull && !wasPinned ? false : isPinned,
        // [2026-08-07] 노출 기간 — **KST 벽시계 → 절대시각 ISO**.
        //   이전에는 `${d}T00:00:00.000Z` / `${d}T23:59:59.999Z` 를 조립했는데 그 값은 UTC 라
        //   KST 기준 시작 09:00 · 종료 익일 08:59 로 9시간 밀렸다(F-06).
        //   빈 값은 `undefined` 가 아니라 **`null`** — undefined 는 JSON 에서 키가 사라져
        //   서버가 "변경 없음" 으로 해석하고, 한 번 설정한 기간을 지울 수 없었다(F-05).
        startDate: startDate ? kstDateToIso(startDate, 'start') : null,
        endDate: endDate ? kstDateToIso(endDate, 'end') : null,
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
      } else if (response.error?.code === 'NOTICE_PIN_LIMIT') {
        // [AC 3-8 · P3-R1-05] 고정 한도의 단일 SoT = 서버 409. 표준 문구로 매핑.
        toast.error(MESSAGES.notice.pinnedFull);
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
          {/* 상단 고정 옵션 — 최대 2개. 대상 팀 풀 기준 정확 카운트로 사전 안내(비활성화)하고,
              사전 판정과 등록 사이의 레이스는 서버 409 → pinnedFull toast 가 최종 판정. */}
          <label
            className={cn(
              'flex items-center gap-3 pb-4 border-b border-it-line dark:border-rink-700',
              // [R6-02] 원래 고정돼 있던 공지의 수정은 full 판정과 무관하게 항상 조작 가능
              // (고정 해제 경로 보존). 신규·원래 미고정은 full 이면 잠금.
              pinnedFull && !wasPinned ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
          >
            <input
              type="checkbox"
              checked={isPinned}
              disabled={pinnedFull && !wasPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-it-blue-500"
            />
            <span className="flex-1">
              <span className="block text-[14px] font-bold text-it-ink-800 dark:text-white">
                상단 고정
              </span>
              <span className="block text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5">
                {pinnedFull && !wasPinned
                  ? MESSAGES.notice.pinnedFull
                  : MESSAGES.notice.pinnedHint}
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
                <button
                  id="notice-start-date"
                  type="button"
                  onClick={() => setOpenPicker('start')}
                  aria-haspopup="dialog"
                  aria-expanded={openPicker === 'start'}
                  aria-label={MESSAGES.unitNotice.periodStart}
                  className="w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios flex min-w-0 items-center justify-between gap-2 text-left"
                >
                  <span className={startDate ? 'truncate tabular-nums' : 'truncate text-it-ink-400 dark:text-rink-300'}>
                    {startDate ? formatDateLabel(startDate) : MESSAGES.unitNotice.periodStart}
                  </span>
                  <Icon name="calendar_today" className="shrink-0 text-base text-it-ink-400" aria-hidden="true" />
                </button>
              </div>
              <div>
                <label
                  htmlFor="notice-end-date"
                  className="block text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 mb-1.5"
                >
                  종료일
                </label>
                <button
                  id="notice-end-date"
                  type="button"
                  onClick={() => setOpenPicker('end')}
                  aria-haspopup="dialog"
                  aria-expanded={openPicker === 'end'}
                  aria-label={MESSAGES.unitNotice.periodEnd}
                  className="w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios flex min-w-0 items-center justify-between gap-2 text-left"
                >
                  <span className={endDate ? 'truncate tabular-nums' : 'truncate text-it-ink-400 dark:text-rink-300'}>
                    {endDate ? formatDateLabel(endDate) : MESSAGES.unitNotice.periodEnd}
                  </span>
                  <Icon name="calendar_today" className="shrink-0 text-base text-it-ink-400" aria-hidden="true" />
                </button>
              </div>
            </div>
            {/* [2026-08-07] 예약 노출 안내 — 도래 시점 푸시는 미지원(스케줄러 미도입).
                생성 시점에 게시 중이 아니면 알림이 나가지 않으므로 미리 알린다. */}
            {isScheduledStart && (
              <p
                role="status"
                className="mt-2.5 flex items-start gap-1.5 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30 px-3 py-2 text-card-meta text-it-blue-700 dark:text-it-blue-200"
              >
                <Icon
                  name="schedule"
                  className="mt-px text-[14px] shrink-0"
                  aria-hidden="true"
                />
                <span>{MESSAGES.noticesCreate.scheduledStartNotice}</span>
              </p>
            )}

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
      {/* 기간 달력 — native input[type=date] 는 앱 WebView 마다 모양이 달라 공용 모달로 통일.
          시작일은 종료일 이전, 종료일은 시작일 이후로만 선택되게 min/max 를 교차 제한한다. */}
      <DatePickerModal
        isOpen={openPicker !== null}
        value={openPicker === 'start' ? startDate : endDate}
        minDate={openPicker === 'end' ? isoToLocalDate(startDate) : undefined}
        maxDate={openPicker === 'start' ? isoToLocalDate(endDate) : undefined}
        ariaLabel={openPicker === 'start' ? MESSAGES.unitNotice.periodStart : MESSAGES.unitNotice.periodEnd}
              iceTheme
        onClose={() => setOpenPicker(null)}
        onSelect={(iso) => {
          if (openPicker === 'start') setStartDate(iso);
          else if (openPicker === 'end') setEndDate(iso);
        }}
      />
    </MobileContainer>
  );
}
