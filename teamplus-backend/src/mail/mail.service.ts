import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

/**
 * MailService — SMTP 메일 발송 (Postfix 릴레이 가정).
 *
 * 운영 환경(115 서버):
 *   - SMTP_HOST=127.0.0.1 / SMTP_PORT=25 / 인증 없음 (Postfix mynetworks 화이트리스트)
 *   - Postfix 가 outbound.daouoffice.com:465 로 SMTPS + SASL 릴레이
 *   - From 은 반드시 *@kci.co.kr (다우오피스 릴레이 거부 방지)
 *
 * 개발 환경:
 *   - SMTP_HOST 가 비어있거나 connect 실패 시 콘솔에 코드 출력 (dryRun 모드)
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress = "noreply@kci.co.kr";
  private dryRun = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>("SMTP_HOST", "");
    const port = Number(this.config.get<string>("SMTP_PORT", "25"));
    const user = this.config.get<string>("SMTP_USER", "");
    const pass = this.config.get<string>("SMTP_PASS", "");
    const secure = this.config.get<string>("SMTP_SECURE", "false") === "true";
    const fromAddr = this.config.get<string>("SMTP_FROM", "noreply@kci.co.kr");
    const fromName = this.config.get<string>("SMTP_FROM_NAME", "");
    // SMTP_FROM_NAME 설정 시 발신자 별칭 표시 ("별칭" <주소>) — 한글은 nodemailer 가 RFC2047 자동 인코딩
    this.fromAddress = fromName ? `"${fromName}" <${fromAddr}>` : fromAddr;

    if (!host) {
      this.dryRun = true;
      this.logger.warn(
        "SMTP_HOST 미설정 — Mail dry-run 모드 (콘솔에 코드만 출력).",
      );
      return;
    }

    // TLS 인증서 검증은 기본 활성화(true). 자가서명 Postfix 대응을 위한 비활성화는
    // 개발 환경(NODE_ENV=development)에서 MAIL_TLS_REJECT_UNAUTHORIZED=false 일 때만 허용.
    // 운영을 포함한 그 외 환경에서는 강제로 검증을 유지하여 OTP 코드 MITM 을 차단한다.
    const isDevelopment = process.env.NODE_ENV === "development";
    const rejectUnauthorized = !(
      isDevelopment &&
      this.config.get<string>("MAIL_TLS_REJECT_UNAUTHORIZED", "true") === "false"
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      tls: { rejectUnauthorized },
      // 짧은 timeout — 운영 Postfix(127.0.0.1) 는 즉시 응답해야 함
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });

    this.logger.log(
      `Mail transporter 초기화: host=${host} port=${port} secure=${secure} auth=${user ? "ON" : "OFF"}`,
    );
  }

  /**
   * 텍스트 메일 발송.
   * @returns true: 발송 성공 (또는 dryRun)  false: 실패
   */
  async sendText(to: string, subject: string, text: string): Promise<boolean> {
    if (this.dryRun || !this.transporter) {
      this.logger.warn(
        `[Mail DRY-RUN] to=${to}\n  subject=${subject}\n  body=${text}`,
      );
      return true;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        text,
      });
      this.logger.log(`Mail sent → ${to} (messageId=${info.messageId})`);
      return true;
    } catch (err) {
      this.logger.error(
        `Mail send 실패 → ${to}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return false;
    }
  }
}
