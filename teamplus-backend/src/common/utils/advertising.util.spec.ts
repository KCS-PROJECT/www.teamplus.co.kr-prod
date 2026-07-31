import {
  AD_LABEL,
  buildAdvertisingBody,
  buildAdvertisingTitle,
  decorateAdvertisingText,
  isMarketingNotificationType,
  isNightTimeKST,
} from "./advertising.util";

describe("isMarketingNotificationType", () => {
  it.each([
    "marketing",
    "promotion",
    "advertisement",
    "event_promotion",
    "academy_promotion",
    "admin_push_marketing",
    "ADMIN_PUSH_MARKETING",
  ])("광고성 %s → true", (type) => {
    expect(isMarketingNotificationType(type)).toBe(true);
  });

  it.each(["payment_success", "class_created", "admin_push", "chat_message"])(
    "정보성 %s → false",
    (type) => {
      expect(isMarketingNotificationType(type)).toBe(false);
    },
  );

  it("빈 값은 false", () => {
    expect(isMarketingNotificationType(undefined)).toBe(false);
    expect(isMarketingNotificationType(null)).toBe(false);
  });
});

describe("isNightTimeKST", () => {
  /** KST 시각으로 Date 생성 (UTC = KST - 9h) */
  const kst = (hours: number) =>
    new Date(Date.UTC(2026, 0, 15, (hours - 9 + 24) % 24, 0));

  it.each([21, 23, 0, 7])("KST %s시는 야간", (h) => {
    expect(isNightTimeKST(kst(h))).toBe(true);
  });

  it.each([8, 12, 20])("KST %s시는 주간", (h) => {
    expect(isNightTimeKST(kst(h))).toBe(false);
  });
});

describe("광고성 표기 (§50④)", () => {
  it("제목 맨 앞에 (광고) 를 붙인다", () => {
    expect(buildAdvertisingTitle("여름 캠프 할인")).toBe(
      `${AD_LABEL} 여름 캠프 할인`,
    );
  });

  it("이미 (광고) 가 있으면 중복 삽입하지 않는다", () => {
    const already = `${AD_LABEL} 여름 캠프`;
    expect(buildAdvertisingTitle(already)).toBe(already);
  });

  it("본문에 전송자 명칭·연락처·무료 수신거부 방법을 덧붙인다", () => {
    const body = buildAdvertisingBody("지금 등록하세요!");
    expect(body).toContain("지금 등록하세요!");
    expect(body).toContain("전송자:");
    expect(body).toContain("문의:");
    expect(body).toContain("무료 수신거부");
  });

  it("이미 수신거부 안내가 있으면 중복 삽입하지 않는다", () => {
    const once = buildAdvertisingBody("본문");
    expect(buildAdvertisingBody(once)).toBe(once);
  });

  it("단일 문자열(SMS) 가공은 접두어 + 전송자 정보를 함께 넣는다", () => {
    const text = decorateAdvertisingText("이벤트 안내");
    expect(text.startsWith(AD_LABEL)).toBe(true);
    expect(text).toContain("무료 수신거부");
  });
});
