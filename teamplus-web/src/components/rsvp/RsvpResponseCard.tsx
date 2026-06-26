'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { getTrainingColor } from '@/lib/calendar-colors';
import { useNativeScrim } from '@/hooks/useNativeScrim';
import type { RsvpScheduleInfo, RsvpStatus, RsvpSummary } from '@/types/rsvp';

/** Modal 표준 scrim 컬러 (AARRGGBB · rink-900 / 55%) — SPEC_POPUP_FULLSCREEN_DIM.md */
const MODAL_SCRIM_COLOR = '#8C141826';

/**
 * RsvpResponseCard - RSVP 참석/불참 응답 카드
 * TEAMPLUS Design System
 *
 * Design 7 Principles:
 * - Primary: bg-ice-500 솔리드 (gradient 금지)
 * - 아웃라인 버튼: border border-wline
 * - shadow-md만 사용 (컬러 그림자 금지)
 * - messages.ts 상수 사용
 */

interface RsvpResponseCardProps {
  schedule: RsvpScheduleInfo;
  summary: RsvpSummary;
  myStatus?: RsvpStatus;
  onRespond: (status: 'ATTENDING' | 'DECLINED', reason?: string) => void;
  loading?: boolean;
  className?: string;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 Card 박스 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 카드 박스 → flat 흰 타일 + hairline 구분선, it-* 토큰 적용.
   *   참석=it-blue · 불참=it-red · 미응답=it-ink. (현재 /rsvp 화면만 전달.)
   */
  iceTheme?: boolean;
}

