import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import IdentityVerifyInput from "@/components/identity/IdentityVerifyInput";
import {
  initiateAnonymousIdentity,
  getActiveIdentityProvider,
  parsePortOneSdkParams,
} from "@/services/identity";
import { isNativeApp } from "@/lib/environment";
import { IDV_POPUP_STORAGE_KEY, IDV_POPUP_TIMEOUT_MS } from "@/lib/identity-popup";

/**
 * KG이니시스 통합인증 팝업 모드 (2026-09-21, R1 #1/#3/#5 반영, R2 #1/#2 반영) — 회귀 대상:
 *   1. window.open 이 initiateAnonymousIdentity 의 await 이전(동기 구간)에 호출된다.
 *   2. window.open 이 null(팝업 차단)이면 onBeforeRedirect 호출 + 페이지 전환으로 강등한다.
 *   3. 타 origin/타 requestId 로 온 메시지는 무시한다.
 *   4. 결과 없이 팝업이 닫히면 실패 처리한다.
 *   5. 네이티브 웹뷰에서는 팝업을 열지 않고 returnUrl 에 authWindow 를 붙이지 않는다.
 *   6. [R1 #1] 닫힘 감지 유예 시간 안에 도착한 성공 메시지가 실패 확정을 이긴다.
 *   7. [R1 #5] initiate 응답 대기 중 팝업이 닫히면 페이지 전환으로 강등한다.
 *   8. [R1 #3] activeProvider 가 kg_inicis 로 확인되지 않으면 팝업을 열지 않는다.
 *   9. [R2 #1] origin·requestId·type 이 모두 맞아도 event.source 가 내가 연
 *      팝업이 아니면 무시한다.
 *  10. [R2 #2] COOP 등으로 postMessage 가 막혔을 때의 유일한 대안인 localStorage
 *      크럼 수신 경로 — 정상 소비/requestId 불일치 무시/TTL 초과 제거.
 */

jest.mock("@/services/identity", () => ({
  initiateAnonymousIdentity: jest.fn(),
  submitPortOneCallback: jest.fn(),
  parsePortOneSdkParams: jest.fn(),
  getActiveIdentityProvider: jest.fn(),
}));

jest.mock("@/lib/environment", () => ({
  isNativeApp: jest.fn(),
}));

const mockedInitiate = initiateAnonymousIdentity as jest.MockedFunction<
  typeof initiateAnonymousIdentity
>;
const mockedIsNativeApp = isNativeApp as jest.MockedFunction<typeof isNativeApp>;
const mockedGetActiveProvider = getActiveIdentityProvider as jest.MockedFunction<
  typeof getActiveIdentityProvider
>;
const mockedParsePortOneSdkParams = parsePortOneSdkParams as jest.MockedFunction<
  typeof parsePortOneSdkParams
>;

function kgInitiateResponse(overrides: Partial<{ requestId: string; authHtml: string }> = {}) {
  return {
    success: true,
    data: {
      success: true,
      requestId: overrides.requestId ?? "req-abc",
      provider: "kg_inicis" as const,
      authHtml: overrides.authHtml ?? "<html><body>kg auth</body></html>",
    },
  };
}

function createFakePopup() {
  const popup: {
    closed: boolean;
    close: jest.Mock;
    document: { open: jest.Mock; write: jest.Mock; close: jest.Mock };
  } = {
    closed: false,
    close: jest.fn(() => {
      popup.closed = true;
    }),
    document: {
      open: jest.fn(),
      write: jest.fn(),
      close: jest.fn(),
    },
  };
  return popup as unknown as Window & typeof popup;
}

/** [R1 #3] 팝업 개시 여부는 activeProvider 사전 조회 결과에 좌우된다 — 기본 kg_inicis. */
function stubActiveProvider(provider: "portone" | "kg_inicis" | null = "kg_inicis") {
  if (provider) {
    mockedGetActiveProvider.mockResolvedValue({
      success: true,
      data: { provider },
    } as never);
  } else {
    mockedGetActiveProvider.mockResolvedValue({ success: false } as never);
  }
}

