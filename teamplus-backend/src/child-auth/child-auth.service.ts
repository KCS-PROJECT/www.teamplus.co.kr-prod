import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { SmsService } from "@/sms/sms.service";
import { OtpService } from "@/sms/otp.service";
import { UserType } from "@prisma/client";
import * as bcrypt from "bcrypt";

/** 자녀 인증 응답의 user 타입 */
export interface ChildAuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  userType: string;
  name: string;
}

/** 자녀 인증 토큰 응답 */
export interface ChildAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: ChildAuthUser;
}

/** 연속 숫자 패턴 (오름차순/내림차순) */
const SEQUENTIAL_PATTERNS = [
  "012345",
  "123456",
  "234567",
  "345678",
  "456789",
  "567890",
  "987654",
  "876543",
  "765432",
  "654321",
  "543210",
  "098765",
];

/** PIN 잠금 시간 (밀리초) — 10분 */
const LOCK_DURATION_MS = 10 * 60 * 1000;

/** 최대 실패 허용 횟수 */
const MAX_FAILED_ATTEMPTS = 5;

/** bcrypt salt rounds */
const BCRYPT_SALT_ROUNDS = 10;

/** PIN 인증 유효 기간 (일) */
const CHILD_PIN_VALIDITY_DAYS = 365;

/** OTP 용도 키 */
const OTP_PURPOSE = "child-pin";

/**
 * ChildAuth Service
 *
 * 자녀 PIN 인증 관리:
 * - PIN 설정 (학부모 전용)
 * - PIN 검증 (학부모, 청소년, 아동)
 * - PIN 삭제/초기화 (학부모 전용)
 *
 * 보안 규칙:
 * - PIN은 bcrypt(salt=10)으로 해싱하여 저장
 * - 5회 실패 시 10분 잠금
 * - 연속 숫자(123456), 동일 숫자(111111) 패턴 거부
 * - 소유권 확인: ParentChild 테이블 기반
 */
@Injectable()
export class ChildAuthService {
  private readonly logger = new Logger(ChildAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly smsService: SmsService,
    private readonly otpService: OtpService,
  ) {}

