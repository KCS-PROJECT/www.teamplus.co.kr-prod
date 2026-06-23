import { UserType } from "@prisma/client";
import {
  CHLDIV,
  CHLDIV_ALLOWED_USER_TYPES,
  CHLDIV_MISMATCH_MESSAGE,
  isAdminRole,
  isUserTypeAllowedForChldiv,
} from "./chldiv.constants";

describe("chldiv.constants", () => {
  describe("CHLDIV", () => {
    it("상수 값이 'APP' / 'ADM' 으로 고정되어야 한다", () => {
      expect(CHLDIV.APP).toBe("APP");
      expect(CHLDIV.ADM).toBe("ADM");
    });
  });

  describe("CHLDIV_ALLOWED_USER_TYPES", () => {
    it("APP 은 PARENT/COACH/CHILD/DIRECTOR/TEEN/ADMIN/ACADEMY_DIRECTOR 7개를 허용해야 한다", () => {
      const appAllowed = CHLDIV_ALLOWED_USER_TYPES[CHLDIV.APP];
      expect(appAllowed.has(UserType.PARENT)).toBe(true);
      expect(appAllowed.has(UserType.COACH)).toBe(true);
      expect(appAllowed.has(UserType.CHILD)).toBe(true);
      expect(appAllowed.has(UserType.DIRECTOR)).toBe(true);
      expect(appAllowed.has(UserType.TEEN)).toBe(true);
      expect(appAllowed.has(UserType.ADMIN)).toBe(true);
      expect(appAllowed.has(UserType.ACADEMY_DIRECTOR)).toBe(true);
      expect(appAllowed.size).toBe(7);
    });

    it("ADM 은 SYSTEM/OPER 2개만 허용해야 한다", () => {
      const admAllowed = CHLDIV_ALLOWED_USER_TYPES[CHLDIV.ADM];
      expect(admAllowed.has(UserType.SYSTEM)).toBe(true);
      expect(admAllowed.has(UserType.OPER)).toBe(true);
      expect(admAllowed.size).toBe(2);
    });

    it("ADM 은 일반 사용자 역할을 차단해야 한다", () => {
      const admAllowed = CHLDIV_ALLOWED_USER_TYPES[CHLDIV.ADM];
      expect(admAllowed.has(UserType.PARENT)).toBe(false);
      expect(admAllowed.has(UserType.COACH)).toBe(false);
      expect(admAllowed.has(UserType.CHILD)).toBe(false);
      expect(admAllowed.has(UserType.TEEN)).toBe(false);
      expect(admAllowed.has(UserType.DIRECTOR)).toBe(false);
      expect(admAllowed.has(UserType.ACADEMY_DIRECTOR)).toBe(false);
      expect(admAllowed.has(UserType.ADMIN)).toBe(false); // 레거시 ADMIN은 ADM 차단
    });

    it("APP 은 ADM 전용 역할(SYSTEM/OPER)을 차단해야 한다", () => {
      const appAllowed = CHLDIV_ALLOWED_USER_TYPES[CHLDIV.APP];
      expect(appAllowed.has(UserType.SYSTEM)).toBe(false);
      expect(appAllowed.has(UserType.OPER)).toBe(false);
    });
  });

  describe("isUserTypeAllowedForChldiv", () => {
    it.each([
      [UserType.PARENT, CHLDIV.APP, true],
      [UserType.COACH, CHLDIV.APP, true],
      [UserType.CHILD, CHLDIV.APP, true],
      [UserType.DIRECTOR, CHLDIV.APP, true],
      [UserType.TEEN, CHLDIV.APP, true],
      [UserType.ADMIN, CHLDIV.APP, true],
      [UserType.ACADEMY_DIRECTOR, CHLDIV.APP, true],
      [UserType.SYSTEM, CHLDIV.APP, false],
      [UserType.OPER, CHLDIV.APP, false],
      [UserType.SYSTEM, CHLDIV.ADM, true],
      [UserType.OPER, CHLDIV.ADM, true],
      [UserType.ADMIN, CHLDIV.ADM, false],
      [UserType.PARENT, CHLDIV.ADM, false],
      [UserType.COACH, CHLDIV.ADM, false],
      [UserType.CHILD, CHLDIV.ADM, false],
      [UserType.DIRECTOR, CHLDIV.ADM, false],
      [UserType.TEEN, CHLDIV.ADM, false],
      [UserType.ACADEMY_DIRECTOR, CHLDIV.ADM, false],
    ])("userType=%s, chldiv=%s → %s", (userType, chldiv, expected) => {
      expect(isUserTypeAllowedForChldiv(chldiv, userType)).toBe(expected);
    });
  });

  describe("isAdminRole", () => {
    it("ADMIN, SYSTEM, OPER 는 true 를 반환한다", () => {
      expect(isAdminRole(UserType.ADMIN)).toBe(true);
      expect(isAdminRole(UserType.SYSTEM)).toBe(true);
      expect(isAdminRole(UserType.OPER)).toBe(true);
    });

    it("일반 사용자 역할은 false 를 반환한다", () => {
      expect(isAdminRole(UserType.PARENT)).toBe(false);
      expect(isAdminRole(UserType.COACH)).toBe(false);
      expect(isAdminRole(UserType.CHILD)).toBe(false);
      expect(isAdminRole(UserType.DIRECTOR)).toBe(false);
      expect(isAdminRole(UserType.TEEN)).toBe(false);
      expect(isAdminRole(UserType.ACADEMY_DIRECTOR)).toBe(false);
    });

    it("null/undefined/빈문자열은 false 를 반환한다", () => {
      expect(isAdminRole(null)).toBe(false);
      expect(isAdminRole(undefined)).toBe(false);
      expect(isAdminRole("")).toBe(false);
      expect(isAdminRole("RANDOM_ROLE")).toBe(false);
    });
  });

  describe("CHLDIV_MISMATCH_MESSAGE", () => {
    it("정확한 한국어 메시지를 반환한다 (보안: 계정 존재 힌트 금지)", () => {
      expect(CHLDIV_MISMATCH_MESSAGE).toBe(
        "해당 화면에서는 로그인할 수 없는 계정입니다.",
      );
    });
  });
});
