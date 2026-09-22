import { MESSAGES } from '@/lib/messages';
import { clearExternalDeparture, markExternalDeparture } from '@/lib/nav-stack';

/**
 * 나이스페이먼츠 구모듈(표준결제) 결제창 전역.
 *
 *  `goPay` 는 스크립트 로드 시 동기 등록된다. `nicepaySubmit`/`nicepayClose` 는
 *  이름이 고정된 콜백 — 결제창이 PC 레이어 팝업일 때 나이스가 직접 호출한다.
 *  (`docs/Reference/NICEPAY_STD_PAYMENT_API.md` §2.1)
 */
declare global {
  interface Window {
    goPay?: (form: HTMLFormElement) => void;
    /** 인증 완료 시 나이스가 호출 — 이름 변경 불가. */
    nicepaySubmit?: () => void;
    /** 사용자가 결제창을 닫았을 때 나이스가 호출 — 이름 변경 불가. */
    nicepayClose?: () => void;
  }
}

export const NICE_STD_SDK_SRC =
  'https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js';

/** SDK 준비 판정 타임아웃 — 초과 시 무한 대기 대신 에러로 끝낸다. */
const NICE_STD_SDK_TIMEOUT_MS = 15000;

/**
 * 나이스 구모듈 결제창 SDK 로드.
 *
 *  준비 판정을 load 이벤트가 아니라 `window.goPay` 존재 여부로 한다(nice-sdk.ts 와
 *  동일 이유 — StrictMode 이중 마운트·Fast Refresh 로 script 태그만 남고 load 이벤트가
 *  이미 지난 경우에도 안전하다). 같은 src 의 script 를 중복 삽입하지 않는다.
 */
export function loadNiceStdSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('SSR 환경에서는 결제창을 열 수 없습니다.'));
      return;
    }
    if (window.goPay) {
      resolve();
      return;
    }

    const startedAt = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    timer = setInterval(() => {
      if (window.goPay) {
        stop();
        resolve();
        return;
      }
      if (Date.now() - startedAt > NICE_STD_SDK_TIMEOUT_MS) {
        stop();
        reject(new Error(MESSAGES.payment2.windowOpenFailed));
      }
    }, 100);

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${NICE_STD_SDK_SRC}"]`,
    );
    if (existing) return; // 이미 로드 중/완료 — 폴링이 마무리한다.

    const script = document.createElement('script');
    script.src = NICE_STD_SDK_SRC;
    script.async = true;
    script.onerror = () => {
      stop();
      script.remove();
      reject(new Error(MESSAGES.payment2.windowOpenFailed));
    };
    document.head.appendChild(script);
  });
}

/** `POST /payments/nicestd/sign` 응답 — 폼 필드는 서버가 만든 그대로 사용한다. */
export interface NiceStdSignResponse {
  actionUrl: string;
  fields: Record<string, string>;
}

export interface OpenNiceStdPayWindowParams {
  actionUrl: string;
  fields: Record<string, string>;
  /** 사용자가 결제창을 닫았을 때(= 나이스가 nicepayClose 호출) 실행 — 버튼 상태 복구용. */
  onClose: () => void;
}

/**
 * 구모듈 결제창 호출.
 *
 *  hidden `<form>` 을 만들어 서버가 내려준 필드를 그대로 채우고 `goPay(form)` 을 부른다.
 *  금액·MID·SignData 는 프론트에서 만들거나 고치지 않는다.
 *
 *  `accept-charset="euc-kr"` 필수 — 결제창 호출 인코딩 규격(§1.2). PC 는 레이어 팝업이라
 *  인증 완료 시 나이스가 `window.nicepaySubmit()` 을 호출해야 폼이 제출된다(모바일은
 *  콜백 없이 결제창 페이지로 이동했다가 ReturnURL 로 직접 POST 된다).
 *
 *  원문 샘플의 `nicepayClose` 는 `alert` 를 쓰지만 WebView 에서 차단될 수 있어 쓰지 않는다
 *  — `onClose` 콜백만 실행해 호출부가 버튼 상태를 복구하게 한다.
 *
 *  반환된 cleanup 은 폼 제거 + 두 전역 콜백 해제를 한다. 화면 언마운트 시 반드시 호출해야
 *  다음 결제 호출(다른 화면 재진입 포함)과 전역 콜백이 충돌하지 않는다.
 */
export function openNiceStdPayWindow({
  actionUrl,
  fields,
  onClose,
}: OpenNiceStdPayWindowParams): () => void {
  if (typeof window === 'undefined' || !window.goPay) {
    throw new Error(MESSAGES.payment2.windowOpenFailed);
  }

  const form = document.createElement('form');
  form.method = 'post';
  form.acceptCharset = 'euc-kr';
  form.action = actionUrl;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);

  const cleanup = () => {
    form.remove();
    delete window.nicepaySubmit;
    delete window.nicepayClose;
  };

  window.nicepaySubmit = () => {
    form.submit();
  };
  window.nicepayClose = () => {
    onClose();
    cleanup();
  };

  // 모바일은 결제창이 다른 도메인 페이지로 화면 전체를 이동시킨다 — 취소 복귀 후 뒤로가기가
  //   결제창 블록을 건너뛰어 원래 항목으로 돌아갈 수 있게 떠나기 직전 history 길이를 적는다.
  markExternalDeparture();
  try {
    window.goPay(form);
  } catch (e) {
    // goPay 가 던지면 폼·전역 콜백이 등록된 채로 남는다 — cleanup 후 그대로 다시 던진다.
    //   떠나지 않았으므로 출발 기록도 지운다(표식 항목은 history 에서 못 빼지만, 기록이 없으면
    //   복귀 계산에 쓰이지 않는다).
    cleanup();
    clearExternalDeparture();
    throw e;
  }

  return cleanup;
}
