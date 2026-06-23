'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { VenuePicker } from '@/components/common/VenuePicker';
import { DatePickerModal, formatDateLabel } from '@/components/ui/DatePickerModal';
import { TimePicker, formatTimeLabel } from '@/components/ui/TimePicker';
import { MatchApplicantsSheet } from '@/components/match/MatchApplicantsSheet';
import { MatchEditSheet } from '@/components/match/MatchEditSheet';

// Backend PickupMatch.status 와 정합 (prisma/schema.prisma: "recruiting|closing_soon|closed|cancelled")
export type PickupMatchStatus = 'recruiting' | 'closing_soon' | 'closed' | 'cancelled';

export interface Match {
  id: string;
  title: string;
  date: string;
  /** 'HH:MM' (24h) 내부 표준 — 화면 표시는 formatTimeLabel 로 변환 */
  time: string;
  location: string;
  status: PickupMatchStatus;
  currentParticipants: number;
  maxParticipants: number;
  fee: number;
  /** 백엔드 PickupMatch.level 은 한글("초급|중급|고급") String — LevelBadge 가 한글/영문 모두 매핑 */
  level: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number;
  awayScore?: number;
  description?: string;
}


type TabType = 'new' | 'registered';

const tabs: { key: TabType; label: string }[] = [
  { key: 'new', label: '새 매치 등록' },
  { key: 'registered', label: '등록된 매치' },
];

const levelOptions = [
  { key: 'beginner', label: '입문' },
  { key: 'intermediate', label: '초급' },
  { key: 'advanced', label: '중급' },
  { key: 'expert', label: '상급' },
];

interface StatusConfigItem {
  bg: string;
  text: string;
  border: string;
  dot: string;
  label: string;
}

const STATUS_CONFIG: Record<PickupMatchStatus, StatusConfigItem> = {
  recruiting: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-100 dark:border-emerald-800/50',
    dot: 'bg-emerald-500',
    label: '모집 중',
  },
  closing_soon: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-100 dark:border-amber-800/50',
    dot: 'bg-amber-500',
    label: '마감 임박',
  },
  closed: {
    bg: 'bg-wline-2 dark:bg-rink-700',
    text: 'text-wtext-2 dark:text-rink-100',
    border: 'border-wline dark:border-rink-700',
    dot: 'bg-wtext-4',
    label: '모집 마감',
  },
  cancelled: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-600 dark:text-red-300',
    border: 'border-red-100 dark:border-red-800/50',
    dot: 'bg-red-500',
    label: '취소',
  },
};

// 백엔드가 추가 enum (full/ongoing/completed 같은 레거시 값) 을 반환해도 크래시 방지
const STATUS_FALLBACK: StatusConfigItem = {
  bg: 'bg-wline-2 dark:bg-rink-700',
  text: 'text-wtext-2 dark:text-rink-100',
  border: 'border-wline dark:border-rink-700',
  dot: 'bg-wtext-4',
  label: '미정',
};

function StatusBadge({ status }: { status: Match['status'] }) {
  const c = STATUS_CONFIG[status] ?? STATUS_FALLBACK;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-w-pill ${c.bg} ${c.text} text-[10px] font-bold border ${c.border}`}
    >
      <span className={`size-1.5 rounded-w-pill ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  );
}

function LevelBadge({ level }: { level: Match['level'] }) {
  // 백엔드 PickupMatch.level 은 한글 String("초급|중급|고급") 을 반환한다.
  // 영문 키(레거시/타입 호환) + 한글 키(실제 값) 모두 매핑한다.
  const config: Record<string, { bg: string; text: string; label: string }> = {
    beginner: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: '초급' },
    intermediate: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-ice-500 dark:text-blue-300', label: '중급' },
    advanced: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: '고급' },
    all: { bg: 'bg-wline-2 dark:bg-rink-700', text: 'text-wtext-2 dark:text-rink-100', label: '전체' },
    초급: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: '초급' },
    중급: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-ice-500 dark:text-blue-300', label: '중급' },
    고급: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: '고급' },
    전체: { bg: 'bg-wline-2 dark:bg-rink-700', text: 'text-wtext-2 dark:text-rink-100', label: '전체' },
  };

  // 미지의 level 값을 반환해도 크래시 방지 (WEB-067) — StatusBadge 와 동일 폴백 패턴
  const c = config[level] ?? {
    bg: 'bg-wline-2 dark:bg-rink-700',
    text: 'text-wtext-2 dark:text-rink-100',
    label: level || '전체',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원';
}

