'use client';

// 감독/코치 공지 관리 화면 — 2탭 (unit-notice-stream-design §6·§7).
//   [Phase 2] 탭 A "팀 공지" 도 TeamPost 단일 소스로 전환 — UnitNoticeManagedList(axis='team').
//   (기존 TeamNoticeListView(mode=manage)는 이관 원본(SystemNotice) 소스라 교체 — 읽음 N/M 편입)
//   탭 B "훈련·대회"   = 단위 공지 통합 공지함 (UnitNoticeManagedList — 읽음 N/M 포함)
//   BottomNav 는 (director) 그룹 layout 이 렌더한다.
import { useEffect, useRef, useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { UnitNoticeManagedList } from '@/components/notice/UnitNoticeManagedList';

const TABS = [
  { key: 'team', label: MESSAGES.unitNotice.tabTeam },
  { key: 'unit', label: MESSAGES.unitNotice.tabUnit },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function DirectorNoticesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('team');
  // 페이지 첫 진입 여부 — 첫 탭 인스턴스만 진입 모션(slideUp)을 재생하고,
  // 탭 전환으로 재마운트되는 인스턴스는 즉시 전환한다 (모션 재생 시 "화면이
  // 사라졌다 아래에서 올라오는" 체감 — 사용자 지적 2026-08-21).
  const enteredRef = useRef(false);
  useEffect(() => {
    enteredRef.current = true;
  }, []);

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
        {/* [P2-R1-M02] key 분리 — 탭 전환 시 인스턴스를 새로 만들어 이전 축 상태·응답 오염 차단 */}
        {activeTab === 'team' ? (
          <UnitNoticeManagedList
            key="team"
            axis="team"
            disableEnterMotion={enteredRef.current}
          />
        ) : (
          <UnitNoticeManagedList
            key="unit"
            axis="unit"
            disableEnterMotion={enteredRef.current}
          />
        )}
      </div>
    </MobileContainer>
  );
}
