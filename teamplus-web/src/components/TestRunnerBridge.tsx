"use client";

/**
 * TestRunnerBridge — tbot 러너 postMessage 리스너 (dev 전용)
 *
 * tbot(`http://localhost:7788`) 이 window.open 한 페이지에 주입되어
 * 테스트 러너의 원격 제어 명령을 수신한다.
 *
 * 지원 메시지 (type 은 모두 `runner:` 로 시작):
 *   · runner:ping          → runner:pong 응답 (연결 확인)
 *   · runner:auth-refresh  → localStorage + Cookie 토큰 갱신 (15분 만료 대응)
 *   · runner:query         → DOM snapshot / URL / role 반환 (LLM 해석 입력)
 *   · runner:goto          → window.location.assign (소프트 라우팅은 아직 미지원)
 *
 * 자동 전송:
 *   · runner:loaded        → window.opener 에게 페이지 로드 완료 알림
 *
 * 보안:
 *   · NODE_ENV === 'production' 가드 → 프로덕션 빌드에선 no-op
 *   · origin allowlist: localhost/127.0.0.1 :7788 만 수락
 *   · targetOrigin 명시 → wildcard 금지
 */

import { useEffect } from "react";

const TBOT_ORIGINS = [
  "http://localhost:7788",
  "http://127.0.0.1:7788",
  "http://localhost:5099",
  "http://127.0.0.1:5099",
];
const ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):(7788|5099)$/;
// ⚠️ web 실제 사용 키는 teamplus_auth_token (web-token-storage.ts:21 일치).
//    Cookie 이름만 teamplus_access_token (middleware 와 계약). 2026-04-21 수정.
const TOKEN_KEY = "teamplus_auth_token";
const REFRESH_TOKEN_KEY = "teamplus_refresh_token";
const COOKIE_ACCESS_KEY = "teamplus_access_token";
const COOKIE_REFRESH_KEY = "teamplus_refresh_token";

type RunnerMessage =
  | { type: "runner:ping"; id: string }
  | {
      type: "runner:auth-refresh";
      id: string;
      accessToken?: string;
      refreshToken?: string;
    }
  | { type: "runner:query"; id: string; fields?: string[] }
  | { type: "runner:goto"; id: string; path: string }
  | { type: "runner:autologin"; id: string; email: string; password: string };

/**
 * React 컨트롤드 input 값을 프로그래밍으로 설정하면서
 * onChange 핸들러가 실제 사용자 입력처럼 반응하도록 native setter 사용.
 */
function setReactInputValue(input: HTMLInputElement, value: string) {
  const proto = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const HTMLInputProtoSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  const nativeSetter =
    setter !== HTMLInputProtoSetter ? HTMLInputProtoSetter : setter;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Native Channel(flutter_inappwebview) 핸들러 접근자.
 * - TBOT_ENABLED=true dart-define 으로 기동된 Flutter 앱에서만 `tbot` 핸들러가 등록됨.
 * - post-message 와 동시 송신하여 Dual-Bridge 를 구성 — 첫 도착 채널을 러너가 채택.
 */
type FlutterInAppWebView = {
  callHandler: (name: string, ...args: unknown[]) => Promise<unknown> | unknown;
};
function getFlutterNativeHandler(): FlutterInAppWebView | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { flutter_inappwebview?: FlutterInAppWebView };
  return w.flutter_inappwebview &&
    typeof w.flutter_inappwebview.callHandler === "function"
    ? w.flutter_inappwebview
    : null;
}

/**
 * 러너로 메시지를 돌려보낸다.
 * - 반환 target 이 있으면 post-message (기존 경로)
 * - Flutter 앱(WebView)이면 `tbot` 핸들러로 동일 메시지를 병렬 송신 → 러너가 correlationId 로 중복 제거
 */
function safePostBack(
  source: unknown,
  origin: string,
  message: Record<string, unknown>,
) {
  // 1) post-message 경로
  try {
    const target = source as Window | null;
    if (target) target.postMessage(message, origin);
  } catch {
    // cross-origin 제약 · 창 닫힘 → silent
  }
  // 2) native-channel 경로 (Dual-Bridge)
  const native = getFlutterNativeHandler();
  if (native) {
    try {
      const type = String(
        (message as { type?: unknown }).type || "runner:event",
      );
      native.callHandler("tbot", type, message);
    } catch {
      // native channel 미등록/오류 → silent
    }
  }
}

