'use client';

/**
 * MatchEventInputForm — 실시간 이벤트 입력 폼 (관리자 전용)
 *
 * 특징:
 *  - 이벤트 타입 선택(골/페널티/세이브/슛)
 *  - 피리어드 선택
 *  - 팀 선택 (홈/어웨이)
 *  - 이벤트 시간 (MM:SS 검증)
 *  - 페널티 타입 서브 필드 (페널티 선택 시)
 *  - onSubmit 콜백으로 이벤트 생성 요청
 *
 * 권한: 상위 컴포넌트에서 isManager 확인 후 렌더링해야 함.
 */

import { useId, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type {
  CreateMatchEventInput,
  MatchDetail,
  MatchEventType,
  PenaltyType,
} from '@/services/tournament.service';
import { cn } from '@/lib/utils';

interface Props {
  match: MatchDetail;
  onSubmit: (input: CreateMatchEventInput) => Promise<void>;
  isSubmitting?: boolean;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → flat, 입력 it-fill+1.5px, 색만 it-* 치환(검증 로직 동결).
   */
  iceTheme?: boolean;
}

const EVENT_TYPES: { value: MatchEventType; label: string; icon: string }[] = [
  { value: 'goal', label: '골', icon: 'sports_hockey' },
  { value: 'penalty', label: '페널티', icon: 'gavel' },
  { value: 'shot', label: '슛', icon: 'sports' },
  { value: 'save', label: '세이브', icon: 'shield' },
];

const PENALTY_TYPES: { value: PenaltyType; label: string; minutes: number }[] = [
  { value: 'minor', label: '마이너 (2분)', minutes: 2 },
  { value: 'major', label: '메이저 (5분)', minutes: 5 },
  { value: 'misconduct', label: '미스컨덕트 (10분)', minutes: 10 },
  { value: 'game_misconduct', label: '게임 미스컨덕트', minutes: 0 },
];

const MM_SS_REGEX = /^[0-9]{1,2}:[0-5][0-9]$/;

export function MatchEventInputForm({ match, onSubmit, isSubmitting, iceTheme = false }: Props) {
  const periodId = useId();
  const timeId = useId();
  const typeId = useId();
  const teamId = useId();

  const [eventType, setEventType] = useState<MatchEventType>('goal');
  const [periodNumber, setPeriodNumber] = useState<number>(
    match.currentPeriod ?? 1,
  );
  const [eventTime, setEventTime] = useState('00:00');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    match.homeTeam?.id ?? '',
  );
  const [penaltyType, setPenaltyType] = useState<PenaltyType>('minor');
  const [penaltyMinutes, setPenaltyMinutes] = useState<number>(2);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!MM_SS_REGEX.test(eventTime)) {
      setError(MESSAGES.matchEvent.eventTimeFormat);
      return;
    }
    if (!selectedTeamId) {
      setError('팀을 선택해주세요.');
      return;
    }

    const input: CreateMatchEventInput = {
      periodNumber,
      eventTime,
      eventType,
      teamId: selectedTeamId,
    };
    if (eventType === 'penalty') {
      input.penaltyType = penaltyType;
      input.penaltyMinutes = penaltyMinutes;
    }
    if (description.trim()) {
      input.description = description.trim();
    }

    setError(null);
    try {
      await onSubmit(input);
      // 성공 시 시간만 남기고 설명 리셋
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : MESSAGES.matchEvent.createFailed);
    }
  };

  // ── iceTheme 토큰 클래스 (false 경로는 기존 클래스 1:1 유지) ──
  const labelCls = iceTheme
    ? 'mb-2 block text-xs font-bold text-it-ink-600 dark:text-rink-100'
    : 'mb-2 block text-xs font-bold text-wtext-2 dark:text-rink-100';
  // 선택형 chip(이벤트 타입/팀) — idle/active 분기.
  const chipIdle = iceTheme
    ? 'border-it-line-strong bg-it-fill text-it-ink-600 hover:bg-it-line dark:border-rink-700 dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500'
    : 'border-wline bg-wbg text-wtext-2 hover:bg-wline-2 dark:border-rink-700 dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500';
  const chipActive = iceTheme
    ? 'border-it-blue-500 bg-it-blue-500 text-white'
    : 'border-ice-500 bg-ice-500 text-white';
  const chipBorderW = iceTheme ? 'border-[1.5px]' : 'border';
  const chipRadius = iceTheme ? 'rounded-w-md' : 'rounded-lg';
  // 텍스트/셀렉트 인풋 — it-fill + 1.5px border.
  const inputCls = iceTheme
    ? 'h-10 w-full rounded-w-md border-[1.5px] border-it-line-strong bg-it-fill px-3 text-sm text-it-ink-800 focus:border-it-blue-500 focus:bg-it-surface focus:outline-none dark:border-rink-700 dark:bg-rink-700 dark:text-white'
    : 'h-10 w-full rounded-lg border border-wline bg-white px-3 text-sm dark:border-rink-700 dark:bg-rink-700 dark:text-white';

  return (
    <div
      className={cn(
        'p-4',
        iceTheme
          ? // ICETIMES flat — 카드 박스(rounded-2xl/shadow) 제거, hairline 경계.
            'rounded-w-md border-[1.5px] border-it-line bg-it-surface dark:border-rink-700 dark:bg-it-blue-950'
          : 'rounded-2xl border border-wline bg-white shadow-sm dark:border-rink-700 dark:bg-rink-800',
      )}
    >
      <h3
        className={cn(
          'mb-4 text-sm font-bold',
          iceTheme ? 'text-it-ink-800 dark:text-white' : 'text-wtext-1 dark:text-white',
        )}
      >
        이벤트 기록하기
      </h3>

      {/* 이벤트 타입 */}
      <div className="mb-4">
        <label htmlFor={typeId} className={labelCls}>
          이벤트 타입
        </label>
        <div id={typeId} className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="이벤트 타입 선택">
          {EVENT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setEventType(type.value)}
              role="radio"
              aria-checked={eventType === type.value}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-2 text-xs font-bold transition-colors',
                chipBorderW,
                chipRadius,
                eventType === type.value ? chipActive : chipIdle,
              )}
            >
              <Icon name={type.icon} className="text-base" />
              <span>{type.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 팀 선택 */}
      <div className="mb-4">
        <label htmlFor={teamId} className={labelCls}>
          팀 선택
        </label>
        <div id={teamId} className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="팀 선택">
          <button
            type="button"
            onClick={() => match.homeTeam && setSelectedTeamId(match.homeTeam.id)}
            role="radio"
            aria-checked={selectedTeamId === match.homeTeam?.id}
            disabled={!match.homeTeam}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold transition-colors',
              chipBorderW,
              chipRadius,
              selectedTeamId === match.homeTeam?.id ? chipActive : chipIdle,
              !match.homeTeam && 'cursor-not-allowed opacity-50',
            )}
          >
            <span className="text-[10px] uppercase">HOME</span>
            <span className="truncate">{match.homeTeam?.name ?? '홈'}</span>
          </button>
          <button
            type="button"
            onClick={() => match.awayTeam && setSelectedTeamId(match.awayTeam.id)}
            role="radio"
            aria-checked={selectedTeamId === match.awayTeam?.id}
            disabled={!match.awayTeam}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold transition-colors',
              chipBorderW,
              chipRadius,
              selectedTeamId === match.awayTeam?.id ? chipActive : chipIdle,
              !match.awayTeam && 'cursor-not-allowed opacity-50',
            )}
          >
            <span className="text-[10px] uppercase">AWAY</span>
            <span className="truncate">{match.awayTeam?.name ?? '어웨이'}</span>
          </button>
        </div>
      </div>

      {/* 피리어드 + 시간 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={periodId} className={labelCls}>
            피리어드
          </label>
          <select
            id={periodId}
            value={periodNumber}
            onChange={(e) => setPeriodNumber(Number(e.target.value))}
            className={inputCls}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {MESSAGES.match.periodLabel(n)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={timeId} className={labelCls}>
            시간 (MM:SS)
          </label>
          <input
            id={timeId}
            type="text"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            placeholder="12:45"
            pattern="[0-9]{1,2}:[0-5][0-9]"
            aria-describedby={error ? `${timeId}-error` : undefined}
            className={cn(inputCls, 'tabular-nums')}
          />
        </div>
      </div>

      {/* 페널티 타입 서브필드 */}
      {eventType === 'penalty' && (
        <div className="mb-4">
          <label className={labelCls}>
            페널티 종류
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PENALTY_TYPES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => {
                  setPenaltyType(p.value);
                  if (p.minutes > 0) setPenaltyMinutes(p.minutes);
                }}
                className={cn(
                  'px-2 py-2 text-xs font-bold transition-colors',
                  chipBorderW,
                  chipRadius,
                  penaltyType === p.value
                    ? iceTheme
                      ? 'border-it-red-500 bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300'
                      : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                    : chipIdle,
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 설명 (선택) */}
      <div className="mb-4">
        <label className={labelCls}>
          메모 (선택)
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="선수명, 어시스트 정보 등"
          maxLength={100}
          className={inputCls}
        />
      </div>

      {error && (
        <p
          id={`${timeId}-error`}
          role="alert"
          className={cn(
            'mb-3 px-3 py-2 text-xs font-medium',
            iceTheme
              ? 'rounded-w-md bg-it-red-50 text-it-red-500 dark:bg-it-red-500/15 dark:text-it-red-300'
              : 'rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
          )}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className={cn(
          'flex h-12 w-full items-center justify-center gap-2 text-sm font-bold text-white disabled:opacity-50',
          iceTheme
            ? 'rounded-w-md bg-it-blue-500 hover:bg-it-blue-600'
            : 'rounded-xl bg-ice-500 hover:bg-ice-700',
        )}
      >
        {isSubmitting ? (
          <>
            <span
              className={cn(
                'h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white',
                iceTheme && 'motion-reduce:animate-none',
              )}
            />
            기록 중...
          </>
        ) : (
          <>
            <Icon name="add_circle" className="text-xl" />
            이벤트 기록하기
          </>
        )}
      </button>
    </div>
  );
}
