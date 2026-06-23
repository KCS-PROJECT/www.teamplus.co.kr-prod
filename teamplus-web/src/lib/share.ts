/**
 * SNS 공유 유틸리티
 *
 * - `openShareSheet(payload)` (권장) — 카카오톡 · 페이스북 · X · 링크 복사 4개 버튼이
 *   있는 BottomSheet 를 열어 사용자가 플랫폼을 명시적으로 선택. 모든 화면 공통.
 * - `sharePayload(payload)` (deprecated) — 네이티브 → Web Share API → 클립보드 폴백
 *   체인. 신규 코드에서는 사용하지 말고 `openShareSheet` 를 호출한다.
 */

import { isNativeApp } from "./environment";
import { ui } from "@/services/native-bridge";

export type ShareTemplate = 'class';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
  imageUrl?: string;
  template?: ShareTemplate;
  schedule?: string;
  time?: string;
  venue?: string;
  coach?: string;
  price?: string;
}

export type ShareResultKind = "native" | "web-share" | "clipboard" | "failed";

export interface ShareResult {
  kind: ShareResultKind;
  success: boolean;
}

/**
 * `<ShareSheetMount>` 가 수신하는 커스텀 이벤트 이름.
 * 외부에서 직접 발행하지 말고 `openShareSheet()` 를 사용할 것.
 */
export const SHARE_SHEET_EVENT = "teamplus:share-sheet";

/**
 * 전역 SNS 공유 시트를 연다. 4개 플랫폼 버튼(카카오톡 · 페이스북 · X · 링크 복사)
 * 을 노출하며, 카카오 키 미설정 시 카카오 버튼만 비활성화된다.
 *
 * 내부적으로 `SHARE_SHEET_EVENT` 커스텀 이벤트를 발행하며,
 * `<ShareSheetMount>`(ClientProviders 안에서 1회 마운트)가 이를 수신해 BottomSheet 를
 * 표시한다. SSR 환경에서는 no-op.
 */
export function openShareSheet(payload: SharePayload): void {
  if (typeof window === "undefined") return;
  const event = new CustomEvent<SharePayload>(SHARE_SHEET_EVENT, {
    detail: payload,
  });
  window.dispatchEvent(event);
}

/**
 * @deprecated 신규 코드는 `openShareSheet` 를 사용하세요. 네이티브 OS 시트가 명시적으로
 *   필요한 특수 케이스(예: 이미지 포함 공유) 에서만 유지됩니다.
 */
export async function sharePayload(
  payload: SharePayload,
): Promise<ShareResult> {
  const url =
    payload.url ?? (typeof window !== "undefined" ? window.location.href : "");

  // 1. Flutter Native
  if (isNativeApp()) {
    const nativeResult = await ui.share({
      title: payload.title,
      text: payload.text,
      url,
    });
    if (nativeResult.available) {
      return { kind: "native", success: nativeResult.shared };
    }
    // available=false → 웹 폴백으로 내려감
  }

  // 2. Web Share API
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url,
      });
      return { kind: "web-share", success: true };
    } catch (e) {
      // 사용자가 취소했거나 실패 → 다음 폴백
      const err = e as { name?: string };
      if (err?.name === "AbortError") {
        return { kind: "web-share", success: false };
      }
    }
  }

  // 3. Clipboard
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText &&
    url
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return { kind: "clipboard", success: true };
    } catch {
      // 실패 → failed
    }
  }

  return { kind: "failed", success: false };
}
