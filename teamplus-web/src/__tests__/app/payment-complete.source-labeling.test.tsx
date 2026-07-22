/**
 * /payment/complete — 서버 billingTiming 기반 후불 판정 회귀 테스트 (작업 B · SPEC §4-3 결정3)
 *
 * 검증:
 *  (a) receipt.billingTiming === 'POSTPAID' → SuccessAnimation 이 후불 완료 문구
 *      (postpaidPay.completedNote)를 노출(isPostpaid true). 접두사 heuristic 대체.
 *  (b) useBlockBackNavigation getRedirectTarget 이중 판정:
 *      - 서버값 POSTPAID → null(뒤로가기 차단)
 *      - 서버값 없음 + orderNumber 'POSTPAID-' 접두사 → null(폴백 병행)
 *      - 선불 + 일반 주문번호 → homePath(정상 홈 이동)
 *
 * 렌더 부담을 줄이기 위해 Suspense 외부 훅/UI/브릿지/서비스를 목킹하고,
 * useBlockBackNavigation 은 전달된 getRedirectTarget 을 캡처해 직접 평가한다.
 */

import { render, screen, act } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import type { Receipt } from '@/types/payment';

// ── searchParams 제어 ───────────────────────────────────
let searchParamsMap: Record<string, string> = {};
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (k: string) => searchParamsMap[k] ?? null,
  }),
}));

// ── useBlockBackNavigation: 최신 getRedirectTarget 캡처 ──
let capturedGetRedirectTarget: (() => string | null) | null = null;
jest.mock('@/hooks/useBlockBackNavigation', () => ({
  useBlockBackNavigation: (opts: { getRedirectTarget: () => string | null }) => {
    capturedGetRedirectTarget = opts.getRedirectTarget;
  },
}));

// ── 서비스 목킹 ─────────────────────────────────────────
const verifyPaymentCompletionMock = jest.fn();
jest.mock('@/services/payment', () => ({
  verifyPaymentCompletion: (...a: unknown[]) => verifyPaymentCompletionMock(...a),
  getReceiptDownloadUrl: jest.fn(),
}));
jest.mock('@/services/native-bridge', () => ({
  navigation: { openExternal: jest.fn() },
}));
jest.mock('@/services/api-client', () => ({ api: { post: jest.fn() } }));

// ── 훅/UI 목킹 ──────────────────────────────────────────
jest.mock('@/hooks/usePageReady', () => ({ usePageReady: () => {} }));
jest.mock('@/hooks/useNativeUI', () => ({ useNativeUI: () => {} }));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userType: 'parent' } }),
}));
jest.mock('@/lib/auth-routing', () => ({
  getDashboardPathByUserType: () => '/parent',
}));
jest.mock('@/components/ui/NavLink', () => ({
  NavLink: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('@/components/ui/Icon', () => ({ Icon: () => null }));
jest.mock('@/components/layout/MobileContainer', () => ({
  MobileContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import PaymentCompletePage from '@/app/payment/complete/page';

function makeReceipt(over: Partial<Receipt>): Receipt {
  return {
    id: 'r1',
    orderNumber: 'ORD-1',
    status: 'completed',
    storeName: 'TEAMPLUS',
    paymentDate: '2026.07.01 10:00',
    paymentMethod: 'card',
    productName: '정기권',
    totalAmount: 30000,
    creditsIssued: 4,
    ...over,
  };
}

async function renderComplete(receipt: Receipt) {
  verifyPaymentCompletionMock.mockResolvedValue({
    success: true,
    data: { receipt, creditsIssued: receipt.creditsIssued, message: 'ok' },
  });
  await act(async () => {
    render(<PaymentCompletePage />);
  });
}

describe('/payment/complete — billingTiming 후불 판정', () => {
  beforeEach(() => {
    searchParamsMap = { orderNumber: 'ORD-1' };
    capturedGetRedirectTarget = null;
    verifyPaymentCompletionMock.mockReset();
  });

  it('(a) 서버 billingTiming POSTPAID → 후불 완료 문구 + 뒤로가기 차단(null)', async () => {
    await renderComplete(makeReceipt({ billingTiming: 'POSTPAID', orderNumber: 'ORD-1' }));

    expect(screen.getByText(MESSAGES.postpaidPay.completedNote)).toBeInTheDocument();
    expect(capturedGetRedirectTarget!()).toBeNull();
  });

  it('(b) 서버값 없음 + POSTPAID- 접두사 → 폴백으로 차단(null)', async () => {
    searchParamsMap = { orderNumber: 'POSTPAID-abc' };
    await renderComplete(makeReceipt({ billingTiming: undefined, orderNumber: 'POSTPAID-abc' }));

    // 서버 billingTiming 없음 → 선불 문구
    expect(screen.getByText(MESSAGES.payment2.creditIssued)).toBeInTheDocument();
    // 접두사 폴백으로 여전히 차단
    expect(capturedGetRedirectTarget!()).toBeNull();
  });

  it('(c) 선불 + 일반 주문번호 → 홈 경로 반환', async () => {
    await renderComplete(makeReceipt({ billingTiming: 'PREPAID', orderNumber: 'ORD-1' }));

    expect(screen.getByText(MESSAGES.payment2.creditIssued)).toBeInTheDocument();
    expect(capturedGetRedirectTarget!()).toBe('/parent');
  });
});
