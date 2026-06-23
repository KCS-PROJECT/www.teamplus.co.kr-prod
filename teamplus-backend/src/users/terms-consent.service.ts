import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";

/**
 * TermsConsentService (L-02 — 2026-05-21 신규)
 *
 * 사용자의 약관/개인정보처리방침 동의 버전과 현재 운영 버전을 비교하여
 * 재동의가 필요한지 판단한다.
 *
 * 정책:
 *  - 운영 버전 = AppSettings.termsVersion / AppSettings.privacyVersion
 *  - 사용자 동의 버전 = User.agreedTermsVersion / User.agreedPrivacyVersion
 *  - 운영 버전과 다르면 (또는 NULL) `requiresReconsent: true`
 *  - 동의 처리 시 두 필드 + agreedAt 동시 갱신 + 무효 Redis 캐시
 *
 * 사용처:
 *  - GET /api/v1/auth/me/terms-status → Web/App 라우팅 가드
 *  - POST /api/v1/auth/me/terms-consent → 동의 처리
 */

const APP_SETTINGS_CACHE_KEY = "app:settings:v1";
const USER_TERMS_CACHE_KEY = (userId: string) => `user:terms:${userId}`;

export interface TermsStatus {
  requiresReconsent: boolean;
  reasons: Array<"TERMS_OUTDATED" | "PRIVACY_OUTDATED" | "NEVER_AGREED">;
  current: {
    termsVersion: string;
    privacyVersion: string;
  };
  agreed: {
    termsVersion: string | null;
    privacyVersion: string | null;
    agreedAt: Date | null;
  };
}

@Injectable()
export class TermsConsentService {
  private readonly logger = new Logger(TermsConsentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * 현재 운영 약관 버전 조회 (AppSettings 캐시 활용)
   */
  private async getCurrentVersions(): Promise<{
    termsVersion: string;
    privacyVersion: string;
  }> {
    // AppSettings 단일 row 가져오기 (캐시 우선)
    try {
      const cached = await this.redis
        .getClient()
        ?.get(APP_SETTINGS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          termsVersion: parsed?.termsVersion ?? "1.0",
          privacyVersion: parsed?.privacyVersion ?? "1.0",
        };
      }
    } catch {
      // 캐시 실패 시 DB 폴백
    }

    const settings = await this.prisma.appSettings.findFirst({
      select: { termsVersion: true, privacyVersion: true },
    });
    return {
      termsVersion: settings?.termsVersion ?? "1.0",
      privacyVersion: settings?.privacyVersion ?? "1.0",
    };
  }

  /**
   * 사용자의 약관 동의 상태 조회
   */
  async getStatus(userId: string): Promise<TermsStatus> {
    const [current, user] = await Promise.all([
      this.getCurrentVersions(),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          agreedTermsVersion: true,
          agreedPrivacyVersion: true,
          agreedAt: true,
        },
      }),
    ]);

    const reasons: TermsStatus["reasons"] = [];
    if (!user?.agreedTermsVersion && !user?.agreedPrivacyVersion) {
      reasons.push("NEVER_AGREED");
    } else {
      if (user.agreedTermsVersion !== current.termsVersion) {
        reasons.push("TERMS_OUTDATED");
      }
      if (user.agreedPrivacyVersion !== current.privacyVersion) {
        reasons.push("PRIVACY_OUTDATED");
      }
    }

    return {
      requiresReconsent: reasons.length > 0,
      reasons,
      current,
      agreed: {
        termsVersion: user?.agreedTermsVersion ?? null,
        privacyVersion: user?.agreedPrivacyVersion ?? null,
        agreedAt: user?.agreedAt ?? null,
      },
    };
  }

  /**
   * 사용자가 현재 운영 버전에 동의 처리
   */
  async accept(userId: string): Promise<TermsStatus> {
    const current = await this.getCurrentVersions();
    const now = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        agreedTermsVersion: current.termsVersion,
        agreedPrivacyVersion: current.privacyVersion,
        agreedAt: now,
      },
    });

    this.logger.log(
      `약관 재동의 완료: userId=${userId}, terms=${current.termsVersion}, privacy=${current.privacyVersion}`,
    );

    // 캐시 무효화
    try {
      await this.redis.getClient()?.del(USER_TERMS_CACHE_KEY(userId));
    } catch {
      // 무시
    }

    return {
      requiresReconsent: false,
      reasons: [],
      current,
      agreed: {
        termsVersion: current.termsVersion,
        privacyVersion: current.privacyVersion,
        agreedAt: now,
      },
    };
  }
}