function MatchCard({
  match,
  onEdit,
  onDelete,
  onManageParticipants,
}: {
  match: Match;
  onEdit: () => void;
  onDelete: () => void;
  onManageParticipants: () => void;
}) {
  // 픽업 매치 상태: recruiting → closing_soon → closed (또는 cancelled)
  // LIVE/진행 중 개념은 없음 (이것은 일반 매치 MatchStatus 의 영역)
  const isClosed = match.status === 'closed';
  const hasScore =
    match.homeTeam !== undefined &&
    (typeof match.homeScore === 'number' || typeof match.awayScore === 'number');

  return (
    <div className="bg-white dark:bg-rink-800 rounded-2xl shadow-sm border border-wline-2 dark:border-rink-700 overflow-hidden">
      {/* Header with Status */}
      <div className="p-4 pb-3 flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={match.status} />
            <LevelBadge level={match.level} />
          </div>
          <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white mt-2">
            {match.title}
          </h3>
        </div>
      </div>

      {/* Match Score (경기 종료 후 등록된 스코어 표시) */}
      {isClosed && hasScore && (
        <div className="px-4 py-4 bg-wbg dark:bg-rink-700/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-col items-center flex-1">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-rink-500 border border-wline dark:border-rink-300 flex items-center justify-center mb-2">
                <Icon name="shield" className="text-2xl text-ice-500" aria-hidden="true" />
              </div>
              <span className="text-card-meta font-medium text-wtext-2 dark:text-rink-100 text-center">
                {match.homeTeam}
              </span>
              <span className="text-2xl font-black text-wtext-1 dark:text-white mt-1">
                {match.homeScore}
              </span>
            </div>

            <div className="flex flex-col items-center px-4">
              <span className="text-[10px] font-black text-wtext-3 italic">VS</span>
            </div>

            <div className="flex flex-col items-center flex-1">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-rink-500 border border-wline dark:border-rink-300 flex items-center justify-center mb-2">
                <Icon name="verified_user" className="text-2xl text-teal-500" />
              </div>
              <span className="text-card-meta font-medium text-wtext-2 dark:text-rink-100 text-center">
                {match.awayTeam}
              </span>
              <span className="text-2xl font-black text-wtext-1 dark:text-white mt-1">
                {match.awayScore}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Match Info */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 text-card-body text-wtext-2 dark:text-rink-100">
          <div className="flex items-center gap-2">
            <Icon name="calendar_today" className="text-wtext-3 text-card-title" />
            <span>{match.date}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="schedule" className="text-wtext-3 text-card-title" />
            <span>{match.time ? formatTimeLabel(match.time) : '-'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-card-body text-wtext-2 dark:text-rink-100">
          <Icon name="location_on" className="text-wtext-3 text-card-title shrink-0" />
          <span className="min-w-0 truncate">{match.location}</span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-wline-2 dark:border-rink-700">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <Icon name="groups" className="text-wtext-3 text-card-title" />
              <span className="text-card-body font-bold text-wtext-1 dark:text-white whitespace-nowrap">
                {match.currentParticipants}/{match.maxParticipants}명
              </span>
            </div>
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-card-body font-bold text-ice-500 truncate">
                {formatCurrency(match.fee)}
              </span>
            </div>
          </div>

          {/* Progress */}
          <div className="w-20 shrink-0">
            <div className="w-full bg-wline-2 dark:bg-rink-700 h-1.5 rounded-w-pill overflow-hidden">
              <div
                className={`h-full transition-all motion-reduce:transition-none duration-500 ${
                  match.currentParticipants === match.maxParticipants
                    ? 'bg-blue-500'
                    : 'bg-ice-500'
                }`}
                style={{
                  width: `${(match.currentParticipants / match.maxParticipants) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {match.description && (
          <p className="text-card-meta text-wtext-3 pt-2 border-t border-wline-2 dark:border-rink-700">
            {match.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onManageParticipants}
          className="flex-1 h-11 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-card-body font-semibold flex items-center justify-center gap-1.5 hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
        >
          <Icon name="group" className="text-[18px]" aria-hidden="true" />
          신청자
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 h-11 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 text-card-body font-semibold flex items-center justify-center gap-1.5 hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
        >
          <Icon name="edit" className="text-[18px]" aria-hidden="true" />
          수정하기
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="매치 삭제"
          className="h-11 w-11 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 flex items-center justify-center hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Icon name="delete_outline" className="text-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function NewMatchForm() {
  const [selectedLevel, setSelectedLevel] = useState<string>('intermediate');
  const [venueId, setVenueId] = useState<string>('');
  const [matchDate, setMatchDate] = useState<string>('');
  const [matchTime, setMatchTime] = useState<string>('');
  const [isDateOpen, setIsDateOpen] = useState(false);
  const matchTitleId = useId();
  const matchDateId = useId();
  const matchPeopleId = useId();
  const matchFeeId = useId();
  const matchDescId = useId();

  return (
    <div className="px-5 py-6 flex flex-col gap-6">
      {/* Section: Basic Info */}
      <section className="flex flex-col gap-4">
        <h2 className="text-card-title font-bold text-wtext-1 dark:text-white flex items-center gap-2">
          <Icon name="edit_calendar" className="text-ice-500" />
          기본 정보
        </h2>
        <div className="bg-white dark:bg-rink-800 p-5 rounded-2xl shadow-sm border border-wline-2 dark:border-rink-700 flex flex-col gap-5">
          {/* Title */}
          <div className="flex flex-col gap-2">
            <label htmlFor={matchTitleId} className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
              매치 제목
            </label>
            <input
              id={matchTitleId}
              type="text"
              placeholder="예: 주말 오전 친선 경기"
              required
              aria-required="true"
              className="w-full h-12 px-4 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body placeholder:text-wtext-3"
            />
          </div>

          {/* Date & Time Row — flex-1 칼럼에 min-w-0 필수 (truncate 작동 → 카드 넘침 방지) */}
          <div className="flex gap-2">
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <label htmlFor={matchDateId} className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
                일자
              </label>
              {/* 공통 DatePickerModal — 버튼으로만 열어 직접 입력 차단 */}
              <button
                id={matchDateId}
                type="button"
                onClick={() => setIsDateOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isDateOpen}
                aria-label="매치 일자 선택"
                className="h-12 w-full rounded-[12px] bg-wbg dark:bg-rink-700 border border-wline dark:border-rink-700 px-3 flex items-center gap-2 text-left transition-colors motion-reduce:transition-none hover:border-ice-500 focus-visible:outline-none focus-visible:border-ice-500"
              >
                <Icon
                  name="calendar_today"
                  size={18}
                  className="text-wtext-3 dark:text-rink-300 shrink-0"
                  aria-hidden="true"
                />
                <span
                  className={`flex-1 min-w-0 text-card-meta font-semibold tabular-nums truncate ${
                    matchDate ? 'text-wtext-1 dark:text-white' : 'text-wtext-3 dark:text-rink-300'
                  }`}
                >
                  {matchDate ? formatDateLabel(matchDate) : 'YYYY.MM.DD'}
                </span>
              </button>
              <DatePickerModal
                isOpen={isDateOpen}
                value={matchDate}
                onClose={() => setIsDateOpen(false)}
                onSelect={(iso) => setMatchDate(iso)}
                ariaLabel="매치 일자 선택"
              />
            </div>
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
                시간
              </span>
              {/* 공통 TimePicker — 버튼으로만 열어 직접 입력 차단 */}
              <TimePicker
                value={matchTime}
                onChange={setMatchTime}
                placeholder="시간"
                sheetTitle="시작 시간을 선택해주세요."
                ariaLabel="매치 시작 시간 선택"
                showChevron={false}
                className="px-3 gap-2 bg-wbg dark:bg-rink-700"
              />
            </div>
          </div>

          {/* Stadium Selector — 공통 VenuePicker (BottomSheet 팝업 + GET /venues 실데이터) */}
          <div className="flex flex-col gap-2">
            <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
              구장 선택
            </span>
            <VenuePicker
              value={venueId}
              onChange={setVenueId}
              placeholder="구장을 선택하세요"
              sheetTitle="구장을 선택해주세요."
              ariaLabel="구장 선택 열기"
              className="bg-wbg dark:bg-rink-700"
            />
          </div>
        </div>
      </section>

      {/* Section: Requirements */}
      <section className="flex flex-col gap-4">
        <h2 className="text-card-title font-bold text-wtext-1 dark:text-white flex items-center gap-2">
          <Icon name="groups" className="text-ice-500" />
          모집 요건
        </h2>
        <div className="bg-white dark:bg-rink-800 p-5 rounded-2xl shadow-sm border border-wline-2 dark:border-rink-700 flex flex-col gap-5">
          {/* People & Fee Row */}
          <div className="flex gap-4">
            <div className="flex flex-col gap-2 w-1/3">
              <label htmlFor={matchPeopleId} className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
                모집 인원
              </label>
              <div className="relative flex items-center">
                <input
                  id={matchPeopleId}
                  type="number"
                  defaultValue={12}
                  min={1}
                  placeholder="12"
                  aria-label="모집 인원"
                  className="w-full h-12 pl-4 pr-8 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body font-semibold text-center"
                />
                <span className="absolute right-3 text-card-meta text-wtext-3 font-medium">명</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label htmlFor={matchFeeId} className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
                참가비 (1인)
              </label>
              <div className="relative flex items-center">
                <input
                  id={matchFeeId}
                  type="text"
                  placeholder="10,000"
                  aria-label="1인당 참가비"
                  className="w-full h-12 pl-4 pr-8 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body font-semibold text-right"
                />
                <span className="absolute right-3 text-card-meta text-wtext-3 font-medium">원</span>
              </div>
            </div>
          </div>

          {/* Skill Level Chips */}
          <div className="flex flex-col gap-2">
            <span className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
              실력 레벨 제한
            </span>
            <div
              className="grid grid-cols-4 gap-2"
              role="radiogroup"
              aria-label="실력 레벨 선택"
            >
              {levelOptions.map((level) => {
                const isSelected = selectedLevel === level.key;
                return (
                  <button
                    type="button"
                    key={level.key}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedLevel(level.key)}
                    className={`min-h-11 px-2 py-2 rounded-lg text-card-body font-bold text-center transition-colors motion-reduce:transition-none border active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 ${
                      isSelected
                        ? 'bg-ice-500 text-white shadow-sm border-ice-500'
                        : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 border-transparent hover:bg-wline dark:hover:bg-rink-500'
                    }`}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Section: Additional Notes */}
      <section className="flex flex-col gap-4">
        <div className="bg-white dark:bg-rink-800 p-5 rounded-2xl shadow-sm border border-wline-2 dark:border-rink-700 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={matchDescId} className="text-card-body font-medium text-wtext-3 dark:text-rink-300">
              안내 사항 (옵션)
            </label>
            <textarea
              id={matchDescId}
              placeholder="주차 정보, 준비물 등 참가자에게 알릴 내용을 입력하세요."
              className="w-full h-24 px-4 py-3 rounded-xl border border-wline dark:border-rink-700 focus:border-ice-500 focus:ring-1 focus:ring-ice-500 bg-wbg dark:bg-rink-700 text-card-body resize-none"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

const MATCH_FILTER_CONFIG: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'recruiting', label: '모집 중' },
  { key: 'closing_soon', label: '마감 임박' },
  { key: 'closed', label: '모집 마감' },
  { key: 'cancelled', label: '취소' },
];

/**
 * API 응답 형태 방어 (WEB-066).
 * 백엔드 `GET /api/v1/matches` 는 페이지네이션 객체 `{ total, page, limit, items }` 를 반환한다.
 * 배열 / `{ items }` / `{ data }` / `{ matches }` 어떤 형태로 와도 매치 배열을 안전하게 추출한다.
 */
function extractMatchItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['items', 'data', 'matches'] as const) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 백엔드 PickupMatch 응답 → 프론트 Match 정규화.
 * 백엔드는 `scheduledAt`(ISO)·`rinkName`·`price`·`level`(한글) 을, 프론트는 `date`/`time`/`location`/`fee` 를 사용한다.
 */
function normalizeMatch(raw: unknown): Match {
  const r = (raw ?? {}) as Record<string, unknown>;
  // 외부 raw 응답을 안전하게 정규화 — string/number 필드는 typeof 가드 후 사용.
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const count = (r._count ?? {}) as { applicants?: number };
  let date = str(r.date);
  let time = str(r.time);
  if (r.scheduledAt) {
    const d = new Date(r.scheduledAt as string);
    if (!Number.isNaN(d.getTime())) {
      date = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
      time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
  }
  return {
    id: String(r.id ?? ''),
    title: str(r.title),
    date,
    time,
    location: str(r.rinkName) || str(r.location),
    status: (r.status ?? 'recruiting') as PickupMatchStatus,
    currentParticipants: Number(r.currentParticipants ?? count.applicants ?? 0),
    maxParticipants: Number(r.maxParticipants ?? 0),
    fee: typeof r.price === 'number' ? r.price : Number(r.fee ?? 0),
    level: str(r.level) || 'all',
    homeTeam: str(r.homeTeamName) || str(r.homeTeam) || undefined,
    awayTeam: str(r.awayTeamName) || str(r.awayTeam) || undefined,
    homeScore: typeof r.homeScore === 'number' ? r.homeScore : undefined,
    awayScore: typeof r.awayScore === 'number' ? r.awayScore : undefined,
    description: str(r.description) || undefined,
  };
}

function RegisteredMatchList({
  matches,
  onEdit,
  onDelete,
  onManageParticipants,
}: {
  matches: Match[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onManageParticipants: (id: string) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { filteredMatches, counts } = useMemo(() => {
    // 런타임 형태 방어 — matches 가 배열이 아닐 경우 빈 배열로 폴백 (WEB-066)
    const safeMatches = Array.isArray(matches) ? matches : [];
    const allCounts: Record<string, number> = {
      all: safeMatches.length,
      recruiting: 0,
      closing_soon: 0,
      closed: 0,
      cancelled: 0,
    };
    safeMatches.forEach((m) => {
      if (m.status in allCounts) allCounts[m.status] += 1;
    });
    const filtered =
      filterStatus === 'all' ? safeMatches : safeMatches.filter((m) => m.status === filterStatus);
    return { filteredMatches: filtered, counts: allCounts };
  }, [matches, filterStatus]);

  return (
    <div className="px-5 py-6 flex flex-col gap-5">
      {/* Filter Chips */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar"
        role="tablist"
        aria-label="매치 상태 필터"
      >
        {MATCH_FILTER_CONFIG.map(({ key, label }) => {
          const isActive = filterStatus === key;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilterStatus(key)}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-3 rounded-w-pill text-card-meta font-bold whitespace-nowrap transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 ${
                isActive
                  ? 'bg-ice-500 text-white shadow-sm'
                  : 'bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:border-ice-500/50'
              }`}
            >
              {label}
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-w-pill text-[10px] font-bold tabular-nums ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-card-emphasis font-bold text-wtext-1 dark:text-white">
          등록된 매치
        </h3>
        <span className="text-card-meta font-semibold text-wtext-3 dark:text-rink-300 tabular-nums">
          총 {filteredMatches.length}건
        </span>
      </div>

      {/* Match List */}
      <div className="flex flex-col gap-4">
        {filteredMatches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            onEdit={() => onEdit(match.id)}
            onDelete={() => onDelete(match.id)}
            onManageParticipants={() => onManageParticipants(match.id)}
          />
        ))}

        {filteredMatches.length === 0 && (
          <div className="rounded-2xl border border-dashed border-wline dark:border-rink-700 bg-white dark:bg-rink-800 p-10 text-center">
            <Icon
              name="sports_hockey"
              className="text-[40px] text-wtext-3 dark:text-rink-300"
              aria-hidden="true"
            />
            <p className="mt-3 text-card-body font-bold text-wtext-2 dark:text-rink-100">
              {MESSAGES.match.list.empty}
            </p>
            <p className="mt-1 text-card-meta text-wtext-3 dark:text-rink-300">
              새 매치를 등록해보세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MatchesPage() {
  const { toast } = useToast();
  const { modal } = useModal();
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // [BUG FIX 2026-05-30] Native(실폰/시뮬레이터)에서 상단 status bar 영역이 사라지는 회귀 수정.
  //   match-manage 는 forceNative 로 DOM AppBar 를 강제 렌더하지만 useNativeUI 를 호출하지
  //   않아 Flutter 네이티브 AppBar 상태(_showAppBarDynamic)가 이전 화면 상태로 잔존했다.
  //   → webview_screen.dart:1094 `isNativeAppBarVisible ? 0 : viewPadding.top` 분기에서
  //     isNativeAppBarVisible=true 로 평가 → webViewTopSafeInset=0 → status bar 영역 미예약
  //     → DOM AppBar 가 노치/시계와 겹쳐 보이지 않음.
  //   네이티브 AppBar 를 명시적으로 끄면(showAppBar:false) webViewTopSafeInset 이
  //   viewPadding.top 으로 계산되어 status bar 영역이 정상 예약된다.
  //   admin/page.tsx · members/[id]/credits 와 동일한 검증된 forceNative + useNativeUI 패턴.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
    isDataLoaded: !isLoading,
  });

  const loadMatches = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<unknown>('/matches');
      // 백엔드는 { total, page, limit, items } 페이지네이션 객체 반환 → items 추출(WEB-066) 후 정규화
      setMatches(res.success ? extractMatchItems(res.data).map(normalizeMatch) : []);
    } catch {
      setMatches([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  usePageReady(!isLoading);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [participantsMatchId, setParticipantsMatchId] = useState<string | null>(null);

  // 수정하기 — 카드의 매치로 수정 시트 오픈
  const handleEdit = (id: string) => {
    const match = matches.find((m) => m.id === id);
    if (match) setEditingMatch({ ...match });
  };

  // 수정 시트 저장 완료 — 목록 반영
  const handleMatchSaved = (updated: Match) => {
    setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setEditingMatch(null);
  };

  // 삭제 — 확인 모달 후 DELETE /matches/:id (pickup-matches 도메인)
  const handleDelete = async (id: string) => {
    const confirmed = await modal.confirm({
      title: '매치 삭제',
      message: MESSAGES.match.deleteConfirm,
      confirmText: '삭제하기',
      cancelText: '취소',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const response = await api.delete(`/matches/${id}`);
      if (response.success) {
        setMatches((prev) => prev.filter((m) => m.id !== id));
        toast.success(MESSAGES.match.deleted);
      } else {
        toast.error(response.error?.message ?? MESSAGES.save.error);
      }
    } catch {
      toast.error(MESSAGES.save.error);
    }
  };

  // 신청자 — 신청자 관리 시트 오픈 (목록/승인/거절은 시트가 자체 처리)
  const handleManageParticipants = (matchId: string) => {
    setParticipantsMatchId(matchId);
  };

  const handleSubmit = () => {
    toast.success(MESSAGES.match.created);
    setActiveTab('registered');
  };

  return (
    <MobileContainer hasBottomNav>
      {/* AppBar
          [BUG FIX 2026-05-19 W3 #11] Native(Flutter WebView) 환경에서 PageAppBar 가 null 반환되어
            상단바가 사라지는 회귀 — `forceNative` 추가로 네이티브 환경에서도 강제 렌더.
            useNativeUI 미적용 페이지지만 Native 환경에서 정상 동작 보장. */}
      <PageAppBar title="매치 관리" className="z-40" forceNative />

      {/* Segmented Tabs */}
      <div className="sticky top-14 z-30 bg-wbg dark:bg-rink-900 px-5 py-4 border-b border-wline dark:border-rink-700">
        <div
          className="flex p-1 bg-wline/70 dark:bg-rink-700 rounded-xl"
          role="tablist"
          aria-label="매치 관리 탭"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-h-[44px] px-4 rounded-lg text-card-body transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 ${
                  isActive
                    ? 'bg-white dark:bg-rink-800 text-ice-500 dark:text-blue-300 shadow-sm font-bold'
                    : 'text-wtext-3 dark:text-rink-300 font-semibold hover:text-wtext-2 dark:hover:text-rink-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content
          [수정 2026-05-29] 하단 액션 바를 fixed → 콘텐츠 흐름 맨 아래로 이동 (사용자 요청).
            떠있는 바 제거에 따라 new 탭 pb-48 → pb-32 로 정상화. */}
      <main className="flex-1 overflow-y-auto pb-32">
        {activeTab === 'new' ? (
          <>
            <NewMatchForm />
            {/* 하단 액션 버튼 — body(콘텐츠) 영역 맨 아래 (fixed 아님, 스크롤 흐름 내) */}
            <div className="px-5 pb-6 flex gap-3">
              <button
                type="button"
                className="flex-1 h-12 rounded-xl bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100 font-bold text-card-emphasis hover:bg-wline dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500"
              >
                미리보기
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-[2] h-12 rounded-xl bg-ice-500 hover:bg-ice-700 text-white font-bold text-card-emphasis shadow-md transition-colors motion-reduce:transition-none active:brightness-95 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-rink-900"
              >
                매치 등록하기
              </button>
            </div>
          </>
        ) : (
          <RegisteredMatchList
            matches={matches}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onManageParticipants={handleManageParticipants}
          />
        )}
      </main>

      {/* 신청자 관리 시트 — 목록 조회 + 승인/거절 (자체 fetch) */}
      <MatchApplicantsSheet
        isOpen={participantsMatchId !== null}
        matchId={participantsMatchId}
        onClose={() => setParticipantsMatchId(null)}
        onChanged={loadMatches}
      />

      {/* 매치 수정 시트 — 폼 prefill + PATCH /matches/:id */}
      <MatchEditSheet
        isOpen={editingMatch !== null}
        match={editingMatch}
        onClose={() => setEditingMatch(null)}
        onSaved={handleMatchSaved}
      />
    </MobileContainer>
  );
}
