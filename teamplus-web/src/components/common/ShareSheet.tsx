"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { useNativeScrim } from "@/hooks/useNativeScrim";
import { MESSAGES } from "@/lib/messages";
import { isKakaoKeyConfigured, shareToKakaoClass, shareToKakaoDefault, shareToKakaoText } from "@/lib/kakao";
import type { SharePayload } from "@/lib/share";
import { SHARE_SHEET_EVENT } from "@/lib/share";

/**
 * ShareSheetMount — 전역 SNS 공유 시트
 *
 * `share.ts` 의 `openShareSheet(payload)` 가 발행하는 `teamplus:share-sheet` 커스텀
 * 이벤트를 수신하여 `BottomSheet` 형태로 노출한다. 4개 플랫폼(카카오톡 · 페이스북 ·
 * X · 링크 복사) 버튼을 그리드로 배치하며, 카카오 키가 미설정된 경우 카카오 버튼은
 * disabled 처리된다.
 *
 * 디자인 규칙:
 *  - bg-gradient/blur/colored shadow 금지 → 솔리드 컬러만 사용
 *  - 모든 색상은 dark: 변형 동반 (다크모드 대비 보장)
 *  - 일반 접근성(WCAG AA) 준수: 44x44dp 터치 타겟, aria-label
 *
 * `<ClientProviders>` 의 ToastProvider 내부에서 단일 마운트한다.
 */
