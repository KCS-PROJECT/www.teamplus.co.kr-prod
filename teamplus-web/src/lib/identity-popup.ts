/**
 * KG이니시스 통합인증 팝업 모드 공용 상수/타입/헬퍼.
 *
 * KG 매뉴얼은 인증창을 팝업(400×640)으로 띄우는 것을 기본으로 안내하고,
 * 앱 웹뷰는 팝업 제약이 있어 페이지 전환 방식을 예외로 허용한다. 웹 브라우저는
 * 팝업을 쓰고 앱 웹뷰(isNativeApp())는 기존 페이지 전환을 그대로 쓴다 — 포트원
 * 경로가 이미 isNativeApp() 으로 분기하는 것과 같은 기준이다.
 *
 * 모드 전달은 returnUrl 쿼리(authWindow=popup)에 싣는다. 백엔드
 * (identity.controller.ts resolveKgReturnUrl/buildIdentityRedirect) 는 origin만
 * allowlist 와 대조하고 쿼리는 그대로 최종 302 리다이렉트까지 승계할 뿐 해석하지
 * 않으므로 백엔드 변경 없이 프론트만으로 팝업 모드를 완결할 수 있다.
 */

export const IDV_AUTH_WINDOW_QUERY_PARAM = "authWindow";
export const IDV_AUTH_WINDOW_POPUP_VALUE = "popup";

export const IDV_POPUP_WINDOW_NAME = "teamplus_kg_identity_popup";
export const IDV_POPUP_WIDTH = 400;
export const IDV_POPUP_HEIGHT = 640;

export const IDV_POPUP_MESSAGE_TYPE = "idv:kg-result";

/** COOP 등으로 postMessage 가 부모에 도달하지 못할 때의 보조 통로 (동일 origin localStorage). */
export const IDV_POPUP_STORAGE_KEY = "idv:kg-popup-result";

/** 인증 요청 만료(30분)와 동일하게 맞춘 팝업 대기 안전판 — 무한 로딩 방지. */
export const IDV_POPUP_TIMEOUT_MS = 30 * 60 * 1000;
export const IDV_POPUP_CLOSE_POLL_MS = 500;
/**
 * [R1 #1] 콜백 페이지는 postMessage 호출 직후 같은 동기 블록에서 window.close()
 * 를 부른다. close-poll 이 하필 그 사이 틱에 걸리면 popup.closed 를 먼저 보고
 * "결과 없이 닫힘"으로 확정해버려, 뒤늦게 도착하는 성공 메시지를 버리게 된다.
 * 닫힘을 처음 감지했을 때 바로 실패로 끝내지 않고 이 유예 시간만큼 기다려
 * 전송 중이던 메시지가 이길 기회를 준다.
 */
export const IDV_POPUP_CLOSE_GRACE_MS = 300;

export interface IdvPopupResultMessage {
  type: typeof IDV_POPUP_MESSAGE_TYPE;
  requestId: string;
  status: string;
  code?: string | null;
  /** 만 14세 미만 보호자 동의 필요 플래그 — PII 아님, 302 쿼리로도 승계 가능. */
  needsGuardianConsent?: boolean;
}

export interface IdvPopupStorageCrumb extends IdvPopupResultMessage {
  timestamp: number;
}

/**
 * [R1 #7] 콜백 페이지(쓰는 쪽)와 IdentityVerifyInput(읽는 쪽)이 각자 인터페이스를
 * 선언하면 새 필드(예: provider) 추가 시 양쪽에 손으로 맞춰야 하는 드리프트가
 * 생긴다. sessionStorage 키와 함께 여기 한 곳에서만 선언한다.
 */
export const IDV_PENDING_KEY = "idv:pending";
export const IDV_RESULT_KEY = "idv:result";
export const IDV_HANDOFF_TTL_MS = 30 * 60 * 1000;

/**
 * WebView redirect 또는 팝업 차단 시 페이지 전환 경로에서 쓰는 핸드오프.
 * provider 를 함께 저장해 콜백 페이지가 "무엇을 시작했는지"로 분기한다
 * (쿼리 존재 여부만으로 KG/포트원을 나누면 오판할 수 있다 — [R1 #1] 이력 참조).
 */
export interface IdvPendingHandoff {
  requestId: string;
  provider: "portone" | "kg_inicis";
  identityVerificationId: string;
  returnTo: string;
  timestamp: number;
}

/** 페이지 전환 경로에서 콜백 페이지가 원래 페이지로 되돌려주는 결과 핸드오프. */
export interface IdvResultHandoff {
  requestId: string;
  success: boolean;
  maskedName?: string;
  maskedPhone?: string;
  needsGuardianConsent?: boolean;
  errorMessage?: string;
  timestamp: number;
}

/** [R1 #7] 백엔드 자체 정의 코드만 세분화, 그 외(KG resultCode 원문 등)는 공통 문구로 폴백. */
export function resolveKgFailureMessage(
  code: string | null | undefined,
  messages: {
    identityFailed: string;
    identityFailedByCode: Record<string, string>;
  },
): string {
  if (!code) return messages.identityFailed;
  return messages.identityFailedByCode[code] || messages.identityFailed;
}

/** 화면 중앙 정렬된 팝업 features 문자열 — KG 공식 샘플의 popupCenter 와 동일한 의도. */
export function buildIdentityPopupFeatures(): string {
  if (typeof window === "undefined") {
    return `width=${IDV_POPUP_WIDTH},height=${IDV_POPUP_HEIGHT}`;
  }
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - IDV_POPUP_WIDTH) / 2),
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - IDV_POPUP_HEIGHT) / 2),
  );
  return `width=${IDV_POPUP_WIDTH},height=${IDV_POPUP_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

/**
 * 클릭 핸들러의 동기 구간에서(첫 await 이전에) 호출해야 한다 — 사용자 제스처가
 * 소진된 뒤에 window.open 을 호출하면 Safari 등에서 팝업 차단이 발동한다.
 * 반환값이 null 이면 팝업 차단으로 간주하고 호출부가 페이지 전환으로 강등한다.
 */
export function openIdentityPopup(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    return window.open(
      "",
      IDV_POPUP_WINDOW_NAME,
      buildIdentityPopupFeatures(),
    );
  } catch {
    return null;
  }
}
