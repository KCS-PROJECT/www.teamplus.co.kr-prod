import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { RedisService } from "@/redis/redis.service";
import { MailService } from "@/mail/mail.service";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * 회원가입 이메일 인증 서비스.
 *
 * Redis 키 구조:
 *   - email-verify:code:{email}     value=6자리 코드, TTL 5분  (인증 코드)
 *   - email-verify:cooldown:{email} value=1,           TTL 60초 (재발송 쿨다운)
 *   - email-verify:passed:{email}   value=1,           TTL 30분 (검증 완료 — 가입 시 확인)
 *
 * 보안:
 *   - 가입 안 된 이메일만 발송 (이미 가입된 사용자에게 코드 발송 차단)
 *   - 1분 쿨다운으로 스팸/봇 차단
 *   - 코드 5회 오입력 시 무효화
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  private readonly CODE_TTL_SEC = 5 * 60; // 5분
  private readonly COOLDOWN_SEC = 60; // 1분
  private readonly PASSED_TTL_SEC = 30 * 60; // 30분 (가입 완료까지 유효)
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  private keyCode(email: string) {
    return `email-verify:code:${email.toLowerCase()}`;
  }
  private keyCooldown(email: string) {
    return `email-verify:cooldown:${email.toLowerCase()}`;
  }
  private keyAttempts(email: string) {
    return `email-verify:attempts:${email.toLowerCase()}`;
  }
  private keyPassed(email: string) {
    return `email-verify:passed:${email.toLowerCase()}`;
  }

  /** 회원가입 단계에서 이메일이 검증되었는지 확인. */
  async isVerified(email: string): Promise<boolean> {
    // RedisService.get 은 JSON.parse 를 시도하여 "1" → number 1 로 변환하므로 String 캐스팅 필요.
    const v = await this.redis.get<string | number>(
      this.keyPassed(email.toLowerCase().trim()),
    );
    return v !== null && v !== undefined && String(v) === "1";
  }

  /** 검증 통과 플래그 해제 (가입 완료 후 호출). */
  async clearVerified(email: string): Promise<void> {
    await this.redis.del(this.keyPassed(email));
  }

  /**
   * 인증 코드 발송.
   *  - 이미 가입된 이메일이면 거부
   *  - 60초 쿨다운
   */
  async sendCode(email: string): Promise<{ success: true; expiresIn: number }> {
    const normalized = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new BadRequestException("이메일 형식이 올바르지 않습니다.");
    }

    // 이미 가입된 이메일은 차단
    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("이미 가입된 이메일입니다.");
    }

    // 쿨다운 체크
    const cooldown = await this.redis.get<string>(this.keyCooldown(normalized));
    if (cooldown) {
      throw new HttpException(
        "잠시 후 다시 시도해주세요. (1분 후 재발송 가능)",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 6자리 코드 생성
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Redis 저장
    await this.redis.set(this.keyCode(normalized), code, this.CODE_TTL_SEC);
    await this.redis.set(this.keyCooldown(normalized), "1", this.COOLDOWN_SEC);
    await this.redis.del(this.keyAttempts(normalized));

    // 메일 발송
    const subject = "teamplus 회원가입 본인인증코드 발송";
    const text =
      `teamplus 회원가입 본인인증코드 발송\n\n` +
      `▶ 인증번호: ${code}\n\n` +
      `유효시간: 5분\n` +
      `본인이 요청한 가입이 아니라면 이 메일을 무시해주세요.\n` +
      `— teamplus`;

    const sent = await this.mail.sendText(normalized, subject, text);
    if (!sent) {
      throw new BadRequestException("메일 발송에 실패했습니다.");
    }

    this.logger.log(`이메일 인증 코드 발송 → ${normalized}`);
    return { success: true, expiresIn: this.CODE_TTL_SEC };
  }

  /**
   * 인증 코드 검증.
   *  - 일치 시 passed 플래그 30분 유지
   *  - 5회 오입력 시 코드 무효화
   */
  async verifyCode(email: string, code: string): Promise<{ success: true }> {
    const normalized = email.toLowerCase().trim();
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException("6자리 숫자를 입력해주세요.");
    }

    // [수정 2026-05-12] RedisService.get<string> 은 내부적으로 JSON.parse 를 시도하여
    //   숫자만으로 이루어진 코드(예: "771409") 를 number 로 변환해 버린다.
    //   strict equality 비교가 항상 실패하는 버그가 있어 String() 으로 명시 캐스팅.
    const storedRaw = await this.redis.get<string | number>(
      this.keyCode(normalized),
    );
    if (storedRaw === null || storedRaw === undefined) {
      throw new BadRequestException(
        "인증 코드가 만료되었습니다. 재발송 해주세요.",
      );
    }
    const stored = String(storedRaw).padStart(6, "0");

    // 시도 횟수 증가
    const attemptsRaw = await this.redis.get<string | number>(
      this.keyAttempts(normalized),
    );
    const attempts = Number(attemptsRaw ?? 0) + 1;
    if (attempts > this.MAX_ATTEMPTS) {
      await this.redis.del(this.keyCode(normalized));
      await this.redis.del(this.keyAttempts(normalized));
      throw new BadRequestException(
        "인증 시도 횟수를 초과했습니다. 코드를 재발송 해주세요.",
      );
    }
    await this.redis.set(
      this.keyAttempts(normalized),
      String(attempts),
      this.CODE_TTL_SEC,
    );

    if (stored !== code) {
      throw new BadRequestException(
        `인증번호가 일치하지 않습니다. (남은 시도 ${this.MAX_ATTEMPTS - attempts}회)`,
      );
    }

    // 검증 통과 — 코드 제거, passed 플래그 30분 유지
    await this.redis.del(this.keyCode(normalized));
    await this.redis.del(this.keyAttempts(normalized));
    await this.redis.set(this.keyPassed(normalized), "1", this.PASSED_TTL_SEC);

    this.logger.log(`이메일 인증 성공 → ${normalized}`);
    return { success: true };
  }
}
