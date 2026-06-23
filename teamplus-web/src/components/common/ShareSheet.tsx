"use client";

import { useCallback, useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { useNativeScrim } from "@/hooks/useNativeScrim";
import { MESSAGES } from "@/lib/messages";
import { isKakaoKeyConfigured, shareToKakaoClass, shareToKakaoDefault } from "@/lib/kakao";
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
          backgroundClass="bg-brand-kakao dark:bg-brand-kakao"
          textClass="text-brand-kakao-text-3 dark:text-brand-kakao-text-3"
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

function KakaoIcon() {
  // 카카오 말풍선 아이콘 (단순화된 형태). currentColor 로 색상 상속.
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 4C6.48 4 2 7.58 2 12c0 2.86 1.86 5.36 4.66 6.78l-1.18 4.27c-.1.34.27.62.57.43L11.16 21c.28.02.56.04.84.04 5.52 0 10-3.58 10-8 0-4.42-4.48-9.04-10-9.04z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M13.5 9V7.5c0-.83.67-1.5 1.5-1.5h1.5V3h-2.25C12 3 10.5 4.5 10.5 6.75V9H8.25v3h2.25v9h3v-9h2.25l.75-3H13.5z" />
    </svg>
  );
}

function XIcon() {
  // X(구 트위터) 로고
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
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
