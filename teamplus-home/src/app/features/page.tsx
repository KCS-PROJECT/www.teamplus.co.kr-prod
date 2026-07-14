import type { Metadata } from 'next';
import { PageHero } from '@/components/layout/PageHero';
import { FeatureOverview } from '@/components/sections/FeatureOverview';
import { FeatureSignature } from '@/components/sections/FeatureSignature';
import { FeatureLedger } from '@/components/sections/FeatureLedger';
import { RoleGallery } from '@/components/sections/RoleGallery';
import { StoreBadge } from '@/components/ui/StoreBadge';
import { APP_DOWNLOAD } from '@/lib/content';
import { KEYWORDS } from '@/lib/seo';

const PAGE_TITLE = '주요 기능';
const PAGE_DESC =
  '아이스하키 클럽 운영에 필요한 회원 · 수업·강습 · QR 출석 관리 · 수업권 결제 · 카카오 알림톡 · 쇼핑 · 대회 · 채팅을 8개 모듈로 묶어 하나의 운영으로 이어줍니다.';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  keywords: [...KEYWORDS.sport, ...KEYWORDS.solution],
  alternates: { canonical: '/features' },
  openGraph: {
    url: '/features',
    title: PAGE_TITLE,
    description: PAGE_DESC,
  },
};

const HERO_TRUST = ['QR 출석·결제권 자동 차감', '수업·회원·알림 통합 관리', '대회·쇼핑 확장 모듈 포함'];

/**
 * /features — "8개 모듈이 하나의 운영으로".
 * 도입 CTA(스토어 다운로드 + 신뢰 신호)를 하단 FinalCta 에서 히어로로 끌어올림 →
 *   히어로에서 바로 전환(다운로드) 가능. 흐름: PageHero(+CTA) → 기능 인덱스(4개의 일)
 *   → 시그니처 워크플로(QR 한 흐름) → 8개 모듈 원장 → 실제 화면 갤러리.
 */
export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="기능 안내"
        title={
          <>
            8개 모듈이{' '}
            <br className="hidden sm:block" />
            <span className="text-ice-500">하나의 운영</span>으로
          </>
        }
        description="회원, 수업, QR 출석, 결제·수업권, 알림, 쇼핑, 대회, 채팅을 역할별 화면으로 정리했습니다. 현장에서는 출석과 수업을 빠르게 처리하고, 운영자는 매출과 커뮤니케이션을 한 흐름에서 확인합니다."
        primary={{ src: '/images/app-classes.png', alt: '팀플러스 수업·스케줄 앱 화면' }}
        secondary={{ src: '/images/app-schedule.png', alt: '' }}
      >
        {/* 히어로 도입 CTA */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <StoreBadge
            store="apple"
            href={APP_DOWNLOAD.appStore}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
          <StoreBadge
            store="google"
            href={APP_DOWNLOAD.googlePlay}
            className="w-full justify-center sm:w-auto sm:justify-start"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-wtext-4">
          {HERO_TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-ice-500" />
              {t}
            </span>
          ))}
        </div>
      </PageHero>

      <FeatureOverview />
      <FeatureSignature />
      <FeatureLedger />
      <RoleGallery />
    </>
  );
}
