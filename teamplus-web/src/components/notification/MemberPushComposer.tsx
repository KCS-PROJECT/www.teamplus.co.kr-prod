'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';
import {
  getTeamPushRecipients,
  sendTeamPush,
  type PushRecipient,
} from '@/services/notification.service';

// ── 제약 (백엔드 계약과 동일하게 클라이언트에서도 가드) ──
const TITLE_MAX = 50;
const MESSAGE_MAX = 200;
const RECIPIENT_MAX = 200;

interface ManagedTeam {
  id: string;
  name?: string;
}

// 그룹 키 — members(선수) · parents(학부모) · managers(감독·코치)
type GroupKey = 'members' | 'parents' | 'managers';

const GROUP_META: { key: GroupKey; label: string; icon: string }[] = [
  { key: 'members', label: MESSAGES.memberPush.groupMembers, icon: 'sports_hockey' },
  { key: 'parents', label: MESSAGES.memberPush.groupParents, icon: 'family_restroom' },
  { key: 'managers', label: MESSAGES.memberPush.groupManagers, icon: 'sports' },
];

interface MemberPushComposerProps {
  /** 진입 컨텍스트(역할) — 토스트/로깅 구분용. 권한 가드는 layout 이 처리. */
  context?: 'director' | 'coach';
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 main 회색 캔버스(bg-it-canvas) + 입력/칩/버튼 it-* 토큰 적용.
   *   (현재 /director-members/push · /coach-members/push 화면만 전달.)
   */
  iceTheme?: boolean;
}

/**
 * iceTheme 클래스 토큰 맵. false = 기존 클래스 문자열 1:1(회귀 0), true = it-* 정합.
 * 단일 JSX 에 변수로 주입하여 분기별 마크업 중복 없이 회귀 안전을 보장한다.
 */
