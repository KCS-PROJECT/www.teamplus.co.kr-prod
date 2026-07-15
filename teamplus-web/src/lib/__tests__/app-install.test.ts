/**
 * app-install 회귀 가드 — 식별자 정정(P0) + SNS 인앱브라우저 감지·intent://(P1).
 *
 * - 패키지명/번들ID 가 실제 앱(`kr.co.teamplus`)과 일치해야 스토어 링크가 실제 앱으로 연결됨.
 * - SNS 인앱브라우저(카톡/인스타/페북/네이버/X/라인) 감지가 틀리면 앱 오픈 전략이 잘못 선택됨.
 * - intent:// / 카카오 탈출 URL 포맷이 깨지면 Android 인앱·iOS 카톡에서 앱/스토어 이동 실패.
 */

import {
  IOS_BUNDLE_ID,
  getStoreUrl,
  detectInAppBrowser,
  buildAndroidIntentUrl,
  buildKakaoInAppEscapeUrl,
  planAppOpen,
} from "../app-install";

/** 네이버 진입 시나리오 테스트용 공통 입력 (수업 상세 딥링크) */
const SCENARIO = {
  internalPath: "/classes/123",
  universalUrl: "https://teamplusweb.icetimes.co.kr/classes/123",
  schemeUrl: "teamplus://classes/123",
};

// 실제 SNS 인앱브라우저 User-Agent 샘플
const UA = {
  kakaotalkIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.3",
  kakaotalkAOS:
    "Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36; KAKAOTALK 10.4.3",
  instagramIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.0.0",
  instagramAOS:
    "Mozilla/5.0 (Linux; Android 13; SM-S918N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 Instagram 302.0.0.0",
  facebookIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/400.0.0.0.0]",
  facebookAOS:
    "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/400.0.0.0]",
  naverIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.0.0)",
  lineIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.0.0",
  twitterIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 12; Pixel 6; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36",
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
};

describe("P0 — 식별자 정정 (실제 앱 kr.co.teamplus)", () => {
  test("IOS_BUNDLE_ID = kr.co.teamplus", () => {
    expect(IOS_BUNDLE_ID).toBe("kr.co.teamplus");
  });

  test("Android 스토어 URL 이 실제 패키지명으로 생성", () => {
    const url = getStoreUrl("android");
    expect(url).toBe(
      "https://play.google.com/store/apps/details?id=kr.co.teamplus",
    );
    expect(url).not.toContain("kr.co.teamplus.app"); // 잉여 .app 버그 회귀 방지
  });

  test("Android 스토어 URL 에 referrer 첨부(deferred 용)", () => {
    const url = getStoreUrl("android", { referrer: "/classes/123" });
    expect(url).toContain("id=kr.co.teamplus");
    expect(url).toContain("referrer=%2Fclasses%2F123");
  });

  test("iOS App Store ID 미설정 시 검색 fallback", () => {
    // 테스트 환경엔 NEXT_PUBLIC_IOS_APP_STORE_ID 미설정 → 검색 URL
    expect(getStoreUrl("ios")).toBe(
      "https://apps.apple.com/kr/search?term=teamplus",
    );
  });
});

