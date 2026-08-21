'use client';

// 감독/코치 공지 관리 화면 — 2탭 재편 (Phase 1 · unit-notice-stream-design v1.2.3 §6).
//   탭 A "팀 공지"     = 기존 TeamNoticeListView(mode=manage, embedded) 그대로
//   탭 B "수업·대회"   = 단위 공지 통합 공지함 (UnitNoticeManagedList — 읽음 N/M 포함)
//   BottomNav 는 (director) 그룹 layout 이 렌더한다.
import { useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { TeamNoticeListView } from '@/components/notice/TeamNoticeListView';
import { UnitNoticeManagedList } from '@/components/notice/UnitNoticeManagedList';

const TABS = [
  { key: 'team', label: MESSAGES.unitNotice.tabTeam },
  { key: 'unit', label: MESSAGES.unitNotice.tabUnit },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function DirectorNoticesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('team');

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    appBarTitle: MESSAGES.unitNotice.managePageTitle,
    showBottomNav: true,
    showBackButton: true,
  });

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title={MESSAGES.unitNotice.managePageTitle} forceNative />

      {/* 탭 — SegmentedTabs 밑줄형 (director-payments 패턴) */}
      <div className="bg-it-surface dark:bg-rink-800">
        <div
          role="tablist"
          aria-label={MESSAGES.unitNotice.tabsAria}
          className="flex border-b border-it-line dark:border-rink-700"
        >
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`director-notices-panel-${tab.key}`}
                id={`director-notices-tab-${tab.key}`}
                key={tab.key}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                // [Codex R1 M-03] tablist 키보드 내비게이션 — 좌우 화살표로 탭 순환 이동
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  const delta = e.key === 'ArrowRight' ? 1 : -1;
                  const next = TABS[(index + delta + TABS.length) % TABS.length];
                  setActiveTab(next.key);
                  document
                    .getElementById(`director-notices-tab-${next.key}`)
                    ?.focus();
                }}
                className={cn(
                  'relative flex-1 px-1 pb-[13px] pt-[14px] text-[15px] transition-colors duration-200 motion-reduce:transition-none',
                  isActive
                    ? 'font-extrabold text-it-blue-600 dark:text-white'
                    : 'font-semibold text-it-ink-500 hover:text-it-ink-800 dark:text-wtext-4 dark:hover:text-white',
                )}
              >
                {tab.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 -bottom-px h-[2.5px] rounded-sm',
                    isActive ? 'bg-it-blue-500' : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* [Codex R1 M-03] aria-controls 대상 tabpanel — 탭별 패널 컨테이너 */}
      <div
        role="tabpanel"
        id={`director-notices-panel-${activeTab}`}
        aria-labelledby={`director-notices-tab-${activeTab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {activeTab === 'team' ? (
          <TeamNoticeListView
            title={MESSAGES.unitNotice.managePageTitle}
            canManage
            canWrite
            mode="manage"
            iceTheme
            embedded
          />
        ) : (
          <UnitNoticeManagedList />
        )}
      </div>
    </MobileContainer>
  );
}