function parseTbotAutoLoginPayloadFromHash(): {
  email: string;
  password: string;
} | null {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const hashParams = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const encoded = hashParams.get("__tbot_autologin");
  if (!encoded) return null;

  try {
    const decoded = atob(decodeURIComponent(encoded));
    const payload = JSON.parse(decoded);
    if (
      typeof payload?.email !== "string" ||
      typeof payload?.password !== "string"
    ) {
      return null;
    }
    return { email: payload.email, password: payload.password };
  } catch {
    return null;
  }
}

function stripTbotAutoLoginHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (!hashParams.has("__tbot_autologin")) return;
  hashParams.delete("__tbot_autologin");
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";
  window.history.replaceState({}, "", url.toString());
}

function prepareAutoLoginSubmission(
  email: string,
  password: string,
): { ok: true; submit: () => void } | { ok: false; error: string } {
  const emailInput = document.querySelector(
    'input[type="email"], input[name="email"], input[autocomplete="email"], input[inputmode="email"]',
  ) as HTMLInputElement | null;
  const passwordInput = document.querySelector(
    'input[type="password"], input[name="password"]',
  ) as HTMLInputElement | null;

  if (!emailInput || !passwordInput) {
    return { ok: false, error: "email/password input not found" };
  }

  setReactInputValue(emailInput, email);
  setReactInputValue(passwordInput, password);

  const submitBtn =
    (document.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement | null) ||
    (document.querySelector(
      'form button:not([type="button"])',
    ) as HTMLButtonElement | null);

  if (submitBtn) {
    return { ok: true, submit: () => submitBtn.click() };
  }

  const form = emailInput.closest("form");
  if (form && "requestSubmit" in form) {
    return {
      ok: true,
      submit: () => (form as HTMLFormElement).requestSubmit(),
    };
  }

  return { ok: false, error: "submit button or form not found" };
}

function runAutoLoginWithRetry(
  email: string,
  password: string,
  handlers: {
    onPrepared?: (attempts: number) => void;
    onExhausted?: (error: string, attempts: number) => void;
  } = {},
) {
  let attempts = 0;
  const attempt = () => {
    attempts += 1;
    const result = prepareAutoLoginSubmission(email, password);
    if (result.ok) {
      handlers.onPrepared?.(attempts);
      // ACK 를 먼저 돌려주고 다음 tick 에 submit → 빠른 이동에서도 timeout 방지
      setTimeout(() => {
        try {
          result.submit();
        } catch {
          // submit 단계 예외는 기존 로그인 페이지 UX 에 맡김
        }
      }, 0);
      return;
    }
    if (attempts >= 30) {
      handlers.onExhausted?.(result.error, attempts);
      return;
    }
    setTimeout(attempt, 100);
  };
  attempt();
}

