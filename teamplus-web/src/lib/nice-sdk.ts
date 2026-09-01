import { MESSAGES } from '@/lib/messages';

/**
 * 나이스 결제창 JS SDK 전역. 스크립트 로드 후 window.AUTHNICE 로 노출된다.
 *  npm 패키지가 없어 script 태그로 직접 로드해야 한다(토스는 SDK 패키지 존재).
 */
declare global {
  interface Window {
    AUTHNICE?: {
      requestPay: (options: Record<string, unknown>) => void;
    };
  }
}

export const NICE_SDK_SRC = 'https://pay.nicepay.co.kr/v1/js/';

/** SDK 준비 판정 타임아웃 — 초과 시 무한 대기 대신 에러로 끝낸다. */
const NICE_SDK_TIMEOUT_MS = 15000;

/**
 * 나이스 결제창 SDK 로드.
 *
 *  준비 판정을 **load 이벤트가 아니라 `window.AUTHNICE` 존재 여부**로 한다.
 *  SDK 는 스크립트 마지막 줄에서 `window.AUTHNICE = new AUTHNICE()` 를 동기 실행하므로
 *  이 전역이 곧 준비 신호이고, 이벤트 타이밍에 의존하지 않아 다음 경우에 전부 안전하다.
 *   - StrictMode 이중 마운트·Fast Refresh 로 script 태그만 남고 load 이벤트는 이미 지나간 경우
 *     (기존 태그에 addEventListener('load') 를 걸면 영원히 안 불려 무한 로딩이 된다)
 *   - 다른 화면이 먼저 SDK 를 심어둔 경우
 *
 *  같은 src 의 script 를 중복 삽입하지 않는다 — SDK 가 전역을 두 번 초기화한다.
 */
export function loadNiceSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('SSR 환경에서는 결제창을 열 수 없습니다.'));
      return;
    }
    if (window.AUTHNICE) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    // 전역이 준비되면 즉시 종료. 스크립트 실행이 끝나야 세팅되므로 폴링이 유일한 확정 신호다.
    timer = setInterval(() => {
      if (window.AUTHNICE) {
        stop();
        resolve();
        return;
      }
      if (Date.now() - startedAt > NICE_SDK_TIMEOUT_MS) {
        stop();
        reject(new Error(MESSAGES.payment2.windowOpenFailed));
      }
    }, 100);

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${NICE_SDK_SRC}"]`,
    );
    if (existing) return; // 이미 로드 중/완료 — 폴링이 마무리한다.

    const script = document.createElement('script');
    script.src = NICE_SDK_SRC;
    script.async = true;
    // 로드 실패는 폴링 타임아웃(15초)을 기다리지 않고 즉시 알린다.
    script.onerror = () => {
      stop();
      // 재시도가 가능하도록 실패한 태그는 걷어낸다 — 남겨두면 위 existing 분기에 걸린다.
      script.remove();
      reject(new Error(MESSAGES.payment2.windowOpenFailed));
    };
    document.head.appendChild(script);
  });
}
