import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class TwoFactorService {
  private readonly AES_KEY: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const raw =
      this.config.get<string>("TWO_FACTOR_ENCRYPTION_KEY") ??
      this.config.get<string>("JWT_SECRET") ??
      "teamplus-2fa-default-key";
    // AES-256: 32 bytes 필요 — SHA-256으로 고정 길이 변환
    this.AES_KEY = Buffer.from(
      createHmac("sha256", raw).digest("hex").slice(0, 32),
    );
  }

  // ── TOTP (RFC 6238) ─────────────────────────────────────────────

  /** 32-byte base32 secret 생성 */
  generateSecret(): string {
    const bytes = randomBytes(20);
    return encodeBase32(bytes);
  }

  /** TOTP 코드 검증 (현재 ±1 window 허용) */
  verifyTotp(secret: string, token: string): boolean {
    const counter = Math.floor(Date.now() / 30000);
    for (const delta of [-1, 0, 1]) {
      if (
        this.generateTotp(secret, counter + delta) === token.replace(/\s/g, "")
      ) {
        return true;
      }
    }
    return false;
  }

  private generateTotp(secret: string, counter: number): string {
    const key = decodeBase32(secret);
    const buf = Buffer.alloc(8);
    let c = counter;
    for (let i = 7; i >= 0; i--) {
      buf[i] = c & 0xff;
      c >>= 8;
    }
    const hmac = createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 1000000).padStart(6, "0");
  }

  /** otpauth URI 생성 (Google Authenticator 호환) */
  buildOtpAuthUri(_userId: string, secret: string, email: string): string {
    const issuer = "TEAMPLUS";
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  }

  // ── AES-256-GCM 암호화 ──────────────────────────────────────────

  encryptSecret(plain: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", this.AES_KEY, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${encrypted.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}`;
  }

  decryptSecret(stored: string): string {
    const [encHex, ivHex, tagHex] = stored.split(":");
    if (!encHex || !ivHex || !tagHex)
      throw new BadRequestException("잘못된 암호화 포맷");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.AES_KEY,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return (
      decipher.update(Buffer.from(encHex, "hex")).toString("utf8") +
      decipher.final("utf8")
    );
  }

  // ── 비즈니스 로직 ───────────────────────────────────────────────

  /** 2FA 설정 시작: secret 생성 → DB 저장(disabled) → otpauth URI 반환 */
  async initEnable(userId: string, email: string) {
    const secret = this.generateSecret();
    const encrypted = this.encryptSecret(secret);

    await this.prisma.twoFactorSecret.upsert({
      where: { userId },
      create: { userId, secret: encrypted, enabled: false },
      update: { secret: encrypted, enabled: false },
    });

    const otpauthUri = this.buildOtpAuthUri(userId, secret, email);
    return { otpauthUri, secret };
  }

  /** TOTP 코드 검증 후 2FA 활성화 */
  async verifyAndEnable(userId: string, token: string): Promise<void> {
    const row = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!row)
      throw new NotFoundException(
        "2FA 설정이 시작되지 않았습니다. 먼저 /2fa/enable을 호출하세요.",
      );
    if (row.enabled)
      throw new BadRequestException("이미 2FA가 활성화되어 있습니다.");

    const secret = this.decryptSecret(row.secret);
    if (!this.verifyTotp(secret, token))
      throw new UnauthorizedException("인증 코드가 올바르지 않습니다.");

    await this.prisma.twoFactorSecret.update({
      where: { userId },
      data: { enabled: true },
    });
  }

  /** 2FA 비활성화 (코드 재검증 필수) */
  async disable(userId: string, token: string): Promise<void> {
    const row = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
    });
    if (!row || !row.enabled)
      throw new BadRequestException("2FA가 활성화되어 있지 않습니다.");

    const secret = this.decryptSecret(row.secret);
    if (!this.verifyTotp(secret, token))
      throw new UnauthorizedException("인증 코드가 올바르지 않습니다.");

    await this.prisma.twoFactorSecret.delete({ where: { userId } });
  }

  /** 현재 2FA 상태 조회 */
  async getStatus(userId: string) {
    const row = await this.prisma.twoFactorSecret.findUnique({
      where: { userId },
      select: { enabled: true, createdAt: true },
    });
    return {
      enabled: row?.enabled ?? false,
      createdAt: row?.createdAt ?? null,
    };
  }
}

// ── Base32 (RFC 4648) ────────────────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encodeBase32(buf: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += BASE32_CHARS[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_CHARS.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
