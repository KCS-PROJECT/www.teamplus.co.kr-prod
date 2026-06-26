'use client';

import { Icon } from '@/components/ui/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { useModal } from '@/components/ui/Modal';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { cn } from '@/lib/utils';
import { usePageReady } from '@/hooks/usePageReady';

export default function NotificationSettingsPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { modal } = useModal();
  const {
    settings,
    isLoading,
    togglePush,
    toggleCategory,
    toggleSound,
    toggleVibration,
    toggleQuietHours,
    setQuietHoursStart,
    setQuietHoursEnd,
    resetSettings,
  } = useNotificationSettings();

  // v18 (2026-05-20, audit §4 C #2): isLoading 도착 후 ready — 이중 로더 race 차단.
  usePageReady(!isLoading);

  if (isLoading) {
    return (
      <MobileContainer hasBottomNav={false}>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
        </div>
      </MobileContainer>
    );
  }

  return (
    <MobileContainer hasBottomNav={false} className="bg-it-canvas dark:bg-puck">
      <PageAppBar title="알림 설정" forceNative />

      {/* 설정 목록 — ICETIMES flat: full-bleed 흰 섹션 + hairline 행 */}
      <main className="flex-1 overflow-y-auto pb-8">
        {/* 푸시 알림 마스터 토글 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <div className="px-5 py-4">
            <Toggle
              checked={settings.pushEnabled}
              onChange={togglePush}
              label="푸시 알림"
              description="모든 알림을 한 번에 켜거나 끕니다"
            />
          </div>
        </section>

        {/* 카테고리별 설정 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider px-5 pt-4 pb-1">
            알림 카테고리
          </h2>
          <div className="divide-y divide-it-line dark:divide-rink-700 px-1">
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.class}
                onChange={() => toggleCategory('class')}
                disabled={!settings.pushEnabled}
                label="수업 알림"
                description="수업 일정 변경, 준비물 안내"
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.payment}
                onChange={() => toggleCategory('payment')}
                disabled={!settings.pushEnabled}
                label="결제 알림"
                description="결제 완료, 청구서, 환불 안내"
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.notice}
                onChange={() => toggleCategory('notice')}
                disabled={!settings.pushEnabled}
                label="공지 알림"
                description="팀 공지, 이벤트, 회원 승인"
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.system}
                onChange={() => toggleCategory('system')}
                disabled={!settings.pushEnabled}
                label="시스템 알림"
                description="시스템 점검, 업데이트 안내"
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.categories.marketing}
                onChange={() => toggleCategory('marketing')}
                disabled={!settings.pushEnabled}
                label="마케팅 정보 수신"
                description="이벤트, 혜택, 프로모션 등 광고성 정보 (선택)"
              />
            </div>
          </div>
        </section>

        {/* 알림 방식 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider px-5 pt-4 pb-1">
            알림 방식
          </h2>
          <div className="divide-y divide-it-line dark:divide-rink-700 px-1">
            <div className="px-4 py-4">
              <Toggle
                checked={settings.soundEnabled}
                onChange={toggleSound}
                disabled={!settings.pushEnabled}
                label="알림음"
                description="알림이 올 때 소리로 알려줍니다"
              />
            </div>
            <div className="px-4 py-4">
              <Toggle
                checked={settings.vibrationEnabled}
                onChange={toggleVibration}
                disabled={!settings.pushEnabled}
                label="진동"
                description="알림이 올 때 진동으로 알려줍니다"
              />
            </div>
          </div>
        </section>

        {/* 방해금지 모드 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950">
          <h2 className="text-card-meta font-bold text-it-ink-500 dark:text-rink-300 uppercase tracking-wider px-5 pt-4 pb-1">
            방해금지 모드
          </h2>
          <div className="px-1">
            <div className="px-4 py-4">
              <Toggle
                checked={settings.quietHours.enabled}
                onChange={toggleQuietHours}
                disabled={!settings.pushEnabled}
                label="방해금지 모드"
                description="설정한 시간 동안 알림을 받지 않습니다"
              />
            </div>

            {settings.quietHours.enabled && settings.pushEnabled && (
              <div className="mx-3 px-4 pb-4 pt-2 border-t border-it-line dark:border-rink-700">
                {/* 시간 input 박스 — 작은 화면(360px)에서 종료 시간이 우측 외곽으로 튕겨나가지
                    않도록 `flex-1 min-w-0` 적용. 부모 컨테이너는 gap-2 + items-center 로
                    아이콘과 input 정렬. (이슈 W2.C #8: 방해 금지 모드 종료 시간 박스 외곽 노출 해결) */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="block text-card-meta text-it-ink-500 dark:text-rink-300 mb-1">
                      시작 시간
                    </label>
                    <input
                      type="time"
                      value={settings.quietHours.startTime}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                      className={cn(
                        'w-full min-w-0 px-3 py-2 rounded-w-md text-card-body',
                        'bg-it-fill dark:bg-rink-700',
                        'text-it-ink-800 dark:text-white',
                        'border-[1.5px] border-it-line-strong dark:border-rink-600',
                        'focus:outline-none focus:ring-2 focus:ring-it-blue-500 focus:border-transparent'
                      )}
                    />
                  </div>
                  <Icon
                    name="arrow_forward"
                    className="shrink-0 text-it-ink-400 mt-5"
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <label className="block text-card-meta text-it-ink-500 dark:text-rink-300 mb-1">
                      종료 시간
                    </label>
                    <input
                      type="time"
                      value={settings.quietHours.endTime}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                      className={cn(
                        'w-full min-w-0 px-3 py-2 rounded-w-md text-card-body',
                        'bg-it-fill dark:bg-rink-700',
                        'text-it-ink-800 dark:text-white',
                        'border-[1.5px] border-it-line-strong dark:border-rink-600',
                        'focus:outline-none focus:ring-2 focus:ring-it-blue-500 focus:border-transparent'
                      )}
                    />
                  </div>
                </div>
                <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-3 tabular-nums">
                  {settings.quietHours.startTime} ~ {settings.quietHours.endTime} 동안
                  알림을 받지 않습니다
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 설정 초기화 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 py-3">
          <button
            onClick={async () => {
              const confirmed = await modal.confirm({
                title: '설정 초기화',
                message: '알림 설정을 초기화하시겠습니까?',
                confirmText: '초기화',
                cancelText: '취소',
                variant: 'danger',
              });
              if (confirmed) {
                resetSettings();
              }
            }}
            className="w-full py-3 text-card-body font-medium text-it-red-500 dark:text-it-red-300 hover:bg-it-red-50 dark:hover:bg-it-red-500/15 rounded-w-md transition-colors motion-reduce:transition-none"
          >
            설정 초기화
          </button>
        </section>

        {/* 안내 문구 — it-fill 인셋 행 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-4 py-4">
          <div className="flex items-start gap-3 p-4 bg-it-fill dark:bg-rink-800 rounded-w-md">
            <Icon name="info" className="text-it-ink-400 dark:text-rink-400 flex-shrink-0 mt-0.5" />
            <p className="text-card-meta text-it-ink-500 dark:text-rink-300 leading-relaxed">
              앱 알림을 받으려면 기기 설정에서도 알림을 허용해야 합니다.
              기기 설정 &gt; 알림 &gt; TEAMPLUS에서 확인하세요.
            </p>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
