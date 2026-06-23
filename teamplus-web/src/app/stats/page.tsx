'use client';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';

const statCards = [
  { id: 'stat-1', label: '이번 달 득점', value: '14골', icon: 'sports_hockey' },
  { id: 'stat-2', label: '어시스트', value: '9회', icon: 'handshake' },
  { id: 'stat-3', label: '참석률', value: '95%', icon: 'task_alt' },
];

export default function TeenStatsPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar showBack={false} title="나의 스탯" showMenu />
      <main className="flex-1 overflow-y-auto px-5 py-6 pb-30 bg-wbg dark:bg-rink-900">
        <div className="space-y-4">
          {statCards.map((item) => (
            <Card key={item.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-w-small font-semibold text-wtext-2 dark:text-rink-100">{item.label}</p>
                  <p className="text-2xl font-bold text-wtext-1 dark:text-white mt-1">{item.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ice-500/10 text-ice-500">
                  <Icon name={item.icon} className="text-xl" aria-hidden="true" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </MobileContainer>
  );
}
