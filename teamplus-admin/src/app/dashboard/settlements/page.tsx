'use client';

/**
 * SettlementsPage - 정산 관리 (월 정산 / 결제 현황)
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 팀 월 정산 마감·승인·지급 흐름 + 팀별 결제 현황 조회
 * 2. 휴먼 디자인: 탭으로 두 관점(마감 처리 vs 현황 조회)을 분리
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect + analyzer 협업
 * 5. 명령어 필수: frontend-design 스킬 활용
 * 6. 결과 출력 필수: 7원칙 적용 내용 문서화
 * 7. Tone & Manner: MESSAGES 상수, 한글 탭/버튼 라벨
 */

import { useState } from 'react';
import { MESSAGES } from '@/lib/messages';
import { PageHeader } from '@/components/ui/page-header';
import { AdminTabs } from '@/components/ui/admin-tabs';
import { MonthlySettlementTab } from './_components/MonthlySettlementTab';
import { OverviewTab } from './_components/OverviewTab';

type SettlementTab = 'monthly' | 'overview';

export default function SettlementsPage() {
  const [activeTab, setActiveTab] = useState<SettlementTab>('monthly');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="정산 관리"
        description="팀별 월 정산을 마감·승인·지급 처리하고, 결제 현황을 조회합니다."
      />

      <AdminTabs
        tabs={[
          { id: 'monthly', label: MESSAGES.settlement.tabMonthly },
          { id: 'overview', label: MESSAGES.settlement.tabOverview },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as SettlementTab)}
        variant="segment"
      />

      {activeTab === 'monthly' && <MonthlySettlementTab />}
      {activeTab === 'overview' && <OverviewTab />}
    </div>
  );
}
