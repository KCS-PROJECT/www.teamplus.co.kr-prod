import { Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import {
  DEFAULT_PAYMENT_PROVIDER,
  isKnownPaymentProvider,
  type PaymentProviderCode,
} from "./constants/payment-provider.constant";

/**
 * 활성 결제사 조회 — 신규 결제를 어느 결제사로 시작할지 결정한다.
 *
 * 서비스가 아니라 순수 함수인 이유: 호출부가 payments·tournaments 등 서로 다른 모듈에
 *   흩어져 있어 서비스로 만들면 모듈 간 의존을 새로 엮어야 한다. 두 인자는 호출부가
 *   이미 보유하거나(prisma) 전역 모듈에서 바로 주입되는 것(redis)이라 DI 변경이 없다.
 *
 * 캐시: app_settings 는 원격 DB 라 왕복이 수백 ms 다. 관리자가 설정을 저장하면
 *   updateAppSettings 가 이 키를 지우므로 전환은 다음 결제부터 즉시 반영된다.
 *   TTL 은 무효화가 누락된 경우를 위한 안전망이다.
 *
 * 조회 실패 시 기본값(toss)으로 폴백한다 — 결제 시작에 새로운 실패 지점을 만들지 않기 위함이며,
 *   기본값이 곧 기존 하드코딩 동작이라 최악의 경우도 현재와 동일하다.
 */
export const ACTIVE_PAYMENT_PROVIDER_CACHE_KEY = "payment:active_provider:v1";
const ACTIVE_PAYMENT_PROVIDER_CACHE_TTL = 300;

const logger = new Logger("PaymentProvider");

export async function resolveActivePaymentProvider(
  prisma: PrismaService,
  redis?: RedisService,
): Promise<PaymentProviderCode> {
  try {
    const cached = await redis?.get<string>(ACTIVE_PAYMENT_PROVIDER_CACHE_KEY);
    if (isKnownPaymentProvider(cached)) return cached;
  } catch {
    /* Redis 장애 → DB 폴백 */
  }

  let value: PaymentProviderCode = DEFAULT_PAYMENT_PROVIDER;
  try {
    const row = await prisma.appSettings.findFirst({
      select: { paymentProvider: true },
    });
    if (isKnownPaymentProvider(row?.paymentProvider)) {
      value = row.paymentProvider as PaymentProviderCode;
    } else if (row) {
      logger.warn(
        `알 수 없는 결제사 설정값(${row.paymentProvider}) — 기본값 ${DEFAULT_PAYMENT_PROVIDER} 사용`,
      );
    }
  } catch (err) {
    logger.warn(
      `결제사 설정 조회 실패 — 기본값 ${DEFAULT_PAYMENT_PROVIDER} 사용: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    );
  }

  try {
    await redis?.set(
      ACTIVE_PAYMENT_PROVIDER_CACHE_KEY,
      value,
      ACTIVE_PAYMENT_PROVIDER_CACHE_TTL,
    );
  } catch {
    /* 캐시 저장 실패는 무시 — 다음 호출에서 DB 재조회 */
  }
  return value;
}
