import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/PageHeader';
import { Cases } from '@/components/sections/Cases';
import { TrustBar } from '@/components/sections/TrustBar';
import { Stats } from '@/components/sections/Stats';
import { RoleGallery } from '@/components/sections/RoleGallery';
import { FinalCta } from '@/components/sections/FinalCta';

export const metadata: Metadata = {
  title: '도입 사례',
  description:
    '안양 ACE · 서울 Glacier · 부산 Polar Kids · i-League 연합까지 — 규모와 성격이 다른 클럽이 어떻게 TEAMPLUS 으로 운영을 바꿨는지 확인해 보세요.',
};

export default function CasesPage() {
  return (
    <>
      <PageHeader
        eyebrow="도입 사례"
        title={
          <>
            실제 클럽이 말하는
            <br className="hidden sm:block" />
            <span className="text-ice-600">팀플러스+</span>
          </>
        }
        description="유소년 아카데미부터 국내 최대 리그까지. TEAMPLUS 을 도입한 클럽들은 공통적으로 운영 시간을 70% 이상 단축했습니다."
      />

      <TrustBar />
      <Stats />
      <Cases />
      <RoleGallery />
      <FinalCta />
    </>
  );
}
