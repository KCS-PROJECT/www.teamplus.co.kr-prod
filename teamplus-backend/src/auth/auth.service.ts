import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  Logger,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { AccountLockoutService } from "./services/account-lockout.service";
import { LoggerService } from "@/logger/logger.service";
import { SmsService } from "@/sms/sms.service";
import { MailService } from "@/mail/mail.service";
import { securityConfig } from "@/config/security.config";
import { SignupDto } from "./dto/signup.dto";
import * as bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { SocialUserInfo } from "./dto/social-login.dto";
import { AppleTokenService } from "./services/apple-token.service";
import { UserType, Prisma } from "@prisma/client";
import { calculateKoreanAge } from "@/common/utils/age.util";
import { JwtPayload } from "@/common/interfaces/authenticated-request.interface";
import {
  CHLDIV,
  CHLDIV_MISMATCH_MESSAGE,
  Chldiv,
  isAdminRole,
  isUserTypeAllowedForChldiv,
} from "./constants/chldiv.constants";

/**
 * Refresh Token 저장 레코드 (Rotation + Grace Window)
 *
 * Backward compatibility: 기존 string 형태로 저장된 토큰은 validateRefreshTokenSafe에서
 * 감지하여 string 분기로 처리. 다음 rotation 시 자동으로 object 형태로 마이그레이션된다.
 */
interface RefreshTokenRecord {
  /** 최신 refresh token (가장 최근 발급) */
  current: string;
  /** 직전 refresh token (grace window 동안만 유효) */
  previous?: string;
  /** 최신 토큰 rotation 시각 (epoch ms) */
  rotatedAt: number;
}

/**
 * Refresh Token Rotation Grace Window (ms)
 *
 * 60초 — 절전 해제/브라우저 복원 시 여러 탭의 갱신 타이머가 수십 초에 걸쳐
 * 스태거 발화하는 것을 흡수한다. grace 내 previous 토큰은 새 회전 없이
 * 기존 current 를 멱등 반환하므로(validateRefreshTokenSafe.gracedCurrent)
 * 10초 → 60초 연장에 따른 토큰 발급 증가는 없다.
 * Grace window 밖의 previous 토큰 사용은 여전히 reuse 로 거절된다.
 */
const REFRESH_GRACE_MS = 60_000;

/**
 * 동시 세션 정책 — "사용 중" 판정 기준 (ms)
 *
 * 로그인 시 기존 세션이 존재해도 lastActiveAt 이 이 window 를 벗어나면
 * 방치 세션으로 보고 묻지 않고 교체한다 (매 로그인 모달 노이즈 방지).
 */
