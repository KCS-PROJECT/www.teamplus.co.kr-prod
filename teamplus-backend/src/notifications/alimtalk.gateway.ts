import {
  Injectable,
  Logger,
  InternalServerErrorException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import {
  SendAlimtalkDto,
  AlimtalkResultDto,
  AlimtalkStatus,
} from "./dto/alimtalk.dto";
import { SmsService } from "@/sms/sms.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * 카카오 비즈니스 Alimtalk 게이트웨이
 *
 * 카카오 알림톡 API와의 통신을 담당합니다.
 *
 * 주요 기능:
 * - 알림톡 발송
 * - 발송 상태 조회
 * - 템플릿 유효성 검증
 * - SMS 폴백 처리
 *
 * 보안 요구사항:
 * - API 키는 환경변수로 관리
 * - 전화번호 로그 마스킹
 * - HTTPS 통신 강제
 */
@Injectable()
export class AlimtalkGateway {
  private readonly logger = new Logger(AlimtalkGateway.name);
  private readonly httpClient: AxiosInstance;
  private readonly apiKey: string;
  private readonly senderKey: string;
  private readonly apiUrl: string;
  private readonly retryConfig: {
    attempts: number;
    delay: number;
    backoff: string;
  };

  // [2026-05-13 Phase D-9] AlimtalkTemplate DB 조회 5분 메모리 캐시.
  //   동일 templateCode 가 다회 발송될 때 매번 SELECT 하지 않도록.
  private readonly templateCache = new Map<
    string,
    { content: string; expiresAt: number }
  >();
  private readonly TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly smsService?: SmsService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.apiKey = this.configService.get<string>("kakao.apiKey") || "";
    this.senderKey = this.configService.get<string>("kakao.senderKey") || "";
    this.apiUrl = this.configService.get<string>("kakao.apiUrl") || "";
    this.retryConfig = this.configService.get("kakao.retry") || {
      attempts: 3,
      delay: 1000,
      backoff: "exponential",
    };

    // Axios 클라이언트 초기화
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    // 요청 인터셉터 (로깅)
    this.httpClient.interceptors.request.use((config) => {
      this.logger.debug(
        `Alimtalk API 요청: ${config.method?.toUpperCase()} ${config.url}`,
      );
      return config;
    });

    // 응답 인터셉터 (에러 핸들링)
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error(
          "Alimtalk API 에러:",
          error.response?.data || error.message,
        );
        return Promise.reject(error);
      },
    );
  }

  /**
   * 알림톡 발송
   *
   * @param dto 발송 정보
   * @returns 발송 결과
   *
   * 재시도 로직:
   * - 실패 시 3회까지 재시도
   * - Exponential backoff (1초 → 2초 → 4초)
   */
  async sendAlimtalk(dto: SendAlimtalkDto): Promise<AlimtalkResultDto> {
    const maskedPhone = this.maskPhone(dto.phone);
    this.logger.log(
      `알림톡 발송 시작: ${maskedPhone} (템플릿: ${dto.templateCode})`,
    );

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.attempts; attempt++) {
      try {
        const response = await this.sendWithRetry(dto, attempt);

        this.logger.log(`알림톡 발송 성공: ${maskedPhone}`);
        return {
          id: response.data.messageId || "",
          notificationId: dto.userId || "",
          phone: dto.phone,
          templateCode: dto.templateCode,
          status: AlimtalkStatus.SENT,
          sentAt: new Date(),
          responseData: response.data,
          createdAt: new Date(),
        };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `알림톡 발송 실패 (시도 ${attempt}/${this.retryConfig.attempts}): ${maskedPhone}`,
        );

        if (attempt < this.retryConfig.attempts) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    // 모든 재시도 실패 → SMS 폴백 처리
    this.logger.error(`알림톡 발송 최종 실패: ${maskedPhone}`);
    await this.fallbackToSms(dto);

    throw new InternalServerErrorException(
      `알림톡 발송에 실패했습니다: ${lastError?.message}`,
    );
  }

  /**
   * 알림톡 발송 시도 (내부 메서드)
   */
  private async sendWithRetry(dto: SendAlimtalkDto, _attempt: number) {
    const payload = {
      senderKey: this.senderKey,
      templateCode: dto.templateCode,
      to: dto.phone,
      content: this.renderTemplate(dto.templateCode, dto.templateData),
      buttons: this.getTemplateButtons(dto.templateCode),
    };

    return await this.httpClient.post("/send", payload);
  }

  /**
   * 발송 상태 조회
   *
   * @param messageId 메시지 ID
   * @returns 발송 상태
   */
  async checkStatus(messageId: string): Promise<AlimtalkStatus> {
    try {
      const response = await this.httpClient.get(`/status/${messageId}`);

      const status = response.data.status;

      switch (status) {
        case "SENT":
          return AlimtalkStatus.SENT;
        case "DELIVERED":
          return AlimtalkStatus.DELIVERED;
        case "FAILED":
          return AlimtalkStatus.FAILED;
        default:
          return AlimtalkStatus.PENDING;
      }
    } catch (error) {
      this.logger.error(`상태 조회 실패: ${messageId}`, error);
      return AlimtalkStatus.PENDING;
    }
  }

  /**
   * 템플릿 렌더링
   *
   * @param templateCode 템플릿 코드
   * @param data 템플릿 데이터
   * @returns 렌더링된 메시지
   */
  private renderTemplate(
    templateCode: string,
    data: Record<string, string>,
  ): string {
    // 실제 구현에서는 templates/ 디렉토리의 템플릿을 사용
    let message = this.getTemplateContent(templateCode);

    Object.entries(data).forEach(([key, value]) => {
      message = message.replace(new RegExp(`#{${key}}`, "g"), value);
    });

    return message;
  }

  /**
   * 템플릿 내용 가져오기.
   *
   * [2026-05-13 Phase D-9] 우선 AlimtalkTemplate DB 조회 (5분 캐시).
   *   DB 에 없으면 기존 fallback (하드코딩) 사용 → 마이그레이션 점진 진행 가능.
   *   PrismaService 가 주입되지 않은 테스트 환경에서도 동작.
   *
   * 본 메서드는 sync 시그니처를 유지하기 위해 캐시만 사용하고, DB miss 시
   * 백그라운드로 fetch + cache 갱신 (다음 호출부터 적용). 첫 호출은 항상 fallback.
   */
  private getTemplateContent(templateCode: string): string {
    const cached = this.templateCache.get(templateCode);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.content;
    }

    // 비동기 fetch — 다음 호출부터 DB 본문 사용. 첫 호출은 fallback.
    if (this.prisma) {
      void this.prisma.alimtalkTemplate
        .findUnique({
          where: { templateCode },
          select: { content: true, isActive: true },
        })
        .then((row) => {
          if (row?.isActive && row.content) {
            this.templateCache.set(templateCode, {
              content: row.content,
              expiresAt: Date.now() + this.TEMPLATE_CACHE_TTL_MS,
            });
          }
        })
        .catch((err) => {
          this.logger.warn(
            `AlimtalkTemplate DB fetch failed for ${templateCode}: ${err instanceof Error ? err.message : err}`,
          );
        });
    }

    // Fallback — 기존 하드코딩 stub (DB 마이그레이션 전까지 호환성 유지)
    const templates: Record<string, string> = {
      PAYMENT_SUCCESS_001: `결제가 완료되었습니다.

주문번호: #{orderNumber}
수업: #{className}
금액: #{amount}원
시작일: #{startDate}

감사합니다.`,
      MEMBERSHIP_APPROVED_001: `#{clubName} 클럽 가입이 승인되었습니다!

담당 코치: #{coachName}

감사합니다.`,
      CLASS_REMINDER_001: `내일 수업이 있습니다!

수업: #{className}
일시: #{classDate} #{classTime}

잊지 말고 참석해주세요.`,
      ATTENDANCE_CONFIRMED_001: `출석이 확인되었습니다.

수업: #{className}
날짜: #{attendanceDate}
잔여 크레딧: #{creditsRemaining}회

감사합니다.`,
      CREDIT_EXPIRY_001: `수업 크레딧 만료 예정 안내

수업: #{className}
잔여 크레딧: #{creditsRemaining}회
만료일: #{expiryDate}

만료 전에 사용해주세요.`,
    };

    return templates[templateCode] || "";
  }

  /**
   * 템플릿 버튼 가져오기
   */
  private getTemplateButtons(_templateCode: string): any[] {
    // 템플릿별 버튼 설정 (필요 시 확장)
    return [];
  }

  /**
   * SMS 폴백 처리
   *
   * 알림톡 발송 실패 시 SMS로 대체 발송
   */
  private async fallbackToSms(dto: SendAlimtalkDto): Promise<void> {
    const smsFallbackEnabled = this.configService.get<boolean>(
      "kakao.smsFallback.enabled",
    );

    if (!smsFallbackEnabled) {
      this.logger.warn("SMS 폴백이 비활성화되어 있습니다.");
      return;
    }

    try {
      this.logger.log(`SMS 폴백 발송 시도: ${this.maskPhone(dto.phone)}`);

      if (!this.smsService) {
        this.logger.warn("SmsService가 주입되지 않아 SMS 폴백을 건너뜁니다.");
        return;
      }

      const message = this.renderTemplate(dto.templateCode, dto.templateData);
      const success = await this.smsService.sendNotificationSms(
        dto.phone,
        message,
      );

      if (success) {
        this.logger.log(`SMS 폴백 발송 성공: ${this.maskPhone(dto.phone)}`);
      } else {
        this.logger.error(`SMS 폴백 발송 실패: ${this.maskPhone(dto.phone)}`);
      }
    } catch (error) {
      this.logger.error("SMS 폴백 발송 실패:", error);
    }
  }

  /**
   * 재시도 지연 시간 계산
   *
   * Exponential backoff: 1초 → 2초 → 4초
   */
  private calculateRetryDelay(attempt: number): number {
    if (this.retryConfig.backoff === "exponential") {
      return this.retryConfig.delay * Math.pow(2, attempt - 1);
    }

    // Linear backoff
    return this.retryConfig.delay;
  }

  /**
   * Sleep 유틸리티
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 전화번호 마스킹 (보안)
   *
   * 예: 010-1234-5678 → 010-****-5678
   */
  private maskPhone(phone: string): string {
    if (phone.length < 10) {
      return "***-****-****";
    }

    const cleaned = phone.replace(/\D/g, "");
    const maskedMiddle = cleaned.substring(3, 7).replace(/\d/g, "*");

    return `${cleaned.substring(0, 3)}-${maskedMiddle}-${cleaned.substring(7)}`;
  }

  /**
   * 헬스체크
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 카카오 API 연결 확인
      await this.httpClient.get("/health", { timeout: 3000 });
      return true;
    } catch (error) {
      this.logger.error("Alimtalk 헬스체크 실패:", error);
      return false;
    }
  }
}
