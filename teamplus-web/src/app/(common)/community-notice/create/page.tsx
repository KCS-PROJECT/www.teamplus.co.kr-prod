'use client';

// 수업/대회 단위 공지 작성/수정 (Phase 1 · unit-notice-stream-design v1.2.3 §4.5·§5).
//   대상 픽커 = GET /community/targets (관할 수업·대회) — 축 배타로 정확히 1개 선택.
//   수정 모드(?edit=id)는 대상(축) 변경 불가 — 내용·노출 기간만.
//   상단 고정 토글은 화면 미제공(2026-08-20 A안 — 백엔드 isPinned·정렬·배지는 보존).
//   첨부 = 공용 files/upload(category=IMAGE) 선행 업로드 후 메타 전송 (이미지 4종·10MB).
//   notices-create(팀 공지 작성)와 동일한 iceTheme flat 폼 언어.

import { useId, useRef, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { useToast } from '@/components/ui/Toast';
import { emitRefresh, REFRESH_KEYS } from '@/lib/refresh-bus';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from '@/hooks/useSessionAuth';
import { uploadFile } from '@/services/upload.service';
import {
  createUnitNotice,
  fetchUnitNoticeDetail,
  fetchUnitNoticeTargets,
  isUnitNoticeManagerRole,
  updateUnitNotice,
  type UnitNoticeTargets,
} from '@/services/community-notice.service';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SheetSelectRow } from '@/components/notice/SheetSelectRow';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 첨부 이미지 계약 — 백엔드 unit-notice.dto (4종·10MB)와 동일 */
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_COUNT = 5;

