import { ForbiddenException } from "@nestjs/common";
import { UserType } from "@prisma/client";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import {
  PUBLIC_SIGNUP_ALLOWED_USER_TYPES,
  isPublicSignupAllowedUserType,
  publicSignupDenialMessage,
} from "./constants/public-signup.constants";

/**
 * R14-C1 — 공개 가입 역할 allowlist.
 *
 * 기존 denylist(CHILD/TEEN 만 차단) + `@IsEnum(UserType)`(전체 9종 통과) 조합 때문에
 * `userType:"ADMIN"` 요청 하나로 **본인인증 없이 관리자 계정이 생성**됐다.
 * (ADMIN/SYSTEM/OPER 는 IDENTITY_REQUIRED_TYPES 에도 없어 인증 면제)
 *
 * ⚠️ 기존 `auth.service.spec.ts` 는 선행 실패(메시지 드리프트·목 결함)가 있어
 *    본 회귀는 **독립 spec** 으로 분리한다 (Codex Round 16 지적 5 — 소유권 분리).
 */
describe("R14-C1 — 공개 가입 역할 allowlist", () => {
  describe("allowlist 상수", () => {
    it("공개 가입 허용은 PARENT·DIRECTOR·ACADEMY_DIRECTOR 3종뿐이다", () => {
      expect([...PUBLIC_SIGNUP_ALLOWED_USER_TYPES]).toEqual([
        UserType.PARENT,
        UserType.DIRECTOR,
        UserType.ACADEMY_DIRECTOR,
      ]);
    });

    it("시스템 역할(ADMIN/SYSTEM/OPER)을 허용하지 않는다", () => {
      expect(isPublicSignupAllowedUserType(UserType.ADMIN)).toBe(false);
      expect(isPublicSignupAllowedUserType(UserType.SYSTEM)).toBe(false);
      expect(isPublicSignupAllowedUserType(UserType.OPER)).toBe(false);
    });

    it("COACH·CHILD·TEEN 을 허용하지 않는다", () => {
      expect(isPublicSignupAllowedUserType(UserType.COACH)).toBe(false);
      expect(isPublicSignupAllowedUserType(UserType.CHILD)).toBe(false);
      expect(isPublicSignupAllowedUserType(UserType.TEEN)).toBe(false);
    });

    it("허용 3종은 통과시킨다", () => {
      for (const t of PUBLIC_SIGNUP_ALLOWED_USER_TYPES) {
        expect(isPublicSignupAllowedUserType(t)).toBe(true);
      }
    });

    it("빈 값·미지의 문자열은 허용하지 않는다", () => {
      expect(isPublicSignupAllowedUserType(undefined)).toBe(false);
      expect(isPublicSignupAllowedUserType(null)).toBe(false);
      expect(isPublicSignupAllowedUserType("SUPERUSER")).toBe(false);
    });
  });

  describe("거부 문구 — 역할별 정식 경로 안내", () => {
    it("관리자 계열은 운영자 콘솔을 안내한다", () => {
      for (const t of [UserType.ADMIN, UserType.SYSTEM, UserType.OPER]) {
        expect(publicSignupDenialMessage(t)).toContain("운영자 콘솔");
      }
    });

    it("코치는 감독의 코치 등록을 안내한다", () => {
      expect(publicSignupDenialMessage(UserType.COACH)).toContain("감독");
    });

    it("자녀는 기존 가족정책 심사 대응 문구를 유지한다", () => {
      // 2026-06-18 앱심사(App Store/Google Play 가족정책) 대응 문구 — 변경 시 재심사 리스크
      const message = publicSignupDenialMessage(UserType.CHILD);
      expect(message).toContain("보호자 계정에서만 가능합니다");
      expect(publicSignupDenialMessage(UserType.TEEN)).toBe(message);
    });
  });

  describe("register() 서비스 가드 — DTO 우회 시 2차 방어", () => {
    // 가드는 DB 조회 이전에 throw 하므로 의존성은 전부 빈 스텁으로 충분하다.
    // (스텁이 호출되면 그 자체가 "가드가 늦게 걸렸다"는 신호가 된다)
    const buildService = () => {
      const prisma = { user: { findFirst: jest.fn(), create: jest.fn() } };
      const service = new AuthService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      return { service, prisma };
    };

    const registerAs = (userType: UserType) => ({
      email: "attacker@example.com",
      password: "Test1234!",
      userType,
    });

    it("ADMIN 은 ForbiddenException 으로 차단한다", async () => {
      const { service } = buildService();

      await expect(
        service.register(registerAs(UserType.ADMIN)),
      ).rejects.toThrow(ForbiddenException);
    });

    it("SYSTEM·OPER 도 차단한다", async () => {
      for (const t of [UserType.SYSTEM, UserType.OPER]) {
        const { service } = buildService();
        await expect(service.register(registerAs(t))).rejects.toThrow(
          ForbiddenException,
        );
      }
    });

    it("COACH 는 감독 등록 안내와 함께 차단한다", async () => {
      const { service } = buildService();

      await expect(
        service.register(registerAs(UserType.COACH)),
      ).rejects.toThrow(/감독/);
    });

    it("차단은 DB 조회 이전에 일어난다 (열거·부하 유발 차단)", async () => {
      const { service, prisma } = buildService();

      await expect(
        service.register(registerAs(UserType.ADMIN)),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  /**
   * DTO 는 **enum 유효성만** 검사한다 — 정책 판정은 서비스 단일 지점.
   *
   * DTO 에 allowlist 를 걸었더니 ValidationPipe 의 generic 400 이 먼저 나가면서
   * CHILD/TEEN 가족정책 문구와 역할별 안내가 **실제 응답에서 소실**됐다(Codex Round 2 지적 1).
   * class-validator 는 값별로 다른 메시지를 낼 수 없어 차단 지점을 서비스로 일원화했다.
   * → HTTP 계약(status·message)은 `public-signup.endpoint.spec.ts` 가 고정한다.
   */
  describe("RegisterDto 검증 — enum 유효성만 담당", () => {
    const buildDto = (userType: string) =>
      plainToInstance(RegisterDto, {
        email: "attacker@example.com",
        password: "Test1234!",
        userType,
      });

    const userTypeErrors = async (userType: string) => {
      const errors = await validate(buildDto(userType));
      return errors.filter((e) => e.property === "userType");
    };

    it("알 수 없는 문자열은 DTO 단계에서 거부한다", async () => {
      expect(await userTypeErrors("SUPERUSER")).toHaveLength(1);
      expect(await userTypeErrors("")).toHaveLength(1);
    });

    it("정책상 거부 대상이라도 DTO 는 통과시킨다 (메시지는 서비스가 담당)", async () => {
      // 여기서 막으면 역할별 안내 문구를 낼 수 없다 — 통과가 의도된 동작이다.
      for (const t of ["ADMIN", "SYSTEM", "OPER", "COACH", "CHILD", "TEEN"]) {
        expect(await userTypeErrors(t)).toHaveLength(0);
      }
    });

    it("허용 3종도 당연히 통과한다", async () => {
      expect(await userTypeErrors("PARENT")).toHaveLength(0);
      expect(await userTypeErrors("DIRECTOR")).toHaveLength(0);
      expect(await userTypeErrors("ACADEMY_DIRECTOR")).toHaveLength(0);
    });
  });
});