export function ShareSheetMount() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [payload, setPayload] = useState<SharePayload | null>(null);

  // [2026-05-16 SPEC_POPUP_FULLSCREEN_DIM → v2 Sheet 패턴] BottomSheet 내부에서도
  // useNativeScrim 을 호출하지만, ShareSheetMount 가 BottomSheet 의 구현 변경에
  // 결합되지 않도록 동일 컬러(#73141826)로 방어적 재호출. (idempotent — 중복 호출 안전)
  // BottomSheet 류이므로 `bottom: false` — 시트 카드가 화면 하단까지 차지.
  // SoT: docs/Design/MODAL_DIM_POLICY.md
  useNativeScrim(isOpen, "#73141826", { bottom: false });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SharePayload>).detail;
      if (!detail) return;
      setPayload(detail);
      setIsOpen(true);
    };
    window.addEventListener(SHARE_SHEET_EVENT, handler);
    return () => window.removeEventListener(SHARE_SHEET_EVENT, handler);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // payload 는 닫기 애니메이션 동안 유지 → 다음 open 시 덮어쓴다
  }, []);

  const resolvedUrl =
    payload?.url ?? (typeof window !== "undefined" ? window.location.href : "");
  const resolvedTitle =
    payload?.title ??
    (typeof document !== "undefined"
      ? document.title
      : MESSAGES.share.defaultTitle) ??
    MESSAGES.share.defaultTitle;
  const resolvedText = payload?.text ?? "";

  const handleKakao = useCallback(() => {
    if (!isKakaoKeyConfigured()) {
      toast.info(MESSAGES.share.kakaoUnavailable);
      return;
    }

    let ok = false;

    if (payload?.template === 'class') {
      let path = '';
      try {
        const url = new URL(resolvedUrl);
        path = (url.pathname + url.search + url.hash).replace(/^\//, '');
      } catch {
        path = resolvedUrl.replace(/^\//, '');
      }
      ok = shareToKakaoClass({
        title: resolvedTitle,
        description: resolvedText || undefined,
        path,
        imageUrl: payload?.imageUrl,
        schedule: payload?.schedule,
        time: payload?.time,
        venue: payload?.venue,
        coach: payload?.coach,
        price: payload?.price,
      });
    } else if (payload?.kakaoType === 'text') {
      ok = shareToKakaoText({
        text: resolvedText ? `${resolvedTitle}\n${resolvedText}` : resolvedTitle,
        url: resolvedUrl,
        buttonTitle: payload?.kakaoButtonTitle,
      });
    } else {
      ok = shareToKakaoDefault({
        title: resolvedTitle,
        description: resolvedText || undefined,
        url: resolvedUrl,
      });
    }

    if (!ok) {
      toast.warning(MESSAGES.share.kakaoSdkLoading);
      return;
    }
    handleClose();
  }, [resolvedTitle, resolvedText, resolvedUrl, payload, toast, handleClose]);

  const handleFacebook = useCallback(() => {
    const target =
      "https://www.facebook.com/sharer/sharer.php?u=" +
      encodeURIComponent(resolvedUrl);
    window.open(target, "_blank", "noopener,noreferrer");
    handleClose();
  }, [resolvedUrl, handleClose]);

  const handleTwitter = useCallback(() => {
    const target =
      "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(resolvedText || resolvedTitle) +
      "&url=" +
      encodeURIComponent(resolvedUrl);
    window.open(target, "_blank", "noopener,noreferrer");
    handleClose();
  }, [resolvedText, resolvedTitle, resolvedUrl, handleClose]);

  const handleCopyLink = useCallback(async () => {
    if (!resolvedUrl) {
      toast.error(MESSAGES.share.failed);
      return;
    }
    // [수정 2026-05-15 T05-F] 링크 복사 실패 회귀 수정.
    //   사용자 제보: 웹에서 "링크 복사" 클릭 시 오류 발생.
    //   원인: HTTP (비-secure) / 구형 InAppWebView / iframe 컨텍스트에서는
    //         `navigator.clipboard.writeText` 가 NotAllowedError 를 던지며 실패.
    //   조치: Clipboard API 우선 시도 → 실패 시 execCommand('copy') 폴백.
    //         (execCommand 는 deprecated 지만 모든 모바일 브라우저에서 여전히 동작)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resolvedUrl);
        toast.success(MESSAGES.share.linkCopied);
        handleClose();
        return;
      }
    } catch {
      // fall through to execCommand fallback
    }
    // Fallback — 임시 textarea + document.execCommand
    if (copyViaExecCommand(resolvedUrl)) {
      toast.success(MESSAGES.share.linkCopied);
      handleClose();
      return;
    }
    toast.error(MESSAGES.share.copyFailed);
  }, [resolvedUrl, toast, handleClose]);

  const kakaoEnabled = isKakaoKeyConfigured();

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={MESSAGES.share.title}
      maxHeight="auto"
    >
      <div className="grid grid-cols-4 gap-3 py-2">
        <ShareButton
          label={MESSAGES.share.platformKakao}
          ariaLabel={MESSAGES.share.ariaKakao}
          icon={<KakaoIcon />}
          backgroundClass="bg-brand-kakao-share dark:bg-brand-kakao-share"
          textClass="text-brand-kakao-share-symbol dark:text-brand-kakao-share-symbol"
          disabled={!kakaoEnabled}
          onClick={handleKakao}
        />
        <ShareButton
          label={MESSAGES.share.platformFacebook}
          ariaLabel={MESSAGES.share.ariaFacebook}
          icon={<FacebookIcon />}
          backgroundClass="bg-brand-facebook dark:bg-brand-facebook"
          textClass="text-white dark:text-white"
          onClick={handleFacebook}
        />
        <ShareButton
          label={MESSAGES.share.platformTwitter}
          ariaLabel={MESSAGES.share.ariaTwitter}
          icon={<XIcon />}
          backgroundClass="bg-black dark:bg-black"
          textClass="text-white dark:text-white"
          onClick={handleTwitter}
        />
        <ShareButton
          label={MESSAGES.share.platformCopy}
          ariaLabel={MESSAGES.share.ariaCopy}
          icon={<LinkIcon />}
          backgroundClass="bg-wline-2 dark:bg-rink-700"
          textClass="text-wtext-1 dark:text-white"
          onClick={handleCopyLink}
        />
      </div>
      {!kakaoEnabled && (
        <p className="mt-3 text-center text-xs text-wtext-3 dark:text-rink-300">
          {MESSAGES.share.kakaoUnavailable}
        </p>
      )}
    </BottomSheet>
  );
}

