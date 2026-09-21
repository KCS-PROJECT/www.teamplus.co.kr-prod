import { MESSAGES } from '@/lib/messages';

/**
 * 결제사 — 서버(AppSettings.paymentProvider / initiate 응답 pgProvider)가 정하는 값.
 *
 *  'mock' 은 /payment/complete 전용 테스트 결제 경로라 여기 포함하지 않는다.
 */
export type PaymentProvider = 'toss' | 'nice' | 'nicestd';

const KNOWN_PROVIDERS: readonly PaymentProvider[] = ['toss', 'nice', 'nicestd'];

/**
 * 결제사 값 판정 — 세 값만 통과시킨다.
 *
 *  기존 화면들은 `=== 'nice' ? 'nice' : 'toss'` 삼항으로 판정해, 서버가 새 결제사
 *  값을 내려줘도 갱신이 빠진 화면은 조용히 다른 PG 위젯을 열었다. 미지 값(undefined
 *  포함)은 반드시 throw 해 호출부가 에러 화면으로 처리하게 한다 — 묵시적 폴백 금지.
 */
export function resolvePaymentProvider(value: unknown): PaymentProvider {
  if (typeof value === 'string' && (KNOWN_PROVIDERS as readonly string[]).includes(value)) {
    return value as PaymentProvider;
  }
  throw new Error(MESSAGES.payment2.unknownProvider);
}