export function RsvpResponseCard({
  schedule,
  summary,
  myStatus = 'NO_RESPONSE',
  onRespond,
  loading = false,
  className,
  iceTheme = false,
}: RsvpResponseCardProps) {
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const trainingColor = getTrainingColor(schedule.trainingType);

  const handleAttend = () => {
    onRespond('ATTENDING');
  };

  const handleDecline = () => {
    setShowDeclineModal(true);
  };

  const handleDeclineSubmit = () => {
    onRespond('DECLINED', declineReason || undefined);
    setShowDeclineModal(false);
    setDeclineReason('');
  };

  const handleDeclineCancel = useCallback(() => {
    setShowDeclineModal(false);
    setDeclineReason('');
  }, []);

  // ✅ 필수 1: Flutter Native scrim — iOS notch / Home Indicator / Android Nav Bar 영역까지 dim
  useNativeScrim(showDeclineModal, MODAL_SCRIM_COLOR);

  // ✅ 필수 2: body scroll lock
  useEffect(() => {
    if (!showDeclineModal) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, [showDeclineModal]);

  // ✅ 필수 3: ESC 닫기
  useEffect(() => {
    if (!showDeclineModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDeclineCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDeclineModal, handleDeclineCancel]);

  // 오버레이 클릭 닫기 (내부 컨텐츠 클릭은 stopPropagation 으로 방어)
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleDeclineCancel();
  };

  // 불참 사유 모달 — flat/기존 공통 사용. iceTheme 일 때만 it-* 토큰으로 정합화(비주얼만).
  const declineModal = showDeclineModal && (
    <div
      className="overlay-fullscreen-wrapper items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-modal-title"
      onClick={handleOverlayClick}
    >
      <div className="overlay-fullscreen-dim" aria-hidden="true" />
      <div
        className="relative pointer-events-auto w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {iceTheme ? (
          <div className="w-full rounded-w-lg bg-it-surface dark:bg-it-blue-950 border border-it-line dark:border-it-blue-900 shadow-sh-3 p-6">
            <h4 id="decline-modal-title" className="text-[18px] font-extrabold text-it-ink-800 dark:text-white mb-2">
              불참 사유
            </h4>
            <p className="text-[13.5px] text-it-ink-500 dark:text-rink-300 mb-4">
              불참 사유를 입력해주세요. (선택)
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="예: 개인 일정으로 참석이 어렵습니다."
              aria-label="불참 사유 입력"
              className={cn(
                'w-full h-24 px-3.5 py-2.5 text-[14px] rounded-w-md resize-none',
                'bg-it-fill dark:bg-it-blue-900/40',
                'border-[1.5px] border-it-line-strong dark:border-it-blue-900',
                'text-it-ink-800 dark:text-white',
                'placeholder:text-it-ink-400 dark:placeholder:text-rink-300',
                'focus:outline-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20'
              )}
            />
            <div className="flex gap-2 mt-4">
              <Button
                variant="ghost"
                size="md"
                className="flex-1 border-[1.5px] border-it-line-strong dark:border-it-blue-900 text-it-ink-600 dark:text-rink-100"
                onClick={handleDeclineCancel}
              >
                취소
              </Button>
              <Button
                variant="danger"
                size="md"
                className="flex-1"
                onClick={handleDeclineSubmit}
              >
                불참하기
              </Button>
            </div>
          </div>
        ) : (
          <Card variant="elevated" padding="lg" className="w-full">
            <h4 id="decline-modal-title" className="text-lg font-bold text-wtext-1 dark:text-white mb-2">
              불참 사유
            </h4>
            <p className="text-sm text-wtext-3 dark:text-rink-300 mb-4">
              불참 사유를 입력해주세요. (선택)
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="예: 개인 일정으로 참석이 어렵습니다."
              aria-label="불참 사유 입력"
              className={cn(
                'w-full h-24 px-3 py-2 text-sm rounded-lg resize-none',
                'bg-white dark:bg-rink-800',
                'border border-wline dark:border-rink-700',
                'text-wtext-1 dark:text-white',
                'placeholder:text-wtext-3 dark:placeholder:text-wtext-3',
                'focus:outline-none focus:ring-2 focus:ring-ice-500/50 focus:border-ice-500'
              )}
            />
            <div className="flex gap-2 mt-4">
              <Button
                variant="ghost"
                size="md"
                className="flex-1"
                onClick={handleDeclineCancel}
              >
                취소
              </Button>
              <Button
                variant="danger"
                size="md"
                className="flex-1"
                onClick={handleDeclineSubmit}
              >
                불참하기
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  // ICETIMES flat — 카드 박스 제거. flat 흰 타일(부모 회색 캔버스 위) + it-* 토큰.
  if (iceTheme) {
    return (
      <>
        <div className={cn('relative rounded-w-md bg-it-surface dark:bg-it-blue-950 border border-it-line dark:border-it-blue-900 p-4', className)}>
          {/* 상단 유형 배지 */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-w-pill text-[12px] font-bold text-white',
                trainingColor.bg,
                trainingColor.darkBg
              )}
            >
              {trainingColor.label}
            </span>
            {schedule.isExpired && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-w-pill text-[12px] font-bold bg-it-fill text-it-ink-500 dark:bg-it-blue-900 dark:text-rink-300">
                마감
              </span>
            )}
          </div>

          {/* 일정 정보 */}
          <div className="mb-4">
            <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white mb-1.5">
              {schedule.title}
            </h3>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[13.5px] text-it-ink-600 dark:text-rink-300">
                <Icon name="calendar_today" className="text-[16px] text-it-ink-400" aria-hidden="true" />
                <span className="tabular-nums">
                  {schedule.date}({schedule.dayOfWeek}) {schedule.startTime}~{schedule.endTime}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[13.5px] text-it-ink-600 dark:text-rink-300">
                <Icon name="location_on" className="text-[16px] text-it-ink-400" aria-hidden="true" />
                <span>{schedule.location}</span>
              </div>
              {schedule.rsvpDeadline && !schedule.isExpired && (
                <div className="flex items-center gap-1.5 text-[13.5px] text-it-red-500 dark:text-it-red-300">
                  <Icon name="schedule" className="text-[16px]" aria-hidden="true" />
                  <span>응답 마감: {schedule.rsvpDeadline}</span>
                </div>
              )}
            </div>
          </div>

          {/* 응답 버튼 — 참석=it-blue / 불참=it-red */}
          {!schedule.isExpired ? (
            <div
              className="flex gap-2 mb-4"
              role="group"
              aria-label={`${schedule.title} 참석 여부 응답`}
            >
              <button
                type="button"
                onClick={handleAttend}
                disabled={myStatus === 'ATTENDING' || loading}
                aria-pressed={myStatus === 'ATTENDING'}
                aria-label={
                  myStatus === 'ATTENDING'
                    ? `${schedule.title} 참석 완료 상태`
                    : `${schedule.title} 참석으로 응답하기`
                }
                className={cn(
                  'flex-1 min-h-[48px] rounded-w-md text-[15px] font-bold transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 disabled:cursor-not-allowed',
                  myStatus === 'ATTENDING'
                    ? 'bg-it-blue-500 text-white'
                    : 'bg-it-surface dark:bg-it-blue-950 border-[1.5px] border-it-blue-500 text-it-blue-600 dark:text-it-blue-300 hover:bg-it-blue-50 dark:hover:bg-it-blue-900/40'
                )}
              >
                {myStatus === 'ATTENDING' ? '참석 완료' : '참석하기'}
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={myStatus === 'DECLINED' || loading}
                aria-pressed={myStatus === 'DECLINED'}
                aria-label={
                  myStatus === 'DECLINED'
                    ? `${schedule.title} 불참 완료 상태`
                    : `${schedule.title} 불참으로 응답하기`
                }
                className={cn(
                  'flex-1 min-h-[48px] rounded-w-md text-[15px] font-bold transition-colors motion-reduce:transition-none active:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-it-red-500/40 disabled:cursor-not-allowed',
                  myStatus === 'DECLINED'
                    ? 'bg-it-red-500 text-white'
                    : 'bg-it-surface dark:bg-it-blue-950 border-[1.5px] border-it-line-strong dark:border-it-blue-900 text-it-ink-600 dark:text-rink-100 hover:bg-it-fill dark:hover:bg-it-blue-900/40'
                )}
              >
                {myStatus === 'DECLINED' ? '불참 완료' : '불참하기'}
              </button>
            </div>
          ) : (
            <div
              className="mb-4 px-3 py-2 rounded-w-md bg-it-fill dark:bg-it-blue-900/40 text-[13.5px] text-it-ink-500 dark:text-rink-300 text-center"
              role="status"
            >
              {MESSAGES.rsvp.deadline}
            </div>
          )}

          {/* 응답 현황 요약 — hairline 상단 구분 */}
          <div className="flex items-center justify-center gap-4 pt-3 border-t border-it-line dark:border-it-blue-900">
            <RsvpCountBadge
              icon="check_circle"
              count={summary.attending}
              label="참석"
              colorClass="text-emerald-600 dark:text-emerald-400"
              iceTheme
            />
            <RsvpCountBadge
              icon="cancel"
              count={summary.declined}
              label="불참"
              colorClass="text-it-red-500 dark:text-it-red-300"
              iceTheme
            />
            <RsvpCountBadge
              icon="help"
              count={summary.noResponse}
              label="미응답"
              colorClass="text-it-ink-400 dark:text-rink-300"
              iceTheme
            />
          </div>
        </div>

        {declineModal}
      </>
    );
  }

  return (
    <>
      <Card variant="default" padding="md" className={cn('relative', className)}>
        {/* 상단 유형 배지 */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-white',
              trainingColor.bg,
              trainingColor.darkBg
            )}
          >
            {trainingColor.label}
          </span>
          {schedule.isExpired && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-wline-2 text-wtext-3 dark:bg-rink-700 dark:text-rink-300">
              마감
            </span>
          )}
        </div>

        {/* 일정 정보 */}
        <div className="mb-4">
          <h3 className="text-base font-bold text-wtext-1 dark:text-white mb-1.5">
            {schedule.title}
          </h3>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm text-wtext-2 dark:text-rink-300">
              <Icon name="calendar_today" className="text-[16px] text-wtext-3" />
              <span>
                {schedule.date}({schedule.dayOfWeek}) {schedule.startTime}~{schedule.endTime}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-wtext-2 dark:text-rink-300">
              <Icon name="location_on" className="text-[16px] text-wtext-3" />
              <span>{schedule.location}</span>
            </div>
            {schedule.rsvpDeadline && !schedule.isExpired && (
              <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                <Icon name="schedule" className="text-[16px]" />
                <span>응답 마감: {schedule.rsvpDeadline}</span>
              </div>
            )}
          </div>
        </div>

        {/* 응답 버튼 — aria-pressed로 토글 상태, role="group"으로 묶기 */}
        {!schedule.isExpired ? (
          <div
            className="flex gap-2 mb-4"
            role="group"
            aria-label={`${schedule.title} 참석 여부 응답`}
          >
            <Button
              variant={myStatus === 'ATTENDING' ? 'primary' : 'outline'}
              size="md"
              className="flex-1"
              onClick={handleAttend}
              loading={loading}
              disabled={myStatus === 'ATTENDING'}
              aria-pressed={myStatus === 'ATTENDING'}
              aria-label={
                myStatus === 'ATTENDING'
                  ? `${schedule.title} 참석 완료 상태`
                  : `${schedule.title} 참석으로 응답하기`
              }
            >
              {myStatus === 'ATTENDING' ? '참석 완료' : '참석하기'}
            </Button>
            <Button
              variant={myStatus === 'DECLINED' ? 'danger' : 'ghost'}
              size="md"
              className={cn(
                'flex-1',
                myStatus !== 'DECLINED' &&
                  'border border-wline dark:border-rink-700 text-wtext-2 dark:text-rink-100'
              )}
              onClick={handleDecline}
              loading={loading}
              disabled={myStatus === 'DECLINED'}
              aria-pressed={myStatus === 'DECLINED'}
              aria-label={
                myStatus === 'DECLINED'
                  ? `${schedule.title} 불참 완료 상태`
                  : `${schedule.title} 불참으로 응답하기`
              }
            >
              {myStatus === 'DECLINED' ? '불참 완료' : '불참하기'}
            </Button>
          </div>
        ) : (
          <div
            className="mb-4 px-3 py-2 rounded-lg bg-wbg dark:bg-rink-800 text-sm text-wtext-3 dark:text-rink-300 text-center"
            role="status"
          >
            {MESSAGES.rsvp.deadline}
          </div>
        )}

        {/* 응답 현황 요약 */}
        <div className="flex items-center justify-center gap-4 pt-3 border-t border-wline-2 dark:border-rink-700">
          <RsvpCountBadge
            icon="check_circle"
            count={summary.attending}
            label="참석"
            colorClass="text-emerald-600 dark:text-emerald-400"
          />
          <RsvpCountBadge
            icon="cancel"
            count={summary.declined}
            label="불참"
            colorClass="text-red-500 dark:text-red-400"
          />
          <RsvpCountBadge
            icon="help"
            count={summary.noResponse}
            label="미응답"
            colorClass="text-wtext-3 dark:text-rink-300"
          />
        </div>
      </Card>

      {declineModal}
    </>
  );
}

/** 참석/불참/미응답 카운트 배지 */
function RsvpCountBadge({
  icon,
  count,
  label,
  colorClass,
  iceTheme = false,
}: {
  icon: string;
  count: number;
  label: string;
  colorClass: string;
  iceTheme?: boolean;
}) {
  if (iceTheme) {
    return (
      <div className="flex items-center gap-1">
        <Icon name={icon} className={cn('text-[16px]', colorClass)} aria-hidden="true" />
        <span className="text-[13.5px] font-semibold text-it-ink-600 dark:text-rink-100">
          {label}
        </span>
        <span className="text-[13.5px] font-bold font-num tabular-nums text-it-ink-800 dark:text-white">
          {count}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Icon name={icon} className={cn('text-[16px]', colorClass)} />
      <span className="text-sm font-semibold text-wtext-2 dark:text-rink-100">
        {label}
      </span>
      <span className="text-sm font-bold text-wtext-1 dark:text-white">
        {count}
      </span>
    </div>
  );
}
