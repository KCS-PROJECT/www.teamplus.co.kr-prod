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

/** `GET /notices/manage/teams` — 이 사용자가 공지를 쓸 수 있는 팀 (백엔드 관리 SoT 결과). */
interface ManageableTeam {
  id: string;
  name: string;
}

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
  // [2026-06-09] 상단 고정 옵션 — 최대 2개. pinnedFull 이면 신규 고정 불가.
  const [isPinned, setIsPinned] = useState(false);
  const [pinnedFull, setPinnedFull] = useState(false);
  // [2026-06-18] 공지 노출 기간 (등록기간) — 비우면 상시 노출. 백엔드 startDate/endDate 로 전송.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // 관리 팀이 여러 개인 작성자용 대상 팀 선택. 1개면 백엔드가 자동 주입하므로 선택기를 만들지 않는다.
  const [manageTeams, setManageTeams] = useState<ManageableTeam[]>([]);
  const [targetTeamId, setTargetTeamId] = useState('');
  // 조회 전·실패 후에는 관리 팀이 몇 개인지 알 수 없다 → 그 상태로 제출하면 다중 팀 작성자가
  // 서버 403 을 맞는다. 두 상태 동안 제출을 잠그고 인라인 재시도를 제공한다.
  const [isTeamsLoading, setIsTeamsLoading] = useState(!isEditMode);
  const [teamsLoadFailed, setTeamsLoadFailed] = useState(false);
  const needsTeamChoice = !isEditMode && manageTeams.length > 1;

  // edit 모드는 프리필, 신규 작성은 대상 팀 후보 도착까지 대기 —
  //   선택기도 화면 구성 요소라 도착 전에 로더를 내리면 레이아웃이 뒤늦게 바뀐다.
  usePageReady(!isPrefilling && !isTeamsLoading);

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

  // 대상 팀 후보 조회 — 시스템 역할은 빈 배열이 오므로 선택기가 뜨지 않는다.
  //   수정 모드는 대상 팀을 바꾸지 않으므로(payload 에 키 미포함) 조회도 생략.
  const loadManageTeams = useCallback(async () => {
    setIsTeamsLoading(true);
    setTeamsLoadFailed(false);
    try {
      const res = await api.get<{ data?: ManageableTeam[] } | ManageableTeam[]>(
        '/notices/manage/teams',
      );
      if (!res.success || !res.data) {
        setTeamsLoadFailed(true);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : (res.data.data ?? []);
      setManageTeams(list);
      if (list.length === 1) setTargetTeamId(list[0]!.id);
    } catch {
      setTeamsLoadFailed(true);
    } finally {
      setIsTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isEditMode) return;
    void loadManageTeams();
  }, [isEditMode, loadManageTeams]);

  /**
   * 시작일이 오늘(KST) 이후인가 — 예약 노출 안내 표시용.
   * `<input type="date">` 값은 사용자의 달력 날짜라 KST 오늘과 문자열로 비교하면 충분하다.
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
    if (needsTeamChoice && !targetTeamId) {
      toast.error(MESSAGES.noticesCreate.targetTeamRequired);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        title: trimmedTitle,
        content: trimmedContent,
        isPinned,
        // [2026-08-07] 노출 기간 — **KST 벽시계 → 절대시각 ISO**.
        //   이전에는 `${d}T00:00:00.000Z` / `${d}T23:59:59.999Z` 를 조립했는데 그 값은 UTC 라
        //   KST 기준 시작 09:00 · 종료 익일 08:59 로 9시간 밀렸다(F-06).
        //   빈 값은 `undefined` 가 아니라 **`null`** — undefined 는 JSON 에서 키가 사라져
        //   서버가 "변경 없음" 으로 해석하고, 한 번 설정한 기간을 지울 수 없었다(F-05).
        startDate: startDate ? kstDateToIso(startDate, 'start') : null,
        endDate: endDate ? kstDateToIso(endDate, 'end') : null,
        // 대상 팀은 **선택했을 때만** 키를 싣는다.
        //   키 생략(undefined) = "대상 미지정" → 백엔드가 단일 관리 팀을 자동 주입.
        //   명시적 null 은 "전체 공지 요청" 이라 팀 권한자에게 403 이 되므로 절대 보내지 않는다.
        //   수정 모드도 키를 빼서 기존 대상 팀을 그대로 유지한다.
        ...(!isEditMode && targetTeamId ? { targetTeamId } : {}),
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
          {/* 대상 팀 조회 실패 — toast 는 사라져 원인을 놓치므로 상주 배너 + 재시도.
              이 상태에서는 제출도 잠근다(관리 팀 수를 몰라 다중 팀 작성자가 서버 403 을 맞는다). */}
          {teamsLoadFailed && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-w-md bg-it-red-50 dark:bg-it-red-500/10 px-3 py-2.5"
            >
              {/* 다크 배경(rink-800 + it-red-500/10)에서 it-red-500 은 2.57:1 로 WCAG AA 미달 →
                  다크 변형은 it-red-300 (약 4.95:1). */}
              <Icon
                name="error_outline"
                className="mt-px text-[16px] shrink-0 text-it-red-500 dark:text-it-red-300"
                aria-hidden="true"
              />
              <span className="flex-1 text-card-meta text-it-red-500 dark:text-it-red-300">
                {MESSAGES.noticesCreate.targetTeamLoadFailed}
              </span>
              <button
                type="button"
                onClick={() => void loadManageTeams()}
                disabled={isTeamsLoading}
                className="shrink-0 text-card-meta font-bold text-it-red-500 dark:text-it-red-300 underline disabled:opacity-50"
              >
                {MESSAGES.noticesCreate.targetTeamRetry}
              </button>
            </div>
          )}

          {/* 대상 팀 — 관리 팀이 2개 이상인 작성자에게만 노출. */}
          {needsTeamChoice && (
            <div className="pb-4 border-b border-it-line dark:border-rink-700">
              <label
                htmlFor="notice-target-team"
                className="block text-[14px] font-bold text-it-ink-800 dark:text-white"
              >
                {MESSAGES.noticesCreate.targetTeamLabel}
              </label>
              <span className="mt-0.5 block text-card-meta text-it-ink-500 dark:text-rink-300">
                {MESSAGES.noticesCreate.targetTeamDesc}
              </span>
              <select
                id="notice-target-team"
                value={targetTeamId}
                onChange={(e) => setTargetTeamId(e.target.value)}
                required
                aria-required="true"
                className="mt-3 w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
              >
                <option value="">{MESSAGES.noticesCreate.targetTeamPlaceholder}</option>
                {manageTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* [2026-06-09] 상단 고정 옵션 — 최대 2개까지. */}
          <label
            className={cn(
              'flex items-center gap-3 pb-4 border-b border-it-line dark:border-rink-700',
              needsTeamChoice && 'pt-4',
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
          disabled={isSubmitting || isPrefilling || isTeamsLoading || teamsLoadFailed}
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
