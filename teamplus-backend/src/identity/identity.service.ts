import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  IdentityProviderType,
  IdentityPurpose,
  InitiateIdentityResponseDto,
  IdentityResultDto,
  IdentityStatusDto,
  UserIdentityStatusDto,
  IdentityStatus,
} from "./dto";
import {
  IIdentityGateway,
  IdentityProvider,
  IdentityVerificationResult,
} from "./gateways/identity-gateway.interface";
import { IDENTITY_GATEWAYS } from "./identity.tokens";

/**
 * 본인인증 서비스
 *
 * 4개 제공자를 지원하는 통합 본인인증 서비스:
 * - KG이니시스
 * - 카카오
 * - NICE평가정보
 * - PASS 앱
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly config: any;
  private readonly gateways: Map<IdentityProvider, IIdentityGateway> =
    new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @Inject(IDENTITY_GATEWAYS) gateways: IIdentityGateway[],
  ) {
    this.config = this.configService.get("identity");
    // 5개 Gateway 일괄 등록 (KG/Kakao/NICE/PASS/PortOne)
    //   - identity.module.ts 의 IDENTITY_GATEWAYS 토큰이 DI 시 배열로 주입.
    //   - 기존엔 registerGateway() 호출 누락으로 모든 Gateway 가 동작하지 않던 갭 동시 해결.
    for (const gw of gateways) {
      this.registerGateway(gw);
    }
    this.logger.log(
      `본인인증 서비스 초기화 완료 — 등록된 Gateway: ${gateways.length}개 (${gateways.map((g) => g.providerName).join(", ")})`,
    );
  }

  /**
   * Gateway 등록
   *
   * 각 제공자의 Gateway를 등록합니다.
   */
  registerGateway(gateway: IIdentityGateway): void {
    this.gateways.set(gateway.providerName, gateway);
    this.logger.log(`Gateway 등록: ${gateway.providerName}`);
  }

  /**
   * 본인인증 시작
   *
   * 사용자를 인증 페이지로 리다이렉트할 URL을 생성합니다.
   */
  async initiateVerification(
    userId: string | null,
    provider: IdentityProviderType,
    purpose: IdentityPurpose,
    options?: {
      returnUrl?: string;
      metadata?: Record<string, any>;
      clientIp?: string;
      userAgent?: string;
    },
  ): Promise<InitiateIdentityResponseDto> {
    const { returnUrl, metadata, clientIp, userAgent } = options || {};

    this.logger.log(
      `본인인증 시작: userId=${userId || "guest"}, provider=${provider}, purpose=${purpose}`,
    );

    // Rate Limiting 확인
    if (userId) {
      const isRateLimited = await this.checkRateLimit(userId);
      if (isRateLimited) {
        throw new BadRequestException(
          "인증 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
        );
      }
    }

    // Gateway 확인
    const gateway = this.gateways.get(provider as IdentityProvider);
    if (!gateway) {
      throw new BadRequestException(
        `지원하지 않는 인증 제공자입니다: ${provider}`,
      );
    }

    // 요청 ID 생성
    const requestId = `idv_${uuidv4().replace(/-/g, "")}`;

    // 만료 시간 설정 (30분)
    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + this.config.common.requestTimeout,
    );

    // 리턴 URL 결정
    const finalReturnUrl = returnUrl || this.config.common.returnBaseUrl;

    // 인증 요청 생성
    try {
      const authResult = await gateway.createAuthRequest({
        requestId,
        purpose,
        userId: userId || undefined,
        returnUrl: finalReturnUrl,
        metadata,
      });

      if (!authResult.success) {
        this.logger.warn(
          `인증 요청 생성 실패: requestId=${requestId}, error=${authResult.errorMessage}`,
        );
        return {
          success: false,
          requestId,
          errorMessage:
            authResult.errorMessage || "인증 요청 생성에 실패했습니다.",
        };
      }

      // DB에 인증 요청 저장
      await this.prisma.identityVerification.create({
        data: {
          requestId,
          userId: userId || null,
          provider,
          purpose,
          status: "pending",
          returnUrl: finalReturnUrl,
          clientIp: clientIp || null,
          userAgent: userAgent || null,
          expiresAt,
        },
      });

      // Redis에 상태 캐시 (빠른 조회용)
      await this.cacheVerificationStatus(requestId, "pending", expiresAt);

      this.logger.log(`인증 요청 생성 완료: requestId=${requestId}`);

      return {
        success: true,
        requestId,
        authUrl: authResult.authUrl,
        authHtml: authResult.authHtml,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      this.logger.error(`인증 요청 중 오류: ${error.message}`, error.stack);
      throw new BadRequestException("인증 요청 처리 중 오류가 발생했습니다.");
    }
  }

  /**
   * 콜백 처리
   *
   * 제공자로부터 받은 콜백 데이터를 처리합니다.
   */
  async processCallback(
    provider: IdentityProviderType,
    callbackData: Record<string, any>,
    clientIp?: string,
  ): Promise<IdentityResultDto> {
    this.logger.log(`콜백 수신: provider=${provider}`);

    // Gateway 확인
    const gateway = this.gateways.get(provider as IdentityProvider);
    if (!gateway) {
      throw new BadRequestException(
        `지원하지 않는 인증 제공자입니다: ${provider}`,
      );
    }

    // IP 화이트리스트 검증 (프로덕션)
    if (clientIp && !gateway.verifyIpWhitelist(clientIp)) {
      this.logger.error(`허용되지 않은 IP에서 콜백: ${clientIp}`);
      throw new BadRequestException("허용되지 않은 IP입니다.");
    }

    // 요청 ID 추출 (제공자별로 다름)
    const requestId = this.extractRequestId(provider, callbackData);
    if (!requestId) {
      throw new BadRequestException("요청 ID를 찾을 수 없습니다.");
    }

    // 인증 요청 조회
    const verification = await this.prisma.identityVerification.findUnique({
      where: { requestId },
    });

    if (!verification) {
      throw new NotFoundException("인증 요청을 찾을 수 없습니다.");
    }

    // 상태 확인
    if (
      verification.status !== "pending" &&
      verification.status !== "processing"
    ) {
      throw new ConflictException("이미 처리된 인증 요청입니다.");
    }

    // 만료 확인
    if (new Date() > verification.expiresAt) {
      await this.updateVerificationStatus(requestId, "expired");
      throw new BadRequestException("인증 요청이 만료되었습니다.");
    }

    // 상태를 processing으로 업데이트
    await this.updateVerificationStatus(requestId, "processing");

    // 웹훅 로그 저장
    await this.logWebhook(verification.id, provider, "callback", callbackData);

    try {
      // 서명 검증
      const signature = callbackData.signature || callbackData.integrity;
      if (signature) {
        const signatureResult = gateway.verifySignature(
          callbackData,
          signature,
        );
        if (!signatureResult.valid) {
          this.logger.error(
            `서명 검증 실패: requestId=${requestId}, error=${signatureResult.errorMessage}`,
          );
          await this.updateVerificationStatus(
            requestId,
            "failed",
            "INVALID_SIGNATURE",
            "서명 검증 실패",
          );
          throw new BadRequestException("서명이 유효하지 않습니다.");
        }
      }

      // 콜백 처리
      const result = await gateway.processCallback({
        requestId,
        responseData: callbackData,
        signature,
        clientIp,
      });

      if (!result.success) {
        this.logger.warn(
          `인증 실패: requestId=${requestId}, error=${result.errorMessage}`,
        );
        await this.updateVerificationStatus(
          requestId,
          "failed",
          result.errorCode,
          result.errorMessage,
        );
        return this.formatResult(
          requestId,
          "failed",
          undefined,
          result.errorCode,
          result.errorMessage,
        );
      }

      // CI/DI 암호화 및 저장
      const encryptedCi = result.ci ? this.encryptData(result.ci) : null;
      const encryptedDi = result.di ? this.encryptData(result.di) : null;
      // [2026-06-10 SECURITY] CI 결정적 해시 — 1인1계정 중복가입 차단 인덱스.
      const ciHash = result.ci ? this.generateCiHash(result.ci) : null;

      // 인증 결과 저장
      await this.prisma.identityVerification.update({
        where: { requestId },
        data: {
          status: "completed",
          ci: encryptedCi,
          ciHash,
          di: encryptedDi,
          verifiedName: result.name,
          verifiedPhone: result.phone,
          verifiedBirth: result.birthDate,
          verifiedGender: result.gender,
          verifiedAt: new Date(),
        },
      });

      // 사용자가 있으면 User 테이블 업데이트
      if (verification.userId) {
        await this.updateUserVerification(
          verification.userId,
          encryptedCi,
          encryptedDi,
          ciHash,
        );
      }

      // 캐시 업데이트
      await this.cacheVerificationStatus(
        requestId,
        "completed",
        verification.expiresAt,
      );

      this.logger.log(
        `인증 완료: requestId=${requestId}, name=${this.maskName(result.name)}`,
      );

      return this.formatResult(requestId, "completed", result);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      this.logger.error(`콜백 처리 중 오류: ${error.message}`, error.stack);
      await this.updateVerificationStatus(
        requestId,
        "failed",
        "CALLBACK_ERROR",
        error.message,
      );
      throw new BadRequestException("인증 처리 중 오류가 발생했습니다.");
    }
  }

  /**
   * 인증 결과 조회
   */
  async getVerificationResult(requestId: string): Promise<IdentityResultDto> {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { requestId },
    });

    if (!verification) {
      throw new NotFoundException("인증 요청을 찾을 수 없습니다.");
    }

    return {
      success: verification.status === "completed",
      requestId,
      status: verification.status as IdentityStatus,
      name: verification.verifiedName
        ? this.maskName(verification.verifiedName)
        : undefined,
      phone: verification.verifiedPhone
        ? this.maskPhone(verification.verifiedPhone)
        : undefined,
      birthDate: verification.verifiedBirth
        ? this.maskBirthDate(verification.verifiedBirth)
        : undefined,
      gender: verification.verifiedGender || undefined,
      verifiedAt: verification.verifiedAt?.toISOString(),
      errorCode: verification.errorCode || undefined,
      errorMessage: verification.errorMessage || undefined,
    };
  }

  /**
   * 인증 상태 확인 (폴링용)
   */
  async checkVerificationStatus(requestId: string): Promise<IdentityStatusDto> {
    // 먼저 Redis 캐시 확인
    const cachedStatus = await this.redisService.get(
      `identity:status:${requestId}`,
    );
    if (cachedStatus) {
      const cached = JSON.parse(cachedStatus);
      return {
        requestId,
        status: cached.status as IdentityStatus,
        expiresAt: cached.expiresAt,
      };
    }

    // DB 조회
    const verification = await this.prisma.identityVerification.findUnique({
      where: { requestId },
      select: {
        requestId: true,
        status: true,
        provider: true,
        purpose: true,
        requestedAt: true,
        expiresAt: true,
      },
    });

    if (!verification) {
      throw new NotFoundException("인증 요청을 찾을 수 없습니다.");
    }

    // 만료 확인
    if (
      new Date() > verification.expiresAt &&
      verification.status === "pending"
    ) {
      await this.updateVerificationStatus(requestId, "expired");
      return {
        requestId,
        status: IdentityStatus.EXPIRED,
        provider: verification.provider,
        purpose: verification.purpose,
        requestedAt: verification.requestedAt.toISOString(),
        expiresAt: verification.expiresAt.toISOString(),
      };
    }

    return {
      requestId,
      status: verification.status as IdentityStatus,
      provider: verification.provider,
      purpose: verification.purpose,
      requestedAt: verification.requestedAt.toISOString(),
      expiresAt: verification.expiresAt.toISOString(),
    };
  }

  /**
   * 사용자 인증 상태 확인
   */
  async getUserVerificationStatus(
    userId: string,
  ): Promise<UserIdentityStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isVerified: true,
        verifiedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 마지막 인증 정보 조회
    const lastVerification = await this.prisma.identityVerification.findFirst({
      where: {
        userId,
        status: "completed",
      },
      orderBy: { verifiedAt: "desc" },
      select: {
        verifiedName: true,
        provider: true,
      },
    });

    return {
      userId,
      isVerified: user.isVerified,
      verifiedAt: user.verifiedAt?.toISOString(),
      verifiedName: lastVerification?.verifiedName
        ? this.maskName(lastVerification.verifiedName)
        : undefined,
      provider: lastVerification?.provider,
    };
  }

  /**
   * CI로 중복 가입 확인
   */
  async checkDuplicateCI(
    ci: string,
  ): Promise<{ isDuplicate: boolean; existingUserId: string | null }> {
    // [2026-06-10 SECURITY] 결정적 ciHash 로 조회 — 기존 encryptData(랜덤 IV) 비교는 항상 미매칭이라
    //   중복검사가 무력화돼 있었음. 동일 평문 CI 가 항상 같은 해시가 되도록 HMAC 인덱스로 조회한다.
    const ciHash = this.generateCiHash(ci);
    const existing = await this.prisma.user.findUnique({
      where: { ciHash },
      select: { id: true },
    });
    return {
      isDuplicate: !!existing,
      existingUserId: existing?.id || null,
    };
  }

  /**
   * 사용자 인증 이력 조회
   */
  async getUserVerificationHistory(
    userId: string,
    limit: number = 10,
  ): Promise<{
    verifications: Array<{
      requestId: string;
      provider: string;
      purpose: string;
      status: string;
      requestedAt: string;
      verifiedAt: string | null;
    }>;
    totalCount: number;
  }> {
    const [verifications, totalCount] = await Promise.all([
      this.prisma.identityVerification.findMany({
        where: { userId },
        orderBy: { requestedAt: "desc" },
        take: limit,
        select: {
          requestId: true,
          provider: true,
          purpose: true,
          status: true,
          requestedAt: true,
          verifiedAt: true,
        },
      }),
      this.prisma.identityVerification.count({
        where: { userId },
      }),
    ]);

    return {
      verifications: verifications.map((v) => ({
        requestId: v.requestId,
        provider: v.provider,
        purpose: v.purpose,
        status: v.status,
        requestedAt: v.requestedAt.toISOString(),
        verifiedAt: v.verifiedAt?.toISOString() || null,
      })),
      totalCount,
    };
  }

  /**
   * 인증 통계 조회 (관리자용)
   */
  async getVerificationStats(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalVerifications: number;
    completedCount: number;
    failedCount: number;
    expiredCount: number;
    byProvider: Record<string, number>;
    byPurpose: Record<string, number>;
    successRate: string;
  }> {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.requestedAt = {};
      if (startDate) dateFilter.requestedAt.gte = startDate;
      if (endDate) dateFilter.requestedAt.lte = endDate;
    }

    // 전체 통계
    const [total, completed, failed, expired] = await Promise.all([
      this.prisma.identityVerification.count({ where: dateFilter }),
      this.prisma.identityVerification.count({
        where: { ...dateFilter, status: "completed" },
      }),
      this.prisma.identityVerification.count({
        where: { ...dateFilter, status: "failed" },
      }),
      this.prisma.identityVerification.count({
        where: { ...dateFilter, status: "expired" },
      }),
    ]);

    // 제공자별 통계
    const byProviderData = await this.prisma.identityVerification.groupBy({
      by: ["provider"],
      where: dateFilter,
      _count: { provider: true },
    });

    const byProvider: Record<string, number> = {};
    for (const item of byProviderData) {
      byProvider[item.provider] = item._count.provider;
    }

    // 목적별 통계
    const byPurposeData = await this.prisma.identityVerification.groupBy({
      by: ["purpose"],
      where: dateFilter,
      _count: { purpose: true },
    });

    const byPurpose: Record<string, number> = {};
    for (const item of byPurposeData) {
      byPurpose[item.purpose] = item._count.purpose;
    }

    // 성공률 계산
    const successRate =
      total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";

    return {
      totalVerifications: total,
      completedCount: completed,
      failedCount: failed,
      expiredCount: expired,
      byProvider,
      byPurpose,
      successRate,
    };
  }

  // ==================== Private Methods ====================

  /**
   * 요청 ID 추출 (제공자별)
   */
  private extractRequestId(
    provider: IdentityProviderType,
    data: Record<string, any>,
  ): string | null {
    switch (provider) {
      case IdentityProviderType.KG_INICIS:
        return data.requestId || data.state;
      case IdentityProviderType.KAKAO:
        return data.state;
      case IdentityProviderType.NICE:
        return data.reqNo || data.requestId;
      case IdentityProviderType.PASS:
        return data.txId || data.requestId;
      case IdentityProviderType.PORTONE:
        // 클라이언트 SDK 인증 성공 후 프론트가 requestId 와
        // identityVerificationId 둘 다 보내준다. 우리 시스템의 키는 requestId.
        return data.requestId;
      default:
        return data.requestId;
    }
  }

  /**
   * 상태 업데이트
   */
  private async updateVerificationStatus(
    requestId: string,
    status: string,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.identityVerification.update({
      where: { requestId },
      data: {
        status,
        errorCode,
        errorMessage,
      },
    });

    // 캐시 업데이트
    const verification = await this.prisma.identityVerification.findUnique({
      where: { requestId },
      select: { expiresAt: true },
    });
    if (verification) {
      await this.cacheVerificationStatus(
        requestId,
        status,
        verification.expiresAt,
      );
    }
  }

  /**
   * 사용자 인증 정보 업데이트
   */
  private async updateUserVerification(
    userId: string,
    ci: string | null,
    di: string | null,
    ciHash: string | null = null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ci,
        ciHash,
        di,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    this.logger.log(`사용자 인증 정보 업데이트: userId=${userId}`);
  }

  /**
   * 웹훅 로그 저장
   */
  private async logWebhook(
    verificationId: string,
    provider: string,
    webhookType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    // 민감정보 마스킹
    const maskedPayload = this.maskSensitiveData(payload);

    await this.prisma.identityWebhookLog.create({
      data: {
        identityVerificationId: verificationId,
        provider,
        webhookType,
        webhookPayload: maskedPayload,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Rate Limiting 확인
   */
  private async checkRateLimit(userId: string): Promise<boolean> {
    const key = `identity:rate:${userId}`;
    const count = await this.redisService.get(key);
    const currentCount = count ? parseInt(count, 10) : 0;

    if (currentCount >= this.config.security.rateLimitPerHour) {
      return true;
    }

    // 카운트 증가
    await this.redisService.set(
      key,
      (currentCount + 1).toString(),
      3600, // 1시간
    );

    return false;
  }

  /**
   * 상태 캐시
   */
  private async cacheVerificationStatus(
    requestId: string,
    status: string,
    expiresAt: Date,
  ): Promise<void> {
    const ttl = Math.max(
      0,
      Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    );
    await this.redisService.set(
      `identity:status:${requestId}`,
      JSON.stringify({ status, expiresAt: expiresAt.toISOString() }),
      ttl,
    );
  }

  /**
   * 데이터 암호화 (AES-256-CBC)
   */
  private encryptData(data: string): string {
    const key = Buffer.from(
      this.config.security.encryptionKey.padEnd(32, "0").slice(0, 32),
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      this.config.security.encryptionAlgorithm,
      key,
      iv,
    );
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  /**
   * [2026-06-10 SECURITY] CI 결정적 해시 (HMAC-SHA256).
   *   encryptData 는 호출마다 랜덤 IV 라 동일 CI 도 매번 다른 암호문 → 동등비교(중복검사) 불가.
   *   1인1계정·제재회피 차단을 위해 동일 평문 CI 가 항상 같은 값이 되는 keyed-hash 인덱스를 별도 저장한다.
   *   키: IDENTITY_CI_HASH_KEY > encryptionKey 폴백(R7 가드로 프로덕션은 encryptionKey 강제).
   */
  generateCiHash(ci: string): string {
    const hashKey =
      process.env.IDENTITY_CI_HASH_KEY ||
      this.config.security.encryptionKey ||
      "";
    return crypto
      .createHmac("sha256", hashKey)
      .update(ci, "utf8")
      .digest("hex");
  }

  /**
   * [2026-06-10] encryptData 로 저장된 CI/DI 복호화 (백필 스크립트 전용).
   *   포맷: `${ivHex}:${cipherHex}` (AES-256-CBC, encryptData 와 대칭).
   */
  decryptData(encrypted: string): string {
    const key = Buffer.from(
      this.config.security.encryptionKey.padEnd(32, "0").slice(0, 32),
    );
    const [ivHex, cipherHex] = encrypted.split(":");
    if (!ivHex || !cipherHex) {
      throw new Error("암호문 형식이 올바르지 않습니다.");
    }
    const decipher = crypto.createDecipheriv(
      this.config.security.encryptionAlgorithm,
      key,
      Buffer.from(ivHex, "hex"),
    );
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * 민감정보 마스킹
   */
  private maskSensitiveData(data: Record<string, any>): Record<string, any> {
    const sensitiveFields = this.config.logging.sensitiveFields;
    const masked = { ...data };

    for (const field of sensitiveFields) {
      if (masked[field]) {
        masked[field] = "***MASKED***";
      }
    }

    return masked;
  }

  /**
   * 이름 마스킹 (홍*동)
   */
  private maskName(name: string | null | undefined): string | undefined {
    if (!name || name.length < 2) return name || undefined;
    if (name.length === 2) return name[0] + "*";
    return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
  }

  /**
   * 전화번호 마스킹 (010-****-5678)
   */
  private maskPhone(phone: string | null | undefined): string | undefined {
    if (!phone) return undefined;
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.length < 7) return phone;
    return cleaned.slice(0, 3) + "-****-" + cleaned.slice(-4);
  }

  /**
   * 생년월일 마스킹 (1990-**-**)
   */
  private maskBirthDate(
    birthDate: string | null | undefined,
  ): string | undefined {
    if (!birthDate) return undefined;
    if (birthDate.length === 8) {
      return birthDate.slice(0, 4) + "-**-**";
    }
    return birthDate.slice(0, 4) + "-**-**";
  }

  /**
   * 결과 포맷팅
   */
  private formatResult(
    requestId: string,
    status: string,
    result?: IdentityVerificationResult,
    errorCode?: string,
    errorMessage?: string,
  ): IdentityResultDto {
    // [2026-05-13 Phase E-5] PIPA 만 14세 미만 보호자 동의 분기.
    //   birthDate 파싱 가능한 경우 만 나이 계산. 14세 미만 시 클라이언트가
    //   별도 보호자 동의 흐름으로 라우팅하도록 needsGuardianConsent 플래그 부착.
    const ageInfo = this.computeAgeFlags(result?.birthDate);

    return {
      success: status === "completed",
      requestId,
      status: status as IdentityStatus,
      name: result?.name ? this.maskName(result.name) : undefined,
      phone: result?.phone ? this.maskPhone(result.phone) : undefined,
      birthDate: result?.birthDate
        ? this.maskBirthDate(result.birthDate)
        : undefined,
      gender: result?.gender,
      verifiedAt: result?.verifiedAt?.toISOString(),
      errorCode,
      errorMessage,
      isUnder14: ageInfo.isUnder14,
      needsGuardianConsent: ageInfo.needsGuardianConsent,
    };
  }

  /**
   * birthDate (YYYYMMDD 또는 YYYY-MM-DD) → 만 나이 기반 PIPA 플래그 계산.
   *
   * - 파싱 실패: 둘 다 undefined (정책상 false-negative — 동의 절차 강제하지 않음)
   * - 만 14세 미만: { isUnder14: true, needsGuardianConsent: true }
   * - 만 14세 이상: { isUnder14: false, needsGuardianConsent: false }
   */
  private computeAgeFlags(birthDate?: string | null): {
    isUnder14?: boolean;
    needsGuardianConsent?: boolean;
  } {
    if (!birthDate) return {};
    let y: number, m: number, d: number;
    const digits = birthDate.replace(/-/g, "");
    if (digits.length !== 8) return {};
    y = parseInt(digits.slice(0, 4), 10);
    m = parseInt(digits.slice(4, 6), 10);
    d = parseInt(digits.slice(6, 8), 10);
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return {};
    const today = new Date();
    let age = today.getFullYear() - y;
    const monthDiff = today.getMonth() + 1 - m;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
    if (age < 0 || age > 150) return {};
    const isUnder14 = age < 14;
    return { isUnder14, needsGuardianConsent: isUnder14 };
  }
}