describe("P1 — SNS 인앱브라우저 감지", () => {
  test("카카오톡 (iOS/Android)", () => {
    expect(detectInAppBrowser(UA.kakaotalkIOS)).toBe("kakaotalk");
    expect(detectInAppBrowser(UA.kakaotalkAOS)).toBe("kakaotalk");
  });

  test("인스타그램 (iOS/Android) — wv 마커보다 우선", () => {
    expect(detectInAppBrowser(UA.instagramIOS)).toBe("instagram");
    expect(detectInAppBrowser(UA.instagramAOS)).toBe("instagram");
  });

  test("페이스북 (FBAN/FB_IAB)", () => {
    expect(detectInAppBrowser(UA.facebookIOS)).toBe("facebook");
    expect(detectInAppBrowser(UA.facebookAOS)).toBe("facebook");
  });

  test("네이버 인앱", () => {
    expect(detectInAppBrowser(UA.naverIOS)).toBe("naver");
  });

  test("라인", () => {
    expect(detectInAppBrowser(UA.lineIOS)).toBe("line");
  });

  test("X(트위터)", () => {
    expect(detectInAppBrowser(UA.twitterIOS)).toBe("twitter");
  });

  test("일반 Android WebView → other-webview", () => {
    expect(detectInAppBrowser(UA.androidWebview)).toBe("other-webview");
  });

  test("일반 브라우저(Safari/Chrome) → null", () => {
    expect(detectInAppBrowser(UA.safari)).toBeNull();
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
  });

  test("빈 UA → null", () => {
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("P1 — Android intent:// URL 빌더", () => {
  test("Universal Link → intent:// + 스토어 fallback", () => {
    const store =
      "https://play.google.com/store/apps/details?id=kr.co.teamplus";
    const result = buildAndroidIntentUrl(
      "https://teamplusweb.icetimes.co.kr/classes/123",
      { fallbackUrl: store },
    );
    expect(result).toBe(
      "intent://teamplusweb.icetimes.co.kr/classes/123#Intent;" +
        "scheme=https;" +
        "package=kr.co.teamplus;" +
        `S.browser_fallback_url=${encodeURIComponent(store)};` +
        "end",
    );
  });

  test("쿼리 포함 URL 유지", () => {
    const result = buildAndroidIntentUrl(
      "https://teamplusweb.icetimes.co.kr/classes/123?tab=info",
      { fallbackUrl: "https://play.google.com/store" },
    );
    expect(result).toContain(
      "intent://teamplusweb.icetimes.co.kr/classes/123?tab=info#Intent;",
    );
  });

  test("커스텀 패키지명 주입", () => {
    const result = buildAndroidIntentUrl("https://x.com/a", {
      fallbackUrl: "https://store",
      packageName: "com.custom.pkg",
    });
    expect(result).toContain("package=com.custom.pkg;");
  });

  test("잘못된 URL → fallbackUrl 그대로", () => {
    expect(
      buildAndroidIntentUrl("not a url", { fallbackUrl: "https://store" }),
    ).toBe("https://store");
  });
});

describe("P1 — iOS 카카오톡 Safari 탈출 URL", () => {
  test("kakaotalk://web/openExternal?url= 로 감싼다", () => {
    const ul = "https://teamplusweb.icetimes.co.kr/classes/123";
    expect(buildKakaoInAppEscapeUrl(ul)).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(ul)}`,
    );
  });
});

describe("P1 — planAppOpen 전략 결정 (SNS 진입 시나리오)", () => {
  // ── 네이버 진입 (사용자 지정 테스트 대상) ──
  test("🟢 네이버 인앱 · Android → intent:// (앱 or 스토어)", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "android",
      inApp: "naver",
      isNative: false,
    });
    expect(plan.strategy).toBe("android-intent");
    // 앱이 처리할 Universal Link 포함
    expect(plan.href).toContain(
      "intent://teamplusweb.icetimes.co.kr/classes/123#Intent;",
    );
    expect(plan.href).toContain("package=kr.co.teamplus;");
    // 미설치 시 실제 Play 스토어(정정된 패키지명)로 fallback
    expect(plan.href).toContain(
      encodeURIComponent(
        "https://play.google.com/store/apps/details?id=kr.co.teamplus",
      ),
    );
  });

  test("🟢 네이버 인앱 · iOS → /get-app 안내(자동 실행 불가)", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "ios",
      inApp: "naver",
      isNative: false,
    });
    expect(plan.strategy).toBe("ios-inapp-guide");
    expect(plan.path).toBe("/get-app?redirect=%2Fclasses%2F123&inapp=naver");
  });

  // ── 기타 SNS ──
  test("카카오톡 · iOS → Safari 탈출", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "ios",
      inApp: "kakaotalk",
      isNative: false,
    });
    expect(plan.strategy).toBe("ios-kakao-escape");
    expect(plan.href).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(SCENARIO.universalUrl)}`,
    );
  });

  test("인스타그램 · Android → intent://", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "android",
      inApp: "instagram",
      isNative: false,
    });
    expect(plan.strategy).toBe("android-intent");
  });

  test("일반 모바일 브라우저(인앱 아님) → scheme-timeout", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "ios",
      inApp: null,
      isNative: false,
    });
    expect(plan.strategy).toBe("scheme-timeout");
    expect(plan.schemeUrl).toBe("teamplus://classes/123");
    expect(plan.fallbackPath).toBe("/get-app?redirect=%2Fclasses%2F123");
  });

  test("이미 네이티브 앱 안 → internal (스토어 유도 없음)", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "ios",
      inApp: null,
      isNative: true,
    });
    expect(plan.strategy).toBe("internal");
    expect(plan.path).toBe("/classes/123");
  });

  test("PC(other) → internal", () => {
    const plan = planAppOpen({
      ...SCENARIO,
      platform: "other",
      inApp: null,
      isNative: false,
    });
    expect(plan.strategy).toBe("internal");
  });
});
