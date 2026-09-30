import { Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import {
  DEFAULT_PAYOUT_API_MODE,
  isKnownPayoutApiMode,
  type PayoutApiMode,
} from "./constants/payout-mode.constant";

/**
 * 현재 지급대행 API 사용 단계 조회. 설정 저장 시 updateAppSettings 가 캐시를 지운다.
 *
 * 조회에 실패하거나 값이 이상하면 off 로 본다 — 결제사 조회와 반대 방향의 폴백이다.
 *   장애 때문에 나이스 쪽 데이터를 바꾸는 호출이 켜지는 일이 없어야 한다.
 */
export const PAYOUT_API_MODE_CACHE_KEY = "settlement:payout_api_mode:v1";
const PAYOUT_API_MODE_CACHE_TTL = 300;

const logger = new Logger("PayoutApiMode");

export async function resolvePayoutApiMode(
  prisma: PrismaService,
  redis?: RedisService,
): Promise<PayoutApiMode> {
  try {
    const cached = await redis?.get<string>(PAYOUT_API_MODE_CACHE_KEY);
    if (isKnownPayoutApiMode(cached)) return cached;
  } catch {
    /* Redis 장애 → DB 조회 */
  }

  let value: PayoutApiMode = DEFAULT_PAYOUT_API_MODE;
  try {
    const row = await prisma.appSettings.findFirst({
      select: { payoutApiMode: true },
    });
    if (isKnownPayoutApiMode(row?.payoutApiMode)) {
      value = row.payoutApiMode as PayoutApiMode;
    } else if (row) {
      logger.warn(
        `알 수 없는 지급대행 모드(${row.payoutApiMode}) — off 로 처리`,
      );
    }
  } catch (err) {
    logger.warn(
      `지급대행 모드 조회 실패 — off 로 처리: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    );
    return value;
  }

  try {
    await redis?.set(
      PAYOUT_API_MODE_CACHE_KEY,
      value,
      PAYOUT_API_MODE_CACHE_TTL,
    );
  } catch {
    /* 다음 호출에서 DB 재조회 */
  }
  return value;
}