function pushTokens(iceTheme: boolean) {
  if (iceTheme) {
    return {
      main: 'flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck',
      desc: 'text-card-meta font-medium text-it-ink-500 dark:text-rink-300',
      sectionTitle: 'mb-2 text-card-meta font-bold uppercase tracking-[0.12em] text-it-ink-500 dark:text-rink-300',
      skeleton: 'animate-pulse rounded-w-md bg-it-fill dark:bg-it-blue-900',
      teamCard: 'flex items-center gap-3 rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface px-4 py-3 dark:border-it-blue-900 dark:bg-it-blue-950',
      teamIconWrap: 'flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15',
      teamIcon: 'text-[20px] text-it-blue-500',
      teamName: 'flex-1 truncate text-card-body font-bold text-it-ink-800 dark:text-white',
      teamRadioActive: 'border-it-blue-500 bg-it-blue-50 dark:border-it-blue-500 dark:bg-it-blue-500/15',
      teamRadioIdle: 'border-it-line-strong bg-it-surface hover:bg-it-fill dark:border-it-blue-900 dark:bg-it-blue-950 dark:hover:bg-it-blue-900/40',
      teamRadioIconActive: 'text-it-blue-500',
      teamRadioIconIdle: 'text-it-ink-400 dark:text-rink-300',
      teamRadioLabelActive: 'text-it-blue-500',
      teamRadioLabelIdle: 'text-it-ink-800 dark:text-white',
      teamRadioCheck: 'text-[22px] text-it-blue-500',
      selectedCount: 'text-card-meta font-bold font-num tabular-nums text-it-blue-500',
      search: 'h-12 w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill pl-11 pr-10 text-card-body text-it-ink-800 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none placeholder:text-it-ink-400 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-rink-300',
      searchIcon: 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-it-ink-400 dark:text-rink-300',
      searchClear: 'absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-w-pill text-it-ink-400 transition-colors motion-reduce:transition-none hover:bg-it-fill hover:text-it-ink-800 dark:hover:bg-it-blue-900/40 dark:hover:text-white',
      selectAllBtn: 'inline-flex h-9 items-center gap-1.5 self-start rounded-w-md border-[1.5px] border-it-line-strong bg-it-surface px-3 text-card-meta font-bold text-it-ink-600 transition-colors motion-reduce:transition-none hover:bg-it-fill active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-it-blue-900 dark:bg-it-blue-950 dark:text-rink-200 dark:hover:bg-it-blue-900/40',
      groupIcon: 'text-[16px] text-it-blue-500',
      groupLabel: 'text-card-meta font-bold text-it-ink-600 dark:text-rink-200',
      groupCount: 'text-card-meta font-bold font-num tabular-nums text-it-ink-400 dark:text-rink-300',
      recipientActive: 'border-it-blue-500 bg-it-blue-50 dark:border-it-blue-500 dark:bg-it-blue-500/15',
      recipientIdle: 'border-it-line-strong bg-it-surface hover:bg-it-fill dark:border-it-blue-900 dark:bg-it-blue-950 dark:hover:bg-it-blue-900/40',
      checkboxActive: 'border-it-blue-500 bg-it-blue-500',
      checkboxIdle: 'border-it-line-strong bg-it-surface dark:border-it-blue-900 dark:bg-it-blue-950',
      avatarWrap: 'flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-it-fill dark:bg-it-blue-900',
      avatarText: 'text-card-meta font-bold text-it-ink-600 dark:text-rink-200',
      recipientName: 'flex-1 truncate text-card-body font-bold text-it-ink-800 dark:text-white',
      label: 'text-card-meta font-bold text-it-ink-600 dark:text-rink-200',
      charCount: 'text-card-meta font-medium font-num tabular-nums text-it-ink-400 dark:text-rink-300',
      input: 'h-12 w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 text-card-body text-it-ink-800 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none placeholder:text-it-ink-400 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-rink-300',
      textarea: 'w-full resize-none rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-4 py-3 text-card-body leading-relaxed text-it-ink-800 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none placeholder:text-it-ink-400 focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20 dark:border-it-blue-900 dark:bg-it-blue-900/40 dark:text-white dark:placeholder:text-rink-300',
      footer: 'sticky bottom-0 left-0 right-0 border-t border-it-line bg-it-canvas px-5 pt-3 dark:border-it-blue-900 dark:bg-puck',
    };
  }
  return {
    main: 'flex-1 overflow-y-auto hide-scrollbar bg-wbg dark:bg-puck',
    desc: 'text-card-meta font-medium text-wtext-3 dark:text-wtext-4',
    sectionTitle: 'mb-2 text-card-meta font-bold uppercase tracking-[0.12em] text-wtext-3 dark:text-wtext-4',
    skeleton: 'animate-pulse rounded-w-md bg-wline-2 dark:bg-rink-700',
    teamCard: 'flex items-center gap-3 rounded-w-md border border-wline-2 bg-wsurface px-4 py-3 dark:border-rink-700 dark:bg-rink-800',
    teamIconWrap: 'flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-ice-50 dark:bg-ice-500/15',
    teamIcon: 'text-[20px] text-ice-500',
    teamName: 'flex-1 truncate text-card-body font-bold text-wtext-1 dark:text-white',
    teamRadioActive: 'border-ice-500 bg-ice-50 dark:border-ice-500 dark:bg-ice-500/15',
    teamRadioIdle: 'border-wline-2 bg-wsurface hover:bg-wline-2/40 dark:border-rink-700 dark:bg-rink-800 dark:hover:bg-rink-700',
    teamRadioIconActive: 'text-ice-500',
    teamRadioIconIdle: 'text-wtext-3 dark:text-wtext-4',
    teamRadioLabelActive: 'text-ice-500',
    teamRadioLabelIdle: 'text-wtext-1 dark:text-white',
    teamRadioCheck: 'text-[22px] text-ice-500',
    selectedCount: 'text-card-meta font-bold font-num tabular-nums text-ice-500',
    search: 'h-12 w-full rounded-w-md border border-wline-2 bg-wsurface pl-11 pr-10 text-card-body text-wtext-1 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none placeholder:text-wtext-4 focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:placeholder:text-wtext-3',
    searchIcon: 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-wtext-3 dark:text-wtext-4',
    searchClear: 'absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-w-pill text-wtext-3 transition-colors motion-reduce:transition-none hover:bg-wline-2 hover:text-wtext-1 dark:hover:bg-rink-700 dark:hover:text-white',
    selectAllBtn: 'inline-flex h-9 items-center gap-1.5 self-start rounded-w-md border border-wline-2 bg-wsurface px-3 text-card-meta font-bold text-wtext-2 transition-colors motion-reduce:transition-none hover:bg-wline-2/40 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rink-700 dark:bg-rink-800 dark:text-wtext-4 dark:hover:bg-rink-700',
    groupIcon: 'text-[16px] text-ice-500',
    groupLabel: 'text-card-meta font-bold text-wtext-2 dark:text-wtext-4',
    groupCount: 'text-card-meta font-bold font-num tabular-nums text-wtext-3 dark:text-wtext-4',
    recipientActive: 'border-ice-500 bg-ice-50 dark:border-ice-500 dark:bg-ice-500/15',
    recipientIdle: 'border-wline-2 bg-wsurface hover:bg-wline-2/40 dark:border-rink-700 dark:bg-rink-800 dark:hover:bg-rink-700',
    checkboxActive: 'border-ice-500 bg-ice-500',
    checkboxIdle: 'border-wline bg-wsurface dark:border-rink-700 dark:bg-rink-800',
    avatarWrap: 'flex size-9 shrink-0 items-center justify-center rounded-w-pill bg-wline-2 dark:bg-rink-700',
    avatarText: 'text-card-meta font-bold text-wtext-2 dark:text-wtext-4',
    recipientName: 'flex-1 truncate text-card-body font-bold text-wtext-1 dark:text-white',
    label: 'text-card-meta font-bold text-wtext-2 dark:text-wtext-4',
    charCount: 'text-card-meta font-medium font-num tabular-nums text-wtext-3 dark:text-wtext-4',
    input: 'h-12 w-full rounded-w-md border border-wline-2 bg-wsurface px-4 text-card-body text-wtext-1 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none placeholder:text-wtext-4 focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:placeholder:text-wtext-3',
    textarea: 'w-full resize-none rounded-w-md border border-wline-2 bg-wsurface px-4 py-3 text-card-body leading-relaxed text-wtext-1 outline-none transition-colors duration-150 ease-ios motion-reduce:transition-none placeholder:text-wtext-4 focus:border-ice-500 focus:ring-2 focus:ring-ice-500/20 dark:border-rink-700 dark:bg-rink-800 dark:text-white dark:placeholder:text-wtext-3',
    footer: 'sticky bottom-0 left-0 right-0 border-t border-wline-2 bg-wbg px-5 pt-3 dark:border-rink-800 dark:bg-puck',
  };
}

