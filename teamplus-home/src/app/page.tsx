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
