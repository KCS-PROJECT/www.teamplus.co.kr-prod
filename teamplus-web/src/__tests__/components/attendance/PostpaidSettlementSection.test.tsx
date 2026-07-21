/**
 * PostpaidSettlementSection — 후불 정산 확정(controlled) 금융 쓰기 회귀 테스트.
 *
 * HIGH-1(월 전환 중 이전 월 초안으로 다른 월 확정) 방지 계약을 고정한다:
 *   · reqSeq 가드 — 늦게 온 이전 월 응답이 최신 월 draft 를 덮지 않는다.
 *   · activeDraft 게이트 — draft.yearMonth ≠ 선택 월이면 확정 비활성.
 *   · loading 중 확정 버튼 미노출.
 *   · view-only(canWrite=false) — 확정 버튼 미노출 + 안내.
 *   · 확정 월 정확성 — 클릭 시점 선택 월로 confirm 호출.
 *   · 당월 비활성 — isPastMonth=false.
 *   · draft 실패 — InlineRetryError(섹션 숨김/0 위장 금지).
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import type {
  PostpaidDraft,
  PostpaidDraftResult,
  ConfirmPostpaidResultResponse,
} from '@/services/postpaid-billing.service';

// ── 목킹 ────────────────────────────────────────────────
const mockFetchPostpaidDraft = jest.fn();
const mockConfirmPostpaidSettlementResult = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('@/services/postpaid-billing.service', () => ({
  fetchPostpaidDraft: (...args: unknown[]) => mockFetchPostpaidDraft(...args),
  confirmPostpaidSettlementResult: (...args: unknown[]) =>
    mockConfirmPostpaidSettlementResult(...args),
}));
jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: { success: mockToastSuccess, error: mockToastError } }),
}));
// 현재 KST 월을 고정 — 2026-06 은 과거월, 2026-07 은 당월.
jest.mock('@/lib/kst-month', () => ({ kstYearMonth: () => '2026-07' }));

import { PostpaidSettlementSection } from '@/components/attendance/PostpaidSettlementSection';

// ── 헬퍼 ────────────────────────────────────────────────
function draftFor(yearMonth: string): PostpaidDraft {
  return {
    classId: 'c1',
    yearMonth,
    unitPrice: 30000,
    status: 'draft',
    confirmedAt: null,
    totalAmount: 60000,
    items: [
      { userId: 'u1', name: '홍길동', attendanceCount: 2, amount: 60000 },
    ],
  };
}

function resolvedDraft(data: PostpaidDraft): PostpaidDraftResult {
  return { ok: true, data };
}

const confirmBtnName = MESSAGES.postpaidSettlement.confirmCta;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PostpaidSettlementSection — 금융 쓰기 게이트', () => {
  it('월 race — 늦게 온 이전 월(A) 응답이 최신 월(B) 항목/합계를 덮지 않는다', async () => {
    // yearMonth 별로 수동 resolver 를 보관해 응답 순서를 제어.
    const resolvers: Record<string, (v: PostpaidDraftResult) => void> = {};
    mockFetchPostpaidDraft.mockImplementation(
      (_classId: string, ym: string) =>
        new Promise<PostpaidDraftResult>((res) => {
          resolvers[ym] = res;
        }),
    );

    const { rerender } = render(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-05" canWrite iceTheme />,
    );
    // 월 A(2026-05) 조회 중 → 월 B(2026-06) 로 전환.
    rerender(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-06" canWrite iceTheme />,
    );

    // B 응답이 먼저 도착.
    await act(async () => {
      resolvers['2026-06']?.(resolvedDraft(draftFor('2026-06')));
    });
    // 이후 A 응답이 늦게 도착 — reqSeq 가드로 폐기되어야 함.
    await act(async () => {
      resolvers['2026-05']?.(resolvedDraft(draftFor('2026-05')));
    });

    // B 월 합계(60,000)만 표시, A 로 덮이지 않음(항목 1건 유지) + 확정 버튼 활성(과거월).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: confirmBtnName })).toBeEnabled();
    });
    expect(screen.getByText('홍길동')).toBeInTheDocument();
  });

  it('월 불일치(stale draft) — draft.yearMonth ≠ 선택 월이면 확정 비활성 + confirm 미호출', async () => {
    // 선택 월은 2026-06 이지만 응답 draft 는 2026-05(stale echo).
    mockFetchPostpaidDraft.mockResolvedValue(resolvedDraft(draftFor('2026-05')));

    render(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-06" canWrite iceTheme />,
    );

    // activeDraft=null → loading 유지(스켈레톤). 확정 버튼 미노출.
    await waitFor(() => {
      expect(mockFetchPostpaidDraft).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: confirmBtnName })).not.toBeInTheDocument();
    expect(mockConfirmPostpaidSettlementResult).not.toHaveBeenCalled();
  });

  it('loading 중 — 확정 버튼 미노출(스켈레톤)', async () => {
    let resolve!: (v: PostpaidDraftResult) => void;
    mockFetchPostpaidDraft.mockImplementation(
      () => new Promise<PostpaidDraftResult>((res) => (resolve = res)),
    );

    render(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-06" canWrite iceTheme />,
    );

    // 아직 미해결 → 확정 버튼 없음.
    expect(screen.queryByRole('button', { name: confirmBtnName })).not.toBeInTheDocument();

    await act(async () => {
      resolve(resolvedDraft(draftFor('2026-06')));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: confirmBtnName })).toBeInTheDocument();
    });
  });

  it('view-only — canWrite=false 면 확정 버튼 미노출 + 안내 문구', async () => {
    mockFetchPostpaidDraft.mockResolvedValue(resolvedDraft(draftFor('2026-06')));

    render(
      <PostpaidSettlementSection
        classId="c1"
        yearMonth="2026-06"
        canWrite={false}
        iceTheme
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(MESSAGES.postpaidSettlement.viewOnly)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: confirmBtnName })).not.toBeInTheDocument();
  });

  it('canWrite=true + 과거월 + items>0 → 확정 활성', async () => {
    mockFetchPostpaidDraft.mockResolvedValue(resolvedDraft(draftFor('2026-06')));

    render(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-06" canWrite iceTheme />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: confirmBtnName })).toBeEnabled();
    });
  });

  it('확정 월 정확성 — 클릭 시 선택 월로 confirm 호출 + 성공 후 onConfirmed', async () => {
    mockFetchPostpaidDraft.mockResolvedValue(resolvedDraft(draftFor('2026-06')));
    mockConfirmPostpaidSettlementResult.mockResolvedValue({
      ok: true,
      data: { billingId: 'b1', lineCount: 1, totalAmount: 60000 },
    } as ConfirmPostpaidResultResponse);
    const onConfirmed = jest.fn();

    render(
      <PostpaidSettlementSection
        classId="c1"
        yearMonth="2026-06"
        canWrite
        onConfirmed={onConfirmed}
        iceTheme
      />,
    );

    const btn = await screen.findByRole('button', { name: confirmBtnName });
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockConfirmPostpaidSettlementResult).toHaveBeenCalledWith('c1', '2026-06');
    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledTimes(1);
    });
    expect(mockToastSuccess).toHaveBeenCalledWith(
      MESSAGES.postpaidSettlement.confirmedToast,
    );
  });

  it('당월 비활성 — isPastMonth=false(당월)면 확정 버튼 disabled', async () => {
    mockFetchPostpaidDraft.mockResolvedValue(resolvedDraft(draftFor('2026-07')));

    render(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-07" canWrite iceTheme />,
    );

    const btn = await screen.findByRole('button', { name: confirmBtnName });
    expect(btn).toBeDisabled();
  });

  it('draft 실패 — InlineRetryError 노출(섹션 숨김/0 위장 금지)', async () => {
    mockFetchPostpaidDraft.mockResolvedValue({ ok: false } as PostpaidDraftResult);

    render(
      <PostpaidSettlementSection classId="c1" yearMonth="2026-06" canWrite iceTheme />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(MESSAGES.settlement.monthLoadFailed),
      ).toBeInTheDocument();
    });
    // 재시도 버튼 노출 + 확정 버튼 미노출(0 위장 아님).
    expect(
      screen.getByRole('button', { name: MESSAGES.settlement.retry }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: confirmBtnName })).not.toBeInTheDocument();
  });
});
