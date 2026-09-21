/**
 * /identity/callback — KG이니시스 통합인증 팝업 모드 배달 회귀 테스트
 * (2026-09-21, R1 #2/#4 반영 2026-09-21)
 *
 * 검증:
 *   (a) authWindow=popup 쿼리 + window.opener 존재 → postMessage(주 통로) +
 *       localStorage 크럼(보조 통로) 남기고 window.close() 한다. router.replace 는
 *       호출하지 않는다(팝업은 그 자리에서 닫히지, 다른 페이지로 이동하지 않는다).
 *   (b) [R1 #2] opener 가 없어도(직접 진입 등) 크럼 저장 + close() 는 그대로
 *       실행되고, 어떤 경우에도 pending 경로나 /signup 으로 리다이렉트하지 않는다.
 *   (c) [R1 #4] guardianConsent=1 쿼리가 postMessage/크럼의 needsGuardianConsent
 *       로 전달된다.
 */

import { render, act, screen } from "@testing-library/react";
import IdentityCallbackPage from "@/app/identity/callback/page";

let searchParamsMap: Record<string, string> = {};
const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => replaceMock(...args) }),
  useSearchParams: () => ({
    get: (k: string) => searchParamsMap[k] ?? null,
  }),
}));

jest.mock("@/services/identity", () => ({
  submitPortOneCallback: jest.fn(),
}));

const IDV_POPUP_STORAGE_KEY = "idv:kg-popup-result";

describe("/identity/callback — 팝업 모드 배달", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsMap = {};
    window.sessionStorage.clear();
    window.localStorage.clear();
    jest.spyOn(window, "close").mockImplementation(() => {});
    // window.opener 는 jsdom 기본값이 null — 각 테스트에서 필요 시 재정의한다.
    Object.defineProperty(window, "opener", {
      configurable: true,
      value: null,
    });
  });

  it("authWindow=popup + opener 존재 → postMessage 후 close, router.replace 는 호출하지 않는다", async () => {
    searchParamsMap = {
      authWindow: "popup",
      requestId: "req-abc",
      status: "completed",
    };
    const postMessageMock = jest.fn();
    Object.defineProperty(window, "opener", {
      configurable: true,
      value: { closed: false, postMessage: postMessageMock },
    });

    await act(async () => {
      render(<IdentityCallbackPage />);
    });

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "idv:kg-result",
        requestId: "req-abc",
        status: "completed",
      }),
      window.location.origin,
    );
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();

    // 보조 통로 — 동일 origin localStorage 크럼도 함께 남긴다.
    const crumbRaw = window.localStorage.getItem(IDV_POPUP_STORAGE_KEY);
    expect(crumbRaw).not.toBeNull();
    const crumb = JSON.parse(crumbRaw as string);
    expect(crumb.requestId).toBe("req-abc");
    expect(crumb.status).toBe("completed");
  });

  /**
   * [R1 #2] 이전 구현은 크럼 저장 + close() 가 opener 존재 가드 "안"에 있어서,
   * opener 가 끊긴 경우 이 블록 전체가 건너뛰어지고 pending 경로(→ /signup)로
   * 떨어졌다. 400x640 팝업에 회원가입 폼이 뜨고 부모는 30분간 멈춰 있었다.
   * 지금은 opener 여부와 무관하게 크럼 저장 + close() 가 항상 실행되고,
   * authWindow=popup 경로는 어떤 경우에도 다른 페이지로 리다이렉트하지 않는다.
   */
  it("authWindow=popup 이면 opener 가 없어도 크럼 저장 + close() 는 실행되고, 아무 곳으로도 리다이렉트하지 않는다", async () => {
    searchParamsMap = {
      authWindow: "popup",
      requestId: "req-abc",
      status: "completed",
    };
    // opener 없음(끊김/직접 진입) — beforeEach 기본값(null) 유지.
    // sessionStorage 에 pending 핸드오프도 없다 — 이전 구현이라면 /signup 폴백.

    await act(async () => {
      render(<IdentityCallbackPage />);
    });

    expect(window.close).toHaveBeenCalledTimes(1);
    expect(replaceMock).not.toHaveBeenCalled();

    const crumbRaw = window.localStorage.getItem(IDV_POPUP_STORAGE_KEY);
    expect(crumbRaw).not.toBeNull();
    const crumb = JSON.parse(crumbRaw as string);
    expect(crumb.requestId).toBe("req-abc");
    expect(crumb.status).toBe("completed");

    // close() 가 무시되는 드문 경우를 대비한 안내가 렌더된다(사용자가 직접 닫을 수 있게).
    expect(
      screen.getByText("인증 처리가 끝났습니다. 이 창을 닫아주세요."),
    ).toBeInTheDocument();
  });

  /**
   * [R1 #4] needsGuardianConsent 는 PII 가 아닌 불리언 플래그라 302 쿼리
   * (guardianConsent=1)로 승계된다 — 팝업 경로에서도 이 값이 postMessage 에
   * 실려야 만 14세 미만 보호자 동의 안내가 사라지지 않는다.
   */
  it("guardianConsent=1 쿼리를 postMessage/크럼의 needsGuardianConsent 로 전달한다", async () => {
    searchParamsMap = {
      authWindow: "popup",
      requestId: "req-minor",
      status: "completed",
      guardianConsent: "1",
    };
    const postMessageMock = jest.fn();
    Object.defineProperty(window, "opener", {
      configurable: true,
      value: { closed: false, postMessage: postMessageMock },
    });

    await act(async () => {
      render(<IdentityCallbackPage />);
    });

    expect(postMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ needsGuardianConsent: true }),
      window.location.origin,
    );
    const crumb = JSON.parse(
      window.localStorage.getItem(IDV_POPUP_STORAGE_KEY) as string,
    );
    expect(crumb.needsGuardianConsent).toBe(true);
  });
});
