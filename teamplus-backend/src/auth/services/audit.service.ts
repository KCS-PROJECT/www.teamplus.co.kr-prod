import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { LoggerService } from "@/logger/logger.service";
import * as crypto from "crypto";

/**
 * 복호화 이벤트 분류
 */
export enum DecryptionEventType {
  // 성공
  SUCCESS = "decryption_success",

  // 실패
  FAILURE_INVALID_PAYLOAD = "decryption_failure_invalid_payload",
  FAILURE_INVALID_FORMAT = "decryption_failure_invalid_format",
  FAILURE_SIZE_VALIDATION = "decryption_failure_size_validation",
  FAILURE_AUTHENTICATION = "decryption_failure_authentication",
  FAILURE_KEY_ERROR = "decryption_failure_key_error",
  FAILURE_UNKNOWN = "decryption_failure_unknown",

  // 보안 위협
  THREAT_TAMPERING_DETECTED = "threat_tampering_detected",
  THREAT_REPLAY_ATTACK = "threat_replay_attack",
  THREAT_MALFORMED_PAYLOAD = "threat_malformed_payload",
  THREAT_SIZE_ABUSE = "threat_size_abuse",
}

/**
 * 위협 수준 분류
 */
export enum ThreatLevel {
  INFO = "info",
  WARNING = "warning",
  CRITICAL = "critical",
}

/**
 * 복호화 감사 이벤트 데이터
 */
export interface DecryptionAuditEvent {
  // 기본 정보
  eventType: DecryptionEventType;
  threatLevel: ThreatLevel;
  timestamp: Date;

  // 사용자/요청 정보
  userId?: string;
  email?: string;
  ipAddress: string;
  userAgent?: string;

  // 페이로드 정보
  payloadHash: string;
  payloadSize: number;
  encryptedDataLength: number;

  // 복호화 결과
  success: boolean;
  duration: number;
  errorMessage?: string;

  // 보안 메타데이터
  isSuspicious: boolean;
  suspicionReason?: string;

  // 추가 컨텍스트
  context?: Record<string, any>;
}

/**
 * 감사 로깅 서비스
 *
 * 복호화 이벤트를 분류하고 감사 추적용으로 기록합니다.
 * - 성공/실패 로깅
 * - 보안 위협 감지
 * - 규정 준수 감시
 */
