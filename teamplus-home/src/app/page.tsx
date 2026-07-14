import { Hero } from '@/components/sections/Hero';
import { ProblemSolution } from '@/components/sections/ProblemSolution';
import { WhyTeamplus } from '@/components/sections/WhyTeamplus';
import { FeatureBento } from '@/components/sections/FeatureBento';
import { Showcase } from '@/components/sections/Showcase';
import { Personas } from '@/components/sections/Personas';
import { RoleGallery } from '@/components/sections/RoleGallery';
import { Stats } from '@/components/sections/Stats';
import { TrustBar } from '@/components/sections/TrustBar';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/content';
import { JsonLd } from '@/components/seo/JsonLd';
import { softwareApplicationSchema, faqSchema } from '@/lib/seo';

export const metadata: Metadata = {
  // 홈은 사이트 루트 — 기본 타이틀(템플릿 미적용) 유지.
  title: {
    absolute: `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`,
  },
  description:
    '유소년 아이스하키 클럽을 위한 통합 운영 앱. 수업·강습 일정, QR 출석 관리, 성장 기록, 수업권 결제, 카카오 알림톡까지 감독·코치·학부모가 하나의 앱에서 확인합니다.',
  alternates: { canonical: '/' },
};

/**
 * 홈(랜딩) — 설득 깔때기 순서로 조립.
 * 약속(Hero) → 문제+전환(ProblemSolution) → 차별점(WhyTeamplus) → 흐름(FeatureBento)
 *   → 실화면(Showcase) → 역할(Personas·RoleGallery) → 효율(Stats) → 인증(TrustBar)
 *   → 반론(Faq) → 전환(FinalCta).
 * 기술 Proof(Stats·TrustBar)는 욕구 형성 뒤로 배치 — 인증은 관심 있는 바이어를 안심시키는 도구.
 */
export default function HomePage() {
  return (
    <>
      {/* 제품(앱)·FAQ 구조화 데이터 — 답변 엔진/리치 결과 공급 */}
      <JsonLd data={[softwareApplicationSchema(), faqSchema()]} />
      <Hero />
      <ProblemSolution />
      <WhyTeamplus />
      <FeatureBento />
      <Showcase />
      <Personas />
      <RoleGallery />
      <Stats />
      <TrustBar />
      <Faq />
      <FinalCta />
    </>
  );
}