interface ShareButtonProps {
  label: string;
  ariaLabel: string;
  icon: React.ReactNode;
  backgroundClass: string;
  textClass: string;
  disabled?: boolean;
  onClick: () => void;
}

function ShareButton({
  label,
  ariaLabel,
  icon,
  backgroundClass,
  textClass,
  disabled,
  onClick,
}: ShareButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex flex-col items-center gap-1.5 rounded-2xl py-1 transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className={`flex size-14 items-center justify-center rounded-2xl ${backgroundClass} ${textClass}`}
      >
        {icon}
      </span>
      <span className="text-xs font-medium text-wtext-2 dark:text-rink-100">
        {label}
      </span>
    </button>
  );
}

// ─── 브랜드 아이콘 (인라인 SVG · 외부 의존성 없음) ─────────────────────
//
// [2026-07-18 공식 원본 재추출] 각 경로는 공식 브랜드 벡터를 다운로드한 뒤
// 좌표 변환 스크립트로 24×24 box 에 재생성한 것이다 (임의 단순화 금지 — 사용자 직접 지시).
//  · 카카오톡: KakaoTalk 공식 로고 벡터(256box)의 말풍선+TALK 서브패스를 ×24/256
//    균등 변환(arc rx/ry 포함). 색상은 developers.kakao.com 공유 버튼 PNG 전픽셀
//    실측값 — 컨테이너 #FAE100 (2,937px) · 심볼 #3C1E1E (1,118px).
//  · 페이스북: 2023 Meta 공식 아이콘 SVG(666.667box)의 흰색 f path 를 중첩 변환
//    (translate(447.9175,273.6036) → matrix(1.333,0,0,-1.333,-133.333,800) → ×24/666.667)
//    으로 재생성. 파란 배경 #0866FF 위 흰 f = Meta 공식 secondary use
//    ("A white logo on a Facebook Blue background").
//  · X: x.com 공식 로고 경로(simple-icons 수록 공식 유래) 원본 그대로 — 검정
//    #000000 배경 위 흰색 X.

