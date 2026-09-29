import { BadRequestException } from "@nestjs/common";
import {
  SETTLEMENT_STATUS,
  canTransition,
  assertTransition,
} from "./settlement-status.constant";

describe("settlement-status.constant", () => {
  describe("canTransition", () => {
    it("pending → approved 를 허용한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.PENDING, SETTLEMENT_STATUS.APPROVED),
      ).toBe(true);
    });

    it("pending → rejected 를 허용한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.PENDING, SETTLEMENT_STATUS.REJECTED),
      ).toBe(true);
    });

    it("approved → paid 를 허용한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.APPROVED, SETTLEMENT_STATUS.PAID),
      ).toBe(true);
    });

    it("approved → processing 을 허용한다 (후속 단계 예약)", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.APPROVED, SETTLEMENT_STATUS.PROCESSING),
      ).toBe(true);
    });

    it("processing → paid|failed 를 허용한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.PROCESSING, SETTLEMENT_STATUS.PAID),
      ).toBe(true);
      expect(
        canTransition(SETTLEMENT_STATUS.PROCESSING, SETTLEMENT_STATUS.FAILED),
      ).toBe(true);
    });

    it("failed → processing 을 허용한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.FAILED, SETTLEMENT_STATUS.PROCESSING),
      ).toBe(true);
    });

    it("paid 는 종결 상태라 어떤 전이도 불허한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.PAID, SETTLEMENT_STATUS.APPROVED),
      ).toBe(false);
    });

    it("rejected → approved 처럼 정의되지 않은 전이는 불허한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.REJECTED, SETTLEMENT_STATUS.APPROVED),
      ).toBe(false);
    });

    it("rejected → pending 은 마감 생성기 전용 전이로 허용한다(일반 API 는 호출하지 않음)", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.REJECTED, SETTLEMENT_STATUS.PENDING),
      ).toBe(true);
    });

    it("pending → paid 처럼 정의되지 않은 전이는 불허한다", () => {
      expect(
        canTransition(SETTLEMENT_STATUS.PENDING, SETTLEMENT_STATUS.PAID),
      ).toBe(false);
    });

    it("알 수 없는 from 값은 불허한다", () => {
      expect(canTransition("unknown", SETTLEMENT_STATUS.APPROVED)).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("허용된 전이는 통과한다", () => {
      expect(() =>
        assertTransition(SETTLEMENT_STATUS.PENDING, SETTLEMENT_STATUS.APPROVED),
      ).not.toThrow();
    });

    it("불허된 전이는 BadRequestException + 동작 라벨을 포함한 메시지를 던진다", () => {
      expect(() =>
        assertTransition(SETTLEMENT_STATUS.PAID, SETTLEMENT_STATUS.APPROVED),
      ).toThrow(BadRequestException);
      try {
        assertTransition(SETTLEMENT_STATUS.PAID, SETTLEMENT_STATUS.APPROVED);
      } catch (e) {
        expect((e as BadRequestException).message).toBe(
          "현재 상태(paid)에서는 승인할 수 없습니다.",
        );
      }
    });
  });
});
