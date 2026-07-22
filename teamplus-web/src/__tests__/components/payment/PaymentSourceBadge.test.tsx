/**
 * PaymentSourceBadge — 결제 출처·선후불 배지 유닛 테스트 (작업 B · SPEC §6-2)
 *
 * 검증:
 *  - sourceType·billingTiming 둘 다 있을 때만 렌더(무관계 결제 오라벨 방지).
 *  - 둘 중 하나라도 없으면 null (아무것도 렌더하지 않음).
 *  - MESSAGES.payment2 문구 사용(하드코딩 0) — 수업/대회 · 선불/후불.
 */

import { render, screen } from '@testing-library/react';
import { PaymentSourceBadge } from '@/components/payment/PaymentSourceBadge';
import { MESSAGES } from '@/lib/messages';

describe('PaymentSourceBadge', () => {
  it('둘 다 있을 때 수업·선불 라벨을 렌더', () => {
    render(<PaymentSourceBadge sourceType="CLASS" billingTiming="PREPAID" />);
    expect(screen.getByText(MESSAGES.payment2.sourceClass)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.payment2.prepaid)).toBeInTheDocument();
  });

  it('대회·후불 라벨을 렌더', () => {
    render(<PaymentSourceBadge sourceType="TOURNAMENT" billingTiming="POSTPAID" />);
    expect(screen.getByText(MESSAGES.payment2.sourceTournament)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.payment2.postpaid)).toBeInTheDocument();
  });

  it('sourceType 만 있으면 렌더하지 않음', () => {
    const { container } = render(<PaymentSourceBadge sourceType="CLASS" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('billingTiming 만 있으면 렌더하지 않음', () => {
    const { container } = render(<PaymentSourceBadge billingTiming="POSTPAID" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('둘 다 null/undefined 면 렌더하지 않음', () => {
    const { container } = render(
      <PaymentSourceBadge sourceType={null} billingTiming={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
