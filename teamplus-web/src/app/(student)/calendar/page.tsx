'use client';

/**
 * 신학생 통합 캘린더 페이지 (2026-05-15 재작성).
 *
 * 신부모 /parent-calendar 와 동일 구조 — useUnifiedCalendar + UnifiedCalendarGrid 재사용.
 * Backend GET /calendar 가 사용자 역할별 데이터 반환 (학생은 본인 결제 paid 수업만).
 * 기존 학생 전용 자체 구현(수업캘린더만) 폐기 → 수업·대회·이벤트 통합.
 */

import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { UnifiedCalendarGrid } from '@/components/calendar/UnifiedCalendarGrid';
import { useUnifiedCalendar } from '@/hooks/useUnifiedCalendar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { MESSAGES } from '@/lib/messages';
import { usePageReady } from '@/hooks/usePageReady';

export default function StudentCalendarPage() {
  const calendar = useUnifiedCalendar();
  usePageReady(!calendar.isLoading);

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  // [v16 2026-05-16] 이중 로더 제거 — LoadingProvider 풀스크린 로더가 usePageReady 신호로 종료.
  if (calendar.isLoading && (!calendar.calendarGrid || calendar.calendarGrid.length === 0)) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <SubmainAppBar title={MESSAGES.calendar.title} />

      <main className="hide-scrollbar flex-1 overflow-y-auto" role="main" aria-label={MESSAGES.calendar.title}>
        <UnifiedCalendarGrid
          calendarGrid={calendar.calendarGrid}
          currentMonth={calendar.currentMonth}
          monthLabel={calendar.monthLabel}
          selectedDateKey={calendar.selectedDateKey}
          onDateSelect={calendar.setSelectedDateKey}
          selectedEvents={calendar.selectedEvents}
          selectedDateLabel={calendar.selectedDateLabel}
          onPrevMonth={calendar.goToPrevMonth}
          onNextMonth={calendar.goToNextMonth}
          onGoToToday={calendar.goToToday}
          isLoading={calendar.isLoading}
          errorMessage={calendar.errorMessage}
        />
      </main>
    </MobileContainer>
  );
}
