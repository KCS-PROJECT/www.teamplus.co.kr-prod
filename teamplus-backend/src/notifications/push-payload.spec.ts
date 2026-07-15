import {
  buildPushData,
  isValidInternalLinkUrl,
  PUSH_PAYLOAD_VERSION,
} from "./push-payload";

/**
 * 푸시 payload 계약 v1 pin 테스트.
 *
 * 필드명을 문자 그대로 고정(pin)한다 — Flutter 파서(fromFcmData)와 웹 매퍼가
 * 같은 키를 읽으므로, 키 이름 변경은 이 spec 을 깨뜨려 드리프트를 CI 에서 잡는다.
 * 계약 명세: docs/Architecture/PUSH_NOTIFICATION_GUIDE.md
 */
describe("push-payload (계약 v1)", () => {
  describe("buildPushData — 필드명 pin", () => {
    it("전체 필드: { v, type, linkUrl, notificationId } 키를 정확히 생성", () => {
      const data = buildPushData({
        type: "enrollment_approved",
        linkUrl: "/classes/abc",
        notificationId: "notif-1",
      });

      expect(data).toEqual({
        v: PUSH_PAYLOAD_VERSION,
        type: "enrollment_approved",
        linkUrl: "/classes/abc",
        notificationId: "notif-1",
      });
      expect(Object.keys(data).sort()).toEqual([
        "linkUrl",
        "notificationId",
        "type",
        "v",
      ]);
    });

    it("계약 버전은 '1'", () => {
      expect(PUSH_PAYLOAD_VERSION).toBe("1");
      expect(buildPushData({ type: "t" }).v).toBe("1");
    });

    it("optional 필드 부재 시 키 자체를 생략 (빈 문자열 금지)", () => {
      const data = buildPushData({ type: "chat_message" });

      expect(data).toEqual({ v: "1", type: "chat_message" });
      expect(data).not.toHaveProperty("linkUrl");
      expect(data).not.toHaveProperty("notificationId");
    });

    it("null 값도 키 생략", () => {
      const data = buildPushData({
        type: "t",
        linkUrl: null,
        notificationId: null,
      });

      expect(data).not.toHaveProperty("linkUrl");
      expect(data).not.toHaveProperty("notificationId");
    });

    it("모든 값은 string (FCM data 제약)", () => {
      const data = buildPushData({
        type: "t",
        linkUrl: "/a",
        notificationId: "n",
      });
      for (const v of Object.values(data)) {
        expect(typeof v).toBe("string");
      }
    });
  });

  describe("linkUrl 내부 경로 검증", () => {
    it.each([
      "/notifications",
      "/payment-history",
      "/classes/abc?tab=1",
      "/chat/room-1",
    ])("유효 내부 경로 허용: %s", (url) => {
      expect(isValidInternalLinkUrl(url)).toBe(true);
      expect(buildPushData({ type: "t", linkUrl: url }).linkUrl).toBe(url);
    });

    it.each([
      "https://evil.com/phish",
      "javascript:alert(1)",
      "//evil.com",
      "/\\evil.com",
      "notifications",
      "teamplus://class/1",
      "",
    ])("비내부 경로 제외: %s", (url) => {
      const data = buildPushData({ type: "t", linkUrl: url });
      expect(data).not.toHaveProperty("linkUrl");
    });
  });
});
