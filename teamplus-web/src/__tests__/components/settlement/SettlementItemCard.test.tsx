/**
 * 공유 SettlementItemCard — 5-state 배지 · 차단 사유 · drilldown 최소 회귀 테스트.
 *
 * 팀 허브(director-payments)와 오픈클래스(academy) 정산 탭이 재사용하는 공유 카드가
 * 상태 배지·차단 사유 문구·detailPath onOpen 콜백을 정확히 렌더/호출하는지 검증한다.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { MESSAGES } from '@/lib/messages';
import {
  SettlementItemCard,
  classToCardData,
  type SettlementCardData,
} from '@/components/settlement/SettlementItemCard';
import type { ClassSettlementSummary } from '@/services/payment';

// 아이콘은 렌더 부담을 줄이기 위해 목킹
jest.mock('@/components/ui/Icon', () => ({
  Icon: () => null,
}));

function makeCardData(overrides: Partial<SettlementCardData> = {}): SettlementCardData {
  return {
    title: 'CARD_TITLE',
    subtitle: '팀A',
    settlementStatus: 'DRAFT',
    total: 5,
    paidCount: 3,
    billedAmount: 50000,
    paidAmount: 30000,
    outstandingAmount: 20000,
    estimatedAmount: 0,
    mixedBilling: false,
    timingParts: [],
    blockedReasonCode: null,
    detailPath: '/classes/c1/students?yearMonth=2026-07',
    ...overrides,
  };
}

describe('SettlementItemCard', () => {
  it('5-state 배지(작성 중)와 완납 인원을 표시한다', () => {
    render(<SettlementItemCard data={makeCardData()} onOpen={jest.fn()} />);
    expect(screen.getByText('CARD_TITLE')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.statusDraft)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.settlement.paidRatio(3, 5))).toBeInTheDocument();
  });

  it('정산 완료 상태 배지를 표시한다', () => {
    render(
      <SettlementItemCard
        data={makeCardData({ settlementStatus: 'CONFIRMED' })}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getByText(MESSAGES.settlement.statusConfirmed)).toBeInTheDocument();
  });

  it('차단 사유 코드가 있으면 해당 안내 문구를 표시한다', () => {
    render(
      <SettlementItemCard
        data={makeCardData({ blockedReasonCode: 'MONTH_NOT_ENDED' })}
        onOpen={jest.fn()}
      />,
    );
    expect(
      screen.getByText(MESSAGES.settlement.blockedMonthNotEnded),
    ).toBeInTheDocument();
  });

  it('클릭 시 detailPath 로 onOpen 을 호출한다', () => {
    const onOpen = jest.fn();
    render(<SettlementItemCard data={makeCardData()} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('CARD_TITLE'));
    expect(onOpen).toHaveBeenCalledWith('/classes/c1/students?yearMonth=2026-07');
  });
});

describe('classToCardData', () => {
  it('수업 소계를 카드 데이터로 정규화하고 선불/후불 인원 요약을 만든다', () => {
    const item = {
      classId: 'c1',
      className: 'TRAIN_A',
      teamId: null,
      teamName: '팀A',
      billingMode: 'PREPAID',
      settlementStatus: 'DRAFT',
      paymentStatus: 'PARTIAL_PAID',
      total: 5,
      paidCount: 3,
      billedAmount: 50000,
      paidAmount: 30000,
      outstandingAmount: 20000,
      estimatedAmount: 0,
      cancelledCount: 0,
      refundedCount: 0,
      refundedAmount: 0,
      mixedBilling: true,
      prepaidCount: 2,
      postpaidCount: 1,
      unassignedCount: 0,
      blockedReasonCode: null,
      detailPath: '/classes/c1/students?yearMonth=2026-07',
    } as ClassSettlementSummary;

    const card = classToCardData(item);

    expect(card.title).toBe('TRAIN_A');
    expect(card.subtitle).toBe('팀A');
    expect(card.timingParts).toEqual([
      `${MESSAGES.settlement.prepaid} 2${MESSAGES.settlement.person}`,
      `${MESSAGES.settlement.postpaid} 1${MESSAGES.settlement.person}`,
    ]);
    expect(card.detailPath).toBe('/classes/c1/students?yearMonth=2026-07');
  });
});