/**
 * MemberPushComposer — 코치/감독이 자기 팀 회원에게 푸시 알림을 발송하는 공용 컴포저.
 *
 * 흐름:
 *   1. GET /teams/my/managed → 관리 팀 목록 (1개면 자동 선택, 여러 개면 선택 UI)
 *   2. 선택 팀의 GET /notifications/team/:teamId/recipients → 그룹별 대상 풀
 *   3. 그룹별 다중선택(체크박스) + 이름 검색 + 전체선택/해제
 *   4. 제목(≤50)·내용(≤200) 입력 (글자수 카운터)
 *   5. POST /notifications/team/:teamId/push → 성공 토스트 + 폼 리셋
 *
 * 디자인: AppBar/BottomNav 불가침 — 이 컴포넌트는 body 영역만 렌더.
 */
export function MemberPushComposer({ context, iceTheme = false }: MemberPushComposerProps) {
  const { toast } = useToast();
  const { back } = useNavigation();
  const titleInputId = useId();
  const messageInputId = useId();
  const tk = pushTokens(iceTheme);

  // ── 팀 상태 ──
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [isTeamsLoading, setIsTeamsLoading] = useState(true);
  const [teamsError, setTeamsError] = useState(false);

  // ── 대상 풀 상태 ──
  const [recipients, setRecipients] = useState<Record<GroupKey, PushRecipient[]>>({
    members: [],
    parents: [],
    managers: [],
  });
  const [isRecipientsLoading, setIsRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState(false);

  // ── 선택/검색/입력 상태 ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // 풀스크린 로더 fast-path — 팀 목록 fetch 완료 시점에 OFF
  usePageReady(!isTeamsLoading);

  // ── 1. 관리 팀 목록 로드 ──
  const loadTeams = useCallback(async () => {
    setIsTeamsLoading(true);
    setTeamsError(false);
    try {
      const res = await api.get<ManagedTeam[]>('/teams/my/managed');
      if (!res.success || !Array.isArray(res.data)) {
        setTeams([]);
        setTeamsError(true);
        return;
      }
      setTeams(res.data);
      // 팀이 1개면 자동 선택
      if (res.data.length === 1) {
        setSelectedTeamId(res.data[0].id);
      }
    } catch {
      setTeams([]);
      setTeamsError(true);
    } finally {
      setIsTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  // ── 2. 선택 팀의 대상 풀 로드 ──
  const loadRecipients = useCallback(async (teamId: string) => {
    setIsRecipientsLoading(true);
    setRecipientsError(false);
    setSelectedIds(new Set());
    setSearchQuery('');
    try {
      const res = await getTeamPushRecipients(teamId);
      if (!res.success || !res.data) {
        setRecipients({ members: [], parents: [], managers: [] });
        setRecipientsError(true);
        return;
      }
      setRecipients({
        members: Array.isArray(res.data.members) ? res.data.members : [],
        parents: Array.isArray(res.data.parents) ? res.data.parents : [],
        managers: Array.isArray(res.data.managers) ? res.data.managers : [],
      });
    } catch {
      setRecipients({ members: [], parents: [], managers: [] });
      setRecipientsError(true);
    } finally {
      setIsRecipientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    void loadRecipients(selectedTeamId);
  }, [selectedTeamId, loadRecipients]);

  // ── 검색 필터링된 그룹별 대상 ──
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filterFn = (r: PushRecipient) =>
      q === '' || r.name.toLowerCase().includes(q);
    return {
      members: recipients.members.filter(filterFn),
      parents: recipients.parents.filter(filterFn),
      managers: recipients.managers.filter(filterFn),
    };
  }, [recipients, searchQuery]);

  // 현재 화면에 보이는(검색 필터 통과한) 전체 대상 — 전체선택/해제 기준
  const visibleRecipients = useMemo(
    () => [
      ...filteredGroups.members,
      ...filteredGroups.parents,
      ...filteredGroups.managers,
    ],
    [filteredGroups],
  );

  const totalRecipientCount =
    recipients.members.length +
    recipients.parents.length +
    recipients.managers.length;

  const allVisibleSelected =
    visibleRecipients.length > 0 &&
    visibleRecipients.every((r) => selectedIds.has(r.userId));

  // ── 선택 토글 ──
  const toggleRecipient = useCallback((userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (visibleRecipients.every((r) => next.has(r.userId))) {
        // 전체 해제 (보이는 대상만)
        visibleRecipients.forEach((r) => next.delete(r.userId));
      } else {
        // 전체 선택 (보이는 대상만)
        visibleRecipients.forEach((r) => next.add(r.userId));
      }
      return next;
    });
  }, [visibleRecipients]);

  // ── 발송 ──
  const handleSend = useCallback(async () => {
    if (isSending) return;

    if (!selectedTeamId) {
      toast.error(MESSAGES.memberPush.teamRequired);
      return;
    }
    const userIds = Array.from(selectedIds);
    if (userIds.length === 0) {
      toast.error(MESSAGES.memberPush.recipientRequired);
      return;
    }
    if (userIds.length > RECIPIENT_MAX) {
      toast.error(MESSAGES.memberPush.recipientTooMany);
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error(MESSAGES.memberPush.titleRequired);
      return;
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      toast.error(MESSAGES.memberPush.messageRequired);
      return;
    }

    setIsSending(true);
    try {
      const res = await sendTeamPush(selectedTeamId, {
        userIds,
        title: trimmedTitle,
        message: trimmedMessage,
      });
      if (res.success && res.data) {
        toast.success(MESSAGES.memberPush.sendSuccess(res.data.sentCount));
        // 폼 리셋 후 이전 화면으로 복귀
        setSelectedIds(new Set());
        setTitle('');
        setMessage('');
        back();
        return;
      }
      // 권한 없음(403) → 전용 카피
      if (res.error?.statusCode === 403) {
        toast.error(MESSAGES.memberPush.forbidden);
        return;
      }
      toast.error(MESSAGES.memberPush.sendError);
    } catch {
      toast.error(MESSAGES.memberPush.sendError);
    } finally {
      setIsSending(false);
    }
  }, [
    isSending,
    selectedTeamId,
    selectedIds,
    title,
    message,
    toast,
    back,
  ]);

  // context 는 향후 로깅/분기 확장용 (현재 동작 분기 없음)
  void context;

  const selectedCount = selectedIds.size;
  const canSend =
    !!selectedTeamId &&
    selectedCount > 0 &&
    title.trim().length > 0 &&
    message.trim().length > 0;

  return (
    <main
      className={tk.main}
      role="main"
      aria-label={MESSAGES.memberPush.pageTitle}
    >
      <div className="flex flex-col gap-5 px-5 pt-5 pb-32">
        {/* 안내 */}
        <p className={tk.desc}>
          {MESSAGES.memberPush.description}
        </p>

        {/* ── 팀 선택 ── */}
        <section aria-label={MESSAGES.memberPush.teamSectionTitle}>
          <h2 className={tk.sectionTitle}>
            {MESSAGES.memberPush.teamSectionTitle}
          </h2>

          {isTeamsLoading ? (
            <div className={cn('h-12 w-full', tk.skeleton)} aria-hidden="true" />
          ) : teamsError ? (
            <EmptyState
              icon="error_outline"
              text={MESSAGES.memberPush.teamLoadError}
              actionLabel={MESSAGES.common.retry}
              onAction={() => void loadTeams()}
              iceTheme={iceTheme}
            />
          ) : teams.length === 0 ? (
            <EmptyState icon="groups_2" text={MESSAGES.memberPush.noTeam} iceTheme={iceTheme} />
          ) : teams.length === 1 ? (
            // 단일 팀 — 자동 선택, 읽기 전용 카드
            <div className={tk.teamCard}>
              <span className={tk.teamIconWrap}>
                <Icon name="groups" className={tk.teamIcon} aria-hidden="true" />
              </span>
              <span className={tk.teamName}>
                {teams[0].name ?? MESSAGES.common.unknown}
              </span>
            </div>
          ) : (
            // 다중 팀 — 라디오 형태 선택 리스트
            <div role="radiogroup" aria-label={MESSAGES.memberPush.teamSectionTitle} className="flex flex-col gap-2">
              {teams.map((t) => {
                const selected = selectedTeamId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedTeamId(t.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-w-md border px-4 py-3 text-left transition-colors duration-200 ease-ios motion-reduce:transition-none active:brightness-95',
                      selected ? tk.teamRadioActive : tk.teamRadioIdle,
                    )}
                  >
                    <Icon
                      name="groups"
                      className={cn('text-[20px]', selected ? tk.teamRadioIconActive : tk.teamRadioIconIdle)}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'flex-1 truncate text-card-body font-bold',
                        selected ? tk.teamRadioLabelActive : tk.teamRadioLabelIdle,
                      )}
                    >
                      {t.name ?? MESSAGES.common.unknown}
                    </span>
                    {selected && (
                      <Icon name="check_circle" className={tk.teamRadioCheck} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 대상 선택 ── (팀 선택 후에만 노출) */}
        {selectedTeamId && (
          <section aria-label={MESSAGES.memberPush.recipientSectionTitle}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={cn('text-card-meta font-bold uppercase tracking-[0.12em]', iceTheme ? 'text-it-ink-500 dark:text-rink-300' : 'text-wtext-3 dark:text-wtext-4')}>
                {MESSAGES.memberPush.recipientSectionTitle}
              </h2>
              {selectedCount > 0 && (
                <span className={tk.selectedCount}>
                  {MESSAGES.memberPush.selectedCount(selectedCount)}
                </span>
              )}
            </div>

            {isRecipientsLoading ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={cn('h-14 w-full', tk.skeleton)} aria-hidden="true" />
                ))}
              </div>
            ) : recipientsError ? (
              <EmptyState
                icon="error_outline"
                text={MESSAGES.memberPush.recipientLoadError}
                actionLabel={MESSAGES.common.retry}
                onAction={() => void loadRecipients(selectedTeamId)}
                iceTheme={iceTheme}
              />
            ) : totalRecipientCount === 0 ? (
              <EmptyState icon="person_off" text={MESSAGES.memberPush.recipientEmpty} iceTheme={iceTheme} />
            ) : (
              <>
                {/* 검색 + 전체선택 */}
                <div className="mb-3 flex flex-col gap-2">
                  <div className="relative">
                    <Icon
                      name="search"
                      className={tk.searchIcon}
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={MESSAGES.memberPush.recipientSearchPlaceholder}
                      aria-label={MESSAGES.memberPush.recipientSearchPlaceholder}
                      autoComplete="off"
                      className={tk.search}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="검색어 지우기"
                        className={tk.searchClear}
                      >
                        <Icon name="close" className="text-[18px]" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={visibleRecipients.length === 0}
                    className={tk.selectAllBtn}
                  >
                    <Icon
                      name={allVisibleSelected ? 'check_box' : 'check_box_outline_blank'}
                      className="text-[18px]"
                      aria-hidden="true"
                    />
                    <span>
                      {allVisibleSelected
                        ? MESSAGES.memberPush.deselectAll
                        : MESSAGES.memberPush.selectAll}
                    </span>
                  </button>
                </div>

                {/* 그룹별 섹션 */}
                {visibleRecipients.length === 0 ? (
                  <EmptyState icon="search_off" text={MESSAGES.memberPush.recipientSearchEmpty} iceTheme={iceTheme} />
                ) : (
                  <div className="flex flex-col gap-4">
                    {GROUP_META.map((group) => {
                      const list = filteredGroups[group.key];
                      if (list.length === 0) return null;
                      return (
                        <div key={group.key}>
                          <div className="mb-2 flex items-center gap-1.5">
                            <Icon name={group.icon} className={tk.groupIcon} aria-hidden="true" />
                            <h3 className={tk.groupLabel}>
                              {group.label}
                            </h3>
                            <span className={tk.groupCount}>
                              {list.length}
                            </span>
                          </div>
                          <ul className="flex list-none flex-col gap-2" role="list" aria-label={group.label}>
                            {list.map((r) => {
                              const checked = selectedIds.has(r.userId);
                              return (
                                <li key={r.userId} role="listitem">
                                  <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={checked}
                                    aria-label={`${r.name} ${checked ? '선택됨' : ''}`}
                                    onClick={() => toggleRecipient(r.userId)}
                                    className={cn(
                                      'flex w-full items-center gap-3 rounded-w-md border px-3.5 py-3 text-left transition-colors duration-150 ease-ios motion-reduce:transition-none active:brightness-95',
                                      checked ? tk.recipientActive : tk.recipientIdle,
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        'flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors motion-reduce:transition-none',
                                        checked ? tk.checkboxActive : tk.checkboxIdle,
                                      )}
                                      aria-hidden="true"
                                    >
                                      {checked && <Icon name="check" className="text-[16px] text-white" />}
                                    </span>
                                    <span className={tk.avatarWrap}>
                                      <span className={tk.avatarText}>
                                        {r.name?.charAt(0) || '?'}
                                      </span>
                                    </span>
                                    <span className={tk.recipientName}>
                                      {r.name}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── 메시지 입력 ── (팀 선택 후에만 노출) */}
        {selectedTeamId && (
          <section aria-label={MESSAGES.memberPush.messageSectionTitle}>
            <h2 className={tk.sectionTitle}>
              {MESSAGES.memberPush.messageSectionTitle}
            </h2>

            <div className="flex flex-col gap-4">
              {/* 제목 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor={titleInputId} className={tk.label}>
                    {MESSAGES.memberPush.titleLabel}
                  </label>
                  <span className={tk.charCount}>
                    {MESSAGES.memberPush.charCount(title.length, TITLE_MAX)}
                  </span>
                </div>
                <input
                  id={titleInputId}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  maxLength={TITLE_MAX}
                  placeholder={MESSAGES.memberPush.titlePlaceholder}
                  className={tk.input}
                />
              </div>

              {/* 내용 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor={messageInputId} className={tk.label}>
                    {MESSAGES.memberPush.messageLabel}
                  </label>
                  <span className={tk.charCount}>
                    {MESSAGES.memberPush.charCount(message.length, MESSAGE_MAX)}
                  </span>
                </div>
                <textarea
                  id={messageInputId}
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                  maxLength={MESSAGE_MAX}
                  rows={5}
                  placeholder={MESSAGES.memberPush.messagePlaceholder}
                  className={tk.textarea}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── 하단 고정 발송 버튼 ── */}
      {selectedTeamId && (
        <div
          className={tk.footer}
          style={{ paddingBottom: 'calc(0.75rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))' }}
        >
          <Button
            size="lg"
            fullWidth
            loading={isSending}
            disabled={!canSend}
            onClick={() => void handleSend()}
            aria-label={MESSAGES.memberPush.sendAction}
          >
            {isSending ? MESSAGES.memberPush.sending : MESSAGES.memberPush.sendAction}
          </Button>
        </div>
      )}
    </main>
  );
}

// ── 공용 빈/에러 상태 ──
function EmptyState({
  icon,
  text,
  actionLabel,
  onAction,
  iceTheme = false,
}: {
  icon: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  iceTheme?: boolean;
}) {
  if (iceTheme) {
    return (
      <div className="flex flex-col items-center justify-center rounded-w-md border border-it-line bg-it-surface px-4 py-10 dark:border-it-blue-900 dark:bg-it-blue-950" role="status">
        <Icon name={icon} className="mb-2 text-[32px] text-it-ink-400 dark:text-rink-300" aria-hidden="true" />
        <p className="text-center text-card-body font-medium text-it-ink-600 dark:text-rink-200">{text}</p>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="mt-3 text-card-meta font-bold text-it-blue-500 underline underline-offset-2 transition-colors motion-reduce:transition-none hover:text-it-blue-600"
          >
            {actionLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-w-md border border-wline-2 bg-wsurface px-4 py-10 dark:border-rink-700 dark:bg-rink-800" role="status">
      <Icon name={icon} className="mb-2 text-[32px] text-wtext-4 dark:text-wtext-3" aria-hidden="true" />
      <p className="text-center text-card-body font-medium text-wtext-2 dark:text-wtext-4">{text}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 text-card-meta font-bold text-ice-500 underline underline-offset-2 transition-colors motion-reduce:transition-none hover:text-ice-600"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default MemberPushComposer;
