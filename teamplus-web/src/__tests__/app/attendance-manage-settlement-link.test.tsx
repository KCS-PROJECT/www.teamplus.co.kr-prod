/**
 * /attendance-manage — "정산 보기" 링크 노출 회귀 테스트.
 *
 * MEDIUM-3 계약 고정:
 *   · POSTPAID·BOTH 수업 → "정산 보기" 링크 노출(students?tab=payment&yearMonth= 이동).
 *   · PREPAID 수업 → 미노출.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';

// ── 가변 목 상태 ────────────────────────────────────────
let mockBillingMode: 'PREPAID' | 'POSTPAID' | 'BOTH' = 'POSTPAID';
const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('classId=c1'),
}));
jest.mock('@/hooks/useCoachAttendanceManage', () => ({
  useClassAttendanceHistory: () => ({
    data: {
      classInfo: {
        classId: 'c1',
        className: '수업A',
        coachName: '코치',
        studentCount: 5,
        completedCount: 2,
        totalScheduleCount: 10,
        billingMode: mockBillingMode,
      },
      stats: {
        totalSchedules: 10,
        completedCount: 2,
        avgAttendanceRate: 80,
        totalPresent: 16,
        totalAbsent: 4,
      },
      inProgress: [],
      completed: { items: [], hasMore: false },
      upcomingCount: 0,
    },
    isLoading: false,
    isLoadingMore: false,
    error: null,
    loadMoreCompleted: jest.fn(),
    loadUpcoming: jest.fn(),
  }),
}));
jest.mock('@/components/attendance/MonthlyAttendanceCountSection', () => ({
  MonthlyAttendanceCountSection: () => <div data-testid="attendance-count" />,
}));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/PageAppBar', () => ({ PageAppBar: () => null }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }),
}));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/lib/kst-month', () => ({ kstYearMonth: () => '2026-07' }));

import AttendanceManagePage from '@/app/(coach)/attendance-manage/page';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AttendanceManagePage — 정산 보기 링크', () => {
  it('POSTPAID 수업 → 정산 보기 링크를 노출하고 결제 탭으로 이동', () => {
    mockBillingMode = 'POSTPAID';
    render(<AttendanceManagePage />);

    const link = screen.getByText(MESSAGES.settlement.viewSettlement);
    expect(link).toBeInTheDocument();

    fireEvent.click(link);
    expect(mockPush).toHaveBeenCalledWith(
      '/classes/c1/students?tab=payment&yearMonth=2026-07',
    );
  });

  it('BOTH 수업 → 정산 보기 링크를 노출(선수별 후불 가능)', () => {
    mockBillingMode = 'BOTH';
    render(<AttendanceManagePage />);
    expect(screen.getByText(MESSAGES.settlement.viewSettlement)).toBeInTheDocument();
  });

  it('PREPAID 수업 → 정산 보기 링크 미노출', () => {
    mockBillingMode = 'PREPAID';
    render(<AttendanceManagePage />);
    expect(
      screen.queryByText(MESSAGES.settlement.viewSettlement),
    ).not.toBeInTheDocument();
  });
});
