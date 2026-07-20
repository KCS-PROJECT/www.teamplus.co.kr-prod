/**
 * kstYearMonth — KST(Asia/Seoul) 월 경계 유틸 테스트 (Codex Phase 3 MEDIUM-3)
 *
 * 핵심: 디바이스 로컬 타임존이 아니라 KST 기준으로 'YYYY-MM' 을 산출해야 한다.
 * UTC 로는 전/다음 달이지만 KST(+9) 로는 다른 달이 되는 경계를 검증한다.
 */

import { kstYearMonth } from '@/lib/kst-month';

describe('kstYearMonth — KST 월 경계', () => {
  it('UTC 2026-06-30T20:00Z → KST 2026-07-01 05:00 → "2026-07"', () => {
    expect(kstYearMonth(new Date('2026-06-30T20:00:00Z'))).toBe('2026-07');
  });

  it('UTC 2026-07-31T15:00Z → KST 2026-08-01 00:00 → "2026-08"', () => {
    expect(kstYearMonth(new Date('2026-07-31T15:00:00Z'))).toBe('2026-08');
  });

  it('UTC 2026-07-31T14:59Z → KST 2026-07-31 23:59 → 여전히 "2026-07"', () => {
    expect(kstYearMonth(new Date('2026-07-31T14:59:00Z'))).toBe('2026-07');
  });

  it('연 경계: UTC 2026-12-31T20:00Z → KST 2027-01 → "2027-01"', () => {
    expect(kstYearMonth(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01');
  });

  it('KST 정오는 같은 날짜의 월을 그대로 반환', () => {
    expect(kstYearMonth(new Date('2026-07-15T03:00:00Z'))).toBe('2026-07'); // KST 12:00
  });
});