function KakaoIcon() {
  // 카카오톡 공유 버튼 공식 심볼(말풍선 + TALK). currentColor(#3C1E1E) 로 색상 상속.
  // 크기 48px: 공식 버튼 실측 비율(말풍선 폭 = 컨테이너의 70.6%)을 56px 타일에 재현.
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 3.375 C6.6152 3.375 2.25 6.8168 2.25 11.0625 C2.25 13.8074 4.0749 16.2159 6.8201 17.576 C6.6708 18.091 5.8604 20.8895 5.8282 21.1093 C5.8282 21.1093 5.8087 21.2745 5.9157 21.3375 C6.0227 21.4005 6.1485 21.3516 6.1485 21.3516 C6.4552 21.3087 9.7057 19.0255 10.2682 18.6291 C10.8303 18.7087 11.409 18.75 12 18.75 C17.3848 18.75 21.75 15.3083 21.75 11.0625 C21.75 6.8168 17.3848 3.375 12 3.375 Z M6.6094 13.7461 C6.2992 13.7461 6.0469 13.5052 6.0469 13.2089 L6.0469 9.8672 L5.1692 9.8672 C4.8648 9.8672 4.6172 9.6201 4.6172 9.3164 C4.6172 9.0128 4.8649 8.7656 5.1692 8.7656 L8.0496 8.7656 C8.354 8.7656 8.6016 9.0128 8.6016 9.3164 C8.6016 9.6201 8.3539 9.8672 8.0496 9.8672 L7.1719 9.8672 L7.1719 13.2089 C7.1719 13.5052 6.9196 13.7461 6.6094 13.7461 Z M11.5418 13.7388 C11.3072 13.7388 11.1277 13.6435 11.0737 13.4903 L10.7951 12.7612 L9.0799 12.7611 L8.8012 13.4907 C8.7473 13.6436 8.5679 13.7388 8.3333 13.7388 A0.8583 0.8583 0 0 1 7.9758 13.6612 C7.8207 13.5896 7.6717 13.3929 7.8425 12.8624 L9.188 9.3209 C9.2828 9.0516 9.5707 8.7741 9.937 8.7657 C10.3044 8.774 10.5923 9.0516 10.6873 9.3215 L12.0323 12.8614 C12.2034 13.3931 12.0544 13.5899 11.8993 13.6612 A0.8603 0.8603 0 0 1 11.5418 13.7388 C11.5417 13.7388 11.5418 13.7388 11.5418 13.7388 Z M10.4993 11.7648 L9.9375 10.1687 L9.3757 11.7648 L10.4993 11.7648 Z M12.9375 13.6641 C12.6402 13.6641 12.3984 13.4327 12.3984 13.1484 L12.3984 9.3281 C12.3984 9.0179 12.6561 8.7656 12.9727 8.7656 C13.2893 8.7656 13.5469 9.0179 13.5469 9.3281 L13.5469 12.6328 L14.7422 12.6328 C15.0395 12.6328 15.2813 12.8642 15.2813 13.1484 C15.2813 13.4327 15.0395 13.6641 14.7422 13.6641 L12.9375 13.6641 Z M16.0626 13.7388 C15.7523 13.7388 15.5001 13.4865 15.5001 13.1763 L15.5001 9.3281 C15.5001 9.0179 15.7523 8.7656 16.0626 8.7656 C16.3728 8.7656 16.6251 9.0179 16.6251 9.3281 L16.6251 10.5371 L18.1944 8.9678 C18.2752 8.887 18.3861 8.8426 18.5064 8.8426 C18.6469 8.8426 18.7879 8.9032 18.8935 9.0087 C18.9921 9.1072 19.0508 9.2338 19.0589 9.3653 C19.0671 9.498 19.0229 9.6196 18.9348 9.7078 L17.6529 10.9895 L19.0375 12.8238 A0.5579 0.5579 0 0 1 19.1455 13.2405 A0.5584 0.5584 0 0 1 18.9273 13.6115 A0.5569 0.5569 0 0 1 18.5889 13.725 A0.5581 0.5581 0 0 1 18.1396 13.5014 L16.8204 11.7535 L16.6252 11.9487 L16.6252 13.176 A0.5634 0.5634 0 0 1 16.0626 13.7388 Z" />
    </svg>
  );
}

function FacebookIcon() {
  // Meta 2023 공식 f 로고 (흰색 f 경로 원본 추출). currentColor(white) 상속.
  // 크기 56px(타일 전체): 공식 아이콘의 원(=컨테이너) 안 f 배치 기하를 그대로 재현
  // (f 하단이 컨테이너 하단에 맞닿는 공식 레이아웃).
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M16.7 15.667 L17.3734 12 L13.4538 12 L13.4538 10.7031 C13.4538 8.7653 14.214 8.02 16.1817 8.02 C16.7929 8.02 17.2848 8.0348 17.568 8.0646 L17.568 4.7405 C17.0314 4.5914 15.7196 4.4423 14.9594 4.4423 C10.9495 4.4423 9.1011 6.3355 9.1011 10.4199 L9.1011 12 L6.6266 12 L6.6266 15.667 L9.1011 15.667 L9.1011 23.6466 C10.0295 23.8769 11.0003 24 12 24 C12.4922 24 12.9772 23.9697 13.4538 23.9121 L13.4538 15.667 Z" />
    </svg>
  );
}

function XIcon() {
  // X(구 트위터) 공식 로고 경로. 크기 28px ≈ 공식 앱 아이콘의 글리프 비율(약 50%).
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/**
 * [추가 2026-05-15 T05-F] 비-secure context / 구형 WebView 에서 Clipboard API 실패 시
 * 사용하는 폴백. 임시 textarea 를 화면 밖에 배치하고 `document.execCommand('copy')`
 * 를 호출. 사용자 제스처 컨텍스트(클릭 핸들러) 안에서만 작동하므로 ShareButton onClick
 * 동기 호출 흐름에서 안전.
 */
function copyViaExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

export default ShareSheetMount;
