/**
 * Crypto Service
 *
 * Wraps crypto utilities with structured logging and audit logging for decryption operations.
 * Sanitizes sensitive data, provides audit trails, and detects security threats.
 */

import { Injectable } from "@nestjs/common";
import { Request } from "express";
import { LoggerService } from "@/logger/logger.service";
import { AuditService, DecryptionEventType } from "./audit.service";
import {
  decryptCredentials,
  isFallbackPayload,
  EncryptedPayload,
} from "@/common/utils/crypto.util";

@Injectable()
export class CryptoService {
  constructor(
    private logger: LoggerService,
    private audit: AuditService,
  ) {}

  /**
   * Decrypt credentials with structured logging and audit trail
   *
   * @param payload - Encrypted payload (encryptedData, iv, authTag)
   * @param request - Express request (for IP address and user agent)
   * @param userId - User ID (optional, from JWT)
   * @param email - User email (optional, for audit log)
   * @returns Decrypted plaintext JSON
   * @throws Error if decryption fails
   */
  async decryptCredentialsWithAudit(
    payload: EncryptedPayload,
    request?: Request,
    userId?: string,
    email?: string,
  ): Promise<string> {
    const startTime = Date.now();
    const payloadSize = payload.encryptedData?.length || 0;
    const payloadHash = this.audit.generatePayloadHash(
      payload.encryptedData || "",
    );

    // [2026-05-14] 폴백 모드 감지 — 클라이언트가 평문 base64 로 보내고 있음을 의미.
    //   dev 환경에서만 허용되며(crypto.util.ts 게이트), 운영 환경에서는 throw 됨.
    //   감사 로그 + WARN 로그로 모니터링 가능하게 마킹.
    const usedFallback = isFallbackPayload(payload);

    // IP 주소 및 User Agent 수집
    const ipAddress = (request?.ip ||
      request?.socket?.remoteAddress ||
      "unknown") as string;
    const userAgent = request?.get("user-agent");

    try {
      // 1. 복호화 시작
      this.logger.logCryptoOperation("decrypt", "start", undefined, {
        payloadSize,
        payloadHash,
      });

      // 2. 실제 복호화 수행
      const decrypted = decryptCredentials(payload);

      const duration = Date.now() - startTime;

      // 3. 성공 로깅
      this.logger.logCryptoOperation("decrypt", "success", duration, {
        duration,
        payloadHash,
      });

      // 4. 폴백 사용 시 보안 경고 (dev 에서만 도달 — prod 는 위 decryptCredentials 에서 throw)
      if (usedFallback) {
        this.logger.warn(
          "[Crypto][SECURITY] Fallback mode payload accepted (dev/test only). " +
            "Client device must use WebCrypto AES-GCM. Check iOS WebView secure-context (HTTPS).",
          {
            ipAddress,
            userAgent,
            email,
            payloadHash,
          },
        );
      }

      // 5. 감사 로그 기록 — fallback 사용 컨텍스트 명시
      //    [2026-05-30 perf · BE-01] 성공 경로의 auditLog INSERT(~15-40ms)가 매
      //    로그인 응답을 블로킹하던 것을 fire-and-forget 로 전환. 성공 감사는
      //    ThreatLevel.INFO 정보성 기록이고 같은 요청 내 동기 read-back 소비자가
      //    없으며, recordDecryptionEvent 내부가 이미 try/catch 로 감사 실패를
      //    삼키므로 unhandled rejection 위험도 없다. 실패/의심 경로(catch 블록)는
      //    throw 순서·보안 판정 보장을 위해 await 를 그대로 유지한다.
      void this.audit
        .recordDecryptionEvent({
          eventType: DecryptionEventType.SUCCESS,
          threatLevel: this.audit.determineThreatLevel(
            DecryptionEventType.SUCCESS,
          ),
          timestamp: new Date(),
          userId,
          email,
          ipAddress,
          userAgent,
          payloadHash,
          payloadSize,
          encryptedDataLength: payload.encryptedData?.length || 0,
          success: true,
          duration,
          // fallback 자체는 dev 환경의 정상 동작이지만 추적 가능하도록 컨텍스트로 기록.
          isSuspicious: false,
          context: usedFallback ? { usedFallback: true } : undefined,
        })
        .catch((err) =>
          this.logger.warn(
            `[Crypto] success decryption audit log failed (non-blocking): ${
              (err as Error).message
            }`,
          ),
        );

      return decrypted;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // 1. 오류 로깅
      this.logger.logCryptoOperation("decrypt", "failure", duration, {
        error: errorMessage,
        payloadHash,
      });

      // 2. 이벤트 분류
      const eventType = this.audit.classifyDecryptionEvent(
        false,
        error as Error,
      );

      // 3. 의심스러운 활동 감지
      const suspiciousCheck = await this.audit.detectSuspiciousActivity(
        ipAddress,
        userId,
      );

      // 4. 감사 로그 기록
      await this.audit.recordDecryptionEvent({
        eventType,
        threatLevel: this.audit.determineThreatLevel(eventType),
        timestamp: new Date(),
        userId,
        email,
        ipAddress,
        userAgent,
        payloadHash,
        payloadSize,
        encryptedDataLength: payload.encryptedData?.length || 0,
        success: false,
        duration,
        errorMessage,
        isSuspicious:
          suspiciousCheck.isSuspicious || eventType.startsWith("threat_"),
        suspicionReason: suspiciousCheck.reason,
        context: {
          errorType:
            error instanceof Error ? error.constructor.name : "Unknown",
        },
      });

      throw error;
    }
  }

  /**
   * Decrypt credentials (synchronous, without audit trail)
   * 레거시 호환성을 위해 유지
   *
   * @param payload - Encrypted payload (encryptedData, iv, authTag)
   * @returns Decrypted plaintext JSON
   * @throws Error if decryption fails
   */
  decryptCredentials(payload: EncryptedPayload): string {
    const startTime = Date.now();

    try {
      this.logger.logCryptoOperation("decrypt", "start", undefined, {
        payloadSize: payload.encryptedData?.length || 0,
      });

      const decrypted = decryptCredentials(payload);

      const duration = Date.now() - startTime;

      this.logger.logCryptoOperation("decrypt", "success", duration, {
        duration,
      });

      return decrypted;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.logCryptoOperation("decrypt", "failure", duration, {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }
}
