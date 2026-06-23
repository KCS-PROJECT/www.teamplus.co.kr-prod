"use client";

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
 * - 로고 미등록 시 null 반환 → 기존 SVG 데코만 노출.
 * - 디자인 규칙: gradient/blur/컬러 그림자 금지. 배경 없이 로고 이미지만 노출(흰 박스 제거).
 */
export function HeroTeamLogo({ logoUrl, className }: HeroTeamLogoProps) {
  const resolved = resolveImageSrc(logoUrl ?? undefined);
  if (!resolved) return null;

  return (
    <div
      className={cn(
        "absolute right-5 top-5 z-[1] flex h-[72px] w-[72px] items-center justify-center overflow-hidden",
        className,
      )}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" decoding="async" src={resolved} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

export default HeroTeamLogo;
