import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * BrandWordmark — '팀플러스+' 브랜드 워드마크 이미지 (라이트/다크 자동 스왑)
 *
 * dark:invert 는 초록 '+' 가 자홍색으로 반전되므로 사용 금지 —
 * 라이트(splash_wordmark3, 검정)/다크(splash_wordmark2, 흰색) 이미지 스왑으로
 * 양쪽 테마 모두 초록 '+' 색을 보존한다.
 *
 * 사용처: 로그인 화면, 메인 대시보드 헤더(WalletAppBar titleLeading).
 *
 * @example
 * <BrandWordmark className="h-5" />            // 헤더 (20px)
 * <BrandWordmark className="mt-4 h-7" priority /> // 로그인 히어로 (28px)
 */
interface BrandWordmarkProps {
  /** 추가 클래스 — 높이 오버라이드(h-*) 및 여백. 기본 높이 h-5(20px). */
  className?: string;
  /** LCP 후보 위치(로그인 히어로 등)에서 true */
  priority?: boolean;
}

export function BrandWordmark({
  className,
  priority = false,
}: BrandWordmarkProps) {
  return (
    <>
      <Image
        src="/images/app_icons/splash_wordmark3.png"
        alt="팀플러스+"
        width={954}
        height={218}
        priority={priority}
        className={cn("h-5 w-auto object-contain dark:hidden", className)}
      />
      <Image
        src="/images/app_icons/splash_wordmark2.png"
        alt="팀플러스+"
        width={954}
        height={218}
        priority={priority}
        className={cn("hidden h-5 w-auto object-contain dark:block", className)}
      />
    </>
  );
}