  /**
   * PIN 설정
   *
   * 학부모가 자녀의 보안 PIN을 설정합니다.
   * 1. PIN 보안 패턴 검증 (연속/동일 숫자 거부)
   * 2. ChildProfile 존재 확인
   * 3. 학부모-자녀 소유권 확인 (ParentChild 테이블)
   * 4. bcrypt 해싱 후 ChildPin upsert
   */
  async setPin(
    parentUserId: string,
    childProfileId: string,
    pin: string,
  ): Promise<{ success: true; message: string }> {
    this.logger.log(
      `PIN 설정 요청: parentUserId=${parentUserId}, childProfileId=${childProfileId}`,
    );

    // 1. PIN 보안 패턴 검증
    this.validatePinPattern(pin);

    // 2. ChildProfile 존재 확인
    const childProfile = await this.prisma.childProfile.findUnique({
      where: { id: childProfileId },
      select: { id: true, userId: true },
    });

    if (!childProfile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    // 3. 소유권 확인: ParentChild 테이블에서 parentUserId → childProfile.userId 매핑
    await this.verifyParentOwnership(parentUserId, childProfile.userId);

    // 4. bcrypt 해싱 후 upsert
    const pinHash = await bcrypt.hash(pin, BCRYPT_SALT_ROUNDS);

    await this.prisma.childPin.upsert({
      where: { childProfileId },
      create: {
        childProfileId,
        pinHash,
        lastSetBy: parentUserId,
        failedAttempts: 0,
      },
      update: {
        pinHash,
        lastSetBy: parentUserId,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

    this.logger.log(
      `PIN 설정 완료: childProfileId=${childProfileId}, setBy=${parentUserId}`,
    );

    return { success: true, message: "자녀 PIN이 설정되었습니다." };
  }

  /**
   * PIN 검증
   *
   * 자녀 PIN을 검증합니다.
   * 1. ChildPin 존재 확인
   * 2. 잠금 상태 확인 (lockedUntil > now → 403)
   * 3. bcrypt.compare로 PIN 비교
   * 4. 실패 시: failedAttempts++, 5회 이상이면 10분 잠금
   * 5. 성공 시: failedAttempts 초기화, lastVerifiedAt 갱신
   */
  async verifyPin(
    childProfileId: string,
    pin: string,
    requesterId?: string,
  ): Promise<{
    success: true;
    data: { verified: boolean; remainingAttempts?: number };
  }> {
    this.logger.log(`PIN 검증 요청: childProfileId=${childProfileId}`);

    // [2026-06-10 SECURITY] 소유권 검증 — 본인(CHILD/TEEN) 또는 부모만 검증 가능.
    //   기존: 검증 없이 임의 childProfileId 대상 PIN 검증 → 타인 자녀 PIN 잠금 DoS·탐색 가능.
    if (requesterId) {
      const childProfile = await this.prisma.childProfile.findUnique({
        where: { id: childProfileId },
        select: { userId: true },
      });
      if (!childProfile) {
        throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
      }
      if (childProfile.userId !== requesterId) {
        // 본인이 아니면 부모-자녀 관계 필수
        await this.verifyParentOwnership(requesterId, childProfile.userId);
      }
    }

    // 1. ChildPin 존재 확인
    const childPin = await this.prisma.childPin.findUnique({
      where: { childProfileId },
      select: {
        id: true,
        pinHash: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });

    if (!childPin) {
      throw new NotFoundException("설정된 PIN이 없습니다.");
    }

    // 2. 잠금 상태 확인
    if (childPin.lockedUntil && childPin.lockedUntil > new Date()) {
      const remainingMs = childPin.lockedUntil.getTime() - new Date().getTime();
      const remainingMin = Math.ceil(remainingMs / 60000);

      throw new ForbiddenException(
        `잠금 상태입니다. ${remainingMin}분 후 다시 시도해주세요.`,
      );
    }

    // 3. PIN 비교
    const isMatch = await bcrypt.compare(pin, childPin.pinHash);

    if (!isMatch) {
      // 4. 실패 처리
      const newFailedAttempts = childPin.failedAttempts + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

      await this.prisma.childPin.update({
        where: { id: childPin.id },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCK_DURATION_MS)
            : undefined,
        },
      });

      const remaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;

      if (shouldLock) {
        this.logger.warn(
          `PIN 잠금 발생: childProfileId=${childProfileId}, failedAttempts=${newFailedAttempts}`,
        );
        throw new ForbiddenException(
          "PIN 입력 횟수를 초과하였습니다. 10분 후 다시 시도해주세요.",
        );
      }

      this.logger.log(
        `PIN 검증 실패: childProfileId=${childProfileId}, remainingAttempts=${remaining}`,
      );

      return {
        success: true,
        data: {
          verified: false,
          remainingAttempts: remaining > 0 ? remaining : 0,
        },
      };
    }

    // 5. 성공 처리
    await this.prisma.childPin.update({
      where: { id: childPin.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastVerifiedAt: new Date(),
      },
    });

    this.logger.log(`PIN 검증 성공: childProfileId=${childProfileId}`);

    return {
      success: true,
      data: { verified: true },
    };
  }

  /**
   * PIN 삭제 (초기화)
   *
   * 학부모가 자녀의 PIN을 삭제합니다.
   * 1. ChildProfile 존재 확인
   * 2. 소유권 확인
   * 3. ChildPin 삭제
   */
  async deletePin(
    parentUserId: string,
    childProfileId: string,
  ): Promise<{ success: true; message: string }> {
    this.logger.log(
      `PIN 삭제 요청: parentUserId=${parentUserId}, childProfileId=${childProfileId}`,
    );

    // 1. ChildProfile 존재 확인
    const childProfile = await this.prisma.childProfile.findUnique({
      where: { id: childProfileId },
      select: { id: true, userId: true },
    });

    if (!childProfile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    // 2. 소유권 확인
    await this.verifyParentOwnership(parentUserId, childProfile.userId);

    // 3. ChildPin 존재 확인 및 삭제
    const existingPin = await this.prisma.childPin.findUnique({
      where: { childProfileId },
      select: { id: true },
    });

    if (!existingPin) {
      throw new NotFoundException("설정된 PIN이 없습니다.");
    }

    await this.prisma.childPin.delete({
      where: { childProfileId },
    });

    this.logger.log(
      `PIN 삭제 완료: childProfileId=${childProfileId}, deletedBy=${parentUserId}`,
    );

    return { success: true, message: "PIN이 초기화되었습니다." };
  }

  /**
   * 학부모-자녀 소유권 확인
   *
   * ParentChild 테이블에서 parentUserId → childUserId 관계가 존재하는지 확인합니다.
   * 관계가 없으면 ForbiddenException을 던집니다.
   */
  private async verifyParentOwnership(
    parentUserId: string,
    childUserId: string,
  ): Promise<void> {
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: {
          parentId: parentUserId,
          childId: childUserId,
        },
      },
      select: { id: true },
    });

    if (!parentChild) {
      throw new ForbiddenException("해당 자녀에 대한 접근 권한이 없습니다.");
    }
  }

  /**
   * PIN 보안 패턴 검증
   *
   * 보안 취약 패턴을 거부합니다:
   * - 동일 숫자 반복 (111111, 000000 등)
   * - 연속 숫자 (123456, 654321 등)
   */
  private validatePinPattern(pin: string): void {
    // 동일 숫자 반복 검증 (111111, 000000 등)
    if (/^(\d)\1{5}$/.test(pin)) {
      throw new BadRequestException(
        "동일한 숫자의 반복은 PIN으로 사용할 수 없습니다.",
      );
    }

    // 연속 숫자 검증
    if (SEQUENTIAL_PATTERNS.includes(pin)) {
      throw new BadRequestException(
        "연속된 숫자는 PIN으로 사용할 수 없습니다.",
      );
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 자녀 로그인용 PIN/OTP 검증 + JWT 발급 (Public 엔드포인트)
  // ══════════════════════════════════════════════════════════════

  /**
   * 고정 PIN 검증 + 로그인 (경로 A)
   *
   * 자녀가 부모가 사전 설정한 PIN을 입력하여 인증하고 JWT를 발급받습니다.
   */
  async verifyAndLogin(
    childEmail: string,
    pin: string,
    challengeToken: string,
  ): Promise<ChildAuthResponse> {
    await this.verifyChallengeToken(challengeToken, childEmail);
    this.logger.log(`PIN 로그인 요청: email=${childEmail}`);

    // 1. 자녀 User + ChildProfile + ChildPin 조회
    const user = await this.prisma.user.findUnique({
      where: { email: childEmail },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userType: true,
        status: true,
        childProfile: {
          select: {
            id: true,
            pinVerifiedUntil: true,
            childPin: {
              select: {
                id: true,
                pinHash: true,
                failedAttempts: true,
                lockedUntil: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("자녀 계정을 찾을 수 없습니다.");
    }

    if (user.userType !== "CHILD" && user.userType !== "TEEN") {
      throw new BadRequestException(
        "자녀 또는 청소년 계정만 사용할 수 있습니다.",
      );
    }

    if (user.status === "WITHDRAWN" || user.status === "WITHDRAW_PENDING") {
      throw new UnauthorizedException("사용할 수 없는 계정입니다.");
    }

    const childProfile = user.childProfile;
    if (!childProfile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    const childPin = childProfile.childPin;
    if (!childPin) {
      throw new NotFoundException(
        "설정된 PIN이 없습니다. 부모님에게 PIN 설정을 요청해주세요.",
      );
    }

    // 2. 잠금 상태 확인
    if (childPin.lockedUntil && childPin.lockedUntil > new Date()) {
      const remainingMs = childPin.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new ForbiddenException(
        `잠금 상태입니다. ${remainingMin}분 후 다시 시도해주세요.`,
      );
    }

    // 3. PIN 비교
    const isMatch = await bcrypt.compare(pin, childPin.pinHash);

    if (!isMatch) {
      const newFailedAttempts = childPin.failedAttempts + 1;
      const shouldLock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

      await this.prisma.childPin.update({
        where: { id: childPin.id },
        data: {
          failedAttempts: newFailedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCK_DURATION_MS)
            : undefined,
        },
      });

      const remaining = MAX_FAILED_ATTEMPTS - newFailedAttempts;

      if (shouldLock) {
        this.logger.warn(
          `PIN 로그인 잠금: email=${childEmail}, failedAttempts=${newFailedAttempts}`,
        );
        throw new ForbiddenException(
          "PIN 입력 횟수를 초과하였습니다. 10분 후 다시 시도해주세요.",
        );
      }

      throw new UnauthorizedException({
        message: `PIN이 일치하지 않습니다. (${remaining > 0 ? remaining : 0}회 남음)`,
        error: "PIN_INVALID",
        remainingAttempts: remaining > 0 ? remaining : 0,
      });
    }

    // 4. 성공: ChildPin 초기화 + pinVerifiedUntil 갱신 + JWT 발급
    const pinVerifiedUntil = new Date();
    pinVerifiedUntil.setDate(
      pinVerifiedUntil.getDate() + CHILD_PIN_VALIDITY_DAYS,
    );

    await this.prisma.$transaction([
      this.prisma.childPin.update({
        where: { id: childPin.id },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
          lastVerifiedAt: new Date(),
        },
      }),
      this.prisma.childProfile.update({
        where: { id: childProfile.id },
        data: { pinVerifiedUntil },
      }),
    ]);

    const name = `${user.lastName}${user.firstName}`;
    const tokens = this.generateTokens(
      user.id,
      user.userType as UserType,
      name,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`PIN 로그인 성공: email=${childEmail}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        name,
      },
    };
  }

  /**
   * OTP 발송 요청 (경로 B — Step 1)
   *
   * 자녀 이메일만 받고, 서버가 DB에서 연결된 부모 연락처를 조회하여 SMS 발송.
   * 자녀가 부모 번호를 입력하거나 알 필요 없음. 응답의 sentTo로 마스킹된 번호만 노출.
   */
  async requestOtp(
    childEmail: string,
    challengeToken: string,
  ): Promise<{
    remainingSeconds: number;
    resendAvailableInSeconds: number;
    reused: boolean;
  }> {
    await this.verifyChallengeToken(challengeToken, childEmail);
    this.logger.log(`OTP 발송 요청: childEmail=${childEmail}`);

    // 1. 자녀 User 조회
    const childUser = await this.prisma.user.findUnique({
      where: { email: childEmail },
      select: { id: true, userType: true, status: true },
    });

    if (!childUser) {
      throw new NotFoundException("자녀 계정을 찾을 수 없습니다.");
    }

    if (childUser.userType !== "CHILD" && childUser.userType !== "TEEN") {
      throw new BadRequestException(
        "자녀 또는 청소년 계정만 사용할 수 있습니다.",
      );
    }

    if (
      childUser.status === "WITHDRAWN" ||
      childUser.status === "WITHDRAW_PENDING"
    ) {
      throw new UnauthorizedException("사용할 수 없는 계정입니다.");
    }

    // 2. 연결된 부모 조회 (isPrimary 우선 → 없으면 createdAt 오름차순 첫 번째)
    const parentPhone = await this.resolveParentPhone(childUser.id);

    // 3. 활성 OTP 있으면 재사용 (발송 skip — idempotent)
    const hasActive = await this.otpService.hasActiveOtp(
      parentPhone,
      OTP_PURPOSE,
    );
    if (hasActive) {
      const remainingSeconds = await this.otpService.getRemainingTime(
        parentPhone,
        OTP_PURPOSE,
      );
      const { waitSeconds } = await this.smsService.canResend(parentPhone);
      this.logger.log(
        `OTP 재사용: childEmail=${childEmail}, OTP 남은시간=${remainingSeconds}초, 재발송 대기=${waitSeconds}초`,
      );
      return {
        remainingSeconds,
        resendAvailableInSeconds: waitSeconds,
        reused: true,
      };
    }

    // 4. 새 OTP 발송 (기존 SmsService 활용)
    try {
      await this.smsService.sendVerificationCode({
        phone: parentPhone,
        purpose: OTP_PURPOSE,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error; // rate limit 등 기존 에러 그대로 전달
      }
      this.logger.error(
        `OTP SMS 발송 실패: ${this.maskPhone(parentPhone)}`,
        error,
      );
      throw new InternalServerErrorException(
        "인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    const remainingSeconds = await this.otpService.getRemainingTime(
      parentPhone,
      OTP_PURPOSE,
    );
    const { waitSeconds } = await this.smsService.canResend(parentPhone);
    this.logger.log(`OTP 발송 성공: childEmail=${childEmail}`);

    return {
      remainingSeconds,
      resendAvailableInSeconds: waitSeconds,
      reused: false,
    };
  }

  /**
   * OTP 검증 + 로그인 (경로 B — Step 2)
   *
   * 서버가 DB에서 연결된 부모 연락처를 재조회하여 OTP 검증 후 자녀 로그인 완료.
   */
  async verifyOtpAndLogin(
    childEmail: string,
    otp: string,
    challengeToken: string,
  ): Promise<ChildAuthResponse> {
    await this.verifyChallengeToken(challengeToken, childEmail);
    this.logger.log(`OTP 로그인 요청: email=${childEmail}`);

    // 1. 자녀 User + ChildProfile 조회
    const user = await this.prisma.user.findUnique({
      where: { email: childEmail },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        userType: true,
        status: true,
        childProfile: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("자녀 계정을 찾을 수 없습니다.");
    }

    if (user.userType !== "CHILD" && user.userType !== "TEEN") {
      throw new BadRequestException(
        "자녀 또는 청소년 계정만 사용할 수 있습니다.",
      );
    }

    if (user.status === "WITHDRAWN" || user.status === "WITHDRAW_PENDING") {
      throw new UnauthorizedException("사용할 수 없는 계정입니다.");
    }

    const childProfile = user.childProfile;
    if (!childProfile) {
      throw new NotFoundException("자녀 프로필을 찾을 수 없습니다.");
    }

    // 2. 부모 연락처 재조회 (request-otp와 동일 로직) → OTP 검증
    const parentPhone = await this.resolveParentPhone(user.id);
    const otpResult = await this.otpService.verifyOtp(
      parentPhone,
      OTP_PURPOSE,
      otp,
    );

    if (!otpResult.valid) {
      throw new UnauthorizedException({
        message: otpResult.message,
        error: "OTP_INVALID",
      });
    }

    // 3. 성공: pinVerifiedUntil 갱신 + JWT 발급
    const pinVerifiedUntil = new Date();
    pinVerifiedUntil.setDate(
      pinVerifiedUntil.getDate() + CHILD_PIN_VALIDITY_DAYS,
    );

    await this.prisma.childProfile.update({
      where: { id: childProfile.id },
      data: { pinVerifiedUntil },
    });

    const name = `${user.lastName}${user.firstName}`;
    const tokens = this.generateTokens(
      user.id,
      user.userType as UserType,
      name,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`OTP 로그인 성공: email=${childEmail}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userType: user.userType,
        name,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Private Helpers
  // ──────────────────────────────────────────────────────────────

  /**
   * JWT Access + Refresh 토큰 생성
   * AuthService.generateTokens()와 동일 로직 (순환 DI 회피)
   */
  private generateTokens(userId: string, userType: UserType, name = "") {
    const payload = {
      sub: userId,
      userType,
      name,
      iat: Math.floor(Date.now() / 1000),
    };

    const accessTokenExpiration = this.configService.get<string>(
      "JWT_EXPIRATION",
      "900",
    );
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>("JWT_SECRET"),
      expiresIn: parseInt(accessTokenExpiration, 10),
    });

    const refreshTokenExpiration = this.configService.get<string>(
      "JWT_REFRESH_EXPIRATION",
      "604800",
    );
    const refreshSecret =
      this.configService.get<string>("JWT_REFRESH_SECRET") ||
      this.configService.get<string>("JWT_SECRET");
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: "refresh" },
      {
        secret: refreshSecret,
        expiresIn: parseInt(refreshTokenExpiration, 10),
      },
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh Token을 Redis에 저장
   */
  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const ttl = parseInt(
      this.configService.get<string>("JWT_REFRESH_EXPIRATION", "604800"),
      10,
    );
    const key = `refresh_token:${userId}`;
    await this.redisService.set(key, refreshToken, ttl);
  }

  /**
   * 자녀 userId로 연결된 부모 전화번호 조회
   *
   * 우선순위:
   * 1. isPrimary=true 인 부모 중 첫 번째 (createdAt 오름차순)
   * 2. 없으면 ParentChild 전체에서 첫 번째
   *
   * 없거나 부모 전화번호가 등록되지 않았으면 NotFoundException.
   */
  private async resolveParentPhone(childUserId: string): Promise<string> {
    const parentChild =
      (await this.prisma.parentChild.findFirst({
        where: { childId: childUserId, isPrimary: true },
        orderBy: { createdAt: "asc" },
        select: { parent: { select: { phone: true } } },
      })) ??
      (await this.prisma.parentChild.findFirst({
        where: { childId: childUserId },
        orderBy: { createdAt: "asc" },
        select: { parent: { select: { phone: true } } },
      }));

    if (!parentChild) {
      throw new NotFoundException(
        "연결된 보호자가 없습니다. 관리자에게 문의하세요.",
      );
    }

    const phone = parentChild.parent?.phone?.replace(/\D/g, "");
    if (!phone) {
      throw new NotFoundException(
        "보호자 전화번호가 등록되지 않아 인증할 수 없습니다. 관리자에게 문의하세요.",
      );
    }

    return phone;
  }

  /**
   * 전화번호 마스킹
   */
  private maskPhone(phone: string): string {
    if (phone.length >= 8) {
      return phone.slice(0, 3) + "****" + phone.slice(-4);
    }
    return "****";
  }

  private async verifyChallengeToken(
    token: string,
    expectedEmail: string,
  ): Promise<void> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>("JWT_SECRET"),
      });
      if (payload.type !== "child_pin_challenge") {
        throw new UnauthorizedException({
          message: "유효하지 않은 접근입니다.",
          error: "INVALID_CHALLENGE",
        });
      }
      if (payload.email !== expectedEmail) {
        throw new UnauthorizedException({
          message: "유효하지 않은 접근입니다.",
          error: "INVALID_CHALLENGE",
        });
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException({
        message: "세션이 만료되었습니다. 다시 로그인해주세요.",
        error: "CHALLENGE_EXPIRED",
      });
    }
  }
}