@Injectable()
export class AuditService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {}

  /**
   * 복호화 이벤트 기록
   *
   * @param event 복호화 감사 이벤트
   */
  async recordDecryptionEvent(event: DecryptionAuditEvent): Promise<void> {
    try {
      // 1. 데이터베이스에 저장 (감사 추적)
      // userId가 없거나 "unknown"인 경우 user relation 생략 (외래키 제약 회피)
      const hasValidUser = event.userId && event.userId !== "unknown";

      // Prisma XOR 타입 호환을 위한 base data 구성
      const baseData = {
        action: event.eventType,
        resource: `crypto:decryption:${event.payloadHash}`,
        ipAddress: event.ipAddress,
        oldValue: {
          timestamp: event.timestamp,
          payloadHash: event.payloadHash,
          payloadSize: event.payloadSize,
          attemptedEmail: event.email, // 실패한 로그인 시도의 이메일 추적
        },
        newValue: {
          eventType: event.eventType,
          threatLevel: event.threatLevel,
          success: event.success,
          duration: event.duration,
          userAgent: event.userAgent,
          email: event.email,
          isSuspicious: event.isSuspicious,
          suspicionReason: event.suspicionReason,
          errorMessage: event.errorMessage,
          context: event.context,
        },
      };

      if (hasValidUser) {
        await this.prisma.auditLog.create({
          data: {
            ...baseData,
            user: { connect: { id: event.userId! } },
          },
        });
      } else {
        await this.prisma.auditLog.create({
          data: baseData,
        });
      }

      // 2. 구조화된 로깅으로 실시간 모니터링
      this.logDecryptionEvent(event);

      // 3. 보안 위협 감지 시 알림
      if (event.isSuspicious) {
        await this.handleSecurityThreat(event);
      }
    } catch (error) {
      // 감사 로깅 실패 시에도 계속 진행 (비긴급)
      this.logger.error("Failed to record decryption audit event", error, {
        context: "AuditService.recordDecryptionEvent",
        eventType: event.eventType,
      });
    }
  }

  /**
   * 복호화 이벤트 분류
   *
   * @param success 복호화 성공 여부
   * @param error 오류 (실패 시)
   * @returns 이벤트 유형
   */
  classifyDecryptionEvent(
    success: boolean,
    error?: Error,
  ): DecryptionEventType {
    if (success) {
      return DecryptionEventType.SUCCESS;
    }

    if (!error) {
      return DecryptionEventType.FAILURE_UNKNOWN;
    }

    const message = error.message.toLowerCase();

    // 인증 태그 오류 → 변조 감지
    if (
      message.includes("authentication") ||
      message.includes("authtag") ||
      message.includes("verify")
    ) {
      return DecryptionEventType.FAILURE_AUTHENTICATION;
    }

    // 형식 오류
    if (
      message.includes("json") ||
      message.includes("parse") ||
      message.includes("format")
    ) {
      return DecryptionEventType.FAILURE_INVALID_FORMAT;
    }

    // 크기 검증 오류
    if (
      message.includes("size") ||
      message.includes("length") ||
      message.includes("max")
    ) {
      return DecryptionEventType.FAILURE_SIZE_VALIDATION;
    }

    // 페이로드 검증 오류
    if (
      message.includes("invalid") ||
      message.includes("malformed") ||
      message.includes("base64")
    ) {
      return DecryptionEventType.FAILURE_INVALID_PAYLOAD;
    }

    // 키 관련 오류
    if (
      message.includes("key") ||
      message.includes("secret") ||
      message.includes("cipher")
    ) {
      return DecryptionEventType.FAILURE_KEY_ERROR;
    }

    return DecryptionEventType.FAILURE_UNKNOWN;
  }

  /**
   * 위협 수준 결정
   *
   * @param eventType 이벤트 유형
   * @returns 위협 수준
   */
  determineThreatLevel(eventType: DecryptionEventType): ThreatLevel {
    // 보안 위협 → 높음
    if (eventType.startsWith("threat_")) {
      return ThreatLevel.CRITICAL;
    }

    // 인증 실패 → 중간
    if (eventType === DecryptionEventType.FAILURE_AUTHENTICATION) {
      return ThreatLevel.WARNING;
    }

    // 그 외 실패 → 정보
    if (eventType.startsWith("failure_")) {
      return ThreatLevel.INFO;
    }

    // 성공 → 정보
    return ThreatLevel.INFO;
  }

  /**
   * 의심스러운 활동 감지
   *
   * @param ipAddress IP 주소
   * @param userId 사용자 ID
   * @param failureCount 최근 실패 횟수
   * @returns 의심 여부 및 사유
   */
  async detectSuspiciousActivity(
    ipAddress: string,
    userId?: string,
    failureCount: number = 0,
  ): Promise<{ isSuspicious: boolean; reason?: string }> {
    // 1. 최근 1시간 동안의 실패 횟수 확인
    if (failureCount >= 5) {
      return {
        isSuspicious: true,
        reason: `Multiple decryption failures (${failureCount} in 1 hour)`,
      };
    }

    // 2. 같은 IP에서의 비정상 활동 패턴
    const recentFailures = await this.prisma.auditLog.count({
      where: {
        resource: { contains: "crypto:decryption" },
        ipAddress,
        createdAt: {
          gte: new Date(Date.now() - 3600000), // 1시간
        },
      },
    });

    if (recentFailures > 20) {
      return {
        isSuspicious: true,
        reason: "Abnormal decryption failure pattern detected",
      };
    }

    // 3. 사용자별 비정상 활동
    if (userId && userId !== "unknown") {
      const userFailures = await this.prisma.auditLog.count({
        where: {
          userId,
          resource: { contains: "crypto:decryption" },
          createdAt: {
            gte: new Date(Date.now() - 3600000), // 1시간
          },
        },
      });

      if (userFailures >= 10) {
        return {
          isSuspicious: true,
          reason: `User has ${userFailures} decryption failures in 1 hour`,
        };
      }
    }

    return { isSuspicious: false };
  }

  /**
   * 페이로드 해시 생성 (개인정보 미포함)
   *
   * @param encryptedData 암호화된 데이터
   * @returns SHA-256 해시
   */
  generatePayloadHash(encryptedData: string): string {
    return crypto
      .createHash("sha256")
      .update(encryptedData)
      .digest("hex")
      .substring(0, 16); // 처음 16글자만 (성능)
  }

  /**
   * 복호화 이벤트 로깅 (실시간 모니터링)
   *
   * @param event 복호화 감사 이벤트
   */
  private logDecryptionEvent(event: DecryptionAuditEvent): void {
    const baseContext = {
      eventType: event.eventType,
      threatLevel: event.threatLevel,
      payloadSize: event.payloadSize,
      duration: `${event.duration}ms`,
      ipAddress: event.ipAddress,
      isSuspicious: event.isSuspicious,
    };

    if (event.success) {
      this.logger.info("Decryption succeeded", {
        ...baseContext,
        email: event.email,
      });
    } else {
      this.logger.warn("Decryption failed", {
        ...baseContext,
        email: event.email,
        errorMessage: event.errorMessage,
        suspicionReason: event.suspicionReason,
      });
    }

    // 보안 위협 로깅
    if (event.isSuspicious) {
      this.logger.error("Security threat detected in decryption", undefined, {
        ...baseContext,
        userId: event.userId,
        suspicionReason: event.suspicionReason,
      });
    }
  }

  /**
   * 보안 위협 처리
   *
   * @param event 복호화 감사 이벤트
   */
  private async handleSecurityThreat(
    event: DecryptionAuditEvent,
  ): Promise<void> {
    // 1. 알림 발송 (보안팀)
    this.logger.audit(
      "security_threat",
      `crypto:decryption:threat`,
      event.userId || "unknown",
      "failure", // status: success or failure
      {
        threatLevel: event.threatLevel,
        eventType: event.eventType,
        ipAddress: event.ipAddress,
        suspicionReason: event.suspicionReason,
      },
    );

    // 2. 추가 보안 조치
    if (event.eventType === DecryptionEventType.THREAT_TAMPERING_DETECTED) {
      // 변조 감지: 사용자 계정 보안 검토
      this.logger.warn("Potential tampering attack detected", {
        userId: event.userId,
        ipAddress: event.ipAddress,
        payloadHash: event.payloadHash,
      });
    }

    if (event.eventType === DecryptionEventType.THREAT_REPLAY_ATTACK) {
      // 재사용 공격: IP 블로킹 검토
      this.logger.warn("Potential replay attack detected", {
        ipAddress: event.ipAddress,
        payloadHash: event.payloadHash,
      });
    }
  }

  /**
   * 감사 로그 쿼리 (내부 사용)
   *
   * @param filters 필터 조건
   * @returns 감사 로그 배열
   */
  async queryAuditLogs(filters: {
    userId?: string;
    eventType?: DecryptionEventType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }) {
    const { userId, eventType, startDate, endDate, limit = 100 } = filters;

    const query: any = {
      resource: { contains: "crypto:decryption" },
    };

    if (userId) query.userId = userId;
    if (eventType) query.action = eventType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.gte = startDate;
      if (endDate) query.createdAt.lte = endDate;
    }

    return await this.prisma.auditLog.findMany({
      where: query,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * 보안 보고서 생성 (일일/주간)
   *
   * @returns 보안 통계
   */
  async generateSecurityReport(days: number = 1) {
    const startDate = new Date(Date.now() - days * 24 * 3600000);

    // 전체 복호화 이벤트 카운트
    const totalDecryptions = await this.prisma.auditLog.count({
      where: {
        resource: { contains: "crypto:decryption" },
        createdAt: { gte: startDate },
      },
    });

    // 실패한 복호화 이벤트
    const failedDecryptions = await this.prisma.auditLog.count({
      where: {
        resource: { contains: "crypto:decryption" },
        action: { contains: "failure" },
        createdAt: { gte: startDate },
      },
    });

    // 보안 위협 이벤트
    const securityThreats = await this.prisma.auditLog.count({
      where: {
        resource: { contains: "crypto:decryption" },
        action: { startsWith: "threat_" },
        createdAt: { gte: startDate },
      },
    });

    // 의심스러운 활동
    const suspiciousActivities = await this.prisma.auditLog.findMany({
      where: {
        resource: { contains: "crypto:decryption" },
        createdAt: { gte: startDate },
      },
      select: {
        newValue: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const suspiciousCount = suspiciousActivities.filter((log) => {
      const newValue = log.newValue as any;
      return newValue?.isSuspicious === true;
    }).length;

    return {
      period: `Last ${days} day(s)`,
      statistics: {
        totalDecryptions,
        failedDecryptions,
        failureRate:
          totalDecryptions > 0
            ? ((failedDecryptions / totalDecryptions) * 100).toFixed(2) + "%"
            : "0%",
        securityThreats,
        suspiciousActivities: suspiciousCount,
      },
      generatedAt: new Date(),
    };
  }
}
