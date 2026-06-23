import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * 조회 대상 엔티티 타입
 * - 새 도메인이 추가되면 여기에 union으로 확장
 */
export type ViewCounterEntityType =
  | "notice"
  | "academy_promotion"
  | "club_post"
  | "tms_post"
  | "shop_product"
  | "video";

export interface TryIncrementParams {
  entityType: ViewCounterEntityType;
  entityId: string;
  /**
   * 조회 사용자 ID (로그인 사용자)
   * - undefined/null: 비로그인 → 카운트 증가 없음 (식별 불가)
   */
  userId?: string | null;
}

/**
 * 1일 1회 조회수 증가 제한을 담당하는 공통 서비스.
 *
 * 설계 원칙:
 * - **단일 진실 공급원**: 모든 viewCount 도메인이 동일한 뷰 로그 테이블을 공유
 * - **원자적 중복 차단**: DB UNIQUE 제약(entity_type + entity_id + user_id + viewed_date)으로
 *   동시 요청에도 절대 중복 카운트되지 않음 (애플리케이션 레벨 경합 조건 불필요)
 * - **KST 기준**: 한국 사용자 관점의 "하루"를 기준으로 제한 (00:00 KST 경계)
 * - **실패 관대**: 뷰 로그 기록 실패가 실제 조회 기능을 막지 않도록 에러 격리
 *
 * 사용 패턴:
 * ```ts
 * const shouldIncrement = await this.viewCounter.tryIncrement({
 *   entityType: 'notice',
 *   entityId: noticeId,
 *   userId: req.user?.id,
 * });
 *
 * if (shouldIncrement) {
 *   await this.prisma.systemNotice.update({
 *     where: { id: noticeId },
 *     data: { viewCount: { increment: 1 } },
 *   });
 * }
 * ```
 */
@Injectable()
export class ViewCounterService {
  private readonly logger = new Logger(ViewCounterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 오늘(KST) 해당 사용자의 첫 조회이면 true, 이미 오늘 조회했으면 false
   *
   * - `userId`가 없으면(비로그인) 항상 false → 카운트 증가 없음
   * - UNIQUE 제약 위반(P2002) → 이미 오늘 조회 → false
   * - 기타 DB 오류 → 로깅 후 false (조회 기능 자체는 보호)
   */
  async tryIncrement(params: TryIncrementParams): Promise<boolean> {
    const { entityType, entityId, userId } = params;

    // 비로그인 사용자는 1일 1회 식별이 불가능하므로 카운트 증가 대상에서 제외
    if (!userId) return false;

    const viewedDate = this.getKstDateString();

    try {
      await this.prisma.dailyViewLog.create({
        data: {
          entityType,
          entityId,
          userId,
          viewedDate,
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // 이미 오늘 조회한 기록이 존재 → 카운트 유지
        return false;
      }
      // 예상치 못한 오류는 조회수 기능만 실패하고 상위 조회 흐름은 유지
      this.logger.warn(
        `[ViewCounter] tryIncrement 실패 entityType=${entityType} entityId=${entityId} userId=${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  /**
   * KST(Asia/Seoul) 기준 오늘 날짜를 'YYYY-MM-DD' 형식으로 반환
   *
   * - 서버 타임존에 의존하지 않음
   * - Intl API 기반이라 DST/역사적 오프셋 변화도 안전
   */
  private getKstDateString(): string {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";

    return `${year}-${month}-${day}`;
  }
}
