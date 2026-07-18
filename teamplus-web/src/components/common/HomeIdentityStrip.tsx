'use client';

/**
 * HomeIdentityStrip — 역할 홈 상단 정체성 스트립 (네이비 밴드, 공용)
 *
 * 헤더(WalletAppBar)에서 분리한 정체성 정보(로고 · 이름 · 팀/소속) 전용 영역.
 * parent(자녀 + [선택] 버튼) · director · coach · academy-director 4개 홈이 공유한다.
 * 헤더는 액션 아이콘 전용으로 비우고(title="") 정체성은 본 스트립이 전담한다.
 *
 * ICETIMES navy 히어로 밴드 문법(credits 히어로와 동일 계열) — 흰 헤더와의 경계 확보.
 * dark 는 주변 it-blue-950 표면보다 한 단계 밝은 it-blue-900.
 * SoT: DESIGN.md §7(절대 금지) — gradient/backdrop-blur/컬러 그림자 0건.
 */

import { memo, useState, type ReactNode } from 'react';
import { resolveImageSrc } from '@/lib/image-url';

export interface HomeIdentityStripProps {
  /** 대표 로고 URL(팀/아카데미) — 없거나 로드 실패 시 이니셜 플레이스홀더 */
  logoUrl?: string | null;
  /** 로고 폴백 이니셜 소스(1글자로 잘라 표시) — 보통 팀명, 없으면 이름 */
  fallbackInitial: string;
  /** 1행 — 주 정체성 (자녀명 / "김감독 감독" 등) */
  title: string;
  /** 2행 — 소속(팀 · 팀 조인) 또는 상태 라벨. 없으면 1행만 노출 */
  subline?: string | null;
  /** 2행 톤 — warning 은 승인 대기 등 주의 상태(amber) */
  sublineTone?: 'default' | 'warning';
  /** 우측 액션 슬롯 (예: parent 자녀 [선택] 버튼) */
  action?: ReactNode;
  ariaLabel?: string;
}

export const HomeIdentityStrip = memo(function HomeIdentityStrip({
  logoUrl,
  fallbackInitial,
  title,
  subline,
  sublineTone = 'default',
  action,
  ariaLabel,
}: HomeIdentityStripProps) {
  // 로드 실패(404/깨짐) URL 기억 → 이니셜 플레이스홀더 대체.
  //   URL 값 기준이므로 대상 전환으로 다른 로고가 되면 자동으로 다시 시도.
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  const showLogo = !!logoUrl && logoUrl !== brokenLogo;

  return (
    <section
      className="bg-it-blue-800 dark:bg-it-blue-900 flex items-center gap-3 px-5 py-[18px]"
      aria-label={ariaLabel ?? title}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveImageSrc(logoUrl!)}
          alt=""
          onError={() => setBrokenLogo(logoUrl!)}
          className="size-11 rounded-xl object-cover shrink-0"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-11 rounded-xl bg-white/[0.12] flex items-center justify-center text-[18px] font-bold text-white shrink-0"
        >
          {fallbackInitial.charAt(0)}
        </span>
      )}
      <div className="flex-1 flex flex-col min-w-0 gap-0.5">
        <p className="text-[17px] leading-tight font-bold text-white truncate">
          {title}
        </p>
        {subline && (
          <p
            className={`text-card-meta truncate ${
              sublineTone === 'warning'
                ? 'text-amber-300 font-semibold'
                : 'text-white/65'
            }`}
          >
            {subline}
          </p>
        )}
      </div>
      {action}
    </section>
  );
});
