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
import {
  AD_LABEL,
  MARKETING_ALIMTALK_CATEGORIES,
  MARKETING_ALIMTALK_CODE_PREFIXES,
  hasAdLabel,
  isNightTimeKST,
} from "@/common/utils/advertising.util";

/**
 * 야간(KST 21:00~08:00) 광고성 알림톡 차단 에러.
 *
 * 발송 실패가 아니라 '법적으로 보내면 안 되는 상태'이므로 재시도 대상이 아니다.
 * AlimtalkProcessor 가 이 에러를 잡아 재시도 없이 blocked 로 종결한다.
 */
export class AlimtalkNightAdBlockedError extends Error {
  constructor(templateCode: string) {
    super(
      `야간 시간대(21:00~08:00)에는 광고성 알림톡을 발송할 수 없습니다. (정보통신망법 제50조, template=${templateCode})`,
    );
    this.name = "AlimtalkNightAdBlockedError";
  }
}

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
 * - 광고성 템플릿 야간 발송 차단 (정보통신망법 §50③)
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

    // ── 광고성 알림톡 법적 게이트 (정보통신망법 §50) ──
    // 푸시·SMS 3경로에만 있던 야간 게이트가 알림톡에는 없어 우회 경로였다.
    const isAdvertising = await this.isAdvertisingTemplate(dto.templateCode);
    if (isAdvertising) {
      if (isNightTimeKST()) {
        this.logger.warn(
          `야간 광고성 알림톡 발송 차단: ${maskedPhone} (템플릿: ${dto.templateCode})`,
        );
        throw new AlimtalkNightAdBlockedError(dto.templateCode);
      }
      // 알림톡 본문은 카카오 사전승인 템플릿이라 코드에서 임의 가공하면 발송이
      // 거부된다 — '(광고)' 표기·수신거부 문구는 템플릿 등록 단계에서 포함해야 한다.
      // 누락은 차단하지 않고 경고만 남긴다(운영 중단 방지 + 운영자 시정 유도).
      if (!hasAdLabel(this.getTemplateContent(dto.templateCode))) {
        this.logger.warn(
          `광고성 알림톡 템플릿에 '${AD_LABEL}' 표기가 없습니다 — 카카오 템플릿 본문을 수정하세요 (템플릿: ${dto.templateCode})`,
        );
      }
    }

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
   * 광고성 템플릿 판정 (정보성 알림톡에 규제를 오적용하지 않기 위한 게이트).
   *
   * 1순위: AlimtalkTemplate.category — 운영자가 어드민에서 지정하는 값.
   *   광고성으로 취급하는 값은 advertising.util 의 MARKETING_ALIMTALK_CATEGORIES.
   * 2순위: templateCode 접두어(MARKETING_/PROMO_/AD_/EVENT_) — category 미지정 템플릿 보조 판정.
   *
   * PrismaService 미주입(테스트) 시에는 접두어만으로 판정한다.
   */
  private async isAdvertisingTemplate(templateCode: string): Promise<boolean> {
    const code = (templateCode ?? "").toUpperCase();
    if (MARKETING_ALIMTALK_CODE_PREFIXES.some((p) => code.startsWith(p))) {
      return true;
    }

    if (!this.prisma) return false;

    try {
      const row = await this.prisma.alimtalkTemplate.findUnique({
        where: { templateCode },
        select: { category: true },
      });
      const category = row?.category?.toLowerCase() ?? null;
      if (!category) return false;
      return (MARKETING_ALIMTALK_CATEGORIES as readonly string[]).includes(
        category,
      );
    } catch (error) {
      // 판정 실패 시 정보성으로 간주한다 — 결제/출석 등 정보성 알림톡이 DB 장애로
      // 전면 중단되는 것이 더 큰 사고다. 광고성 발송은 어차피 관리자 수동 트리거다.
      this.logger.warn(
        `광고성 템플릿 판정 실패 (${templateCode}): ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
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

      // SMS 폴백은 사전승인 템플릿 제약이 없으므로 광고성일 때 '(광고)' 표기·전송자
      // 정보·수신거부 방법을 SmsService 가 삽입하도록 isMarketing 을 전달한다 (§50④).
      const isAdvertising = await this.isAdvertisingTemplate(dto.templateCode);
      const message = this.renderTemplate(dto.templateCode, dto.templateData);
      const success = await this.smsService.sendNotificationSms(
        dto.phone,
        message,
        isAdvertising,
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