/** activeProvider 마운트 조회(.then 콜백의 setState)가 커밋될 때까지 마이크로태스크를 흘려보낸다. */
async function flushMountEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("IdentityVerifyInput — KG 팝업 모드", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsNativeApp.mockReturnValue(false);
    stubActiveProvider("kg_inicis");
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("window.open 을 initiateAnonymousIdentity 의 await 이전(동기 구간)에 호출한다", async () => {
    const openSpy = jest.spyOn(window, "open").mockReturnValue(createFakePopup());
    // resolve 되지 않는 promise — 아직 initiate 요청이 끝나지 않은 상태를 흉내낸다.
    mockedInitiate.mockReturnValue(new Promise(() => {}));

    render(<IdentityVerifyInput onVerified={jest.fn()} />);
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    // initiate 가 아직 resolve 되지 않았는데도 window.open 은 이미 호출돼 있어야 한다.
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("window.open 이 null(팝업 차단)이면 onBeforeRedirect 호출 후 페이지 전환으로 강등한다", async () => {
    jest.spyOn(window, "open").mockReturnValue(null);
    const docOpenSpy = jest.spyOn(document, "open").mockImplementation(() => document);
    const docWriteSpy = jest.spyOn(document, "write").mockImplementation(() => {});
    const docCloseSpy = jest.spyOn(document, "close").mockImplementation(() => {});
    mockedInitiate.mockResolvedValue(kgInitiateResponse() as never);
    const onBeforeRedirect = jest.fn();

    render(
      <IdentityVerifyInput onVerified={jest.fn()} onBeforeRedirect={onBeforeRedirect} />,
    );
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    await waitFor(() => expect(docWriteSpy).toHaveBeenCalledWith("<html><body>kg auth</body></html>"));

    expect(onBeforeRedirect).toHaveBeenCalledTimes(1);
    expect(docOpenSpy).toHaveBeenCalledTimes(1);
    expect(docCloseSpy).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("idv:pending")).not.toBeNull();
    const pending = JSON.parse(window.sessionStorage.getItem("idv:pending") as string);
    expect(pending.provider).toBe("kg_inicis");
    expect(pending.requestId).toBe("req-abc");

    // returnUrl 에는 팝업이 차단됐으므로 authWindow 쿼리가 붙지 않는다.
    const call = mockedInitiate.mock.calls[0][0];
    expect(call.returnUrl).not.toContain("authWindow");
  });

  it("타 origin·타 requestId 로 온 메시지는 무시하고, 올바른 메시지만 onVerified 를 부른다", async () => {
    const fakePopup = createFakePopup();
    jest.spyOn(window, "open").mockReturnValue(fakePopup);
    mockedInitiate.mockResolvedValue(kgInitiateResponse({ requestId: "req-abc" }) as never);
    const onVerified = jest.fn();

    render(<IdentityVerifyInput onVerified={onVerified} />);
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    await waitFor(() => expect(fakePopup.document.write).toHaveBeenCalled());

    // 타 origin
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "idv:kg-result", requestId: "req-abc", status: "completed" },
          origin: "https://evil.example.com",
          source: fakePopup as unknown as Window,
        }),
      );
    });
    expect(onVerified).not.toHaveBeenCalled();

    // 타 requestId (동일 origin)
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "idv:kg-result", requestId: "other-request", status: "completed" },
          origin: window.location.origin,
          source: fakePopup as unknown as Window,
        }),
      );
    });
    expect(onVerified).not.toHaveBeenCalled();

    // 올바른 origin + requestId
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "idv:kg-result", requestId: "req-abc", status: "completed" },
          origin: window.location.origin,
          source: fakePopup as unknown as Window,
        }),
      );
    });

    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith({ requestId: "req-abc" }),
    );
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  /**
   * [R2 #1] origin·requestId·type 검증만으로는 충분하지 않다 — 코드가 검증하는
   * event.source(내가 연 그 팝업인지)를 테스트가 지키지 않으면, 그 조건이 나중에
   * 지워지거나 잘못 바뀌어도 기존 테스트가 전부 통과한다.
   */
  it("origin·requestId·type 이 모두 맞아도 event.source 가 내가 연 팝업이 아니면 무시한다", async () => {
    const fakePopup = createFakePopup();
    const otherWindow = createFakePopup();
    jest.spyOn(window, "open").mockReturnValue(fakePopup);
    mockedInitiate.mockResolvedValue(kgInitiateResponse({ requestId: "req-source" }) as never);
    const onVerified = jest.fn();
    const onError = jest.fn();

    render(<IdentityVerifyInput onVerified={onVerified} onError={onError} />);
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    await waitFor(() => expect(fakePopup.document.write).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "idv:kg-result", requestId: "req-source", status: "completed" },
          origin: window.location.origin,
          source: otherWindow as unknown as Window,
        }),
      );
    });

    expect(onVerified).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    // 진짜 팝업에서 온 메시지는 정상적으로 소비된다 — source 검증이 전체를
    // 막아버린 게 아니라 그 메시지 한 건만 걸러냈는지 확인한다.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "idv:kg-result", requestId: "req-source", status: "completed" },
          origin: window.location.origin,
          source: fakePopup as unknown as Window,
        }),
      );
    });

    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith({ requestId: "req-source" }),
    );
  });

  it("결과 없이 팝업이 닫히면 실패 처리한다", async () => {
    jest.useFakeTimers();
    const fakePopup = createFakePopup();
    jest.spyOn(window, "open").mockReturnValue(fakePopup);
    mockedInitiate.mockResolvedValue(kgInitiateResponse({ requestId: "req-xyz" }) as never);
    const onVerified = jest.fn();
    const onError = jest.fn();

    render(<IdentityVerifyInput onVerified={onVerified} onError={onError} />);
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakePopup.document.write).toHaveBeenCalled();

    // 사용자가 결과 없이 팝업을 직접 닫는다.
    fakePopup.closed = true;

    // close-poll 틱(500ms, 유예 시작) + 유예(300ms) 를 모두 흘려보내야 최종 실패가 확정된다.
    await act(async () => {
      jest.advanceTimersByTime(500 + 300);
      await Promise.resolve();
    });

    expect(onVerified).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("네이티브 웹뷰에서는 팝업을 열지 않고 returnUrl 에 authWindow 를 붙이지 않는다", async () => {
    mockedIsNativeApp.mockReturnValue(true);
    const openSpy = jest.spyOn(window, "open");
    const docOpenSpy = jest.spyOn(document, "open").mockImplementation(() => document);
    const docWriteSpy = jest.spyOn(document, "write").mockImplementation(() => {});
    jest.spyOn(document, "close").mockImplementation(() => {});
    mockedInitiate.mockResolvedValue(kgInitiateResponse() as never);
    const onBeforeRedirect = jest.fn();

    render(
      <IdentityVerifyInput onVerified={jest.fn()} onBeforeRedirect={onBeforeRedirect} />,
    );
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    await waitFor(() => expect(docWriteSpy).toHaveBeenCalled());

    expect(openSpy).not.toHaveBeenCalled();
    expect(onBeforeRedirect).toHaveBeenCalledTimes(1);
    expect(docOpenSpy).toHaveBeenCalledTimes(1);
    const call = mockedInitiate.mock.calls[0][0];
    expect(call.returnUrl).not.toContain("authWindow");
  });

  /**
   * [R1 #1] 콜백 페이지는 postMessage 직후 같은 동기 블록에서 close() 를 부른다.
   * close-poll 이 그 사이 틱에 걸려 popup.closed 를 먼저 봐도, 유예 시간 안에
   * 도착한 성공 메시지가 실패 확정보다 이겨야 한다(그렇지 않으면 인증을 마친
   * 사용자가 실패 문구를 보고 재시도해 서버의 ALREADY_PROCESSED 를 만난다).
   */
  it("닫힘 감지 유예 동안 도착한 성공 메시지가 실패 확정을 이긴다", async () => {
    jest.useFakeTimers();
    const fakePopup = createFakePopup();
    jest.spyOn(window, "open").mockReturnValue(fakePopup);
    mockedInitiate.mockResolvedValue(kgInitiateResponse({ requestId: "req-race" }) as never);
    const onVerified = jest.fn();
    const onError = jest.fn();

    render(<IdentityVerifyInput onVerified={onVerified} onError={onError} />);
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fakePopup.document.write).toHaveBeenCalled();

    // 콜백 페이지가 postMessage 직후 close() 를 부른 상황 흉내 — closed 플래그를
    // 먼저 세우고, 다음 close-poll 틱(500ms)이 이를 감지해 유예 타이머(300ms)만 건다.
    fakePopup.closed = true;
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();

    // 유예 시간이 끝나기 전에 성공 메시지가 도착한다.
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "idv:kg-result", requestId: "req-race", status: "completed" },
          origin: window.location.origin,
          source: fakePopup as unknown as Window,
        }),
      );
    });

    // 유예 타이머까지 마저 흘려보내도 이미 settled 라 실패로 덮어써지지 않는다.
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(onVerified).toHaveBeenCalledWith({ requestId: "req-race" });
    expect(onError).not.toHaveBeenCalled();
  });

  /**
   * [R1 #5] popupOpened 는 initiateAnonymousIdentity 의 await 이전에 계산된다 —
   * 그 네트워크 왕복 동안 빈 창만 보이므로 사용자가 직접 닫을 수 있다. 이미 닫힌
   * 팝업에 조용히 document.write 하고 실패로 끝내는 대신, 페이지 전환으로 합류해야 한다.
   */
  it("initiate 응답 대기 중 팝업을 닫으면 페이지 전환으로 강등한다", async () => {
    const fakePopup = createFakePopup();
    jest.spyOn(window, "open").mockReturnValue(fakePopup);
    const docOpenSpy = jest.spyOn(document, "open").mockImplementation(() => document);
    const docWriteSpy = jest.spyOn(document, "write").mockImplementation(() => {});
    jest.spyOn(document, "close").mockImplementation(() => {});

    let resolveInitiate!: (value: unknown) => void;
    mockedInitiate.mockReturnValue(
      new Promise((resolve) => {
        resolveInitiate = resolve;
      }) as never,
    );

    const onBeforeRedirect = jest.fn();
    render(
      <IdentityVerifyInput onVerified={jest.fn()} onBeforeRedirect={onBeforeRedirect} />,
    );
    await flushMountEffects();
    fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

    // 팝업은 클릭 시점엔 열려 있었지만, 응답이 오기 전 사용자가 직접 닫는다.
    fakePopup.closed = true;

    await act(async () => {
      resolveInitiate(kgInitiateResponse({ requestId: "req-late-close" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fakePopup.document.write).not.toHaveBeenCalled();
    expect(docWriteSpy).toHaveBeenCalledWith("<html><body>kg auth</body></html>");
    expect(docOpenSpy).toHaveBeenCalledTimes(1);
    expect(onBeforeRedirect).toHaveBeenCalledTimes(1);
    const pending = JSON.parse(window.sessionStorage.getItem("idv:pending") as string);
    expect(pending.requestId).toBe("req-late-close");
  });

  /**
   * [R1 #3] activeProvider 사전 조회가 kg_inicis 를 확인해주지 못하면(portone
   * 이거나 조회 실패) 팝업을 투기적으로 열지 않는다 — 운영 기본값이 아직
   * portone 인 상태로 배포됐을 때 모든 웹 사용자에게 빈 팝업이 뜨는 것을 막는다.
   */
  it.each([["portone" as const], [null]])(
    "activeProvider 가 kg_inicis 로 확인되지 않으면(%s) 팝업을 열지 않는다",
    async (provider) => {
      stubActiveProvider(provider);
      const openSpy = jest.spyOn(window, "open");
      mockedParsePortOneSdkParams.mockReturnValue(null);
      mockedInitiate.mockResolvedValue({
        success: true,
        data: {
          success: true,
          requestId: "req-portone",
          provider: "portone",
          authHtml: "{}",
        },
      } as never);

      render(<IdentityVerifyInput onVerified={jest.fn()} />);
      await flushMountEffects();
      fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

      await waitFor(() => expect(mockedInitiate).toHaveBeenCalled());
      expect(openSpy).not.toHaveBeenCalled();
    },
  );

  /**
   * [R2 #2] localStorage 크럼은 COOP 등으로 postMessage 가 막혔을 때의 유일한
   * 대안 통로다 — 평소에는 postMessage 로만 끝나 이 경로가 실제로 쓰이지
   * 않으므로, 깨져도 수동 테스트로는 영영 발견되지 않는다.
   */
  describe("localStorage 크럼 수신 (postMessage 없이)", () => {
    it("유효한 크럼이 storage 이벤트로 도착하면 onVerified 를 호출한다", async () => {
      const fakePopup = createFakePopup();
      jest.spyOn(window, "open").mockReturnValue(fakePopup);
      mockedInitiate.mockResolvedValue(
        kgInitiateResponse({ requestId: "req-crumb" }) as never,
      );
      const onVerified = jest.fn();

      render(<IdentityVerifyInput onVerified={onVerified} />);
      await flushMountEffects();
      fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

      await waitFor(() => expect(fakePopup.document.write).toHaveBeenCalled());

      const crumb = {
        type: "idv:kg-result",
        requestId: "req-crumb",
        status: "completed",
        code: null,
        timestamp: Date.now(),
      };
      window.localStorage.setItem(IDV_POPUP_STORAGE_KEY, JSON.stringify(crumb));

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: IDV_POPUP_STORAGE_KEY,
            newValue: JSON.stringify(crumb),
          }),
        );
      });

      await waitFor(() =>
        expect(onVerified).toHaveBeenCalledWith({ requestId: "req-crumb" }),
      );
    });

    it("requestId 가 다른 크럼은 무시한다", async () => {
      const fakePopup = createFakePopup();
      jest.spyOn(window, "open").mockReturnValue(fakePopup);
      mockedInitiate.mockResolvedValue(
        kgInitiateResponse({ requestId: "req-mine" }) as never,
      );
      const onVerified = jest.fn();
      const onError = jest.fn();

      render(<IdentityVerifyInput onVerified={onVerified} onError={onError} />);
      await flushMountEffects();
      fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

      await waitFor(() => expect(fakePopup.document.write).toHaveBeenCalled());

      const foreignCrumb = {
        type: "idv:kg-result",
        requestId: "req-other-session",
        status: "completed",
        timestamp: Date.now(),
      };

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: IDV_POPUP_STORAGE_KEY,
            newValue: JSON.stringify(foreignCrumb),
          }),
        );
      });

      expect(onVerified).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      // 내 requestId 의 크럼은 정상 소비된다.
      const myCrumb = {
        type: "idv:kg-result",
        requestId: "req-mine",
        status: "completed",
        timestamp: Date.now(),
      };
      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: IDV_POPUP_STORAGE_KEY,
            newValue: JSON.stringify(myCrumb),
          }),
        );
      });

      await waitFor(() =>
        expect(onVerified).toHaveBeenCalledWith({ requestId: "req-mine" }),
      );
    });

    it("TTL 초과 크럼은 소비하지 않고 제거한다", async () => {
      const fakePopup = createFakePopup();
      jest.spyOn(window, "open").mockReturnValue(fakePopup);
      mockedInitiate.mockResolvedValue(
        kgInitiateResponse({ requestId: "req-ttl" }) as never,
      );
      const onVerified = jest.fn();
      const onError = jest.fn();

      render(<IdentityVerifyInput onVerified={onVerified} onError={onError} />);
      await flushMountEffects();
      fireEvent.click(screen.getByRole("button", { name: "본인인증 시작" }));

      await waitFor(() => expect(fakePopup.document.write).toHaveBeenCalled());

      const staleCrumb = {
        type: "idv:kg-result",
        requestId: "req-ttl",
        status: "completed",
        // 콜백 페이지가 실제로 남긴 크럼이 이미 localStorage 에 있다고 가정한다 —
        // storage 이벤트는 다른 창에서의 변경만 알려주므로 값 자체는 직접 심어둔다.
        timestamp: Date.now() - (IDV_POPUP_TIMEOUT_MS + 1000),
      };
      window.localStorage.setItem(IDV_POPUP_STORAGE_KEY, JSON.stringify(staleCrumb));

      await act(async () => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: IDV_POPUP_STORAGE_KEY,
            newValue: JSON.stringify(staleCrumb),
          }),
        );
      });

      expect(onVerified).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      // 소비 대신 제거됐어야 한다 — 다음 시도까지 만료된 값이 남아있을 이유가 없다.
      expect(window.localStorage.getItem(IDV_POPUP_STORAGE_KEY)).toBeNull();
    });
  });
});
