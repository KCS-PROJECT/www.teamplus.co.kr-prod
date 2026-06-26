'use client';

/**
 * Task #32 I-1 — 선수 이력 카드 통합 뷰 (PARENT)
 *
 * 6 섹션:
 *   1) 기본 정보 (이름·생년월일·포지션·소속팀·등번호·프로필 사진)
 *   2) 훈련 이력 요약 + "자세히" → /children/:childId/class-history
 *   3) 대회 이력 (TournamentRegistration 스탯)
 *   4) 수상 이력 (상위 n건) + "자세히" → /awards
 *   5) 등급 배지 (MemberLevel)
 *   6) 영상 (I-2 연기 → "준비 중" placeholder)
 *
 * PDF 내보내기: window.print() + `@media print` 유틸리티 (외부 의존성 없음)
 *
 * 데이터 소스:
 *   - useChildren(): 자녀 기본 정보 + memberId
 *   - getChild(childId): 전체 ChildApiItem (birthDate, imageUrl 등)
 *   - usePlayerPortfolio(memberId): /awards/portfolio + /tournaments/player-stats 병렬
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useChildren, type ChildApiItem } from '@/hooks/useChildren';
import { usePlayerPortfolio } from '@/hooks/usePlayerPortfolio';
import { MESSAGES } from '@/lib/messages';
import { VideoUploadButton } from '@/components/videos/VideoUploadButton';
import { AwardItemCard } from '@/components/parent/AwardItemCard';
import type {
  RegisteredVideo,
} from '@/services/upload.service';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';
import type { PlayerAward } from '@/types/awards';
import type {
  PortfolioClassHistoryItem,
  TournamentStatsEntry,
} from '@/types/portfolio';

// ────────────────────────────────────────────
// 상수 / 유형 매핑
// ────────────────────────────────────────────
// [Task #8 / 2026-05-14] 수상 유형 매핑은 `@/components/parent/AwardItemCard` 단일 SoT.
//   기존 AWARD_TYPE_ICON / AWARD_TYPE_BADGE_CLASS 인라인 상수는 AwardItemCard 사용으로 제거.
//   대회 상태 라벨만 본 파일 전용으로 유지.

const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  scheduled: '예정',
  ongoing: '진행 중',
  finished: '종료',
  cancelled: '취소',
};

// 목록 중 상위 N개만 상세로 노출
const AWARDS_PREVIEW_LIMIT = 3;
const TOURNAMENTS_PREVIEW_LIMIT = 3;

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  const start = formatDate(startIso);
  const end = formatDate(endIso);
  if (start === '-' && end === '-') return '-';
  if (end === '-' || start === end) return start;
  return `${start} ~ ${end}`;
}

// [Task #8 / 2026-05-14] awardTypeLabel / awardTypeIcon / awardTypeBadgeClass 제거 —
//   `@/components/parent/AwardItemCard` 내부에서 동일 SoT 로직 제공.

function tournamentStatusLabel(status: string): string {
  return TOURNAMENT_STATUS_LABEL[status] ?? status;
}

function positionLabel(
  position: string | null | undefined,
): string {
  if (!position) return '-';
  // ex) 'F', 'D', 'G', 'LW', 'RW', 'C'
  switch (position.toUpperCase()) {
    case 'F':
      return '포워드';
    case 'D':
      return '디펜스';
    case 'G':
      return '골리';
    case 'LW':
      return '레프트윙';
    case 'RW':
      return '라이트윙';
    case 'C':
      return '센터';
    default:
      return position;
  }
}

// ────────────────────────────────────────────
// SectionHeader
// ────────────────────────────────────────────

interface SectionHeaderProps {
  icon: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex size-8 items-center justify-center rounded-w-pill bg-ice-500/10 text-ice-500">
          <Icon name={icon} className="text-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-card-emphasis font-bold text-wtext-1 dark:text-white truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 ml-2">{action}</div>}
    </div>
  );
}

// ────────────────────────────────────────────
// Section 1 — 기본 정보
// ────────────────────────────────────────────

interface BasicInfoSectionProps {
  name: string;
  birthDate: string | null | undefined;
  age: number;
  clubName: string | null;
  imageUrl: string | null;
  positions: Array<{
    team: string;
    teamShortName?: string | null;
    position?: string | null;
    jerseyNumber?: number | null;
  }>;
}

function BasicInfoSection({
  name,
  birthDate,
  age,
  clubName,
  imageUrl,
  positions,
}: BasicInfoSectionProps) {
  const hasValidImage = Boolean(
    imageUrl && imageUrl.trim() !== '' && !imageUrl.endsWith('/placeholder.svg'),
  );
  const initial = name.charAt(0) || '?';

  return (
    <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-5 print:shadow-none print:border-wline print:bg-white">
      <div className="flex items-start gap-4">
        {/* 프로필 사진 */}
        <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-ice-500/10 dark:bg-ice-500/20">
          {hasValidImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={resolveImageSrc(imageUrl) as string}
              alt={name}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              role="img"
              aria-label={`${name} 프로필 사진 미등록`}
            >
              <span
                className="text-4xl font-extrabold text-ice-500 tracking-tight select-none"
                aria-hidden="true"
              >
                {initial}
              </span>
            </div>
          )}
        </div>

        {/* 기본 정보 */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-wtext-1 dark:text-white leading-tight mb-1">
            {name}
          </h1>
          <dl className="space-y-0.5 text-card-body">
            <div className="flex items-center gap-2">
              <dt className="text-wtext-3 dark:text-rink-300 w-14 shrink-0">
                생년월일
              </dt>
              <dd className="text-wtext-1 dark:text-white tabular-nums">
                {formatDate(birthDate)}{' '}
                <span className="text-wtext-3 dark:text-rink-300">
                  ({age}세)
                </span>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-wtext-3 dark:text-rink-300 w-14 shrink-0">
                소속
              </dt>
              <dd className="text-wtext-1 dark:text-white truncate">
                {clubName ?? '미등록'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* 포지션 / 팀 / 등번호 */}
      {positions.length > 0 ? (
        <ul className="mt-4 grid grid-cols-1 gap-2">
          {positions.map((p, idx) => (
            <li
              key={`${p.team}-${idx}`}
              className="flex items-center justify-between bg-wbg dark:bg-rink-700/50 rounded-xl px-3 py-2 text-card-body"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon
                  name="groups"
                  className="text-[16px] text-ice-500 shrink-0"
                  aria-hidden="true"
                />
                <span className="font-semibold text-wtext-1 dark:text-white truncate">
                  {p.team}
                </span>
                {p.teamShortName && (
                  <span className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                    ({p.teamShortName})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-wtext-2 dark:text-rink-100">
                  {positionLabel(p.position)}
                </span>
                {typeof p.jerseyNumber === 'number' && (
                  <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-md bg-ice-500 text-white font-bold tabular-nums text-card-meta">
                    #{p.jerseyNumber}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-card-meta text-wtext-3 dark:text-rink-300">
          아직 등록된 팀/포지션 정보가 없습니다.
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────
// Section 2 — 훈련 이력 요약
// ────────────────────────────────────────────

interface TrainingSectionProps {
  totalClasses: number;
  completedClasses: number;
  activeClasses: number;
  attendedSessions: number;
  totalSessions: number;
  onViewMore: () => void;
}

function TrainingSection({
  totalClasses,
  completedClasses,
  activeClasses,
  attendedSessions,
  totalSessions,
  onViewMore,
}: TrainingSectionProps) {
  const attendanceRate =
    totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 0;

  return (
    <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-5 print:shadow-none print:border-wline print:bg-white">
      <SectionHeader
        icon="school"
        title="훈련 이력"
        subtitle="연간 수업 등록 및 출석 요약"
        action={
          <button
            type="button"
            onClick={onViewMore}
            className="inline-flex items-center gap-1 text-card-meta font-semibold text-ice-500 hover:text-blue-800 dark:hover:text-blue-300 transition-colors motion-reduce:transition-none print:hidden"
          >
            자세히
            <Icon name="chevron_right" size={16} aria-hidden="true" />
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="총 수업"
          value={totalClasses}
          iconName="event_note"
          iconBg="bg-indigo-50 dark:bg-indigo-900/20"
          iconColor="text-indigo-500"
        />
        <StatTile
          label="진행 중"
          value={activeClasses}
          iconName="play_circle"
          iconBg="bg-blue-50 dark:bg-blue-900/20"
          iconColor="text-blue-500"
        />
        <StatTile
          label="수료"
          value={completedClasses}
          iconName="verified"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          iconColor="text-emerald-500"
        />
      </div>

      <div className="mt-4 rounded-xl bg-wbg dark:bg-rink-700/30 px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-card-meta font-semibold text-wtext-2 dark:text-rink-100">
            출석률
          </span>
          <span className="text-card-body font-bold text-ice-500 tabular-nums">
            {attendanceRate}%
            <span className="ml-1 text-card-meta font-medium text-wtext-3 dark:text-rink-300">
              ({attendedSessions} / {totalSessions}회)
            </span>
          </span>
        </div>
        <div
          className="h-2 w-full rounded-w-pill bg-wline dark:bg-rink-700 overflow-hidden"
          role="progressbar"
          aria-valuenow={attendanceRate}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="출석률"
        >
          <div
            className="h-full rounded-w-pill bg-ice-500 transition-all duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.min(100, Math.max(0, attendanceRate))}%` }}
          />
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────
// Section 3 — 대회 이력 (상위 N건)
// ────────────────────────────────────────────

interface TournamentSectionProps {
  tournaments: TournamentStatsEntry[];
  totalGames: number;
  totalGoals: number;
  totalAssists: number;
  totalPoints: number;
}

function TournamentSection({
  tournaments,
  totalGames,
  totalGoals,
  totalAssists,
  totalPoints,
}: TournamentSectionProps) {
  const preview = tournaments.slice(0, TOURNAMENTS_PREVIEW_LIMIT);
  const remaining = Math.max(0, tournaments.length - preview.length);

  return (
    <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-5 print:shadow-none print:border-wline print:bg-white">
      <SectionHeader
        icon="emoji_events"
        title="대회 이력"
        subtitle={`총 ${tournaments.length}개 대회 · ${totalGames}경기`}
      />

      {/* 합산 스탯 */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <StatTile label="골" value={totalGoals} iconName="sports_score" iconBg="bg-amber-50 dark:bg-amber-900/20" iconColor="text-amber-500" compact />
        <StatTile label="어시스트" value={totalAssists} iconName="handshake" iconBg="bg-teal-50 dark:bg-teal-900/20" iconColor="text-teal-500" compact />
        <StatTile label="포인트" value={totalPoints} iconName="star" iconBg="bg-blue-50 dark:bg-blue-900/20" iconColor="text-blue-500" compact />
        <StatTile label="경기" value={totalGames} iconName="stadium" iconBg="bg-indigo-50 dark:bg-indigo-900/20" iconColor="text-indigo-500" compact />
      </div>

      {/* 대회 카드 */}
      {preview.length === 0 ? (
        <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center py-4">
          아직 참가한 대회가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {preview.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-wline-2 dark:border-rink-700 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="text-card-body font-bold text-wtext-1 dark:text-white truncate">
                  {t.name}
                </h3>
                <span className="shrink-0 text-card-meta font-bold uppercase px-2 py-0.5 rounded-w-pill bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100">
                  {tournamentStatusLabel(t.status)}
                </span>
              </div>
              <p className="text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums mb-2">
                {formatDateRange(t.startDate, t.endDate)}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-card-meta text-wtext-2 dark:text-rink-100 tabular-nums">
                <span>경기 {t.stats.gamesPlayed}</span>
                <span>골 {t.stats.goals}</span>
                <span>AS {t.stats.assists}</span>
                <span>P {t.stats.points}</span>
                {t.stats.penaltyMinutes > 0 && (
                  <span>PIM {t.stats.penaltyMinutes}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <p className="mt-3 text-card-meta text-wtext-3 dark:text-rink-300 text-center">
          외 {remaining}개 대회
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────
// Section 4 — 수상 이력 (상위 N건)
// ────────────────────────────────────────────

interface AwardsSectionProps {
  awards: PlayerAward[];
  onViewMore: () => void;
}

function AwardsSection({ awards, onViewMore }: AwardsSectionProps) {
  const preview = awards.slice(0, AWARDS_PREVIEW_LIMIT);
  const remaining = Math.max(0, awards.length - preview.length);

  return (
    <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-5 print:shadow-none print:border-wline print:bg-white">
      <SectionHeader
        icon="military_tech"
        title="수상 이력"
        subtitle={MESSAGES.awards.countLabel(awards.length)}
        action={
          <button
            type="button"
            onClick={onViewMore}
            className="inline-flex items-center gap-1 text-card-meta font-semibold text-ice-500 hover:text-blue-800 dark:hover:text-blue-300 transition-colors motion-reduce:transition-none print:hidden"
          >
            자세히
            <Icon name="chevron_right" size={16} aria-hidden="true" />
          </button>
        }
      />

      {preview.length === 0 ? (
        <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center py-4">
          {MESSAGES.awards.noAwards}
        </p>
      ) : (
        // [Task #8 / 2026-05-14] 공용 AwardItemCard (mode='preview') 사용 —
        //   awards 페이지(mode='page') 와 토큰/간격/날짜 포맷 단일 SoT.
        <div className="space-y-2">
          {preview.map((a) => (
            <AwardItemCard key={a.id} award={a} mode="preview" />
          ))}
        </div>
      )}

      {remaining > 0 && (
        <p className="mt-3 text-card-meta text-wtext-3 dark:text-rink-300 text-center">
          외 {remaining}건
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────
// Section 5 — 등급 배지
// ────────────────────────────────────────────

interface LevelBadgeSectionProps {
  currentLevel: number | null | undefined;
  levelLabel: string | null | undefined;
  progressPercent: number | null | undefined;
  nextTestDate: string | null | undefined;
}

function LevelBadgeSection({
  currentLevel,
  levelLabel,
  progressPercent,
  nextTestDate,
}: LevelBadgeSectionProps) {
  const hasLevel = typeof currentLevel === 'number' && currentLevel > 0;
  const percent = typeof progressPercent === 'number' ? progressPercent : 0;

  return (
    <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-5 print:shadow-none print:border-wline print:bg-white">
      <SectionHeader icon="workspace_premium" title="현재 등급" />

      {hasLevel ? (
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-ice-500 text-white shadow-sm">
            <span className="text-2xl font-extrabold tabular-nums">
              Lv.{currentLevel}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-card-emphasis font-bold text-wtext-1 dark:text-white mb-1">
              {levelLabel ?? '-'}
            </p>
            <div className="flex items-center justify-between mb-1">
              <span className="text-card-meta text-wtext-3 dark:text-rink-300">
                다음 레벨까지
              </span>
              <span className="text-card-meta font-bold text-ice-500 tabular-nums">
                {percent}%
              </span>
            </div>
            <div
              className="h-1.5 w-full rounded-w-pill bg-wline dark:bg-rink-700 overflow-hidden"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="다음 레벨 진행률"
            >
              <div
                className="h-full rounded-w-pill bg-ice-500 transition-all duration-500 motion-reduce:transition-none"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
            {nextTestDate && (
              <p className="mt-1.5 text-card-meta text-wtext-3 dark:text-rink-300 tabular-nums">
                다음 평가 · {formatDate(nextTestDate)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-card-body text-wtext-3 dark:text-rink-300 text-center py-2">
          아직 등급이 평가되지 않았습니다.
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────
// Section 6 — 플레이 영상 (Task #58 A-Web: R2 Presigned 업로드)
// ────────────────────────────────────────────

interface VideoSectionProps {
  /** 자녀의 TeamMember PK. 미승인(null)일 경우 업로드는 가능하나 메타데이터 등록은 스킵 */
  memberId: string | null;
  /** 영상 제목 기본값에 사용될 자녀 이름 */
  childName: string;
}

function VideoSection({ memberId, childName }: VideoSectionProps) {
  const [registered, setRegistered] = useState<RegisteredVideo | null>(null);

  const canUpload = Boolean(memberId);
  const defaultTitle = MESSAGES.video.defaultPlayerTitle(
    childName || '선수',
  );

  return (
    <section className="bg-white dark:bg-rink-800 rounded-2xl border border-wline-2 dark:border-rink-700 shadow-sm p-5 print:shadow-none print:border-wline print:bg-white">
      <SectionHeader icon="play_circle" title="플레이 영상" />

      {registered ? (
        <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/10 p-4">
          <div className="flex items-center gap-2 text-card-body font-semibold text-green-700 dark:text-green-400">
            <Icon name="check_circle" size={18} aria-hidden="true" />
            <span>{MESSAGES.video.registerSuccess}</span>
          </div>
          <dl className="flex flex-col gap-1.5 text-card-meta text-wtext-2 dark:text-rink-100">
            <div className="flex gap-2">
              <dt className="min-w-[56px] font-medium">제목</dt>
              <dd className="truncate">{registered.title}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="min-w-[56px] font-medium">URL</dt>
              <dd className="truncate font-mono text-[11px]">
                {registered.videoUrl}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-wbg dark:bg-rink-700/30 p-4 print:hidden">
          <div className="flex items-center gap-2 text-card-meta text-wtext-3 dark:text-rink-300">
            <Icon name="info" size={14} aria-hidden="true" />
            <span>훈련·경기 영상을 업로드하면 평가·피드백에 활용됩니다.</span>
          </div>
          <VideoUploadButton
            category="VIDEO"
            disabled={!canUpload}
            metadata={
              canUpload
                ? {
                    title: defaultTitle,
                    videoType: 'highlight',
                  }
                : undefined
            }
            onRegistered={(result) => {
              if ('videoUrl' in result) setRegistered(result);
            }}
          />
        </div>
      )}

      <div className="hidden print:flex print:flex-col print:items-center print:justify-center print:gap-2 print:rounded-xl print:bg-wbg print:py-6">
        <Icon name="videocam_off" className="text-3xl text-wtext-4" aria-hidden="true" />
        <p className="text-card-body text-wtext-3">인쇄본에는 영상이 표시되지 않습니다.</p>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────
// Stat Tile
// ────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: number;
  iconName: string;
  iconBg: string;
  iconColor: string;
  compact?: boolean;
}

function StatTile({
  label,
  value,
  iconName,
  iconBg,
  iconColor,
  compact,
}: StatTileProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl bg-wbg dark:bg-rink-700/30 py-2.5 px-2">
      <span
        className={cn(
          'flex items-center justify-center rounded-w-pill',
          compact ? 'size-7' : 'size-8',
          iconBg,
        )}
      >
        <Icon
          name={iconName}
          className={cn(compact ? 'text-[14px]' : 'text-[16px]', iconColor)}
          aria-hidden="true"
        />
      </span>
      <span
        className={cn(
          'font-bold text-wtext-1 dark:text-white tabular-nums',
          compact ? 'text-card-body' : 'text-card-emphasis',
        )}
      >
        {value}
      </span>
      <span className="text-card-meta font-medium text-wtext-3 dark:text-rink-300">
        {label}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────

export default function PlayerProfileCardPage() {
  const params = useParams();
  const { navigate } = useNavigation();
  const childId = (params?.childId as string) ?? '';

  // 네이티브 AppBar 숨김 (웹 PageAppBar 사용)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const {
    children,
    isLoading: childrenLoading,
    getChild,
  } = useChildren();

  const childFromList = useMemo(
    () => children.find((c) => c.id === childId) ?? null,
    [children, childId],
  );
  const memberId = childFromList?.memberId ?? null;

  // ChildApiItem (birthDate, imageUrl 포함) 별도 조회
  const [childDetail, setChildDetail] = useState<ChildApiItem | null>(null);
  const [childDetailError, setChildDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    (async () => {
      const res = await getChild(childId);
      if (cancelled) return;
      if (res.success && res.data) {
        setChildDetail(res.data);
      } else if (!res.success) {
        setChildDetailError(
          res.error ?? MESSAGES.common.loadFailed,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [childId, getChild]);

  const {
    portfolio,
    tournamentStats,
    isLoading: portfolioLoading,
    errorMessage: portfolioError,
  } = usePlayerPortfolio(memberId);

  const isLoading = childrenLoading || (!!memberId && portfolioLoading);

  usePageReady(!isLoading);

  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }, []);

  const handleViewClassHistory = useCallback(() => {
    navigate(`/children/${encodeURIComponent(childId)}/class-history`);
  }, [childId, navigate]);

  // [수정 2026-05-14 Task #8] 선수카드 ↔ 수상이력 UI 통일.
  // 원인: profile-card 의 AwardsSection "자세히" 클릭이 `/awards` (PARENT 통합 페이지)
  //       로 라우팅되어, "수상 이력" 버튼이 가는 `/children/{id}/awards` (자녀별 페이지)
  //       와 다른 UI(자녀 선택 드롭다운 vs 자녀별 직진입)가 표시되어 사용자 혼동.
  // 조치: 동일 자녀의 awards 페이지(`/children/{childId}/awards`)로 라우팅 통일 →
  //       두 진입점이 동일 페이지로 이동하므로 UI 자동 통일 + 자녀 선택 단계 생략.
  const handleViewAwards = useCallback(() => {
    navigate(`/children/${encodeURIComponent(childId)}/awards`);
  }, [childId, navigate]);

  // 집계 값
  const attendedSessions = useMemo(() => {
    if (!portfolio) return 0;
    return portfolio.classHistories.reduce(
      (sum: number, item: PortfolioClassHistoryItem) =>
        sum + (item.attendedSessions ?? 0),
      0,
    );
  }, [portfolio]);

  const totalSessions = useMemo(() => {
    if (!portfolio) return 0;
    return portfolio.classHistories.reduce(
      (sum: number, item: PortfolioClassHistoryItem) =>
        sum + (item.totalSessions ?? 0),
      0,
    );
  }, [portfolio]);

  // ── 렌더: 로딩 ──
  if (isLoading) {
    return null;
  }

  // ── 렌더: 자녀 미발견 ──
  if (!childFromList && !childDetail) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="선수 이력 카드" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center bg-it-canvas dark:bg-puck">
          <Icon
            name="person_off"
            className="text-5xl text-it-ink-300 dark:text-wtext-4"
            aria-hidden="true"
          />
          <p className="text-card-emphasis font-semibold text-it-ink-700 dark:text-rink-100">
            자녀 정보를 찾을 수 없습니다.
          </p>
          {childDetailError && (
            <p className="text-card-meta text-it-ink-500 dark:text-wtext-4">
              {childDetailError}
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate('/children')}
            className="mt-2 px-4 py-2 rounded-w-md bg-it-blue-500 text-white text-card-body font-semibold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            자녀 목록으로
          </button>
        </main>
      </MobileContainer>
    );
  }

  // ── 렌더: 팀 미가입 (memberId 없음) ──
  if (!memberId) {
    const name = childFromList?.name ?? '자녀';
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="선수 이력 카드" forceNative />
        <main className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center bg-it-canvas dark:bg-puck">
          <Icon
            name="info"
            className="text-5xl text-it-ink-300 dark:text-wtext-4"
            aria-hidden="true"
          />
          <p className="text-card-emphasis font-semibold text-it-ink-700 dark:text-rink-100">
            팀 가입이 필요합니다.
          </p>
          <p className="text-card-body text-it-ink-500 dark:text-wtext-4">
            {name}의 선수 이력 카드를 확인하려면 먼저 팀에 가입해주세요.
          </p>
          <button
            type="button"
            onClick={() => navigate('/team')}
            className="mt-2 px-4 py-2 rounded-w-md bg-it-blue-500 text-white text-card-body font-semibold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            팀 찾아보기
          </button>
        </main>
      </MobileContainer>
    );
  }

  // ── 정상 렌더 ──
  const name =
    childFromList?.name ??
    (childDetail ? `${childDetail.lastName}${childDetail.firstName}` : '선수');
  const age = childFromList?.age ?? childDetail?.age ?? 0;
  const clubName =
    childFromList?.club ??
    childDetail?.clubName ??
    childDetail?.clubMemberships?.[0]?.clubName ??
    null;
  const imageUrl = childDetail?.imageUrl ?? childFromList?.imageUrl ?? null;
  const birthDate = childDetail?.birthDate ?? null;

  const positions = tournamentStats?.player.positions ?? [];
  const tournaments = tournamentStats?.tournaments ?? [];
  const totalStats = tournamentStats?.totalStats ?? {
    goals: 0,
    assists: 0,
    points: 0,
    penalties: 0,
    penaltyMinutes: 0,
    gamesPlayed: 0,
  };

  const awards = portfolio?.playerAwards ?? [];
  const summary = portfolio?.summary ?? {
    totalClasses: 0,
    completedClasses: 0,
    activeClasses: 0,
    totalAwards: 0,
  };

  return (
    <MobileContainer hasBottomNav>
      <div className="print:hidden">
        {/* [appbar-harness-v4 · parent-agent · 2026-05-12] rightAction → extraActions 변환 —
            기존 print 버튼이 시계/종/메뉴 우측 3 액션을 통째로 대체하던 문제 해결.
            extraActions[print] + 메뉴 자동 유지 → 글로벌 메뉴 접근성 회복. */}
        <PageAppBar
          title="선수 이력 카드"
          forceNative
          extraActions={[
            {
              icon: 'print',
              onClick: handlePrint,
              label: 'PDF로 저장 또는 인쇄',
            },
          ]}
        />
      </div>

      <main className="flex-1 overflow-y-auto print:overflow-visible bg-it-canvas dark:bg-puck print:bg-white">
        {portfolioError && (
          <div className="mx-5 mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-card-meta text-amber-700 dark:text-amber-400 print:hidden">
            <Icon
              name="warning"
              size={14}
              className="align-middle mr-1"
              aria-hidden="true"
            />
            {portfolioError}
          </div>
        )}

        <div
          className="flex flex-col gap-4 px-5 py-4 print:px-8 print:py-6 print:gap-3"
          data-player-profile-card
        >
          {/* 인쇄 헤더 (화면에서는 숨김) */}
          <div className="hidden print:block">
            <h1 className="text-xl font-extrabold text-wtext-1">
              TEAMPLUS 선수 이력 카드
            </h1>
            <p className="text-card-meta text-wtext-3 mt-0.5 tabular-nums">
              발급일 · {formatDate(new Date().toISOString())}
            </p>
            <hr className="mt-2 border-wline" />
          </div>

          <BasicInfoSection
            name={name}
            birthDate={birthDate}
            age={age}
            clubName={clubName}
            imageUrl={imageUrl}
            positions={positions}
          />

          <TrainingSection
            totalClasses={summary.totalClasses}
            completedClasses={summary.completedClasses}
            activeClasses={summary.activeClasses}
            attendedSessions={attendedSessions}
            totalSessions={totalSessions}
            onViewMore={handleViewClassHistory}
          />

          <TournamentSection
            tournaments={tournaments}
            totalGames={totalStats.gamesPlayed}
            totalGoals={totalStats.goals}
            totalAssists={totalStats.assists}
            totalPoints={totalStats.points}
          />

          <AwardsSection awards={awards} onViewMore={handleViewAwards} />

          <LevelBadgeSection
            currentLevel={childFromList?.currentLevel ?? childDetail?.currentLevel}
            levelLabel={childFromList?.levelLabel ?? childDetail?.levelLabel}
            progressPercent={
              childFromList?.progressPercent ?? childDetail?.progressPercent
            }
            nextTestDate={
              childFromList?.nextTestDate ?? childDetail?.nextTestDate ?? null
            }
          />

          <VideoSection memberId={memberId} childName={name} />

          {/* 인쇄 푸터 */}
          <div className="hidden print:block mt-2">
            <hr className="mb-2 border-wline" />
            <p className="text-card-meta text-wtext-3 text-center">
              본 이력 카드는 TEAMPLUS 플랫폼에서 발급되었습니다.
            </p>
          </div>
        </div>
      </main>

      {/* 인쇄 전용 전역 스타일 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }
          html,
          body {
            background: #ffffff !important;
          }
          /* MobileContainer 해제 — 인쇄 시 전체 폭 사용 */
          [data-mobile-shell] {
            position: static !important;
            max-width: none !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          /* 루트 fixed 컨테이너 해제 */
          [data-mobile-shell]:first-child,
          body > div > div.fixed {
            position: static !important;
            overflow: visible !important;
          }
          main {
            overflow: visible !important;
          }
        }
      `}</style>
    </MobileContainer>
  );
}