const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = securityConfig.password.saltRounds;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redisService: RedisService,
    private configService: ConfigService,
    private accountLockoutService: AccountLockoutService,
    // [REMOVED 2026-05-13] DevelopmentTestAuthService 완전 제거.
    // 운영 시드는 prisma/seeds/run-team-data.ts 단일 경로만 사용한다.
    private smsService: SmsService,
    private logger_: LoggerService,
    private appleTokenService: AppleTokenService,
    private mailService: MailService,
  ) {}

  /**
   * User Registration
   * Creates a new user with email, phone, password, and user type
   */
  async register(
    registerDto: RegisterDto & {
      clubInfo?: {
        name: string;
        location?: string;
        venueId?: string;
      };
      academyInfo?: { name: string; region?: string };
      teamId?: string;
      teamCode?: string;
    },
  ) {
    // 자동 채움(B안, 2026-05-26) 을 위해 firstName/lastName/phone/birthDate/gender 는
    // let 으로 destructure — 본인인증 통과 시 verification 값으로 채워질 수 있다.
    const {
      email,
      password,
      userType,
      zipCode,
      address,
      addressDetail,
      clubInfo,
      academyInfo,
      teamId,
      teamCode,
      identityVerificationId,
    } = registerDto;
    let { firstName, lastName, phone, birthDate, gender } = registerDto;

    // 한국나이 계산 및 TEEN/CHILD 자동 분류
    //  - CHILD: 한국나이 10세 미만, TEEN: 한국나이 10세 이상
    //  - User.koreanAge 컬럼은 등록 시점 스냅샷 (비즈니스 로직에서 신뢰 X, age.util.ts § 참고)
    let resolvedUserType = userType as UserType;
    let koreanAge: number | undefined;

    if (birthDate) {
      koreanAge = calculateKoreanAge(new Date(birthDate));
      if (
        resolvedUserType === UserType.TEEN ||
        resolvedUserType === UserType.CHILD
      ) {
        resolvedUserType = koreanAge < 10 ? UserType.CHILD : UserType.TEEN;
      }
    }

    // Check if user already exists (email or phone)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new BadRequestException("이미 등록된 이메일입니다.");
      }
      if (existingUser.phone === phone) {
        throw new BadRequestException("이미 등록된 휴대폰 번호입니다.");
      }
    }

    // 팀 감독 가입 선검증 (2026-06-01) — 팀 이름만 필수. 팀 코드는 가입 시 미설정(null),
    //   감독이 추후 팀 관리에서 등록·변경한다.
    if (resolvedUserType === UserType.DIRECTOR && !clubInfo) {
      throw new BadRequestException("팀 정보를 입력해주세요.");
    }

    // 오픈클래스 감독 가입 선검증 (설계서 §4.6) — 오픈클래스 정보 필수
    if (resolvedUserType === UserType.ACADEMY_DIRECTOR && !academyInfo) {
      throw new BadRequestException("오픈클래스 정보를 입력해주세요.");
    }

    // 코치 가입 + 팀 선택 선검증 (2026-06-01 · teamId 우선, teamCode 레거시 fallback)
    //  - 팀 선택은 선택 입력. 지정된 경우에만 Team 존재 확인.
    //  - 잘못된 식별자면 User 자체를 생성하지 않기 위함 (원자성).
    if (resolvedUserType === UserType.COACH && (teamId || teamCode)) {
      const coachTargetClub = teamId
        ? await this.prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true },
          })
        : await this.prisma.team.findUnique({
            where: { teamCode: teamCode! },
            select: { id: true },
          });
      if (!coachTargetClub) {
        throw new BadRequestException("선택하신 팀을 찾을 수 없습니다.");
      }
    }

    // CHILD/TEEN 직접 회원가입 차단 (가족정책 하드닝 · 2026-06-18 · INFO-3)
    //  - 자녀(아동/청소년)는 보호자 계정에서만 생성한다. 정식 경로는
    //    ChildrenService.createChild() (학부모 경유, register() 미경유 독립 $transaction).
    //  - 본 register()로의 CHILD/TEEN 직접 가입은 App Store/Google Play 가족정책상
    //    금지되므로 ForbiddenException으로 즉시 차단한다(birthDate 유무 무관).
    if (
      resolvedUserType === UserType.CHILD ||
      resolvedUserType === UserType.TEEN
    ) {
      throw new ForbiddenException(
        "자녀(아동/청소년) 회원가입은 보호자 계정에서만 가능합니다. 학부모로 가입 후 '내 자녀 추가'에서 등록해주세요.",
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // NEW-02 (2026-05-22 · 앱심사 v7) — PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR
    // 가입 시 본인인증 강제 가드.
    //   · 근거: PIPA §22조 + 정통망법 §31조 (실명 확인 의무)
    //   · CHILD/TEEN 은 L-10 법정대리인 동의로 대체 (보호자가 가입 대행)
    //   · ADMIN/SYSTEM/OPER 는 운영자 콘솔에서 별도 발급 — 본인인증 불요
    //   · identityVerificationId 는 NICE/PASS/Kakao 완료 후 받은 IdentityVerification.requestId
    //   · 검증: status='completed' + verifiedAt 존재 + 30분 내 + name 일치
    // ─────────────────────────────────────────────────────────────────────
    const IDENTITY_REQUIRED_TYPES: UserType[] = [
      UserType.PARENT,
      UserType.COACH,
      UserType.DIRECTOR,
      UserType.ACADEMY_DIRECTOR,
    ];
    let verifiedCi: string | null = null;
    let verifiedDi: string | null = null;
    let verifiedCiHash: string | null = null;
    if (IDENTITY_REQUIRED_TYPES.includes(resolvedUserType)) {
      if (!identityVerificationId) {
        throw new BadRequestException(
          "본인인증을 먼저 완료해주세요. (PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 가입 필수)",
        );
      }
      const verification = await this.prisma.identityVerification.findUnique({
        where: { requestId: identityVerificationId },
        select: {
          id: true,
          status: true,
          verifiedAt: true,
          verifiedName: true,
          verifiedPhone: true,
          verifiedBirth: true,
          verifiedGender: true,
          ci: true,
          ciHash: true,
          di: true,
          userId: true,
          expiresAt: true,
        },
      });
      if (!verification) {
        throw new BadRequestException(
          "본인인증 정보를 찾을 수 없습니다. 다시 시도해주세요.",
        );
      }
      if (verification.status !== "completed" || !verification.verifiedAt) {
        throw new BadRequestException(
          "본인인증이 완료되지 않았습니다. 다시 인증해주세요.",
        );
      }
      // 30분(IdentityVerification.expiresAt) 내 검증
      const now = new Date();
      if (verification.expiresAt && verification.expiresAt < now) {
        throw new BadRequestException(
          "본인인증 유효 시간이 만료되었습니다. 다시 인증해주세요.",
        );
      }
      // B안 자동 채움 (2026-05-26) — 사용자가 입력 안 한 경우 verification 값으로 채움
      //   · 프론트 <IdentityVerifyInput /> 이 이름/휴대폰 입력란을 본인인증 컴포넌트로
      //     교체하므로 회원가입 폼은 firstName/lastName/phone/birthDate/gender 를
      //     비워서 전송할 수 있다.
      //   · 한국식 이름 분리: 첫 1자 = 성(lastName), 나머지 = 이름(firstName).
      //     두 글자 성씨(남궁/황보 등) 케이스는 본인인증 결과와 동일 분리 함수를 사용해
      //     일치 검증을 우회하므로 통과한다.
      const verifiedNameClean = (verification.verifiedName ?? "").replace(/\s+/g, "");
      if (verifiedNameClean && !firstName && !lastName) {
        if (verifiedNameClean.length >= 2) {
          lastName = verifiedNameClean.slice(0, 1);
          firstName = verifiedNameClean.slice(1);
        } else {
          lastName = verifiedNameClean;
          firstName = "";
        }
      }
      if (!phone && verification.verifiedPhone) {
        phone = verification.verifiedPhone;
      }
      if (!birthDate && verification.verifiedBirth) {
        // verifiedBirth 는 YYYYMMDD 형식 → ISO YYYY-MM-DD 로 변환
        const b = verification.verifiedBirth;
        if (b.length === 8) {
          birthDate = `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`;
        }
      }
      if (!gender && verification.verifiedGender) {
        gender = verification.verifiedGender; // M | F
      }

      // 이름 일치 검증 (성+이름 합쳐서 비교 — 공백 제거)
      //   · 자동 채움 케이스에서도 우리가 같은 분리 함수를 썼으므로 통과
      //   · 사용자가 직접 입력했고 verification 과 다르면 차단
      const submittedName = `${lastName}${firstName}`.replace(/\s+/g, "");
      if (submittedName && verifiedNameClean && submittedName !== verifiedNameClean) {
        throw new BadRequestException(
          "본인인증 정보의 이름과 입력하신 이름이 일치하지 않습니다.",
        );
      }

      // 동일 CI 로 이미 가입된 계정 차단 (중복가입 차단)
      // [2026-06-10 SECURITY] 결정적 ciHash 로 비교 — 기존 verification.ci(랜덤 IV 암호문) 동등비교는
      //   동일인이 재인증해도 매번 다른 암호문이라 절대 매칭되지 않아 중복차단이 무력화돼 있었음.
      //   ciHash 가 없는 레거시 verification 은 차단 불가하므로 통과(점진 마이그레이션).
      if (verification.ciHash) {
        const duplicateCi = await this.prisma.user.findFirst({
          where: { ciHash: verification.ciHash },
          select: { id: true, email: true },
        });
        if (duplicateCi) {
          throw new BadRequestException(
            "이미 본인인증으로 가입된 계정이 존재합니다.",
          );
        }
      }

      // 자동 채움된 phone 이 다른 계정과 중복인지 재확인
      //   · 1차 check (line 128) 는 사용자 입력 phone 기준이라, 자동 채움 후 다시 확인 필요.
      //   · CI 중복으로 이미 차단되지만 본인인증 미수행 레거시 계정과 phone 만 겹칠 수 있음.
      if (phone) {
        const duplicatePhone = await this.prisma.user.findUnique({
          where: { phone },
          select: { id: true },
        });
        if (duplicatePhone) {
          throw new BadRequestException(
            "이미 등록된 휴대폰 번호입니다.",
          );
        }
      }

      verifiedCi = verification.ci;
      verifiedDi = verification.di;
      verifiedCiHash = verification.ciHash;

      // birthDate 가 자동 채움된 경우 koreanAge 재계산 (line 117 이전이라 미실행됨)
      if (birthDate && koreanAge === undefined) {
        koreanAge = calculateKoreanAge(new Date(birthDate));
      }
    }

    // 자동 채움 후 최종 필수 필드 검증 (B안, 2026-05-26)
    //   · DTO 단에서는 firstName/lastName/phone 을 옵셔널로 받아 자동 채움을 허용했으므로
    //     자동 채움이 일어나지 않은 케이스(본인인증 미수행 + 사용자 미입력)는 여기서 차단.
    if (!firstName) {
      throw new BadRequestException("이름을 입력해주세요.");
    }
    if (!lastName) {
      throw new BadRequestException("성을 입력해주세요.");
    }
    if (!phone) {
      throw new BadRequestException("휴대폰 번호를 입력해주세요.");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    try {
      // Create user + profile in transaction
      const user = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            phone,
            firstName,
            lastName,
            passwordHash,
            userType: resolvedUserType,
            ...(birthDate && { birthDate: new Date(birthDate) }),
            ...(koreanAge !== undefined && { koreanAge }),
            ...(gender && { gender }),
            ...(zipCode && { zipCode }),
            ...(address && { address }),
            ...(addressDetail && { addressDetail }),
            // NEW-02: 본인인증 완료 시 ci/di 스냅샷 + isVerified=true
            ...(verifiedCi && { ci: verifiedCi, isVerified: true }),
            // [2026-06-10 SECURITY] ciHash 동시 저장 — 1인1계정 중복가입 차단 인덱스.
            ...(verifiedCiHash && { ciHash: verifiedCiHash }),
            ...(verifiedDi && { di: verifiedDi }),
          },
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            userType: true,
            createdAt: true,
          },
        });

        // NEW-02: IdentityVerification.userId 를 신규 user 로 연결
        // (회원가입 전이라 NULL 이었던 verification 레코드를 사후 매핑)
        if (identityVerificationId) {
          await tx.identityVerification.update({
            where: { requestId: identityVerificationId },
            data: { userId: newUser.id },
          });
        }

        // userType에 따라 프로필 자동 생성 + 팀/오픈클래스 생성 (설계서 §4.5·§4.6)
        if (resolvedUserType === UserType.PARENT) {
          // [Phase 1] 학부모 가입 시 팀 멤버십을 생성하지 않는다.
          //  부모의 '내 팀'은 자녀(PLAYER) 멤버십을 경유해 동적으로 산출하며,
          //  팀 선택은 자녀 등록 시점에 자녀별로 이뤄진다 (다팀·무소속 허용).
          await tx.parentProfile.create({
            data: { userId: newUser.id },
          });
        } else if (resolvedUserType === UserType.COACH) {
          // 코치 가입: 팀 선택 있으면 Team 조회 + CoachProfile(teamId) + ClubMember(COACH, pending)
          //            없으면 기존처럼 CoachProfile(teamId=null) 만 생성 (떠도는 코치 허용)
          if (teamId || teamCode) {
            const coachClub = teamId
              ? await tx.team.findUnique({
                  where: { id: teamId },
                  select: { id: true, name: true },
                })
              : await tx.team.findUnique({
                  where: { teamCode: teamCode! },
                  select: { id: true, name: true },
                });
            if (!coachClub) {
              throw new BadRequestException("선택하신 팀을 찾을 수 없습니다.");
            }
            await tx.coachProfile.create({
              data: { userId: newUser.id, teamId: coachClub.id },
            });
            await tx.teamMember.create({
              data: {
                userId: newUser.id,
                teamId: coachClub.id,
                playerName: `${lastName}${firstName}`,
                playerAge: 0,
                approvalStatus: "pending",
                roleInTeam: "COACH",
              },
            });
          } else {
            await tx.coachProfile.create({
              data: { userId: newUser.id },
            });
          }
        } else if (resolvedUserType === UserType.DIRECTOR && clubInfo) {
          // 팀 감독 가입 = User + CoachProfile + Team + ClubMember(HEAD_COACH approved)
          // [2026-06-01] 팀 코드는 가입 시 미설정(null) — 감독이 추후 팀 관리에서 등록.
          // [지역/홈경기장 분리] location 은 '지역'(자유 텍스트)으로 독립 — venueId sync 대상 아님.
          //  homeArena 만 venueId 지정 시 venue.name 으로 sync.
          const directorLocation: string | null = clubInfo.location ?? null;
          let directorHomeArena: string | null = null;
          if (clubInfo.venueId) {
            const venue = await tx.venue.findUnique({
              where: { id: clubInfo.venueId },
              select: { name: true },
            });
            if (venue) {
              directorHomeArena = venue.name;
            }
          }
          const club = await tx.team.create({
            data: {
              // teamCode 미설정 (null) — 감독이 추후 팀 관리에서 등록·변경
              name: clubInfo.name,
              coachId: newUser.id,
              phone,
              location: directorLocation,
              homeArena: directorHomeArena,
              venueId: clubInfo.venueId || null,
            },
          });
          await tx.coachProfile.create({
            data: { userId: newUser.id, teamId: club.id },
          });
          await tx.teamMember.create({
            data: {
              userId: newUser.id,
              teamId: club.id,
              playerName: `${lastName}${firstName}`,
              playerAge: 0,
              approvalStatus: "approved",
              // [2026-06-07] 팀 감독 가입자는 항상 HEAD_COACH 고정.
              //   단장(MANAGER)은 감독이 코치 등록 화면에서 생성한다.
              roleInTeam: "HEAD_COACH",
            },
          });
        } else if (
          resolvedUserType === UserType.ACADEMY_DIRECTOR &&
          academyInfo
        ) {
          // 오픈클래스 감독 가입 = User + Academy(ACAD-XXXXXX 자동)
          // Academy 모델은 directorId 직접 참조하므로 CoachProfile 불필요
          const code = await this.generateUniqueAcademyCode(tx);
          await tx.academy.create({
            data: {
              directorId: newUser.id,
              name: academyInfo.name,
              code,
              region: academyInfo.region ?? null,
            },
          });
        }
        // CHILD/TEEN 직접 가입은 register() 진입부에서 ForbiddenException으로
        // 차단되므로(가족정책 하드닝 · INFO-3) 본 트랜잭션에는 도달하지 않는다.
        // 자녀 생성의 정식 경로는 ChildrenService.createChild()(학부모 경유).

        return newUser;
      });

      // Generate tokens (신규 가입 = 첫 세션)
      const { accessToken, refreshToken, sessionId } = this.generateTokens(
        user.id,
        resolvedUserType,
      );

      // Store refresh token in Redis (세션별 키)
      await this.storeRefreshToken(user.id, refreshToken, sessionId);

      this.logger.log(`✅ User registered: ${user.email} (${userType})`);

      return {
        user,
        accessToken,
        refreshToken,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Registration failed: ${errorMessage}`);
      throw new BadRequestException("회원가입에 실패했습니다.");
    }
  }

  /**
   * User Login
   * Authenticates user with email and password
   *
   * Security Features:
   * - Account lockout after failed attempts (progressive)
   * - Constant-time password comparison (bcrypt)
   * - Clear failed attempts on successful login
   */
  async login(
    loginDto: LoginDto,
    context?: {
      ipAddress?: string;
      userAgent?: string;
      chldiv?: Chldiv;
      /** 단일 세션 정책 — 사용자가 "기존 접속 종료" 확인 후 재요청 시 true */
      force?: boolean;
    },
  ) {
    const { email, password } = loginDto;
    const ipAddress = context?.ipAddress ?? null;
    const userAgent = context?.userAgent ?? null;
    const chldiv = context?.chldiv;

    this.logger.debug(`🔐 로그인 시도: ${email} (chldiv=${chldiv ?? "NONE"})`);

    // Step 1: Check if account is locked due to failed attempts
    const lockoutStatus = await this.accountLockoutService.checkIfLocked(email);
    if (lockoutStatus.isLocked) {
      const remainingMinutes = Math.ceil(
        (lockoutStatus.remainingTime || 0) / 60,
      );
      this.logger.warn(
        `🔒 Account locked for ${email}: Level ${lockoutStatus.lockoutLevel}, remaining ${remainingMinutes}m`,
      );
      throw new HttpException(
        `계정이 보안상 잠겨있습니다. ${remainingMinutes}분 후 다시 시도해주세요.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // [REMOVED 2026-05-13] 개발용 자동 시드 복구 (DevelopmentTestAuthService) 완전 제거.
    // 운영 시드는 prisma/seeds/run-team-data.ts 단일 경로만 사용.

    // Step 2: Find user
    // ⚡ phone 추가 (BFF) — 클라이언트가 로그인 직후 GET /auth/profile 으로
    //    재조회하던 RTT 50~100ms 제거. AuthUser 인터페이스의 optional 필드 채움.
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        passwordHash: true,
        userType: true,
        avatarUrl: true,
        birthDate: true,
        status: true,
        tokenVersion: true,
        lastActiveAt: true,
        childProfile: {
          select: { id: true, pinVerifiedUntil: true },
        },
      },
    });

    if (!user) {
      // Record failed attempt even if user doesn't exist (prevent user enumeration)
      await this.accountLockoutService.recordFailedAttempt(email);
      this.logger.warn(`❌ 사용자 없음: ${email}`);
      this.logger_.logAuthEvent("login_failure", {
        reason: "user_not_found",
        email,
      });
      // AuditLog DB 기록 (userId nullable — 본인 로그인 기록 API는 성공만 필터링하지만 실패도 감사용 저장)
      try {
        await this.prisma.auditLog.create({
          data: {
            action: "login_failed",
            resource: "auth:login",
            ipAddress,
            newValue: { reason: "user_not_found", email, userAgent },
          },
        });
      } catch {
        // best effort
      }
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 일치하지 않습니다.",
      );
    }

    this.logger.debug(`✅ 사용자 찾음: ${user.email} (${user.userType})`);

    // Step 2.5: 탈퇴 상태 확인
    if (user.status === "WITHDRAWN") {
      throw new UnauthorizedException(
        "탈퇴 처리된 계정입니다. 새로운 계정으로 가입해주세요.",
      );
    }

    if (user.status === "WITHDRAW_PENDING") {
      throw new UnauthorizedException(
        "탈퇴 대기 중인 계정입니다. 탈퇴를 철회하려면 고객센터에 문의해주세요.",
      );
    }

    // Step 3: Verify password (constant-time comparison via bcrypt)
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // Record failed attempt
      const failureResult =
        await this.accountLockoutService.recordFailedAttempt(email);

      if (failureResult.isLocked) {
        this.logger.warn(
          `🔒 Account locked after ${failureResult.attempts} attempts: ${email}`,
        );
        this.logger_.logAuthEvent("account_locked", {
          email,
          attempts: failureResult.attempts,
          lockoutLevel: failureResult.lockoutLevel,
        });
        throw new HttpException(
          `계정이 보안상 잠겨있습니다. ${Math.ceil((failureResult.lockoutDuration || 0) / 60)}분 후 다시 시도해주세요.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      this.logger.warn(
        `❌ 비밀번호 불일치: ${email} (${failureResult.attempts} attempts)`,
      );
      this.logger_.logAuthEvent("login_failure", {
        reason: "invalid_password",
        email,
        attempts: failureResult.attempts,
      });
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "login_failed",
            resource: "auth:login",
            ipAddress,
            newValue: {
              reason: "invalid_password",
              email,
              attempts: failureResult.attempts,
              userAgent,
            },
          },
        });
      } catch {
        // best effort
      }
      throw new UnauthorizedException(
        "이메일 또는 비밀번호가 일치하지 않습니다.",
      );
    }

    // Step 3.5: chldiv 게이트 — APP/ADM 분기별 허용 UserType 검증
    // 클라이언트가 잘못된 화면에서 로그인 시도 시 401 반환
    if (chldiv && !isUserTypeAllowedForChldiv(chldiv, user.userType)) {
      this.logger.warn(
        `🚫 chldiv mismatch: ${email} userType=${user.userType} chldiv=${chldiv}`,
      );
      this.logger_.logAuthEvent("login_failure", {
        reason: "chldiv_mismatch",
        email,
        userId: user.id,
        userType: user.userType,
        chldiv,
      });
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: "login_failed",
            resource: "auth:login",
            ipAddress,
            newValue: {
              reason: "chldiv_mismatch",
              email,
              userType: user.userType,
              chldiv,
              userAgent,
            },
          },
        });
      } catch {
        // best effort
      }
      throw new UnauthorizedException(CHLDIV_MISMATCH_MESSAGE);
    }

    // Step 4: Clear failed attempts on successful login
    await this.accountLockoutService.clearFailedAttempts(email);

    // Step 4.5: Update korean_age + lastLoginAt + restore DORMANT → ACTIVE
    // ⚡ DORMANT 복원은 비즈니스 정확성 위해 동기 유지(이후 권한 검증 영향).
    //    일반 케이스의 lastLoginAt/koreanAge update 는 fire-and-forget — 응답 경로에서
    //    3~5ms 단축. 실패해도 다음 로그인에 자동 재시도되므로 best-effort 로 처리.
    const loginUpdateData: Record<string, unknown> = {
      lastLoginAt: new Date(),
    };
    if (user.birthDate) {
      loginUpdateData.koreanAge = calculateKoreanAge(new Date(user.birthDate));
    }
    if (user.status === "DORMANT") {
      loginUpdateData.status = "ACTIVE";
      loginUpdateData.dormantAt = null;
      // 상태 전환은 동기 — 후속 권한/세션 의존
      await this.prisma.user.update({
        where: { id: user.id },
        data: loginUpdateData,
      });
    } else {
      // 일반 케이스 — 응답 차단하지 않음
      void this.prisma.user
        .update({ where: { id: user.id }, data: loginUpdateData })
        .catch((err) =>
          this.logger.warn(
            `lastLoginAt update failed: ${(err as Error).message}`,
          ),
        );
    }

    // Step 4.7: 자녀(CHILD/TEEN) 일반 로그인 — PIN 폐지(2026-04-29)
    //  - 정책 b: 이메일+비밀번호로 일반 로그인 가능
    //  - 단 학부모가 자녀 등록 후 감독이 ClubMember 를 approve 해야 로그인 가능
    //  - 미승인 자녀는 학부모 대시보드 대기 배너에서 승인 진행 상태 확인
    if (user.userType === "CHILD" || user.userType === "TEEN") {
      const approvedMembership = await this.prisma.teamMember.findFirst({
        where: { userId: user.id, approvalStatus: "approved" },
        select: { id: true },
      });
      if (!approvedMembership) {
        throw new BadRequestException(
          "감독님의 승인 후 로그인하실 수 있습니다. 학부모님께 문의해주세요.",
        );
      }
    }

    // Step 4.8: 동시 세션 정책 (단일 세션 — 개발 환경은 플래그로 중복 허용)
    //  - 개발 모드: 세션별 키로 무제한 공존 (검사 자체를 건너뜀)
    //  - 운영 모드: 활성(lastActiveAt 30분 이내) 세션 존재 시
    //      · force 없음 → 409 SESSION_EXISTS (새 기기에서 확인 모달 유도)
    //      · force=true → 기존 세션 전체 폐기 + tokenVersion +1 (즉시 무효화)
    //    방치 세션은 묻지 않고 조용히 교체 (모달 노이즈 방지)
    //    ADM(admin 대시보드) 분기는 확인 모달 UI 가 없으므로 조용히 교체.
    let effectiveTokenVersion = user.tokenVersion;
    if (!this.isConcurrentLoginAllowed()) {
      const hasSession = await this.hasAnySession(user.id);
      if (hasSession) {
        const isActive =
          user.lastActiveAt != null &&
          Date.now() - new Date(user.lastActiveAt).getTime() <
            ACTIVE_SESSION_WINDOW_MS;

        if (isActive && !context?.force && context?.chldiv !== CHLDIV.ADM) {
          // AllExceptionsFilter 가 `error` 필드를 응답 errorCode 로 매핑한다
          // (USER_NOT_FOUND / WITHDRAWN_ACCOUNT 와 동일 관례).
          throw new ConflictException({
            message:
              "다른 기기에서 로그인되어 사용 중인 계정입니다. 기존 접속을 종료하고 로그인할까요?",
            error: "SESSION_EXISTS",
          });
        }

        // force 교체 또는 방치 세션 정리 — 기존 refresh 세션 전체 폐기
        await this.revokeRefreshToken(user.id);

        if (isActive && context?.force) {
          // 기존 기기의 살아있는 access 토큰 즉시 무효화 (jwt.strategy tokenVersion 검증)
          const bumped = await this.prisma.user.update({
            where: { id: user.id },
            data: { tokenVersion: { increment: 1 } },
            select: { tokenVersion: true },
          });
          effectiveTokenVersion = bumped.tokenVersion;

          // [2026-06-20] "확인 모달 후 전환" — 기존 기기의 푸시 등록(UserDevice) 비활성화.
          //   새 기기는 로그인 직후 registerDevice 로 재등록되어 active 1개로 수렴한다.
          //   → 전환 후 구 기기로 푸시가 가지 않도록 보장(권한 거부로 새 기기가
          //     registerDevice 를 못 부르는 경우의 안전망).
          await this.prisma.userDevice.updateMany({
            where: { userId: user.id, isActive: true },
            data: { isActive: false },
          });

          this.logger.log(
            `🔁 Force login — 기존 세션 강제 종료: ${user.email}`,
          );
        }
      }
    }

    // Step 5: Generate tokens (새 세션 jti 발급)
    const name = `${user.lastName}${user.firstName}`;
    const { accessToken, refreshToken, sessionId } = this.generateTokens(
      user.id,
      user.userType,
      name,
      effectiveTokenVersion,
    );

    // Step 6: Store refresh token in Redis (세션별 키)
    await this.storeRefreshToken(user.id, refreshToken, sessionId);

    this.logger.log(`✅ User logged in: ${user.email}`);

    // Step 7: Audit log for successful login (Pino + DB)
    this.logger_.audit("login", "auth", user.id, "success", {
      email: user.email,
      userType: user.userType,
    });
    void this.prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: "login_success",
          resource: "auth:login",
          ipAddress,
          newValue: {
            email: user.email,
            userType: user.userType,
            userAgent,
          },
        },
      })
      .catch((err) =>
        this.logger.warn(`audit log failed: ${(err as Error).message}`),
      );

    // Step 8: Structured logging for login success
    this.logger_.logAuthEvent("login_success", {
      userId: user.id,
      email: user.email,
      userType: user.userType,
    });

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? null,
        userType: user.userType,
        name,
        avatarUrl: user.avatarUrl ?? null,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh Access Token
   * Generates a new access token from refresh token with rotation
   */
  async refreshToken(refreshToken: string) {
    try {
      // Refresh Token은 별도 Secret으로 검증 (JWT_REFRESH_SECRET 우선, 없으면 JWT_SECRET 폴백)
      const refreshSecret =
        this.configService.get<string>("JWT_REFRESH_SECRET") ||
        this.configService.get<string>("JWT_SECRET");

      // Verify refresh token
      const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: refreshSecret,
      });
      const sessionId = decoded.jti;

      // Validate refresh token against stored token in Redis (Token Rotation)
      // sessionId 가 있으면 세션별 키, 없으면(구토큰) legacy 단일 키를 검증.
      const { isValid, reason, gracedCurrent } =
        await this.validateRefreshTokenSafe(
          decoded.sub,
          refreshToken,
          sessionId,
        );
      if (!isValid) {
        if (reason === "reuse") {
          // grace 만료 후의 stale 토큰 — 해당 요청만 거절한다.
          // 주의: 여기서 키를 삭제하면 stale 세션의 마지막 시도가 현재 활성
          // 세션까지 죽이는 연쇄 킬이 발생한다 (2026-06-11 로그로 실증).
          // 키 비삭제 시에도 stale 토큰으로는 어떤 토큰도 재발급되지 않는다.
          this.logger.warn(
            `⚠️ Stale refresh token rejected for user: ${decoded.sub} (session: ${sessionId ?? "legacy"})`,
          );
          throw new UnauthorizedException(
            "세션이 만료되었습니다. 다시 로그인해주세요.",
          );
        }
        // reason === 'missing': Redis에 토큰 없음 (Redis 재시작/TTL 만료/로그아웃)
        // 보안 강화: Redis에 토큰이 없으면 재발급 거부, 재로그인 요구
        this.logger.warn(
          `⚠️ Redis refresh token missing for user: ${decoded.sub}. ` +
            `세션이 유효하지 않으므로 재발급 거부. 재로그인 필요.`,
        );
        throw new UnauthorizedException(
          "세션이 만료되었습니다. 다시 로그인해주세요.",
        );
      }

      // DB user 존재/상태 검증 — 토큰은 valid 해도 계정이 삭제·탈퇴된 경우
      // 새 토큰을 발급하면 cookie 가 계속 valid 로 유지돼 middleware 가
      // /login → 대시보드 리다이렉트를 반복하는 무한 루프가 발생함.
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        select: { id: true, status: true, tokenVersion: true },
      });
      if (!user) {
        await this.revokeRefreshToken(decoded.sub);
        throw new UnauthorizedException({
          message: "사용자를 찾을 수 없습니다.",
          error: "USER_NOT_FOUND",
        });
      }
      if (user.status === "WITHDRAWN") {
        await this.revokeRefreshToken(decoded.sub);
        throw new UnauthorizedException({
          message: "탈퇴 처리된 계정입니다. 새로운 계정으로 가입해주세요.",
          error: "WITHDRAWN_ACCOUNT",
        });
      }

      // tokenVersion 검증 — force login/logoutAll 로 강제 종료된 세션의
      // refresh 토큰으로는 재발급 자체를 차단한다 (구버전 access 차단과 대칭).
      //
      // [2026-06-19] 로컬 dev 동시 로그인 허용 환경에서는 건너뛴다. tokenVersion 은
      //   공유 DEV DB 전역값이라, 단일 세션 정책이 켜진 다른 환경이 같은 계정으로
      //   로그인하면 증가해 로컬 dev 세션의 refresh 가 무효화되는 회귀를 차단한다.
      //   운영은 isConcurrentLoginAllowed()=false 라 검증 그대로 유지(보안 영향 0).
      if (
        !this.isConcurrentLoginAllowed() &&
        decoded.tokenVersion != null &&
        user.tokenVersion != null &&
        decoded.tokenVersion !== user.tokenVersion
      ) {
        throw new UnauthorizedException(
          "다른 기기에서 로그인되어 세션이 종료되었습니다. 다시 로그인해주세요.",
        );
      }

      // 멱등 grace — previous 토큰의 동시 갱신 경합. 새로 회전하지 않고
      // access 만 재발급 + refresh 는 기존 current 반환 → 모든 탭이 동일
      // 토큰으로 수렴해 localStorage 쓰기 경합·체인 회전을 차단한다.
      if (gracedCurrent) {
        // legacy 토큰(jti 없음)이면 null 전달 — access 에 무작위 새 jti 가
        // 부여되어 refresh(legacy 키)와 불일치하는 것을 방지.
        const { accessToken } = this.generateTokens(
          decoded.sub,
          decoded.userType as UserType,
          decoded.name ?? "",
          user.tokenVersion,
          sessionId ?? null,
        );
        this.logger.debug(
          `🟡 Idempotent grace refresh for user: ${decoded.sub} (no rotation)`,
        );
        return { accessToken, refreshToken: gracedCurrent };
      }

      // Generate new tokens — sessionId(jti) 유지로 세션 연속성 보장.
      // 구토큰(jti 없음)은 새 jti 발급 → 세션 키 체계로 점진 마이그레이션.
      const {
        accessToken,
        refreshToken: newRefreshToken,
        sessionId: newSessionId,
      } = this.generateTokens(
        decoded.sub,
        decoded.userType as UserType,
        decoded.name ?? "",
        user.tokenVersion,
        sessionId,
      );

      // 새 refresh token 저장 — storeRefreshToken 이 기존 current 를 previous 로
      // 백업하므로 Grace Window 가 동시 갱신 경합을 허용한다.
      await this.storeRefreshToken(decoded.sub, newRefreshToken, newSessionId);

      // legacy → 세션 키 마이그레이션 브릿지: 구토큰 회전 시 legacy 키에도
      // 새 토큰을 기록해, 같은 브라우저의 다른 탭이 들고 있는 구토큰이
      // grace window 동안 legacy 키의 previous 로 수렴할 수 있게 한다.
      // 이후 갱신은 모두 세션 키 경로만 사용하므로 legacy 키는 TTL 로 소멸.
      if (!sessionId) {
        await this.storeRefreshToken(decoded.sub, newRefreshToken);
      }

      this.logger.debug(`🔄 Token rotated for user: ${decoded.sub}`);

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("유효하지 않은 refresh token입니다.");
    }
  }

  /**
   * User에서 이름 추출 (lastName + firstName 조합)
   */
  private extractName(user: { firstName?: string; lastName?: string }): string {
    if (user.lastName && user.firstName) {
      return `${user.lastName}${user.firstName}`;
    }
    return user.firstName ?? user.lastName ?? "";
  }

  /**
   * Generate JWT Tokens
   * Creates both access and refresh tokens
   *
   * ⚡ access/refresh 토큰을 단일 패스에서 동기 sign — config 조회는 미리 1회만.
   * jwtService.sign 자체는 동기 함수이므로 Promise.all 병렬화는 의미 없으나,
   * config 조회를 사전 캐시하여 호출 횟수 절반으로 줄임 (~1ms 절감 + 가독성).
   */
  private generateTokens(
    userId: string,
    userType: UserType,
    name = "",
    tokenVersion = 1,
    sessionId?: string | null,
  ) {
    const iat = Math.floor(Date.now() / 1000);
    // jti = 세션 ID. 로그인 시 1회 발급되고 rotation 동안 유지된다.
    // Redis refresh 키를 세션별로 분리하는 식별자 (access 에도 포함 — logout 시 자기 세션 특정).
    //  - undefined: 새 세션 (login/register/social) → 새 uuid 발급
    //  - null:      legacy 세션 (jti 없는 구토큰의 멱등 grace) → jti 미부여.
    //               logout 시 revokeSessionRefreshToken 이 legacy 키로 폴백한다.
    const jti = sessionId === null ? undefined : (sessionId ?? uuidv4());
    const payload = { sub: userId, userType, name, tokenVersion, iat, jti };

    const accessTokenExpiration = parseInt(
      this.configService.get<string>("JWT_EXPIRATION", "1800"),
      10,
    );
    const refreshTokenExpiration = parseInt(
      this.configService.get<string>("JWT_REFRESH_EXPIRATION", "604800"),
      10,
    );
    const jwtSecret = this.configService.get<string>("JWT_SECRET");
    const refreshSecret =
      this.configService.get<string>("JWT_REFRESH_SECRET") || jwtSecret;

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: accessTokenExpiration,
    });
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: "refresh" },
      { secret: refreshSecret, expiresIn: refreshTokenExpiration },
    );

    return { accessToken, refreshToken, sessionId: jti };
  }

  /**
   * Validate User for Passport
   * Used by JWT strategy to validate token payload
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        userType: true,
        status: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      // errorCode 부여 → 클라이언트가 토큰 갱신 시도 없이 즉시 정리 + 로그인 유도
      throw new UnauthorizedException({
        message: "사용자를 찾을 수 없습니다.",
        error: "USER_NOT_FOUND",
      });
    }

    // 탈퇴 완료된 사용자는 인증 차단
    if (user.status === "WITHDRAWN") {
      throw new UnauthorizedException({
        message: "탈퇴 처리된 계정입니다. 새로운 계정으로 가입해주세요.",
        error: "WITHDRAWN_ACCOUNT",
      });
    }

    return user;
  }

  /**
   * Logout - JWT 토큰을 블랙리스트에 추가
   */
  async logout(userId: string, accessToken: string, deviceId?: string) {
    try {
      // JWT 토큰 블랙리스트에 추가
      await this.blacklistToken(accessToken);

      // 자기 세션의 refresh 토큰만 삭제 — 같은 계정의 다른 기기 세션은 보존.
      // (이전: 계정 단일 키 전체 삭제 → 다른 기기까지 강제 로그아웃되는 결함)
      const decoded = this.jwtService.decode<JwtPayload | null>(accessToken);
      await this.revokeSessionRefreshToken(userId, decoded?.jti);

      // [2026-06-20] 이 디바이스의 푸시 등록(UserDevice) 비활성화.
      //   로그아웃 후에도 active row 가 남아 발생하던 푸시 누수/orphan 을 차단한다.
      //   deviceId(앱 안정 식별자, x-device-id 헤더)가 오면 그 디바이스만 정확히 끔.
      //   구버전 앱은 미전송 → no-op(하위호환). 앱은 별도로 DELETE /devices/:id 도 호출.
      const did = deviceId?.trim();
      if (did) {
        await this.prisma.userDevice.updateMany({
          where: { userId, deviceId: did, isActive: true },
          data: { isActive: false },
        });
      }

      this.logger.log(`✅ User logged out: ${userId}`);

      return {
        message: "로그아웃되었습니다.",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Logout failed: ${errorMessage}`);
      throw new BadRequestException("로그아웃에 실패했습니다.");
    }
  }

  /**
   * Logout All - 모든 기기에서 로그아웃
   *
   * - 현재 access token 블랙리스트 등록 (즉시 차단)
   * - refresh token 폐기 → 모든 기기 재발급 차단(다음 갱신 시점)
   * - User.tokenVersion +1 → 다른 기기에 살아있는 access token 즉시 무효화
   *   (jwt.strategy.validate 에서 payload.tokenVersion ≠ user.tokenVersion → 401)
   */
  async logoutAll(userId: string, accessToken: string) {
    try {
      await this.blacklistToken(accessToken);
      await this.revokeRefreshToken(userId);
      await this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });

      // [2026-06-20] 모든 기기 로그아웃 — 이 user 의 모든 활성 디바이스 푸시 등록 비활성화.
      await this.prisma.userDevice.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });

      this.logger.log(`✅ User logged out from all devices: ${userId}`);

      return {
        message: "모든 기기에서 로그아웃되었습니다.",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Logout-all failed: ${errorMessage}`);
      throw new BadRequestException("로그아웃에 실패했습니다.");
    }
  }

  /**
   * Redis 키 헬퍼 — `configService.get("redis")` 반복 호출 제거
   *
   * 시그니처:
   * - getJwtKey(token): `${keyPrefix.jwt}${token}` → 블랙리스트 키
   * - getRefreshKey(userId): `${keyPrefix.refresh}${userId}` → 리프레시 토큰 키
   *
   * 외부 동작/Redis 키 포맷 변경 없음 (기존 prefix 그대로 사용).
   */
  private getJwtKey(token: string): string {
    const keyPrefix = this.configService.get("redis").keyPrefix.jwt;
    return `${keyPrefix}${token}`;
  }

  private getRefreshKey(userId: string): string {
    const keyPrefix = this.configService.get("redis").keyPrefix.refresh;
    return `${keyPrefix}${userId}`;
  }

  /**
   * 세션별 refresh 키 — `refresh:{userId}:{sessionId(jti)}`
   *
   * 세션(기기)마다 독립 키를 사용해 다중 세션이 서로의 rotation 을
   * 간섭하지 못하게 한다. jti 없는 구토큰은 legacy 단일 키로 폴백.
   */
  private getSessionRefreshKey(userId: string, sessionId: string): string {
    return `${this.getRefreshKey(userId)}:${sessionId}`;
  }

  private getSessionRefreshPattern(userId: string): string {
    return `${this.getRefreshKey(userId)}:*`;
  }

  /**
   * JWT 토큰을 블랙리스트에 추가
   */
  private async blacklistToken(token: string) {
    const ttl = this.configService.get("redis").cacheTTL.jwtBlacklist;
    await this.redisService.set(this.getJwtKey(token), "blacklisted", ttl);
  }

  /**
   * JWT 토큰이 블랙리스트에 있는지 확인
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    return await this.redisService.exists(this.getJwtKey(token));
  }

  /**
   * 리프레시 토큰을 Redis에 저장 (Rotation + Grace Window)
   *
   * 기존 저장값을 previous로 백업하여 validateRefreshTokenSafe에서
   * rotation race condition 방어에 사용한다.
   */
  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    sessionId?: string,
  ) {
    const ttl = this.configService.get("redis").cacheTTL.refreshToken;

    const key = sessionId
      ? this.getSessionRefreshKey(userId, sessionId)
      : this.getRefreshKey(userId);
    // Backward compatibility: 기존 string 값이면 current만 읽어 previous로 백업
    const stored = await this.redisService.get<RefreshTokenRecord | string>(
      key,
    );
    const previous = typeof stored === "string" ? stored : stored?.current;

    const record: RefreshTokenRecord = {
      current: refreshToken,
      previous,
      rotatedAt: Date.now(),
    };
    await this.redisService.set(key, record, ttl);
  }

  /**
   * 리프레시 토큰 안전 검증 — Rotation + Grace Window + Redis 유실 구분
   *
   * - isValid=true: current 일치
   * - isValid=true + gracedCurrent: previous 일치 + grace window 이내.
   *   호출부는 새로 회전하지 말고 gracedCurrent(기존 current)를 멱등 반환해
   *   다중 탭이 동일 토큰으로 수렴하게 한다 (체인 회전 → reuse 오판 차단).
   * - isValid=false, reason='reuse': grace window 만료 후 이전 토큰 사용
   * - isValid=false, reason='missing': Redis에 토큰 없음 (재시작/TTL/강제 로그아웃)
   *
   * sessionId(jti)가 있으면 세션별 키, 없으면 legacy 단일 키를 본다.
   * Redis missing 거부 정책은 유지 — 관리자 Redis 청소로 강제 로그아웃 도구 보존.
   */
  private async validateRefreshTokenSafe(
    userId: string,
    refreshToken: string,
    sessionId?: string,
  ): Promise<{
    isValid: boolean;
    reason?: "reuse" | "missing";
    gracedCurrent?: string;
  }> {
    const key = sessionId
      ? this.getSessionRefreshKey(userId, sessionId)
      : this.getRefreshKey(userId);
    const stored = await this.redisService.get<RefreshTokenRecord | string>(
      key,
    );

    // Redis missing — 운영 도구(강제 로그아웃) 동작 유지
    if (stored === null || stored === undefined) {
      return { isValid: false, reason: "missing" };
    }

    // Backward compatibility: 기존 string 값은 current 일치만 허용 (grace 불가)
    if (typeof stored === "string") {
      return stored === refreshToken
        ? { isValid: true }
        : { isValid: false, reason: "reuse" };
    }

    // 정상: current 일치
    if (stored.current === refreshToken) {
      return { isValid: true };
    }

    // Grace Window: rotation 후 REFRESH_GRACE_MS 이내면 previous 허용.
    // 단 새 토큰을 발급하지 않고 기존 current 로 수렴시킨다 (멱등 grace).
    const isGrace =
      stored.previous === refreshToken &&
      Date.now() - stored.rotatedAt < REFRESH_GRACE_MS;
    if (isGrace) {
      this.logger.debug(`🟡 Grace window refresh accepted for user: ${userId}`);
      return { isValid: true, gracedCurrent: stored.current };
    }

    // grace window 만료 후 이전 토큰 사용 (stale 세션 또는 재사용 공격)
    return { isValid: false, reason: "reuse" };
  }

  /**
   * 사용자의 모든 refresh 세션 폐기 (legacy 단일 키 + 세션별 키 전체)
   *
   * 사용처: logoutAll · 강제 단일 세션 교체(force login) · 탈퇴/계정 무효.
   * 개별 세션만 끝낼 때는 revokeSessionRefreshToken 을 사용한다.
   */
  private async revokeRefreshToken(userId: string) {
    await this.redisService.del(this.getRefreshKey(userId));
    await this.redisService.delByPattern(this.getSessionRefreshPattern(userId));
  }

  /**
   * 단일 세션의 refresh 토큰만 폐기 (로그아웃 시 — 다른 기기 세션 보존)
   */
  private async revokeSessionRefreshToken(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.redisService.del(
        this.getSessionRefreshKey(userId, sessionId),
      );
    } else {
      // jti 없는 구토큰 세션 — legacy 키만 삭제
      await this.redisService.del(this.getRefreshKey(userId));
    }
  }

  /**
   * 동시 세션 정책 — 활성 refresh 세션 존재 여부 (legacy + 세션 키)
   */
  private async hasAnySession(userId: string): Promise<boolean> {
    if (await this.redisService.exists(this.getRefreshKey(userId))) {
      return true;
    }
    const keys = await this.redisService.keysByPattern(
      this.getSessionRefreshPattern(userId),
    );
    return keys.length > 0;
  }

  /**
   * 동시 세션 허용 여부 — 개발 환경 전용 화이트리스트 (ENABLE_DEV_LOGIN 패턴)
   *
   * NODE_ENV=production 이면 플래그가 남아있어도 무시된다 (실운영 이중 안전망).
   * 기본값(미설정)은 단일 세션 정책.
   */
  private isConcurrentLoginAllowed(): boolean {
    return (
      process.env.NODE_ENV === "development" &&
      process.env.AUTH_ALLOW_CONCURRENT_LOGIN === "true"
    );
  }

  /**
   * 프로필 조회
   */
  async getProfile(userId: string) {
    // BE-036 후속 (2026-04-22): Connection pool 경합 완화
    // - 기존: Promise.all 5개 쿼리 (connection_limit=5 pool 전체 점유)
    // - 개선: user 선행 조회로 빠른 실패 + 중복 clubMember 쿼리 제거 + 병렬도 3으로 축소
    //   coachMembers(approved+roleInTeam)는 allMemberships 결과에서 filter로 derive
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        userType: true,
        birthDate: true,
        gender: true,
        zipCode: true,
        address: true,
        addressDetail: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 관련 데이터 병렬 조회 (5→3 축소)
    const [allMemberships, coachProfiles, parentChildLinks] = await Promise.all(
      [
        // C-8 겸직 지원: 전체 클럽 멤버십 (승인 상태 포함)
        // PRIMARY coachMembers(approved+roleInTeam)는 이 결과에서 filter로 derive
        this.prisma.teamMember.findMany({
          where: { userId, leftAt: null },
          select: {
            id: true,
            roleInTeam: true,
            approvalStatus: true,
            joinedAt: true,
            team: { select: { id: true, name: true } },
          },
          orderBy: { joinedAt: "desc" },
        }),
        // FALLBACK: CoachProfile (roleInTeam 미설정 기존 데이터 대비)
        this.prisma.coachProfile.findMany({
          where: { userId },
          select: {
            team: {
              select: { id: true, name: true, coachId: true },
            },
          },
        }),
        this.prisma.parentChild.findMany({
          where: { parentId: userId },
          select: {
            child: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                birthDate: true,
              },
            },
          },
        }),
      ],
    );

    // PRIMARY coachMembers: allMemberships에서 filter (중복 DB 쿼리 제거)
    // PARENT 도입 후 학부모가 코치 권한을 갖지 않도록 roleInTeam을 명시적으로 필터링
    const coachMembers = allMemberships.filter(
      (m) =>
        m.approvalStatus === "approved" &&
        (m.roleInTeam === "COACH" || m.roleInTeam === "HEAD_COACH"),
    );

    const name = this.extractName(user);

    // ClubMember.roleInTeam 우선, CoachProfile은 미설정 클럽에 대한 폴백
    const coachRolesFromMember = coachMembers
      .filter((cm) => cm.team !== null)
      .map((cm) => ({
        teamId: cm.team!.id,
        teamName: cm.team!.name,
        roleInTeam: cm.roleInTeam as "HEAD_COACH" | "COACH",
      }));

    const assignedClubIds = new Set(coachRolesFromMember.map((r) => r.teamId));
    const coachRolesFromProfile = coachProfiles
      .filter((p) => p.team !== null && !assignedClubIds.has(p.team!.id))
      .map((p) => ({
        teamId: p.team!.id,
        teamName: p.team!.name,
        roleInTeam: (p.team!.coachId === userId ? "HEAD_COACH" : "COACH") as
          | "HEAD_COACH"
          | "COACH",
      }));

    const coachRoles = [...coachRolesFromMember, ...coachRolesFromProfile];

    const parentChildren = parentChildLinks.map((pc) => ({
      id: pc.child.id,
      name: this.extractName(pc.child),
      birthYear: pc.child.birthDate
        ? new Date(pc.child.birthDate).getFullYear()
        : null,
    }));

    // C-8 겸직: 클럽 멤버십 전체 (useUserRoles Stage 2)
    const clubMemberships = allMemberships.map((m) => ({
      memberId: m.id,
      teamId: m.team.id,
      teamName: m.team.name,
      roleInTeam: m.roleInTeam ?? null,
      approvalStatus: m.approvalStatus,
      joinedAt: m.joinedAt,
    }));

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      birthDate: user.birthDate,
      gender: user.gender,
      zipCode: user.zipCode,
      address: user.address,
      addressDetail: user.addressDetail,
      avatarUrl: user.avatarUrl,
      name,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      coachRoles,
      parentChildren,
      clubMemberships,
    };
  }

  /**
   * 프로필 수정
   */
  async updateProfile(userId: string, updateData: UpdateProfileDto) {
    // Check if email or phone is already taken by another user
    if (updateData.email || updateData.phone) {
      const orConditions = [
        ...(updateData.email ? [{ email: updateData.email }] : []),
        ...(updateData.phone ? [{ phone: updateData.phone }] : []),
      ];

      if (orConditions.length > 0) {
        const existingUser = await this.prisma.user.findFirst({
          where: {
            AND: [{ id: { not: userId } }, { OR: orConditions }],
          },
        });

        if (existingUser) {
          if (updateData.email && existingUser.email === updateData.email) {
            throw new BadRequestException("이미 사용 중인 이메일입니다.");
          }
          if (updateData.phone && existingUser.phone === updateData.phone) {
            throw new BadRequestException("이미 사용 중인 휴대폰 번호입니다.");
          }
        }
      }
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(updateData.email && { email: updateData.email }),
          ...(updateData.phone && { phone: updateData.phone }),
          ...(updateData.firstName && { firstName: updateData.firstName }),
          ...(updateData.lastName && { lastName: updateData.lastName }),
          ...(updateData.birthDate && {
            birthDate: new Date(updateData.birthDate),
          }),
          ...(updateData.gender !== undefined && { gender: updateData.gender }),
          ...(updateData.zipCode !== undefined && {
            zipCode: updateData.zipCode,
          }),
          ...(updateData.address !== undefined && {
            address: updateData.address,
          }),
          ...(updateData.addressDetail !== undefined && {
            addressDetail: updateData.addressDetail,
          }),
          updatedId: userId,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          userType: true,
          birthDate: true,
          gender: true,
          zipCode: true,
          address: true,
          addressDetail: true,
          updatedAt: true,
        },
      });

      this.logger.log(`✅ Profile updated: ${updatedUser.email}`);

      return {
        ...updatedUser,
        message: "프로필이 수정되었습니다.",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Profile update failed: ${errorMessage}`);
      throw new BadRequestException("프로필 수정에 실패했습니다.");
    }
  }

  /**
   * 비밀번호 변경
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // Get user with password hash
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException("현재 비밀번호가 일치하지 않습니다.");
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException(
        "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      this.logger.log(`✅ Password changed: ${user.email}`);

      return {
        message: "비밀번호가 변경되었습니다.",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Password change failed: ${errorMessage}`);
      throw new BadRequestException("비밀번호 변경에 실패했습니다.");
    }
  }

  /**
   * 회원가입 (프론트엔드 형식 지원)
   * 프론트엔드의 signup 엔드포인트 → register 로직과 연동
   */
  async signup(signupData: SignupDto) {
    if (!signupData.agreements.terms || !signupData.agreements.privacy) {
      throw new BadRequestException("필수 약관에 동의해주세요.");
    }

    return this.register({
      email: signupData.email,
      phone: signupData.phone,
      firstName: signupData.firstName,
      lastName: signupData.lastName,
      password: signupData.password,
      userType: signupData.userType ?? UserType.PARENT,
      birthDate: signupData.birthDate,
      gender: signupData.gender,
      zipCode: signupData.zipCode,
      address: signupData.address,
      addressDetail: signupData.addressDetail,
      identityVerificationId: signupData.identityVerificationId,
      clubInfo: signupData.clubInfo
        ? {
            name: signupData.clubInfo.clubName,
            location: signupData.clubInfo.location,
            venueId: signupData.clubInfo.venueId,
          }
        : undefined,
      academyInfo: signupData.academyInfo,
      teamId: signupData.teamId,
      teamCode: signupData.teamCode,
    });
  }

  /**
   * 아이디(이메일) 찾기
   * 이름과 휴대폰 번호로 등록된 이메일 조회
   */
  async findId(name: string, phone: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        phone,
        OR: [
          { firstName: { contains: name } },
          { lastName: { contains: name } },
        ],
      },
      select: { email: true, createdAt: true },
    });

    if (!user) {
      throw new NotFoundException(
        "입력하신 정보와 일치하는 계정을 찾을 수 없습니다.",
      );
    }

    // 이메일 마스킹 (개인정보 보호)
    const maskedEmail = this.maskEmail(user.email);

    return {
      email: maskedEmail,
      createdAt: user.createdAt,
    };
  }

  /**
   * [2026-06-17] 본인인증(IdentityVerification) → 가입 계정 조회 공통 헬퍼.
   *  ciHash(결정적 HMAC) 우선, 레거시(ciHash 없음)는 본인인증 휴대폰으로 폴백.
   *  인증 미완료/만료는 예외, 일치 계정 없으면 null 반환(가입 이력 없음 판별은 호출부 책임).
   */
  private async resolveUserFromIdentity(identityVerificationId: string) {
    const verification = await this.prisma.identityVerification.findUnique({
      where: { requestId: identityVerificationId },
    });
    if (
      !verification ||
      verification.status !== "completed" ||
      !verification.verifiedAt
    ) {
      throw new BadRequestException("본인인증을 먼저 완료해주세요.");
    }
    if (verification.expiresAt && verification.expiresAt < new Date()) {
      throw new BadRequestException(
        "본인인증 유효 시간이 만료되었습니다. 다시 인증해주세요.",
      );
    }

    let user: { id: string; email: string; createdAt: Date } | null = null;
    if (verification.ciHash) {
      user = await this.prisma.user.findFirst({
        where: { ciHash: verification.ciHash },
        select: { id: true, email: true, createdAt: true },
      });
    }
    if (!user && verification.verifiedPhone) {
      const phone = verification.verifiedPhone.replace(/[^0-9]/g, "");
      if (phone.length >= 10) {
        user = await this.prisma.user.findUnique({
          where: { phone },
          select: { id: true, email: true, createdAt: true },
        });
      }
    }
    return user;
  }

  /**
   * [2026-06-17] 본인인증(휴대폰) 기반 아이디 찾기.
   *  가입 이력 있으면 아이디(로그인 ID)를 그대로 반환, 없으면 found:false. 메일 발송 없음.
   *  본인인증으로 신원이 증명되었으므로 아이디는 마스킹 없이 노출한다.
   */
  async findIdByIdentity(identityVerificationId: string) {
    const user = await this.resolveUserFromIdentity(identityVerificationId);
    if (!user) {
      return { found: false as const };
    }
    return {
      found: true as const,
      loginId: user.email,
      createdAt: user.createdAt,
    };
  }

  /**
   * [2026-06-17] 본인인증(휴대폰) 기반 비밀번호 재설정 — 임시 비밀번호를 사용자가 입력한 이메일로 발송.
   *  흐름: 휴대폰 본인인증 완료 → 사용자가 받을 이메일 입력 → 계정 확인되면 임시 비밀번호 발급(bcrypt 저장) + 해당 이메일로 발송.
   *  email 은 발송받을 주소(가입 아이디와 무관) · 비밀번호 평문 저장 불가 → 임시 비밀번호 신규 발급 · 발급 시 tokenVersion +1 로 기존 세션 무효화.
   */
  async findAccountAndSendCredentials(
    identityVerificationId: string,
    email: string,
  ) {
    const user = await this.resolveUserFromIdentity(identityVerificationId);
    if (!user) {
      throw new NotFoundException(
        "본인인증 정보와 일치하는 가입 이력을 찾을 수 없습니다.",
      );
    }

    // 임시 비밀번호 발급 + bcrypt 저장 + 기존 세션 무효화.
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, this.SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    const dest = email.trim();
    const text =
      `[TEAMPLUS] 임시 비밀번호 안내\n\n` +
      `아이디: ${user.email}\n` +
      `임시 비밀번호: ${tempPassword}\n\n` +
      `로그인 후 반드시 비밀번호를 변경해주세요.\n` +
      `본인이 요청하지 않았다면 고객센터로 문의해주세요.`;
    const sent = await this.mailService.sendText(
      dest,
      "[TEAMPLUS] 임시 비밀번호 안내",
      text,
    );
    this.logger.log(
      `✅ Temp password mailed to ${this.maskEmail(dest)} (account=${this.maskEmail(user.email)}, sent=${sent})`,
    );

    return {
      message: "입력하신 이메일로 임시 비밀번호를 발송했습니다.",
    };
  }

  /** 임시 비밀번호 생성 — 영문 대/소문자 + 숫자 + 특수문자 각 1자 이상 포함(12자). */
  private generateTempPassword(): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const digit = "23456789";
    const special = "!@#$%^&*";
    const all = upper + lower + digit + special;
    const pick = (set: string) => set[randomInt(0, set.length)];
    const base = [pick(upper), pick(lower), pick(digit), pick(special)];
    for (let i = base.length; i < 12; i += 1) base.push(pick(all));
    // Fisher–Yates 셔플 (randomInt 사용).
    for (let i = base.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      [base[i], base[j]] = [base[j], base[i]];
    }
    return base.join("");
  }

  /**
   * 비밀번호 재설정 인증코드 발송
   * Redis에 6자리 코드 저장 (5분 유효), SMS로 OTP 발송
   */
  async sendPasswordResetCode(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, phone: true },
    });

    if (!user) {
      // 보안: 이메일 존재 여부 노출 방지 (항상 성공 메시지 반환)
      return { message: "인증코드가 발송되었습니다." };
    }

    const code = randomInt(100000, 1000000).toString();
    const key = `pwd_reset:${email}`;

    await this.redisService.set(key, code, 300); // 5분 유효

    // SMS로 OTP 발송 (phone이 소셜 로그인 임시 번호가 아닌 경우)
    if (user.phone && !user.phone.startsWith("social_")) {
      try {
        await this.smsService.sendVerificationCode({
          phone: user.phone,
          purpose: "reset-password",
        });
        this.logger.log(`비밀번호 재설정 OTP 발송: ${email}`);
      } catch (smsError: unknown) {
        // SMS 발송 실패 시에도 Redis에는 코드가 저장되어 있음
        // 개발 환경에서는 로그로 확인 가능하도록 유지
        this.logger.warn(
          `비밀번호 재설정 SMS 발송 실패: ${email} — ${smsError instanceof Error ? smsError.message : String(smsError)}`,
        );
      }
    }

    // 개발 환경에서는 로그로 코드 확인 가능
    if (process.env.NODE_ENV !== "production") {
      this.logger.log(`[DEV] 비밀번호 재설정 코드: ${code} (${email})`);
    }

    return { message: "인증코드가 발송되었습니다." };
  }

  /**
   * 비밀번호 재설정
   * 인증코드 검증 후 새 비밀번호 설정
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    const key = `pwd_reset:${email}`;
    const storedCode = await this.redisService.get<string>(key);

    if (!storedCode || storedCode !== code) {
      throw new BadRequestException(
        "인증코드가 올바르지 않거나 만료되었습니다.",
      );
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    await this.redisService.del(key);

    this.logger.log(`✅ Password reset: ${email}`);

    return { message: "비밀번호가 변경되었습니다." };
  }

  /**
   * 이메일 중복 확인
   */
  async checkEmailExists(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return { exists: !!user };
  }

  /**
   * 휴대폰 번호 중복 확인
   */
  async checkPhoneExists(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    return { exists: !!user };
  }

  /**
   * 소셜 로그인 (Kakao/Google)
   *
   * [비활성 2026-06-10] 공개 라우트(POST /auth/social/:provider)가 소셜 로그인 전면
   * 제거(Apple 4.8 의무 해소)로 삭제되어 현재 호출 경로 없음. 소셜 로그인 복원 시
   * Sign in with Apple 동시 제공 필수(4.8). 연결 계정 조회/해제·탈퇴 revoke 는 별도 메서드.
   *
   * 플로우:
   * 1. 소셜 서비스 API로 토큰 검증 + 사용자 정보 조회
   * 2. SocialAccount 테이블에서 provider+socialId로 기존 연동 조회
   * 3. 연동 있으면 → 해당 User로 JWT 발급
   * 4. 연동 없으면 → 이메일로 기존 사용자 조회
   *    - 있으면 → SocialAccount 연결 후 JWT 발급
   *    - 없으면 → User 자동 생성 + SocialAccount 연결 후 JWT 발급
   */
  async socialLogin(
    provider: string,
    token: string,
    authorizationCode?: string,
  ) {
    this.logger.log(`소셜 로그인 시도: ${provider}`);

    // 1. 소셜 서비스에서 사용자 정보 조회
    const socialUser = await this.getSocialUserInfo(provider, token);

    // 1-1. [iOS 5.1.1(v)] Apple authorizationCode → refresh_token 교환.
    //   계정 삭제(탈퇴) 시 Apple 토큰 revoke 에 사용하기 위해 저장한다.
    //   교환 실패/미설정 시 null — 로그인 흐름은 정상 진행(graceful degradation).
    let appleRefreshToken: string | null = null;
    if (socialUser.provider === "apple" && authorizationCode) {
      appleRefreshToken =
        await this.appleTokenService.exchangeAuthorizationCode(
          authorizationCode,
        );
    }

    // 2. 기존 소셜 연동 조회
    const existingAccount = await this.prisma.socialAccount.findUnique({
      where: {
        provider_socialId: {
          provider: socialUser.provider,
          socialId: socialUser.socialId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
            tokenVersion: true,
          },
        },
      },
    });

    if (existingAccount) {
      // 기존 연동 사용자 → JWT 발급
      // 소셜 로그인은 콜백 플로우 중간에 확인 모달을 띄울 수 없어
      // 단일 세션 정책에서 "조용히 교체"(기존 세션 폐기)로 동작한다.
      if (!this.isConcurrentLoginAllowed()) {
        await this.revokeRefreshToken(existingAccount.user.id);
      }
      const name = this.extractName(existingAccount.user);
      const { accessToken, refreshToken, sessionId } = this.generateTokens(
        existingAccount.user.id,
        existingAccount.user.userType,
        name,
        existingAccount.user.tokenVersion,
      );
      await this.storeRefreshToken(
        existingAccount.user.id,
        refreshToken,
        sessionId,
      );

      // 기존 연동에도 새 Apple refresh_token 이 있으면 갱신 저장(탈퇴 시 revoke 용)
      if (appleRefreshToken) {
        await this.prisma.socialAccount.update({
          where: { id: existingAccount.id },
          data: { appleRefreshToken },
        });
      }

      this.logger.log(
        `소셜 로그인 성공 (기존 연동): ${existingAccount.user.email} via ${provider}`,
      );
      this.logger_.logAuthEvent("login_success", {
        userId: existingAccount.user.id,
        provider,
        isNewUser: false,
      });

      return {
        user: {
          id: existingAccount.user.id,
          email: existingAccount.user.email,
          firstName: existingAccount.user.firstName,
          lastName: existingAccount.user.lastName,
          userType: existingAccount.user.userType,
          name,
        },
        accessToken,
        refreshToken,
        isNewUser: false,
      };
    }

    // 3. 이메일로 기존 사용자 조회 (소셜 이메일이 있는 경우)
    let user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      userType: UserType;
      tokenVersion: number;
    } | null = null;

    if (socialUser.email) {
      user = await this.prisma.user.findUnique({
        where: { email: socialUser.email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          tokenVersion: true,
        },
      });
    }

    // 4. 트랜잭션으로 사용자 생성(필요 시) + 소셜 계정 연동
    const result = await this.prisma.$transaction(async (tx) => {
      let isNewUser = false;

      if (!user) {
        // 신규 사용자 생성
        if (!socialUser.email) {
          throw new BadRequestException(
            "소셜 계정에 이메일 정보가 없습니다. 이메일 제공에 동의해주세요.",
          );
        }

        const randomPassword = uuidv4();
        const passwordHash = await bcrypt.hash(
          randomPassword,
          this.SALT_ROUNDS,
        );

        // 소셜 이름 분리: 첫 글자=성, 나머지=이름
        const socialName = socialUser.name || "";
        const derivedLastName =
          socialName.length > 0 ? socialName.charAt(0) : "소";
        const derivedFirstName =
          socialName.length > 1 ? socialName.slice(1) : "셜사용자";

        user = await tx.user.create({
          data: {
            email: socialUser.email,
            phone: `social_${provider}_${socialUser.socialId}`,
            firstName: derivedFirstName,
            lastName: derivedLastName,
            passwordHash,
            userType: UserType.PARENT,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            userType: true,
            tokenVersion: true,
          },
        });
        isNewUser = true;
      }

      // 소셜 계정 연동
      await tx.socialAccount.create({
        data: {
          userId: user!.id,
          provider: socialUser.provider,
          socialId: socialUser.socialId,
          email: socialUser.email,
          name: socialUser.name,
          profileImage: socialUser.profileImage,
          appleRefreshToken, // Apple 전용 — 그 외 provider 는 null (탈퇴 시 revoke 용)
        },
      });

      return { user: user!, isNewUser };
    });

    // 소셜 로그인 — 단일 세션 정책에서 "조용히 교체" (모달 불가 플로우)
    if (!this.isConcurrentLoginAllowed()) {
      await this.revokeRefreshToken(result.user.id);
    }
    const name = this.extractName(result.user);
    const { accessToken, refreshToken, sessionId } = this.generateTokens(
      result.user.id,
      result.user.userType,
      name,
      result.user.tokenVersion,
    );
    await this.storeRefreshToken(result.user.id, refreshToken, sessionId);

    this.logger.log(
      `소셜 로그인 성공 (${result.isNewUser ? "신규 가입" : "계정 연동"}): ${result.user.email} via ${provider}`,
    );
    this.logger_.logAuthEvent("login_success", {
      userId: result.user.id,
      provider,
      isNewUser: result.isNewUser,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        userType: result.user.userType,
        name,
      },
      accessToken,
      refreshToken,
      isNewUser: result.isNewUser,
    };
  }

  /**
   * 연결된 소셜 계정 목록 조회
   */
  async getSocialAccounts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    const socialAccounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        email: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return { socialAccounts };
  }

  /**
   * 소셜 계정 연결 해제
   *
   * 안전 검증:
   * 1. 해당 소셜 계정이 존재하는지 확인
   * 2. 사용자가 다른 로그인 수단을 보유하고 있는지 확인
   *    - 일반 회원가입 사용자 (phone이 social_로 시작하지 않음) → 해제 가능
   *    - 소셜 전용 사용자 → 다른 소셜 계정이 1개 이상 있어야 해제 가능
   * 3. SocialAccount 삭제
   */
  async disconnectSocialAccount(userId: string, provider: string) {
    // 1. 해당 소셜 계정 조회
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: { userId, provider },
    });

    if (!socialAccount) {
      throw new NotFoundException(
        `연결된 ${provider} 계정을 찾을 수 없습니다.`,
      );
    }

    // 2. 사용자 정보 및 다른 소셜 계정 수 조회
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        socialAccounts: {
          select: { id: true, provider: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 소셜 전용 사용자 판별: phone이 social_로 시작하면 소셜 로그인으로만 가입한 사용자
    const isSocialOnlyUser = user.phone?.startsWith("social_") ?? false;
    const otherSocialAccountCount = user.socialAccounts.filter(
      (sa) => sa.id !== socialAccount.id,
    ).length;

    if (isSocialOnlyUser && otherSocialAccountCount === 0) {
      throw new BadRequestException(
        "마지막 소셜 계정은 연결 해제할 수 없습니다. 비밀번호를 먼저 설정하거나 다른 소셜 계정을 연결해주세요.",
      );
    }

    // 3. [iOS 5.1.1(v)] Apple 계정 해제 시 Apple 토큰 revoke (실패해도 해제는 진행)
    if (provider === "apple" && socialAccount.appleRefreshToken) {
      await this.appleTokenService.revokeRefreshToken(
        socialAccount.appleRefreshToken,
      );
    }

    // 4. SocialAccount 삭제
    await this.prisma.socialAccount.delete({
      where: { id: socialAccount.id },
    });

    this.logger.log(`✅ 소셜 계정 연결 해제: ${user.email} — ${provider}`);
    this.logger_.logAuthEvent("social_disconnect", {
      userId,
      provider,
    });

    return {
      message: `${provider} 계정 연결이 해제되었습니다.`,
    };
  }

  /**
   * 소셜 서비스 API로 사용자 정보 조회
   */
  private async getSocialUserInfo(
    provider: string,
    token: string,
  ): Promise<SocialUserInfo> {
    switch (provider) {
      case "kakao":
        return this.getKakaoUserInfo(token);
      case "google":
        return this.getGoogleUserInfo(token);
      case "apple":
        return this.getAppleUserInfo(token);
      default:
        throw new BadRequestException(
          "지원하지 않는 소셜 로그인 제공자입니다. (kakao, google, apple)",
        );
    }
  }

  /**
   * Apple Identity Token(JWT) 검증 — Sign in with Apple (iOS 4.8 동등 옵션)
   * - Apple JWKS(https://appleid.apple.com/auth/keys)로 RS256 서명 검증
   * - iss=https://appleid.apple.com, aud=APPLE_CLIENT_IDS(앱 Bundle ID + 웹 Service ID)
   * - 이름은 Apple이 최초 1회만 클라이언트에 별도 전달(토큰에는 sub/email만 포함)
   * - APPLE_CLIENT_IDS 미설정 시(개발) audience 검증은 건너뛰고 서명·iss·exp만 검증
   */
  private readonly appleJwks = createRemoteJWKSet(
    new URL("https://appleid.apple.com/auth/keys"),
  );

  private async getAppleUserInfo(
    identityToken: string,
  ): Promise<SocialUserInfo> {
    try {
      const audiences = (
        this.configService.get<string>("APPLE_CLIENT_IDS") ?? ""
      )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const { payload } = await jwtVerify(identityToken, this.appleJwks, {
        issuer: "https://appleid.apple.com",
        ...(audiences.length > 0 ? { audience: audiences } : {}),
      });

      if (!payload.sub) {
        throw new UnauthorizedException(
          "애플 인증 토큰에 사용자 식별자가 없습니다.",
        );
      }

      return {
        provider: "apple",
        socialId: String(payload.sub),
        email: typeof payload.email === "string" ? payload.email : null,
        name: null,
        profileImage: null,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `애플 사용자 정보 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException(
        "애플 인증 토큰이 유효하지 않습니다. 다시 로그인해주세요.",
      );
    }
  }

  /**
   * 카카오 API로 사용자 정보 조회
   * https://kapi.kakao.com/v2/user/me (Bearer accessToken)
   */
  private async getKakaoUserInfo(accessToken: string): Promise<SocialUserInfo> {
    try {
      const response = await axios.get("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });

      const data = response.data;
      const kakaoAccount = data.kakao_account || {};
      const profile = kakaoAccount.profile || {};

      return {
        provider: "kakao",
        socialId: String(data.id),
        email: kakaoAccount.email || null,
        name: profile.nickname || null,
        profileImage: profile.profile_image_url || null,
      };
    } catch (error: unknown) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 401) {
        throw new UnauthorizedException(
          "카카오 인증 토큰이 유효하지 않습니다. 다시 로그인해주세요.",
        );
      }
      this.logger.error(
        `카카오 사용자 정보 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException(
        "카카오 로그인 처리 중 오류가 발생했습니다.",
      );
    }
  }

  /**
   * 구글 토큰 검증 및 사용자 정보 조회
   * https://oauth2.googleapis.com/tokeninfo?id_token=
   */
  private async getGoogleUserInfo(idToken: string): Promise<SocialUserInfo> {
    try {
      const response = await axios.get(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
        { timeout: 10000 },
      );

      const data = response.data;

      // Google Client ID 검증 (선택: 환경 변수에 설정된 경우)
      const expectedClientId =
        this.configService.get<string>("GOOGLE_CLIENT_ID");
      if (expectedClientId && data.aud !== expectedClientId) {
        throw new UnauthorizedException(
          "구글 인증 토큰의 대상이 일치하지 않습니다.",
        );
      }

      return {
        provider: "google",
        socialId: data.sub,
        email: data.email || null,
        name: data.name || null,
        profileImage: data.picture || null,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      if (status === 400 || status === 401) {
        throw new UnauthorizedException(
          "구글 인증 토큰이 유효하지 않습니다. 다시 로그인해주세요.",
        );
      }
      this.logger.error(
        `구글 사용자 정보 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException("구글 로그인 처리 중 오류가 발생했습니다.");
    }
  }

  // ==================== 회원 탈퇴 ====================

  /**
   * 회원 탈퇴 요청 (유예 기간 7일)
   * - 비밀번호 재확인 후 탈퇴 대기 상태로 전환
   * - 즉시 삭제하지 않고 withdrawRequestedAt 설정
   * - 7일 후 배치에서 실제 비식별화 처리
   */
  async requestWithdraw(
    userId: string,
    password: string | undefined,
    reason: string | undefined,
    confirmText: string | undefined,
  ) {
    // 1. 사용자 조회
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        passwordHash: true,
        status: true,
        userType: true,
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 이미 탈퇴 처리된 사용자
    if (user.status === "WITHDRAWN") {
      throw new BadRequestException("이미 탈퇴 처리된 계정입니다.");
    }

    // 이미 탈퇴 대기 중인 사용자
    if (user.status === "WITHDRAW_PENDING") {
      throw new BadRequestException(
        "이미 탈퇴 요청이 접수된 상태입니다. 7일 후 자동으로 처리됩니다.",
      );
    }

    // 관리자 계정(ADMIN/SYSTEM/OPER) 은 탈퇴 불가 (보안)
    if (isAdminRole(user.userType)) {
      throw new BadRequestException(
        "관리자 계정은 직접 탈퇴할 수 없습니다. 시스템 관리자에게 문의해주세요.",
      );
    }

    // 2. 본인 확인
    //    - 이메일/비밀번호 계정: 현재 비밀번호 재확인
    //    - 소셜 로그인 전용 계정(phone 이 social_ 로 시작): 가입 시 임의 비밀번호가
    //      생성되어 본인이 알지 못하므로, '탈퇴합니다' 확인 문구로 본인 의사를 확인
    const WITHDRAW_CONFIRM_KEYWORD = "탈퇴합니다";
    const isSocialOnlyUser = user.phone?.startsWith("social_") ?? false;
    if (isSocialOnlyUser) {
      if ((confirmText ?? "").trim() !== WITHDRAW_CONFIRM_KEYWORD) {
        throw new BadRequestException(
          "탈퇴를 진행하려면 '탈퇴합니다'를 정확히 입력해주세요.",
        );
      }
    } else {
      if (!password) {
        throw new BadRequestException("비밀번호를 입력해주세요.");
      }
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new BadRequestException("비밀번호가 일치하지 않습니다.");
      }
    }

    // 3. 탈퇴 대기 상태로 전환
    const now = new Date();
    const gracePeriodEnd = new Date(now);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: "WITHDRAW_PENDING",
        withdrawRequestedAt: now,
        withdrawReason: reason || null,
      },
    });

    // 4. 현재 세션 무효화 (로그아웃 처리)
    await this.revokeRefreshToken(userId);

    this.logger.log(
      `⚠️ 회원 탈퇴 요청: ${user.email} (유예 기간: ${gracePeriodEnd.toISOString()})`,
    );
    this.logger_.audit("withdraw_request", "auth", userId, "success", {
      email: user.email,
      reason: reason || "사유 없음",
      gracePeriodEnd: gracePeriodEnd.toISOString(),
    });

    return {
      message: "탈퇴 요청이 접수되었습니다. 7일 이내에 철회할 수 있습니다.",
      withdrawRequestedAt: now.toISOString(),
      gracePeriodEnd: gracePeriodEnd.toISOString(),
    };
  }

  /**
   * 회원 탈퇴 철회 (유예 기간 내)
   * - withdrawRequestedAt 초기화, status 복원
   */
  async cancelWithdraw(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        withdrawRequestedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    if (user.status !== "WITHDRAW_PENDING") {
      throw new BadRequestException("탈퇴 요청 상태가 아닙니다.");
    }

    // 유예 기간(7일) 확인
    if (user.withdrawRequestedAt) {
      const gracePeriodEnd = new Date(user.withdrawRequestedAt);
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

      if (new Date() > gracePeriodEnd) {
        throw new BadRequestException(
          "유예 기간이 만료되어 탈퇴를 철회할 수 없습니다.",
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: "ACTIVE",
        withdrawRequestedAt: null,
        withdrawReason: null,
      },
    });

    this.logger.log(`✅ 회원 탈퇴 철회: ${user.email}`);
    this.logger_.audit("withdraw_cancel", "auth", userId, "success", {
      email: user.email,
    });

    return {
      message:
        "탈퇴 요청이 철회되었습니다. 정상적으로 서비스를 이용하실 수 있습니다.",
    };
  }

  /**
   * 이메일 마스킹 헬퍼
   * user@example.com → u***@example.com
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    const visible = local.substring(0, 1);
    const masked = "*".repeat(Math.max(local.length - 1, 3));
    return `${visible}${masked}@${domain}`;
  }

  /**
   * Academy.code 자동 생성 (ACAD-XXXXXX). 중복 시 재시도 최대 10회.
   * 트랜잭션 클라이언트를 받아 race 상황에서도 동일 트랜잭션 내 일관성 유지.
   */
  private async generateUniqueAcademyCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const MAX_RETRY = 10;
    for (let i = 0; i < MAX_RETRY; i++) {
      const randomPart = Array.from({ length: 6 }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length)),
      ).join("");
      const code = `ACAD-${randomPart}`;
      const exists = await tx.academy.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    throw new BadRequestException(
      "오픈클래스 코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
    );
  }
}

// calculateKoreanAge → src/common/utils/age.util.ts 로 이동 (공통 유틸)
