"use client";

/**
 * TestRunnerBridge (admin) — tbot 러너 postMessage 리스너 (dev 전용)
 *
 * 동작은 teamplus-web 쪽 동일 컴포넌트와 일치. admin 은 agent:'admin' 만 다름.
 * 프로토콜: runner:ping · runner:auth-refresh · runner:query · runner:goto · runner:autologin
 * 보안: NODE_ENV==='production' 가드 + origin allowlist (localhost:7788)
 */

import { useEffect } from "react";

const TBOT_ORIGINS = [
  "http://localhost:7788",
  "http://127.0.0.1:7788",
  "http://localhost:5099",
  "http://127.0.0.1:5099",
];
const ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):(7788|5099)$/;
const TOKEN_KEY = "teamplus_access_token";
const REFRESH_TOKEN_KEY = "teamplus_refresh_token";

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

function safePostBack(
  source: unknown,
  origin: string,
  message: Record<string, unknown>,
) {
  try {
    const target = source as Window | null;
    if (!target) return;
    target.postMessage(message, origin);
  } catch {
    /* silent */
  }
}

/** React 컨트롤드 input 의 값을 프로그래밍으로 설정 (native setter 경유 → onChange 반응) */
function setReactInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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
  if (!emailInput || !passwordInput)
    return { ok: false, error: "inputs not found" };

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

  return { ok: false, error: "submit not found" };
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
      setTimeout(() => {
        try {
          result.submit();
        } catch {
          // submit 단계 예외는 기존 로그인 UX 에 맡김
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

    // 2026-04-21 v3: iframe/팝업 양쪽 지원 — window.parent 우선, 없으면 opener
    const sendLoaded = () => {
      const target = window.parent !== window ? window.parent : window.opener;
      if (!target) return;
      TBOT_ORIGINS.forEach((o) => {
        try {
          target.postMessage(
            {
              type: "runner:loaded",
              url: window.location.href,
              timestamp: Date.now(),
            },
            o,
          );
        } catch {
          /* wrong origin */
        }
      });
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
            agent: "admin",
          });
          break;

        case "runner:auth-refresh":
          try {
            if (msg.accessToken) {
              localStorage.setItem(TOKEN_KEY, msg.accessToken);
              document.cookie = `${TOKEN_KEY}=${msg.accessToken}; path=/; max-age=900; SameSite=Lax`;
            }
            if (msg.refreshToken) {
              localStorage.setItem(REFRESH_TOKEN_KEY, msg.refreshToken);
              document.cookie = `${REFRESH_TOKEN_KEY}=${msg.refreshToken}; path=/; max-age=604800; SameSite=Lax`;
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
