import {
  buildAnonymizedUserData,
  buildAnonymizedChildProfileData,
  anonymizeUserWithinTx,
  expireRemainingCreditsWithinTx,
} from "./user-anonymize.util";
import { dateOnlyToUtc } from "./kst-date.util";

describe("user-anonymize.util", () => {
  const now = new Date("2026-07-08T00:00:00Z");

  describe("buildAnonymizedUserData", () => {
    it("email 은 정확히 withdrawn_<userId> (이메일 형식·해시 없음)", () => {
      const data = buildAnonymizedUserData("ckuserid0001abcd", {
        reason: "grace_period_expired",
        now,
      });

      expect(data.email).toBe("withdrawn_ckuserid0001abcd");
      expect(String(data.email)).not.toContain("@");
      expect(String(data.email)).not.toContain("deleted.teamplus.com");
      expect(data.phone).toBe("withdrawn_ckuserid"); // 앞 8자
    });

    it("고정값 + 모든 PII 필드 null", () => {
      const data = buildAnonymizedUserData("ckuserid0001abcd", {
        reason: "grace_period_expired",
        now,
      });

      expect(data.firstName).toBe("탈퇴회원");
      expect(data.lastName).toBe("");
      expect(data.passwordHash).toBe("WITHDRAWN");
      expect(data.status).toBe("WITHDRAWN");
      expect(data.withdrawProcessedAt).toBe(now);
      expect(data.withdrawReason).toBe("grace_period_expired");

      expect(data.ci).toBeNull();
      expect(data.di).toBeNull();
      expect(data.ciHash).toBeNull();
      expect(data.isVerified).toBe(false);
      expect(data.verifiedAt).toBeNull();
      expect(data.birthDate).toBeNull();
      expect(data.koreanAge).toBeNull();
      expect(data.gender).toBeNull();
      expect(data.note).toBeNull();
      expect(data.zipCode).toBeNull();
      expect(data.address).toBeNull();
      expect(data.addressDetail).toBeNull();
      expect(data.avatarUrl).toBeNull();
    });

    it("withdrawRequestedAt 은 build 가 세팅하지 않는다(경로별 caller 책임)", () => {
      const data = buildAnonymizedUserData("ckuserid0001abcd", {
        reason: "r",
        now,
      });
      expect("withdrawRequestedAt" in data).toBe(false);
    });
  });

  describe("buildAnonymizedChildProfileData", () => {
    it("imageUrl null · birthDate 센티넬(UTC 자정) · 레벨/진도 초기화", () => {
      const data = buildAnonymizedChildProfileData();

      expect(data.imageUrl).toBeNull();
      expect(data.birthDate).toEqual(dateOnlyToUtc("1970-01-01"));
      expect((data.birthDate as Date).toISOString()).toBe(
        "1970-01-01T00:00:00.000Z",
      );
      expect(data.currentLevel).toBe(1);
      expect(data.levelLabel).toBe("입문");
      expect(data.progressPercent).toBe(0);
      expect(data.nextTestDate).toBeNull();
      expect(data.lastEvaluatedAt).toBeNull();
    });
  });

  describe("anonymizeUserWithinTx", () => {
    function makeTx() {
      return {
        user: {
          findUnique: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        childProfile: {
          findUnique: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        socialAccount: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        userNotificationPreference: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        userDevice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        identityVerification: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        childPin: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        teamMember: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
    }

    it("childProfile 없는 부모 — User 갱신 + 연관 deleteMany + teamMember 종료, childProfile.updateMany 미호출", async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({
        avatarUrl: "/uploads/avatar/parent.display.webp",
      });
      tx.childProfile.findUnique.mockResolvedValue(null);

      const res = await anonymizeUserWithinTx(tx as any, "parent1", {
        reason: "grace_period_expired",
        now,
      });

      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "parent1" },
          data: expect.objectContaining({ email: "withdrawn_parent1" }),
        }),
      );
      expect(tx.socialAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: "parent1" },
      });
      expect(tx.userNotificationPreference.deleteMany).toHaveBeenCalledWith({
        where: { userId: "parent1" },
      });
      expect(tx.userDevice.deleteMany).toHaveBeenCalledWith({
        where: { userId: "parent1" },
      });
      expect(tx.teamMember.updateMany).toHaveBeenCalledWith({
        where: { userId: "parent1", leftAt: null },
        data: { leftAt: now },
      });
      // 본인인증 기록 PII 파기 (부모도 대상)
      expect(tx.identityVerification.updateMany).toHaveBeenCalledWith({
        where: { userId: "parent1" },
        data: expect.objectContaining({
          ci: null,
          ciHash: null,
          di: null,
          verifiedName: null,
          verifiedPhone: null,
          verifiedBirth: null,
          verifiedGender: null,
          clientIp: null,
          userAgent: null,
        }),
      });
      // childProfile 없는 부모는 childPin·childProfile 미처리
      expect(tx.childPin.deleteMany).not.toHaveBeenCalled();
      expect(tx.childProfile.updateMany).not.toHaveBeenCalled();
      expect(res.fileUrls).toEqual(["/uploads/avatar/parent.display.webp"]);
    });

    it("childProfile 있는 자녀 — updateMany 호출 + fileUrls 에 avatar/photo 모두 수집 + withdrawRequestedAt 전달", async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({
        avatarUrl: "/uploads/avatar/child.display.webp",
      });
      tx.childProfile.findUnique.mockResolvedValue({
        imageUrl: "/uploads/avatar/childphoto.display.webp",
      });

      const res = await anonymizeUserWithinTx(tx as any, "child1", {
        reason: "부모 탈퇴로 인한 자녀 연쇄 익명화",
        now,
        withdrawRequestedAt: now,
      });

      expect(tx.childPin.deleteMany).toHaveBeenCalledWith({
        where: { childProfile: { userId: "child1" } },
      });
      expect(tx.childProfile.updateMany).toHaveBeenCalledWith({
        where: { userId: "child1" },
        data: expect.objectContaining({ imageUrl: null }),
      });
      expect(tx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ withdrawRequestedAt: now }),
        }),
      );
      expect(res.fileUrls).toEqual([
        "/uploads/avatar/child.display.webp",
        "/uploads/avatar/childphoto.display.webp",
      ]);
    });

    it("avatar/photo 없으면 fileUrls 는 빈 배열", async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({ avatarUrl: null });
      tx.childProfile.findUnique.mockResolvedValue({ imageUrl: null });

      const res = await anonymizeUserWithinTx(tx as any, "u1", {
        reason: "r",
        now,
      });

      expect(res.fileUrls).toEqual([]);
      // childProfile 레코드는 존재하므로 updateMany 는 호출됨
      expect(tx.childProfile.updateMany).toHaveBeenCalled();
    });
  });

  describe("expireRemainingCreditsWithinTx", () => {
    function makeCreditTx(credits: Array<{ id: string; totalSessions: number; usedSessions: number }>) {
      return {
        memberCredit: {
          findMany: jest.fn().mockResolvedValue(credits),
          update: jest.fn().mockResolvedValue({}),
        },
        creditTransaction: { create: jest.fn().mockResolvedValue({}) },
      };
    }

    it("잔여분 있는 크레딧만 소진 + expired 트랜잭션 기록 (이월 미생성)", async () => {
      const tx = makeCreditTx([
        { id: "mc1", totalSessions: 10, usedSessions: 4 },
        { id: "mc2", totalSessions: 8, usedSessions: 8 },
      ]);

      const res = await expireRemainingCreditsWithinTx(
        tx as any,
        "child1",
        "회원 탈퇴 확정으로 잔여 수업권 소멸",
      );

      expect(res).toEqual({ expiredCredits: 1, expiredSessions: 6 });
      expect(tx.memberCredit.update).toHaveBeenCalledTimes(1);
      expect(tx.memberCredit.update).toHaveBeenCalledWith({
        where: { id: "mc1" },
        data: { usedSessions: 10 },
      });
      expect(tx.creditTransaction.create).toHaveBeenCalledTimes(1);
      expect(tx.creditTransaction.create).toHaveBeenCalledWith({
        data: {
          memberCreditId: "mc1",
          type: "expired",
          amount: 6,
          balanceAfter: 0,
          reason: "회원 탈퇴 확정으로 잔여 수업권 소멸",
        },
      });
      // 탈퇴 소멸은 이월 없음 — 신규 MemberCredit 생성 경로 자체가 없어야 한다
      expect((tx.memberCredit as any).create).toBeUndefined();
    });

    it("크레딧 0건 / 전부 소진이면 no-op", async () => {
      const tx = makeCreditTx([]);
      const res = await expireRemainingCreditsWithinTx(tx as any, "u1", "r");

      expect(res).toEqual({ expiredCredits: 0, expiredSessions: 0 });
      expect(tx.memberCredit.update).not.toHaveBeenCalled();
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });
  });
});
