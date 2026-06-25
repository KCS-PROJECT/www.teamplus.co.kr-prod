'use client';

import { useEffect, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { getClassCompleteData, type ClassCompletePayload } from '@/hooks/useClassForm';
import { koreanAgeToBirthYear, formatBirthYearRangeLabel } from '@/lib/gradeToBirthYear';
import { formatDaySchedulesFull } from '@/lib/class-categories';

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatPrice(price: number | ''): string {
  if (price === '' || price === 0) return '0원';
  return `${Number(price).toLocaleString('ko-KR')}원`;
}

/* ────────────────────────────────────────────
   Page
   ──────────────────────────────────────────── */

export default function ClassCompletePage() {
  // 모듈 스코프에서 동기적으로 읽기 (Strict Mode 영향 없음, 1회만 실행)
  const [data] = useState<ClassCompletePayload | null>(() => getClassCompleteData());
  const [animate, setAnimate] = useState(false);

  usePageReady(true);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: false,
    isDataLoaded: true,
  });

  useEffect(() => {
    const timer = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const isEdit = data?.mode === 'edit';
  const dateRange = data?.startDate
    ? `${formatDate(data.startDate)}${data.endDate && data.endDate !== data.startDate ? ` ~ ${formatDate(data.endDate)}` : ''}`
    : '';
  const timeRange = data?.startTimeOnly
    ? `${data.startTimeOnly}${data.endTimeOnly ? ` ~ ${data.endTimeOnly}` : ''}`
    : '';
  // [2026-06-05] 요일별 시간·장소 요약 — 규칙이 있으면 "월 17:00 ~ 18:00 A링크장 / 수 ..." 표시,
  //   없으면 기존 단일 시간 행 폴백.
  const dayScheduleSummary = formatDaySchedulesFull(data?.daySchedules);

  // 개별 날짜 일정(미니달력) — 상세 페이지와 동일하게 일정별 시간·장소 나열 + 기간(min~max·총 N회).
  const sortedDateSchedules = [...(data?.dateSchedules ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const hasDateSchedules = sortedDateSchedules.length > 0;
  const dateScheduleRange = hasDateSchedules
    ? sortedDateSchedules[0].date ===
      sortedDateSchedules[sortedDateSchedules.length - 1].date
      ? formatDate(sortedDateSchedules[0].date)
      : `${formatDate(sortedDateSchedules[0].date)} ~ ${formatDate(sortedDateSchedules[sortedDateSchedules.length - 1].date)}`
    : '';
  // 모든 일정의 시간·장소가 동일하면 단독 행으로 요약, 다르면 "회차별 상이"로 표기.
  const uniformTime = hasDateSchedules
    ? sortedDateSchedules.every(
        (s) =>
          s.startTime === sortedDateSchedules[0].startTime &&
          s.endTime === sortedDateSchedules[0].endTime,
      )
      ? sortedDateSchedules[0].startTime
        ? `${sortedDateSchedules[0].startTime}${sortedDateSchedules[0].endTime ? ` ~ ${sortedDateSchedules[0].endTime}` : ''}`
        : ''
      : MESSAGES.class.schedulesVary
    : '';
  const uniformVenue = hasDateSchedules
    ? sortedDateSchedules.every(
        (s) => (s.venueName ?? '') === (sortedDateSchedules[0].venueName ?? ''),
      )
      ? (sortedDateSchedules[0].venueName ?? '')
      : MESSAGES.class.schedulesVary
    : '';
  const timeVaries = uniformTime === MESSAGES.class.schedulesVary;
  const venueVaries = uniformVenue === MESSAGES.class.schedulesVary;
  // 일정 나열 — 시간·장소가 동일하면 위 단독 행에서 보여주므로 날짜만, 다르면 회차별 시간·장소 포함.
  const dateScheduleSummary = sortedDateSchedules
    .map((s) => {
      const dt = new Date(`${s.date}T00:00:00`);
      const wd = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
      const dateLabel = `${dt.getMonth() + 1}/${dt.getDate()}(${wd})`;
      const time =
        timeVaries && s.startTime
          ? `${s.startTime}${s.endTime ? `~${s.endTime}` : ''}`
          : '';
      const venue = venueVaries ? s.venueName : '';
      return [dateLabel, time, venue].filter(Boolean).join(' ');
    })
    .join('\n');

  // 수업 대상 — targetBirthYears(SoT) 우선, 없으면 ageMin/ageMax 한국나이 폴백 (상세 페이지와 동일 규칙).
  const targetLabel = (() => {
    const years = [...(data?.targetBirthYears ?? [])].sort((a, b) => a - b);
    if (years.length > 0) {
      const contiguous = years.every((y, i) => i === 0 || y === years[i - 1] + 1);
      return contiguous && years.length > 1
        ? `${years[0]}~${years[years.length - 1]}년생`
        : `${years.join('·')}년생`;
    }
    const min = data?.ageMin === '' || data?.ageMin == null ? undefined : Number(data.ageMin);
    const max = data?.ageMax === '' || data?.ageMax == null ? undefined : Number(data.ageMax);
    const from = max != null ? koreanAgeToBirthYear(max) : undefined;
    const to = min != null ? koreanAgeToBirthYear(min) : undefined;
    const lo = from ?? to;
    const hi = to ?? from;
    return lo != null && hi != null ? formatBirthYearRangeLabel(lo, hi) : '';
  })();

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [AppBar 보장 2026-05-12] success-style 페이지에도 back button AppBar 필수 (팀리더 지시).
          showAppBar:false 유지 + forceNative 로 web/native 양쪽에서 DOM AppBar 단일 노출. */}
      <PageAppBar
        title={isEdit ? '수업 수정 완료' : '수업 등록 완료'}
        forceNative
        titleClassName="text-card-section font-bold"
      />
      <main
        className="flex-1 overflow-y-auto px-5 pb-30 pt-8 bg-it-canvas dark:bg-puck"
        role="main"
        aria-labelledby="class-complete-title"
      >
        {/* 스크린리더 즉시 안내 */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {isEdit ? '수업 수정이 성공적으로 완료되었습니다.' : '수업 등록이 성공적으로 완료되었습니다.'}
        </p>
        <div className="w-full flex flex-col items-center">
          {/* 체크 아이콘 */}
          <div className={cn(
            'w-20 h-20 rounded-w-pill bg-emerald-500 flex items-center justify-center mb-6 transition-all duration-500',
            animate ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
          )} aria-hidden="true">
            <Icon name="check" className="text-4xl text-white" aria-hidden="true" />
          </div>

          {/* 성공 메시지 */}
          <h1
            id="class-complete-title"
            className={cn(
              'text-xl font-extrabold text-it-ink-800 dark:text-white text-center leading-snug mb-2 transition-all duration-500 delay-200',
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            )}
          >
            {isEdit ? '수업 수정이' : '수업 등록이'}
            <br />
            성공적으로 완료되었습니다
          </h1>

          {/* 정보 — full-bleed 흰 섹션 (카드 박스 제거). */}
          {data ? (
            <div className={cn(
              '-mx-5 w-[calc(100%+2.5rem)] mt-8 bg-it-surface dark:bg-it-blue-950 overflow-hidden transition-all duration-500 delay-300',
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            )}>
              {/* 수업 정보 */}
              <div className="px-6 py-5 space-y-4">
                <InfoRow label="수업명" value={data.className} bold />

                {targetLabel && (
                  <InfoRow label="수업 대상" value={targetLabel} />
                )}

                {/* 개별 날짜 일정이 있으면 기간(min~max·총 N회) + 일정별 시간·장소 나열,
                    없으면 기존 요일/기간/단일 시간·장소 폴백. */}
                {hasDateSchedules ? (
                  <>
                    <InfoRow
                      label="수업 기간"
                      value={`${dateScheduleRange} · 총 ${sortedDateSchedules.length}회`}
                    />
                    {uniformTime && (
                      <InfoRow label="수업 시간" value={uniformTime} />
                    )}
                    {uniformVenue && (
                      <InfoRow label="훈련 장소" value={uniformVenue} />
                    )}
                    <InfoRow label="수업 일정" value={dateScheduleSummary} multiline />
                  </>
                ) : (
                  <>
                    {dateRange && (
                      <InfoRow label="수업 기간" value={dateRange} />
                    )}

                    {/* 요일별 규칙이 있으면 요일별 시간·장소를 멀티라인으로, 없으면 단일 시간 행. */}
                    {dayScheduleSummary ? (
                      <InfoRow label="수업 일정" value={dayScheduleSummary} multiline />
                    ) : (
                      timeRange && <InfoRow label="수업 시간" value={timeRange} />
                    )}

                    {/* 요일별 규칙에 장소가 포함되면 위 일정에서 함께 표기되므로 단일 장소 행은 생략. */}
                    {data.venue && !dayScheduleSummary && (
                      <InfoRow label="훈련 장소" value={data.venue} />
                    )}
                  </>
                )}

                {data.instructorName && (
                  <InfoRow label="담당 코치" value={data.instructorName} />
                )}
              </div>

              {/* 구분선 — hairline */}
              <div className="border-t border-it-line dark:border-it-blue-900 mx-6" />

              {/* 수강료 — feeItems(전체 패키지 목록) 우선 표시. 변경 가격·다중 정기권 정확 반영.
                  미전달(구 경로) 시 기존 singlePrice/monthlyPrice 폴백. */}
              <div className="px-6 py-5 space-y-3">
                {data.feeItems && data.feeItems.length > 0 ? (
                  data.feeItems.map((it, i) => (
                    <div
                      key={`${it.name}-${i}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-card-body text-it-ink-500 dark:text-rink-300 min-w-0 truncate">
                        {it.name}
                      </span>
                      <span className="text-card-title font-extrabold text-it-ink-800 dark:text-white shrink-0 tabular-nums">
                        {formatPrice(it.price)}
                      </span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-card-body text-it-ink-500 dark:text-rink-300">
                        {MESSAGES.classProduct.singlePriceLabel}
                      </span>
                      <span className="text-card-title font-extrabold text-it-ink-800 dark:text-white">
                        {formatPrice(data.singlePrice)}
                      </span>
                    </div>
                    {data.monthlyPrice !== '' && Number(data.monthlyPrice) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-card-body text-it-ink-500 dark:text-rink-300">
                          {data.packageWeeks && data.packageTotalSessions && data.packageSessionsPerWeek
                            ? `${data.packageWeeks}주 정기권 (주 ${data.packageSessionsPerWeek}회 · 총 ${data.packageTotalSessions}회)`
                            : '정기 패키지'}
                        </span>
                        <span className="text-card-title font-extrabold text-it-ink-800 dark:text-white">
                          {formatPrice(data.monthlyPrice)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 안내 문구 */}
              <div className="px-6 py-4 bg-it-fill dark:bg-rink-900/40 border-t border-it-line dark:border-it-blue-900">
                <div className="flex gap-2">
                  <Icon name="info" className="text-card-emphasis text-it-ink-400 dark:text-rink-300 shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-card-meta text-it-ink-500 dark:text-rink-300 leading-relaxed whitespace-pre-line">
                    {isEdit
                      ? '수업 정보가 수정되었습니다.\n변경 사항은 즉시 반영됩니다.'
                      : '수업이 등록되었습니다.\n수정 화면에서 결제 패키지를 더 추가하거나 관리할 수 있어요.'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className={cn(
              '-mx-5 w-[calc(100%+2.5rem)] mt-8 bg-it-surface dark:bg-it-blue-950 px-6 py-8 text-center transition-all duration-500 delay-300',
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            )}>
              <p className="text-card-body text-it-ink-500 dark:text-rink-300">
                수업 처리가 완료되었습니다.
              </p>
            </div>
          )}

        </div>

        {/* 버튼 — 수업 목록으로 가기 (단일 강조 버튼). */}
        <div className="w-full mt-10">
          <NavLink
            href="/classes-manage"
            aria-label="수업 목록 페이지로 이동하기"
            className={cn(
              'w-full h-14 rounded-w-md flex items-center justify-center text-card-title font-bold transition-colors motion-reduce:transition-none active:brightness-90 focus-visible:ring-2 focus-visible:ring-it-blue-500 focus-visible:ring-offset-2 focus:outline-none',
              'bg-it-blue-500 hover:bg-it-blue-600 text-white',
              animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
            )}
          >
            수업 목록으로 가기
          </NavLink>
        </div>
      </main>
    </MobileContainer>
  );
}

/* ────────────────────────────────────────────
   InfoRow
   ──────────────────────────────────────────── */

function InfoRow({
  label,
  value,
  bold,
  multiline,
}: {
  label: string;
  value: string;
  bold?: boolean;
  /** 요일별 일정처럼 길어 줄바꿈이 필요한 값 — text-right + break-keep 으로 좁은 폭 대응. */
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4" role="group" aria-label={`${label}: ${value}`}>
      <span className="text-card-body text-it-ink-500 dark:text-rink-300 shrink-0" aria-hidden="true">{label}</span>
      <span
        className={cn(
          'text-card-body text-right',
          multiline ? 'min-w-0 break-keep leading-relaxed whitespace-pre-line' : '',
          bold
            ? 'font-bold text-it-blue-500'
            : 'font-semibold text-it-ink-800 dark:text-rink-100',
        )}
        aria-hidden="true"
      >
        {value}
      </span>
    </div>
  );
}
