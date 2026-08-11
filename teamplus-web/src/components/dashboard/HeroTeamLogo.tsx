"use client";

import { useState } from "react";

import { resolveImageSrc } from "@/lib/image-url";
import { cn } from "@/lib/utils";

interface HeroTeamLogoProps {
  /** 팀 로고 원본 URL (내부에서 resolveImageSrc 처리) */
  logoUrl?: string | null;
  /** 추가 위치/크기 오버라이드 */
  className?: string;
}

/**
 * HeroTeamLogo — 대시보드 Hero(다크) 카드 우측에 표시하는 팀 로고.
 *
 * - 모든 역할 메인화면 Hero 카드에서 공용으로 사용 (coach/parent/director/academy_director/teen).
 * - 부모 요소는 `relative overflow-hidden` 이어야 한다 (Hero 카드 컨테이너).
 * - 로고 미등록·로드 실패 시 null 반환 → 기존 SVG 데코만 노출.
 *   (이 컴포넌트는 Hero 카드 위 장식 레이어라 대체 아이콘을 넣지 않는다 — 아이콘 폴백이
 *    필요한 정체성 슬롯은 HomeIdentityStrip 이 담당.)
 * - 디자인 규칙: gradient/blur/컬러 그림자 금지. 배경 없이 로고 이미지만 노출(흰 박스 제거).
 */
export function HeroTeamLogo({ logoUrl, className }: HeroTeamLogoProps) {
  // 로드 실패(404/깨짐) URL 기억 → 깨진 이미지 대신 미노출. URL 이 바뀌면 자동 재시도.
  //   ⚠️ Hooks 규칙 — 아래 조기 반환보다 반드시 위에 있어야 한다.
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  const resolved = resolveImageSrc(logoUrl ?? undefined);
  if (!resolved || resolved === brokenLogo) return null;

  return (
    <div
      className={cn(
        "absolute right-5 top-5 z-[1] flex h-[72px] w-[72px] items-center justify-center overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        loading="lazy"
        decoding="async"
        src={resolved}
        alt=""
        onError={() => setBrokenLogo(resolved)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export default HeroTeamLogo;
