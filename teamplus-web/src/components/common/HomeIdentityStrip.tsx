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
import { Icon } from '@/components/ui/Icon';
import { resolveImageSrc } from '@/lib/image-url';

export interface HomeIdentityStripProps {
  /** 대표 로고 URL(팀/아카데미) — 없거나 로드 실패 시 폴백 플레이스홀더 */
  logoUrl?: string | null;
  /**
   * 로고 폴백 이니셜 소스(1글자로 잘라 표시). **미전달·빈 문자열이면 팀 기본 아이콘**을 렌더한다.
   *
   * 이 슬롯은 팀/아카데미 아이덴티티 자리이므로 사람 이름을 넘기지 말 것 — 소속이 없는데
   * 이름 이니셜을 넣으면 subline("소속없음")과 어긋나 그 글자가 팀명처럼 읽힌다.
   * 팀 기본 아이콘(`sports_hockey`)은 team/[id] 히어로·TeamListCard·MatchHeroCard 와 동일한
   * 프로젝트 관용이다.
   */
  fallbackInitial?: string | null;
  /**
   * 이니셜이 없을 때 쓸 기본 아이콘. 기본값은 팀 기본 아이콘 `sports_hockey`.
   * 오픈클래스(Academy) 홈은 팀이 아니므로 `school` 을 넘긴다 — academies/[id]·academy/[id]·
   * AcademyCard 가 쓰는 오픈클래스 관용과 맞춘다.
   */
  fallbackIcon?: string;
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
  fallbackIcon = 'sports_hockey',
  title,
  subline,
  sublineTone = 'default',
  action,
  ariaLabel,
}: HomeIdentityStripProps) {
  // 로드 실패(404/깨짐) URL 기억 → 폴백 플레이스홀더 대체.
  //   URL 값 기준이므로 대상 전환으로 다른 로고가 되면 자동으로 다시 시도.
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  // 판정은 **해석된 URL** 기준 — resolveImageSrc 는 빈 문자열·공백·placeholder.svg 를
  //  undefined 로 돌려주므로, 원본 truthy 만 보면 src 없는 빈 img 가 남고 onError 도 안 뜬다.
  const resolvedLogo = resolveImageSrc(logoUrl);
  const showLogo = !!resolvedLogo && resolvedLogo !== brokenLogo;
  // 이니셜 소스가 없으면 팀 기본 아이콘으로 폴백(공백만 넘어온 경우도 아이콘).
  const initial = fallbackInitial?.trim().charAt(0) || null;

  return (
    <section
      className="bg-it-blue-800 dark:bg-it-blue-900 flex items-center gap-3 px-5 py-[18px]"
      aria-label={ariaLabel ?? title}
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedLogo}
          alt=""
          onError={() => setBrokenLogo(resolvedLogo!)}
          className="size-11 rounded-xl object-cover shrink-0"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-11 rounded-xl bg-white/[0.12] flex items-center justify-center text-[18px] font-bold text-white shrink-0"
        >
          {initial ?? (
            <Icon name={fallbackIcon} className="text-[22px] text-white" />
          )}
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
