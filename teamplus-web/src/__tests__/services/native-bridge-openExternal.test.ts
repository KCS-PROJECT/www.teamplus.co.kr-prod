/**
 * `navigation.openExternal` 인자 정규화 회귀 가드.
 *
 * url 을 **위치 인자**로도, **`{ url, parameter }` config 객체(파라미터)** 로도 받을 수
 * 있어야 한다. 두 형태는 동일한 최종 URL 로 브릿지(callHandler)를 호출해야 한다.
 * URL 조립 자체는 `buildUrlWithParams`(utils.test) 가 검증하므로, 여기서는 인자
 * 정규화(url/parameter 추출)와 브릿지 전달만 결정적으로 확인한다.
 */

// 네이티브 환경으로 강제 — 나머지 환경 유틸은 실제 구현 유지.
jest.mock("@/lib/environment", () => ({
  ...jest.requireActual("@/lib/environment"),
  isFlutterBridgeAvailable: () => true,
}));

import { navigation } from "@/services/native-bridge-handlers";

type CallHandlerArg = { action: string; url: string };

describe("navigation.openExternal — url 을 파라미터(인자/객체)로 받기", () => {
  let callHandler: jest.Mock<Promise<unknown>, [string, CallHandlerArg]>;

  beforeEach(() => {
    callHandler = jest.fn(async () => ({}));
    (
      window as unknown as { flutter_inappwebview: { callHandler: typeof callHandler } }
    ).flutter_inappwebview = { callHandler };
  });

  afterEach(() => {
    delete (window as unknown as { flutter_inappwebview?: unknown }).flutter_inappwebview;
  });

  /** 마지막 callHandler 호출이 브릿지로 넘긴 url. */
  function lastUrl(): string | undefined {
    const calls = callHandler.mock.calls;
    if (calls.length === 0) return undefined;
    return calls[calls.length - 1][1]?.url;
  }

  describe("위치 인자(문자열) 형태 — 하위 호환", () => {
    test("url 만", async () => {
      await navigation.openExternal("https://www.naver.com");
      expect(callHandler).toHaveBeenCalledWith("navigation", {
        action: "openExternal",
        url: "https://www.naver.com",
      });
    });

    test("url + object parameter", async () => {
      await navigation.openExternal("https://www.naver.com", { q: "test" });
      expect(lastUrl()).toBe("https://www.naver.com/?q=test");
    });

    test("url + string parameter", async () => {
      await navigation.openExternal("https://www.naver.com", "q=test&t=news");
      expect(lastUrl()).toBe("https://www.naver.com/?q=test&t=news");
    });
  });

  describe("config 객체 형태 — url 을 파라미터(필드)로", () => {
    test("{ url } 만", async () => {
      await navigation.openExternal({ url: "https://www.naver.com" });
      expect(callHandler).toHaveBeenCalledWith("navigation", {
        action: "openExternal",
        url: "https://www.naver.com",
      });
    });

    test("{ url, parameter: object }", async () => {
      await navigation.openExternal({
        url: "https://www.naver.com",
        parameter: { q: "test" },
      });
      expect(lastUrl()).toBe("https://www.naver.com/?q=test");
    });

    test("{ url, parameter: string }", async () => {
      await navigation.openExternal({
        url: "https://www.naver.com",
        parameter: "q=test&t=news",
      });
      expect(lastUrl()).toBe("https://www.naver.com/?q=test&t=news");
    });
  });

  describe("두 형태 동등성", () => {
    test("위치 인자와 config 객체는 동일한 브릿지 URL 을 만든다", async () => {
      await navigation.openExternal("https://www.naver.com", { q: "김철수" });
      const positional = lastUrl();
      callHandler.mockClear();
      await navigation.openExternal({
        url: "https://www.naver.com",
        parameter: { q: "김철수" },
      });
      const object = lastUrl();
      expect(object).toBe(positional);
      expect(object).toBe("https://www.naver.com/?q=%EA%B9%80%EC%B2%A0%EC%88%98");
    });
  });

  describe("스킴 없는 bare-host 정규화 — 사용자 지정 케이스", () => {
    test('위치 인자: openExternal("www.naver.com", { q: "다음" })', async () => {
      await navigation.openExternal("www.naver.com", { q: "다음" });
      expect(lastUrl()).toBe("https://www.naver.com/?q=%EB%8B%A4%EC%9D%8C");
    });

    test('config 객체: openExternal({ url: "www.naver.com", parameter: { q: "다음" } })', async () => {
      await navigation.openExternal({
        url: "www.naver.com",
        parameter: { q: "다음" },
      });
      expect(lastUrl()).toBe("https://www.naver.com/?q=%EB%8B%A4%EC%9D%8C");
    });

    test("정규화된 URL 은 naver.com 절대 URL 로 열린다(앱 도메인 상대경로 아님)", async () => {
      await navigation.openExternal("www.naver.com", { q: "다음" });
      const url = lastUrl() ?? "";
      // window.open / launchUrl 이 실제로 여는 대상이 naver.com origin 인지 검증
      const resolved = new URL(url, "http://localhost:5001");
      expect(resolved.origin).toBe("https://www.naver.com");
      expect(resolved.searchParams.get("q")).toBe("다음");
    });
  });

  describe("빈 url 가드", () => {
    test("빈 문자열 → 브릿지 미호출", async () => {
      await navigation.openExternal("");
      expect(callHandler).not.toHaveBeenCalled();
    });

    test("{ url: '' } → 브릿지 미호출", async () => {
      await navigation.openExternal({ url: "" });
      expect(callHandler).not.toHaveBeenCalled();
    });
  });
});
