'use client';

/**
 * useContentLinkHandler — 본문(dangerouslySetInnerHTML) 앵커 클릭 공통 처리 훅.
 *
 * 적용 표면(공통 규약 SoT): 서비스 공지(/notice/[id]) · 단위 공지(/community-notice/[id]) ·
 * 포스트(/contents/[slug]) 본문. 운영자/감독이 작성한 임의 URL 앵커가 대상이다.
 *
 * 동작 계약 (2026-08-25 사용자 확정 · R1-4 는 a안 — 지원 스킴을 실제 살균 허용 범위로 한정):
 *  - 지원 스킴: **http/https**(공지·단위 공지·포스트 공통) + mailto(포스트만 — backend
 *    blog allowlist 가 허용). tel:/sms: 는 각 표면의 살균 단계가 href 를 제거하므로
 *    정상 콘텐츠에는 도달하지 않는다 — 아래 통과 분기는 방어 코드다.
 *  - 웹 브라우저: 외부 링크는 새 탭(noopener) — confirm 없음.
 *  - 앱(신버전): confirm("기본 브라우저에서 엽니다") → 승인 시 navigation.openExternal
 *    브릿지로 기기 기본 브라우저 오픈. **새 탭 폴백 금지**(fallbackToNewTab:false) —
 *    네이티브의 window.open 은 메인 WebView 를 외부 사이트로 교체해 iOS 좌초를 만든다.
 *  - 앱(구버전 — openExternal Dart case 부재, 1.0.0+5 미만): status:'unsupported' →
 *    업데이트 안내 토스트. 실행 실패(status:'failed')는 일반 실패 안내로 구분한다.
 *  - 자사(same-origin) 링크: 앱 내 라우팅(navigate). 같은 문서 내 fragment(#앵커)는
 *    기본 스크롤 동작 통과.
 *  - 수정키(Ctrl/Cmd/Shift/Alt)·비주 클릭: 브라우저 기본 동작에 맡긴다(NavLink R3-01 정합).
 *  - 비허용 스킴(javascript: 등): isSafeUrl 로 차단.
 */

import { useCallback } from 'react';
import type { MouseEvent } from 'react';

import { useModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useNavigation } from '@/components/ui/NavLink';
import { navigation as nativeNavigation } from '@/services/native-bridge';
import { isNativeApp } from '@/lib/environment';
import { isSafeUrl } from '@/lib/safe-navigate';
import { MESSAGES } from '@/lib/messages';

/** 브라우저/앱 기본 처리에 맡기는 스킴 — preventDefault 하지 않는다 (살균 통과 시 방어) */
const PASS_THROUGH_SCHEMES = ['tel:', 'mailto:', 'sms:'];

export function useContentLinkHandler(): (e: MouseEvent<HTMLElement>) => void {
  const { modal } = useModal();
  const { toast } = useToast();
  const { navigate } = useNavigation();

  return useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor || !e.currentTarget.contains(anchor)) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      const lower = href.trim().toLowerCase();
      if (PASS_THROUGH_SCHEMES.some((s) => lower.startsWith(s))) return;

      // 비허용 스킴 차단은 수정키 판정보다 **먼저** — 수정키 조기 반환이 앞서면
      // Ctrl/Cmd+클릭이 javascript: 류 검사를 우회한다 (Codex R2 회귀 지적).
      if (!isSafeUrl(href)) {
        e.preventDefault();
        return;
      }

      // 안전이 확인된 링크만 수정키·보조 버튼 클릭을 브라우저 기본 동작(새 탭 등)에 맡긴다.
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }

      // 현재 문서 기준으로 해석 — `#앵커`·`./상대경로` 가 origin 루트로 오해석되지 않도록
      // base 는 origin 이 아니라 **현재 문서 URL** 이어야 한다 (R1-5).
      let resolved: URL;
      try {
        resolved = new URL(href, window.location.href);
      } catch {
        e.preventDefault();
        return;
      }

      if (resolved.origin === window.location.origin) {
        // 같은 문서 내 fragment — 기본 앵커 스크롤 동작에 맡긴다 (라우팅·스피너 불필요).
        if (
          resolved.pathname === window.location.pathname &&
          resolved.search === window.location.search &&
          resolved.hash
        ) {
          return;
        }
        // 자사 도메인 — 앱 내 라우팅으로 처리 (풀 리로드·셸 이탈 방지)
        e.preventDefault();
        void navigate(`${resolved.pathname}${resolved.search}${resolved.hash}`);
        return;
      }

      // 외부 http/https
      e.preventDefault();

      if (!isNativeApp()) {
        // 웹 브라우저 — 새 탭(noopener) 규약. openExternal wrapper 가 동일 동작 수행.
        void nativeNavigation.openExternal(resolved.href);
        return;
      }

      void (async () => {
        const confirmed = await modal.confirm({
          title: MESSAGES.externalLink.confirmTitle,
          message: MESSAGES.externalLink.confirmMessage,
          confirmText: MESSAGES.externalLink.confirmOk,
          cancelText: MESSAGES.externalLink.confirmCancel,
        });
        if (!confirmed) return;
        const { status } = await nativeNavigation.openExternal({
          url: resolved.href,
          fallbackToNewTab: false,
        });
        if (status === 'unsupported') {
          toast.info(MESSAGES.externalLink.updateRequired);
        } else if (status === 'failed') {
          toast.error(MESSAGES.externalLink.openFailed);
        }
      })();
    },
    [modal, toast, navigate],
  );
}