/** 절대시각(ISO) → date 입력값 (KST 달력일) — notices-create 규약 동일 (+9h & getUTC*) */
function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const kst = new Date(ms + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

/** date 입력값 → KST 벽시계 기준 절대시각 ISO (start=00:00 / end=23:59:59.999) */
function kstDateToIso(date: string, boundary: 'start' | 'end'): string | null {
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

/** 픽커 값 인코딩 — 축:id (축 배타 select 단일 값) */
type TargetValue =
  | `team:${string}`
  | `class:${string}`
  | `tournament:${string}`
  | '';

interface PendingAttachment {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export default function UnitNoticeCreatePage() {
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
  });

  const { back } = useNavigation();
  const { toast } = useToast();
  const { user } = useSessionAuth();
  // [Codex R1 H-05] 작성 화면 역할 가드 — 백엔드 MANAGER_ROLES 와 동일 집합.
  // (common) 그룹이라 인증만으로 진입 가능하던 것을 역할 차원에서 차단 (최종 판정은 서버).
  // [Codex R3 H-05] 인라인 배열 → 헬퍼 단일 SoT (상세 화면 canWrite 와 집합 드리프트 차단).
  const roleAllowed = isUnitNoticeManagerRole(user?.userType);
  const roleBlocked = !!user && !roleAllowed;
  const searchParams = useSearchParams();
  const editId = searchParams?.get('edit') ?? null;
  const isEditMode = Boolean(editId);
  // 상세 화면(수업/대회)에서 진입 시 대상 프리셋 — ?classId= | ?tournamentId=
  const presetClassId = searchParams?.get('classId') ?? null;
  const presetTournamentId = searchParams?.get('tournamentId') ?? null;
  // [Phase 2] 팀 공지 축 — ?teamId= 프리셋 (팀 화면 진입용)
  const presetTeamId = searchParams?.get('teamId') ?? null;

  const titleId = useId();
  const contentId = useId();
  const targetId = useId();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [target, setTarget] = useState<TargetValue>('');
  // 대상 픽커 바텀시트 — 네이티브 select 는 WebView 에서 OS 픽커가 떠 앱 디자인과
  // 이질적 · 관리 공지함 단위 필터와 동일한 공통 시트 패턴으로 통일
  const [isTargetSheetOpen, setIsTargetSheetOpen] = useState(false);
  const [targets, setTargets] = useState<UnitNoticeTargets | null>(null);
  const [isTargetsLoading, setIsTargetsLoading] = useState(!isEditMode);
  const [targetsLoadFailed, setTargetsLoadFailed] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 첨부 — 업로드 완료된 메타만 보관 (작성 시 함께 전송)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  usePageReady(!isPrefilling && !isTargetsLoading);

  // 수정 모드 프리필 — 대상(축)은 변경 불가라 표시만
  const [editTargetName, setEditTargetName] = useState<string | null>(null);
  const [editAxis, setEditAxis] = useState<
    'team' | 'class' | 'tournament' | null
  >(null);
  // [Codex R1 H-05] 비관할 수정 진입 차단 — 상세 응답의 서버 canManage 가 단일 기준
  const [editBlocked, setEditBlocked] = useState(false);
  // [Codex R1 H-05] 상세 진입 preset 이 관할 목록에 없으면 다른 대상으로 풀리는 대신 차단
  const [presetInvalid, setPresetInvalid] = useState(false);
  useEffect(() => {
    if (!editId) {
      setIsPrefilling(false);
      return;
    }
    let cancelled = false;
    setIsPrefilling(true);
    (async () => {
      try {
        const res = await fetchUnitNoticeDetail(editId);
        if (cancelled) return;
        if (res.success && res.data) {
          const n = res.data;
          if (!n.canManage) {
            // 비관할 사용자의 ?edit= 직접 진입 — 폼 프리필 없이 차단
            setEditBlocked(true);
            setIsPrefilling(false);
            return;
          }
          setTitle(n.title ?? '');
          setContent(n.content ?? '');
          setStartDate(toDateInput(n.startAt));
          setEndDate(toDateInput(n.expiresAt));
          setEditTargetName(n.targetName ?? null);
          setEditAxis(
            n.teamId
              ? 'team'
              : n.targetClassId
                ? 'class'
                : n.targetTournamentId
                  ? 'tournament'
                  : null,
          );
        } else {
          toast.error(MESSAGES.unitNotice.loadFailed);
        }
      } finally {
        if (!cancelled) setIsPrefilling(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, toast]);

  // 대상 픽커 후보 — 신규 작성만
  const loadTargets = useCallback(async () => {
    setIsTargetsLoading(true);
    setTargetsLoadFailed(false);
    try {
      const res = await fetchUnitNoticeTargets();
      if (res.success && res.data) {
        setTargets(res.data);
        // 상세 화면 진입 프리셋 — 관할 목록에 있으면 그 대상으로 잠금,
        // 없으면(비관할·종료 등) 다른 대상으로 풀리는 대신 **작성 차단** (H-05 오발송 방지)
        if (presetClassId || presetTournamentId || presetTeamId) {
          if (
            presetClassId &&
            res.data.classes.some((c) => c.id === presetClassId)
          ) {
            setTarget(`class:${presetClassId}`);
          } else if (
            presetTournamentId &&
            res.data.tournaments.some((t) => t.id === presetTournamentId)
          ) {
            setTarget(`tournament:${presetTournamentId}`);
          } else if (
            presetTeamId &&
            res.data.teams.some((t) => t.id === presetTeamId)
          ) {
            setTarget(`team:${presetTeamId}`);
          } else {
            setPresetInvalid(true);
          }
        }
      } else {
        setTargetsLoadFailed(true);
      }
    } catch {
      setTargetsLoadFailed(true);
    } finally {
      setIsTargetsLoading(false);
    }
  }, [presetClassId, presetTournamentId, presetTeamId]);

  useEffect(() => {
    if (isEditMode) return;
    void loadTargets();
  }, [isEditMode, loadTargets]);

  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const list = Array.from(files);
      if (attachments.length + list.length > IMAGE_MAX_COUNT) {
        toast.error(MESSAGES.unitNotice.maxImages(IMAGE_MAX_COUNT));
        return;
      }
      for (const file of list) {
        if (!IMAGE_MIMES.includes(file.type)) {
          toast.error(MESSAGES.unitNotice.attachInvalidType);
          return;
        }
        if (file.size > IMAGE_MAX_BYTES) {
          toast.error(MESSAGES.unitNotice.attachTooLarge);
          return;
        }
      }
      setIsUploading(true);
      try {
        for (const file of list) {
          const uploaded = await uploadFile(file, { category: 'IMAGE' });
          setAttachments((prev) => [
            ...prev,
            {
              fileUrl: uploaded.url,
              fileName: uploaded.originalName ?? file.name,
              fileType: uploaded.mimeType ?? file.type,
              fileSize: uploaded.size ?? file.size,
            },
          ]);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : MESSAGES.error.network,
        );
      } finally {
        setIsUploading(false);
      }
    },
    [attachments.length, toast],
  );

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!isEditMode && !target) {
      toast.error(MESSAGES.unitNotice.requiredTarget);
      return;
    }
    if (!trimmedTitle) {
      toast.error(MESSAGES.unitNotice.requiredTitle);
      return;
    }
    if (!trimmedContent) {
      toast.error(MESSAGES.unitNotice.requiredContent);
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast.error(MESSAGES.noticesCreate.periodInvalid);
      return;
    }
    setIsSubmitting(true);
    try {
      let response;
      if (isEditMode && editId) {
        response = await updateUnitNotice(editId, {
          title: trimmedTitle,
          content: trimmedContent,
          startAt: startDate ? kstDateToIso(startDate, 'start') : null,
          expiresAt: endDate ? kstDateToIso(endDate, 'end') : null,
        });
      } else {
        const [axis, id] = target.split(':') as [
          'team' | 'class' | 'tournament',
          string,
        ];
        response = await createUnitNotice({
          title: trimmedTitle,
          content: trimmedContent,
          ...(axis === 'team'
            ? { teamId: id }
            : axis === 'class'
              ? { targetClassId: id }
              : { targetTournamentId: id }),
          ...(startDate && { startAt: kstDateToIso(startDate, 'start')! }),
          ...(endDate && { expiresAt: kstDateToIso(endDate, 'end')! }),
          ...(attachments.length > 0 && { attachments }),
        });
      }
      if (response.success) {
        toast.success(
          isEditMode ? MESSAGES.unitNotice.updated : MESSAGES.unitNotice.created,
        );
        emitRefresh(REFRESH_KEYS.UNIT_NOTICES);
        back();
      } else {
        toast.error(response.error?.message ?? MESSAGES.error.network);
      }
    } catch {
      toast.error(MESSAGES.error.network);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isScheduledStart = (() => {
    if (!startDate) return false;
    const kstToday = new Date(Date.now() + KST_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    return startDate > kstToday;
  })();

  const hasNoTargets =
    !isEditMode &&
    !isTargetsLoading &&
    !targetsLoadFailed &&
    targets !== null &&
    targets.teams.length === 0 &&
    targets.classes.length === 0 &&
    targets.tournaments.length === 0;

  // 상세 페이지 진입(프리셋) — 그 단위의 공지를 쓰러 온 맥락이므로 대상 변경을 잠근다
  // (다른 수업/대회로 오발송 방지). 프리셋이 관할 목록에 실재해 자동 선택된 경우만 잠금 —
  // 목록에 없으면(종료 수업 등) 픽커로 폴백해 다른 대상 선택을 허용한다.
  const presetTarget: TargetValue | '' = presetClassId
    ? `class:${presetClassId}`
    : presetTournamentId
      ? `tournament:${presetTournamentId}`
      : presetTeamId
        ? `team:${presetTeamId}`
        : '';
  const isTargetLocked = !isEditMode && !!presetTarget && target === presetTarget;
  // 픽커 트리거 표시용 — 선택 값의 축 아이콘·이름 (시트 그룹 아이콘과 동일 체계)
  const selectedTargetOption = (() => {
    if (!target || !targets) return null;
    if (target.startsWith('team:')) {
      const name = targets.teams.find((t) => `team:${t.id}` === target)?.name;
      return name ? { icon: 'groups', name } : null;
    }
    if (target.startsWith('class:')) {
      const name = targets.classes.find((c) => `class:${c.id}` === target)?.name;
      return name ? { icon: 'school', name } : null;
    }
    const name = targets.tournaments.find(
      (t) => `tournament:${t.id}` === target,
    )?.name;
    return name ? { icon: 'trophy', name } : null;
  })();
  const lockedTargetName = isTargetLocked
    ? (presetClassId
        ? targets?.classes.find((c) => c.id === presetClassId)?.name
        : presetTournamentId
          ? targets?.tournaments.find((t) => t.id === presetTournamentId)?.name
          : targets?.teams.find((t) => t.id === presetTeamId)?.name) ?? null
    : null;

  // 헤더 제목 — 축이 확정되면(프리셋·픽커 선택·수정 프리필) 팀/훈련/대회를 구분해 표기
  const resolvedAxis: 'team' | 'class' | 'tournament' | null = isEditMode
    ? editAxis
    : target.startsWith('team:')
      ? 'team'
      : target.startsWith('class:')
        ? 'class'
        : target.startsWith('tournament:')
          ? 'tournament'
          : presetClassId
            ? 'class'
            : presetTournamentId
              ? 'tournament'
              : presetTeamId
                ? 'team'
                : null;
  const pageTitle = isEditMode
    ? resolvedAxis === 'team'
      ? MESSAGES.unitNotice.editTitleTeam
      : resolvedAxis === 'class'
        ? MESSAGES.unitNotice.editTitleClass
        : resolvedAxis === 'tournament'
          ? MESSAGES.unitNotice.editTitleTournament
          : MESSAGES.unitNotice.editTitle
    : resolvedAxis === 'team'
      ? MESSAGES.unitNotice.writeTitleTeam
      : resolvedAxis === 'class'
        ? MESSAGES.unitNotice.writeTitleClass
        : resolvedAxis === 'tournament'
          ? MESSAGES.unitNotice.writeTitleTournament
          : MESSAGES.unitNotice.writeTitle;

  // [Codex R1 H-05] 차단 화면 — ①비관리 역할 ②비관할 공지 수정 ③미관할 preset 진입.
  // 폼을 렌더하지 않아 다른 대상으로의 오발송 경로 자체를 제거한다 (최종 판정은 서버).
  if (roleBlocked || editBlocked || presetInvalid) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar
          title={pageTitle}
          className="z-50"
          onBack={() => back()}
          forceNative
        />
        <main className="flex-1 overflow-y-auto w-full max-w-md mx-auto bg-it-canvas dark:bg-puck">
          <section className="mt-2 bg-it-surface dark:bg-rink-800 px-5 py-16">
            <div className="flex flex-col items-center gap-3">
              <Icon
                name="error_outline"
                className="text-3xl text-it-ink-400 dark:text-it-ink-300"
                aria-hidden="true"
              />
              <p className="text-card-body font-semibold text-it-ink-800 dark:text-white text-center">
                {presetInvalid
                  ? MESSAGES.unitNotice.targetNotManaged
                  : MESSAGES.unitNotice.notFoundOrForbidden}
              </p>
              <button
                type="button"
                onClick={() => back()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-w-md bg-it-blue-500 px-4 py-2 text-card-meta font-bold text-white hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                {MESSAGES.notice.backToList}
              </button>
            </div>
          </section>
        </main>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar
        title={pageTitle}
        className="z-50"
        onBack={() => back()}
        forceNative
      />

      <main
        className="flex-1 overflow-y-auto !pb-0 w-full max-w-md mx-auto bg-it-canvas dark:bg-puck"
        style={{ WebkitOverflowScrolling: 'touch' as never }}
      >
        {/* 대상 픽커 — flat 흰 섹션 */}
        <section
          className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5"
          aria-label={MESSAGES.unitNotice.targetLabel}
        >
          <label
            htmlFor={targetId}
            className="block text-[14px] font-bold text-it-ink-800 dark:text-white mb-2"
          >
            {MESSAGES.unitNotice.targetLabel}
          </label>

          {isEditMode || isTargetLocked ? (
            // 수정 모드·상세 페이지 진입(프리셋) — 축(대상) 변경 불가, 표시만
            <div className="flex items-center gap-2 px-4 h-[50px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line dark:border-rink-700 rounded-w-md">
              <Icon
                name="campaign"
                className="text-[18px] text-it-blue-500"
                aria-hidden="true"
              />
              <span className="text-[15px] font-semibold text-it-ink-800 dark:text-white truncate">
                {(isEditMode ? editTargetName : lockedTargetName) ??
                  MESSAGES.unitNotice.targetFallback}
              </span>
            </div>
          ) : targetsLoadFailed ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-w-md bg-it-red-50 dark:bg-it-red-500/10 px-3 py-2.5"
            >
              <Icon
                name="error_outline"
                className="mt-px text-[16px] shrink-0 text-it-red-500 dark:text-it-red-300"
                aria-hidden="true"
              />
              <span className="flex-1 text-card-meta text-it-red-500 dark:text-it-red-300">
                {MESSAGES.unitNotice.loadFailed}
              </span>
              <button
                type="button"
                onClick={() => void loadTargets()}
                disabled={isTargetsLoading}
                className="shrink-0 text-card-meta font-bold text-it-red-500 dark:text-it-red-300 underline disabled:opacity-50"
              >
                {MESSAGES.notice.loadRetry}
              </button>
            </div>
          ) : hasNoTargets ? (
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300">
              {MESSAGES.unitNotice.targetEmpty}
            </p>
          ) : (
            // select 형 트리거 + 공통 바텀시트 — 관리 공지함 단위 필터와 동일 패턴
            <button
              type="button"
              id={targetId}
              onClick={() => setIsTargetSheetOpen(true)}
              aria-haspopup="dialog"
              className="flex w-full items-center justify-between gap-2 px-3 h-[50px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md transition-colors motion-reduce:transition-none ease-ios hover:border-it-blue-500/40 active:brightness-95 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500"
            >
              {selectedTargetOption ? (
                <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-it-ink-800 dark:text-white">
                  <Icon
                    name={selectedTargetOption.icon}
                    className="text-[16px] shrink-0 text-it-blue-500"
                    aria-hidden="true"
                  />
                  <span className="truncate">{selectedTargetOption.name}</span>
                </span>
              ) : (
                <span className="text-[15px] font-semibold text-it-ink-400 dark:text-it-ink-300">
                  {MESSAGES.unitNotice.targetPlaceholder}
                </span>
              )}
              <Icon
                name="expand_more"
                className="text-[18px] shrink-0 text-it-ink-400 dark:text-it-ink-300"
                aria-hidden="true"
              />
            </button>
          )}
        </section>

        {/* 대상 픽커 바텀시트 — 팀/훈련/대회 그룹 (밴드 라벨 + 들여쓰기), 선택 즉시 적용·닫힘 */}
        <BottomSheet
          isOpen={isTargetSheetOpen}
          onClose={() => setIsTargetSheetOpen(false)}
          title={MESSAGES.unitNotice.targetLabel}
        >
          <div className="pb-2">
            {targets && targets.teams.length > 0 && (
              <>
                <p className="rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                  {MESSAGES.unitNotice.targetTeamGroup}
                </p>
                <div className="pl-2">
                  {targets.teams.map((t) => (
                    <SheetSelectRow
                      key={t.id}
                      label={t.name}
                      icon="groups"
                      active={target === `team:${t.id}`}
                      onClick={() => {
                        setTarget(`team:${t.id}`);
                        setIsTargetSheetOpen(false);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {targets && targets.classes.length > 0 && (
              <>
                <p className="mt-2 rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                  {MESSAGES.unitNotice.targetClassGroup}
                </p>
                <div className="pl-2">
                  {targets.classes.map((c) => (
                    <SheetSelectRow
                      key={c.id}
                      label={c.name}
                      icon="school"
                      active={target === `class:${c.id}`}
                      onClick={() => {
                        setTarget(`class:${c.id}`);
                        setIsTargetSheetOpen(false);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {targets && targets.tournaments.length > 0 && (
              <>
                <p className="mt-2 rounded-w-md bg-it-fill dark:bg-it-blue-900/30 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-it-ink-400 dark:text-it-ink-300">
                  {MESSAGES.unitNotice.targetTournamentGroup}
                </p>
                <div className="pl-2">
                  {targets.tournaments.map((t) => (
                    <SheetSelectRow
                      key={t.id}
                      label={t.name}
                      icon="trophy"
                      active={target === `tournament:${t.id}`}
                      onClick={() => {
                        setTarget(`tournament:${t.id}`);
                        setIsTargetSheetOpen(false);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </BottomSheet>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 제목·내용 */}
        <section
          className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5 space-y-5"
          aria-label={MESSAGES.unitNotice.contentSectionAria}
        >
          <div>
            <label
              htmlFor={titleId}
              className="block text-[14px] font-bold text-it-ink-800 dark:text-white mb-2"
            >
              {MESSAGES.unitNotice.titleLabel}
            </label>
            <input
              id={titleId}
              className="w-full px-4 h-[50px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
              placeholder={MESSAGES.unitNotice.titlePlaceholder}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          <div>
            <label
              htmlFor={contentId}
              className="block text-[14px] font-bold text-it-ink-800 dark:text-white mb-2"
            >
              {MESSAGES.unitNotice.contentLabel}
            </label>
            <textarea
              id={contentId}
              rows={10}
              className="w-full px-4 py-3 bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[15.5px] font-semibold text-it-ink-800 dark:text-white placeholder:text-it-ink-400 dark:placeholder:text-wtext-3 focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios resize-none"
              placeholder={MESSAGES.unitNotice.contentPlaceholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          {/* 이미지 첨부 — 신규 작성만 (수정은 기존 첨부 유지) */}
          {!isEditMode && (
            <div>
              <span className="block text-[14px] font-bold text-it-ink-800 dark:text-white">
                {MESSAGES.unitNotice.attachLabel}
              </span>
              <span className="mt-0.5 block text-card-meta text-it-ink-500 dark:text-rink-300">
                {MESSAGES.unitNotice.attachHint}
              </span>
              {attachments.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {attachments.map((att, index) => (
                    <li
                      key={`${att.fileUrl}-${index}`}
                      className="flex items-center gap-2 rounded-w-md bg-it-fill dark:bg-rink-900 px-3 py-2"
                    >
                      <Icon
                        name="image"
                        className="text-[16px] text-it-blue-500 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="flex-1 min-w-0 truncate text-card-meta font-semibold text-it-ink-800 dark:text-white">
                        {att.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                        aria-label={MESSAGES.unitNotice.attachRemoveAria(att.fileName)}
                        className="shrink-0 flex h-8 w-8 items-center justify-center rounded-w-md text-it-ink-400 hover:bg-it-line/50 dark:text-it-ink-300"
                      >
                        <Icon name="close" className="text-[16px]" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* [Codex R1 M-03] label 래핑은 키보드 진입점이 없음 — 포커스 가능한
                  버튼이 숨김 input 을 프로그램적으로 연다 */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="mt-3 inline-flex items-center gap-1.5 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 px-4 py-2.5 text-card-meta font-bold text-it-ink-800 dark:text-white hover:bg-it-fill dark:hover:bg-rink-900 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Icon
                  name={isUploading ? 'progress_activity' : 'add_photo_alternate'}
                  className={`text-[18px] ${isUploading ? 'animate-spin motion-reduce:animate-none' : ''}`}
                  aria-hidden="true"
                />
                {isUploading
                  ? MESSAGES.unitNotice.uploading
                  : MESSAGES.unitNotice.imagePick}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_MIMES.join(',')}
                multiple
                disabled={isUploading}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  void handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </section>

        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 옵션 — 노출 기간.
            [2026-08-20 A안] 상단 고정 토글은 화면에서 제거 — 접힘 2건 블록에서 고정이
            최신 공지를 밀어내는 역효과. 백엔드(isPinned·정렬·배지)는 보존(Phase 2 이관 대비). */}
        <section
          className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6"
          aria-label={MESSAGES.unitNotice.optionsSectionAria}
        >
          <div>
            <span className="block text-[14px] font-bold text-it-ink-800 dark:text-white">
              {MESSAGES.unitNotice.periodLabel}
            </span>
            <span className="mt-0.5 block text-card-meta text-it-ink-500 dark:text-rink-300">
              {MESSAGES.unitNotice.periodHint}
            </span>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="unit-notice-start-date"
                  className="block text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 mb-1.5"
                >
                  {MESSAGES.unitNotice.periodStart}
                </label>
                <input
                  id="unit-notice-start-date"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
                />
              </div>
              <div>
                <label
                  htmlFor="unit-notice-end-date"
                  className="block text-card-meta font-semibold text-it-ink-600 dark:text-rink-100 mb-1.5"
                >
                  {MESSAGES.unitNotice.periodEnd}
                </label>
                <input
                  id="unit-notice-end-date"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 h-[46px] bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md text-[14px] font-semibold text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500/20 focus:border-it-blue-500 transition-colors motion-reduce:transition-none ease-ios"
                />
              </div>
            </div>
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
                <span>{MESSAGES.unitNotice.scheduleHint}</span>
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
                {MESSAGES.unitNotice.periodReset}
              </button>
            )}
          </div>
        </section>
      </main>

      {/* CTA Footer */}
      <div className="w-full max-w-md mx-auto px-5 py-3 bg-it-canvas dark:bg-puck">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            isPrefilling ||
            isUploading ||
            (!isEditMode && (isTargetsLoading || targetsLoadFailed || hasNoTargets))
          }
          className="w-full h-[54px] rounded-w-md bg-it-blue-500 text-white font-extrabold text-[16px] hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none flex items-center justify-center gap-2 disabled:bg-it-line-strong dark:disabled:bg-rink-700 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? isEditMode
              ? MESSAGES.unitNotice.updating
              : MESSAGES.unitNotice.submitting
            : isEditMode
              ? MESSAGES.unitNotice.actionEdit
              : MESSAGES.unitNotice.actionSubmit}
          <Icon
            name={isEditMode ? 'edit' : 'check'}
            className="text-[20px]"
            aria-hidden="true"
          />
        </button>
      </div>
    </MobileContainer>
  );
}
