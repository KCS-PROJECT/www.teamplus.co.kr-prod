/**
 * /classes/[id]/students 결제 탭 — 월 게이트(monthMatches) 금융 회귀 테스트.
 *
 * MEDIUM-2 계약 고정:
 *   · 드릴다운 ?yearMonth= 소비 → 해당 월 + 결제(payment) 탭 진입.
 *   · 월 전환 중(monthMatches=false, isMonthLoading) → 이전 월 금융 데이터 미노출(스켈레톤).
 *   · 월 실패(monthError) → InlineRetryError, 이전 월 데이터 미노출.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';

// ── 가변 목 상태 ────────────────────────────────────────
let mockSearch = '';
let mockUser: { id: string; userType: string } | null = null;

// api.get 응답 제어 — yearMonth 별 resolver 보관.
const resolvers: Record<string, (v: unknown) => void> = {};
const mockApiGet = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@/app/(class)/route-user-context', () => ({
  useRouteUser: () => mockUser,
}));
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/PageAppBar', () => ({ PageAppBar: () => null }));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
jest.mock('@/lib/kst-month', () => ({ kstYearMonth: () => '2026-07' }));
jest.mock('@/components/attendance/PostpaidSettlementSection', () => ({
  PostpaidSettlementSection: () => <div data-testid="postpaid-section" />,
}));
jest.mock('@/services/api-client', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

import ClassStudentsPage from '@/app/(class)/classes/[id]/(coach-access)/students/page';

// ── 헬퍼 ────────────────────────────────────────────────
function ymOf(url: string): string {
  return new URLSearchParams(url.split('?')[1] ?? '').get('yearMonth') ?? '';
}

function payload(yearMonth: string, totalPaidAmount: number) {
  return {
    classId: 'c1',
    className: '수업A',
    billingMode: 'PREPAID',
    yearMonth,
    teamId: 't1',
    teamName: '팀A',
    teamCode: 'AAA',
    total: 1,
    totalPaidAmount,
    students: [
      {
        registrationId: 'r1',
        memberId: 'm1',
        memberName: '김학생',
        memberType: 'child',
        registrationDate: '2026-06-01',
        enrollmentId: 'e1',
        enrollmentStatus: 'ACTIVE',
        productName: '상품',
        amount: 100000,
        paymentMethod: 'card',
        paidAt: '2026-06-02',
        payerName: '김부모',
        attendanceCount: 3,
        billingTiming: 'PREPAID',
        billingStatus: 'PAID',
        billedAmount: 100000,
        estimatedAmount: null,
        paidAmount: 100000,
        outstandingAmount: 0,
      },
    ],
    products: [],
  };
}

async function flushSuccess(yearMonth: string, totalPaidAmount: number) {
  await act(async () => {
    resolvers[yearMonth]?.({ success: true, data: payload(yearMonth, totalPaidAmount) });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(resolvers)) delete resolvers[k];
  mockSearch = '';
  mockUser = { id: 'dir1', userType: 'academy_director' };
  mockApiGet.mockImplementation(
    (url: string) =>
      new Promise((res) => {
        resolvers[ymOf(url)] = res;
      }),
  );
});

describe('ClassStudentsPage — 결제 탭 월 게이트', () => {
  it('드릴다운 ?yearMonth= 소비 → 해당 월 + 결제 탭으로 진입', async () => {
    mockSearch = 'yearMonth=2026-06';
    render(<ClassStudentsPage />);

    await flushSuccess('2026-06', 100000);

    // 결제 탭 활성 + 해당 월 라벨 + 해당 월 수납액 노출.
    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: MESSAGES.academy.students.tabPayment }),
      ).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByText(MESSAGES.settlement.monthLabel(2026, 6))).toBeInTheDocument();
    expect(screen.getByText('100,000')).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith(
      '/classes/c1/payments?yearMonth=2026-06',
    );
  });

  it('월 전환 중 — 이전 월 금융 데이터 미노출(스켈레톤)', async () => {
    mockSearch = 'yearMonth=2026-06';
    render(<ClassStudentsPage />);
    await flushSuccess('2026-06', 100000);
    expect(screen.getByText('100,000')).toBeInTheDocument();

    // 이전 달로 전환 → 2026-05 조회 대기(미해결).
    await act(async () => {
      fireEvent.click(screen.getByLabelText(MESSAGES.settlement.prevMonth));
    });

    // 전환 중: monthMatches=false → 이전 월 수납액(100,000) 사라지고 로딩 스켈레톤 노출.
    await waitFor(() => {
      expect(screen.getByText(MESSAGES.settlement.monthLoading)).toBeInTheDocument();
    });
    expect(screen.queryByText('100,000')).not.toBeInTheDocument();
  });

  it('월 실패 — InlineRetryError, 이전 월 데이터 미노출', async () => {
    mockSearch = 'yearMonth=2026-06';
    render(<ClassStudentsPage />);
    await flushSuccess('2026-06', 100000);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(MESSAGES.settlement.prevMonth));
    });
    // 2026-05 조회 실패.
    await act(async () => {
      resolvers['2026-05']?.({ success: false, error: { message: 'boom' } });
    });

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.settlement.monthLoadFailed)).toBeInTheDocument();
    });
    // 재시도 버튼 노출 + 이전 월 데이터 위장 노출 금지.
    expect(
      screen.getByRole('button', { name: MESSAGES.settlement.retry }),
    ).toBeInTheDocument();
    expect(screen.queryByText('100,000')).not.toBeInTheDocument();
  });
});
