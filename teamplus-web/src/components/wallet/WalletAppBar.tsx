"use client";

import { ReactNode } from "react";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { MESSAGES } from "@/lib/messages";

/**
 * WalletAppBar — 통합 PageAppBar(`variant='main'`) 의 thin wrapper (2026-04-29 v2.0)
 *
 * @deprecated 신규 코드는 `<PageAppBar variant="main" mainActions={...} />` 직접 사용 권장.
 *   본 컴포넌트는 backward-compat 유지를 위해 재export 형태로만 남깁니다.
 */
export interface WalletAppBarProps {
  title?: string;
  /** 타이틀 왼쪽 leading 노드(예: 팀 로고). 미지정 시 기존과 동일(로고 없음). */
  titleLeading?: ReactNode;
  /** 타임라인 우측상단 N 배지 */
  timelineBadge?: number | string;
  onSearch?: () => void;
  onTimeline?: () => void;
  onMy?: () => void;
  onMenu?: () => void;
  /** QR 출석 — 지정 시 알림 아이콘 왼쪽에 QR 아이콘 노출(미지정 시 숨김) */
  onQr?: () => void;
  /** 좌측 영역 커스텀 노드 — leading 사용 시 PageAppBar 호환성 위해 무시됨 */
  leading?: ReactNode;
  /**
   * Flutter WebView 안에서도 웹 4-아이콘 헤더를 강제 표시 (기본 true).
   * Flutter teamplusAppBar 는 단순 Material 디자인이라 main variant 의
   * 4-아이콘 vertical(icon+label) 레이아웃을 그릴 수 없음. 메인 대시보드는
   * useNativeUI({ showAppBar:false }) 로 네이티브 AppBar 도 끄므로,
   * 본 prop 이 false 가 되면 헤더 영역이 통째로 비어 보이는 회귀가 발생.
   * (PageAppBar.tsx:139 isNative 가드 우회)
   */
  forceNative?: boolean;
}

export function WalletAppBar({
  title = MESSAGES.wallet.appBar.title,
  titleLeading,
  timelineBadge,
  onSearch,
  onTimeline,
  onMy,
  onMenu,
  onQr,
  forceNative = true,
}: WalletAppBarProps) {
  // timelineBadge: number | string → number | undefined 정규화
  const badgeNum =
    typeof timelineBadge === "number"
      ? timelineBadge
      : typeof timelineBadge === "string" &&
          timelineBadge !== "0" &&
          timelineBadge !== ""
        ? Number(timelineBadge) || undefined
        : undefined;

  return (
    <PageAppBar
      variant="main"
      title={title}
      titleLeading={titleLeading}
      forceNative={forceNative}
      mainActions={{
        onSearch,
        onTimeline,
        timelineBadge: badgeNum,
        onMy,
        onMenu,
        onQr,
        showQr: !!onQr,
      }}
    />
  );
}