export default function TestRunnerBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;

    const hashAutoLogin = parseTbotAutoLoginPayloadFromHash();
    const bridgeWindow = window as Window & {
      __tbotHashAutoLoginStarted?: string;
    };
    if (window.location.pathname.startsWith("/login") && hashAutoLogin) {
      const marker = `${window.location.pathname}:${hashAutoLogin.email}`;
      if (bridgeWindow.__tbotHashAutoLoginStarted !== marker) {
        bridgeWindow.__tbotHashAutoLoginStarted = marker;
        stripTbotAutoLoginHash();
        runAutoLoginWithRetry(hashAutoLogin.email, hashAutoLogin.password);
      }
    }

    // 페이지 로드 완료 신호 (tbot 이 창의 준비 상태 추적)
    // 2026-04-21: iframe 방식 지원 — window.parent 우선, 없으면 window.opener (팝업 레거시)
    // 2026-04-23: Flutter 앱 WebView(self-origin) 에서도 동작하도록 Dual-Bridge 경로 추가.
    //             post-message 상대방이 없어도 native `tbot` 핸들러로 독립 송신.
    const sendLoaded = () => {
      const loadedMsg = {
        type: "runner:loaded",
        url: window.location.href,
        timestamp: Date.now(),
      };
      // 1) post-message 경로 — 팝업/iframe 에 다중 origin 으로 broadcast
      const target = window.parent !== window ? window.parent : window.opener;
      if (target) {
        TBOT_ORIGINS.forEach((o) => {
          try {
            target.postMessage(loadedMsg, o);
          } catch {
            /* wrong origin → 다음 시도 */
          }
        });
      }
      // 2) native-channel 경로 — Flutter 앱 WebView 에서는 post-message 상대가 없을 수 있음
      const native = getFlutterNativeHandler();
      if (native) {
        try {
          native.callHandler("tbot", "runner:loaded", loadedMsg);
        } catch {
          /* silent */
        }
      }
    };
    sendLoaded();

    const handler = (ev: MessageEvent) => {
      if (!ORIGIN_RE.test(ev.origin)) return;
      const msg = ev.data as RunnerMessage | undefined;
      if (
        !msg ||
        typeof msg !== "object" ||
        typeof (msg as { type?: unknown }).type !== "string"
      )
        return;
      if (!msg.type.startsWith("runner:")) return;

      switch (msg.type) {
        case "runner:ping":
          safePostBack(ev.source, ev.origin, {
            type: "runner:pong",
            id: msg.id,
            url: window.location.href,
            timestamp: Date.now(),
            agent: "web",
          });
          break;

        case "runner:auth-refresh":
          try {
            if (msg.accessToken) {
              localStorage.setItem(TOKEN_KEY, msg.accessToken);
              // middleware 는 teamplus_access_token 쿠키 조회 → 쿠키 이름 고정
              document.cookie = `${COOKIE_ACCESS_KEY}=${msg.accessToken}; path=/; max-age=900; SameSite=Lax`;
            }
            if (msg.refreshToken) {
              localStorage.setItem(REFRESH_TOKEN_KEY, msg.refreshToken);
              document.cookie = `${COOKIE_REFRESH_KEY}=${msg.refreshToken}; path=/; max-age=604800; SameSite=Lax`;
            }
            safePostBack(ev.source, ev.origin, {
              type: "runner:auth-refresh-ack",
              id: msg.id,
              ok: true,
            });
          } catch (e) {
            safePostBack(ev.source, ev.origin, {
              type: "runner:auth-refresh-ack",
              id: msg.id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;

        case "runner:query": {
          // Phase 3 LLM 해석 입력용 — DOM 축약 + 기본 정보
          const snapshot = {
            url: window.location.href,
            title: document.title,
            pathname: window.location.pathname,
            readyState: document.readyState,
            bodyText: (document.body?.innerText || "").slice(0, 4000),
            h1: document.querySelector("h1")?.textContent || "",
          };
          safePostBack(ev.source, ev.origin, {
            type: "runner:query-result",
            id: msg.id,
            snapshot,
          });
          break;
        }

        case "runner:goto":
          try {
            if (msg.path && msg.path.startsWith("/")) {
              safePostBack(ev.source, ev.origin, {
                type: "runner:goto-ack",
                id: msg.id,
                ok: true,
              });
              window.location.assign(msg.path);
            } else {
              safePostBack(ev.source, ev.origin, {
                type: "runner:goto-ack",
                id: msg.id,
                ok: false,
                error: "path must start with /",
              });
            }
          } catch (e) {
            safePostBack(ev.source, ev.origin, {
              type: "runner:goto-ack",
              id: msg.id,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;

        case "runner:autologin": {
          runAutoLoginWithRetry(msg.email, msg.password, {
            onPrepared: (attempts) => {
              safePostBack(ev.source, ev.origin, {
                type: "runner:autologin-ack",
                id: msg.id,
                ok: true,
                attempts,
              });
            },
            onExhausted: (error, attempts) => {
              safePostBack(ev.source, ev.origin, {
                type: "runner:autologin-ack",
                id: msg.id,
                ok: false,
                error,
                attempts,
              });
            },
          });
          break;
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return null;
}
