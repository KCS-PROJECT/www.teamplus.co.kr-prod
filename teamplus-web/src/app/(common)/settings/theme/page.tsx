'use client';

export const dynamic = 'force-dynamic';

import { useTheme } from '@/contexts/ThemeContext';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';

export default function ThemeSettingsPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  const { setTheme } = useTheme();
  // 라이트 모드 단일 강제: theme 값은 ThemeContext 내부에서 항상 'light' 로 고정됨
  const theme = 'light' as const;

  // 네이티브 AppBar 끄고 공통 컴포넌트 PageAppBar(forceNative) 사용
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const themeOptions = [
    {
      id: 'light',
      label: '라이트 모드',
      icon: 'light_mode',
      description: '밝고 깨끗한 화면',
      disabled: false,
    },
    {
      id: 'dark',
      label: '다크 모드',
      icon: 'dark_mode',
      description: '현재 지원되지 않습니다',
      disabled: true,
    },
    {
      id: 'system',
      label: '시스템 설정',
      icon: 'smartphone',
      description: '현재 지원되지 않습니다',
      disabled: true,
    },
  ] as const;

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="화면 테마" showBack forceNative />

      {/* Content */}
      <main className="flex-1 p-4 overflow-y-auto hide-scrollbar bg-wbg">
        {/* 안내 카드 — 라이트 모드 단일 지원 명시 */}
        <div className="mb-4 flex items-start gap-3 p-4 bg-wsurface rounded-w-lg border border-wline-2">
          <Icon name="info" className="text-ice-500 flex-shrink-0 mt-0.5" />
          <p className="text-w-caption text-wtext-2 leading-relaxed">
            현재 TEAMPLUS는 라이트 모드만 지원합니다. 다크 모드와 시스템 설정 연동은 추후 제공될 예정입니다.
          </p>
        </div>

        <div className="bg-wsurface rounded-w-xl overflow-hidden border border-wline-2 shadow-sh-1">
          {themeOptions.map((option, index) => {
            const isSelected = theme === option.id;
            const isDisabled = option.disabled;
            const baseBorder = index !== themeOptions.length - 1 ? 'border-b border-wline-2' : '';
            const interactClass = isDisabled
              ? 'cursor-not-allowed opacity-50'
              : isSelected
                ? 'bg-ice-50'
                : 'hover:bg-wbg transition-colors motion-reduce:transition-none';

            return (
              <button
                type="button"
                key={option.id}
                onClick={() => {
                  if (isDisabled) return;
                  setTheme(option.id as 'light' | 'dark' | 'system');
                }}
                disabled={isDisabled}
                aria-disabled={isDisabled}
                aria-pressed={isSelected}
                className={`w-full flex items-center justify-between p-4 ${baseBorder} ${interactClass}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-w-pill flex items-center justify-center ${
                    isSelected
                      ? 'bg-ice-500 text-white'
                      : 'bg-wbg text-wtext-3'
                  }`}>
                    <Icon name={option.icon} className="text-xl" />
                  </div>
                  <div className="text-left">
                    <p className={`text-w-small font-bold ${
                      isSelected ? 'text-ice-600' : 'text-wtext-1'
                    }`}>
                      {option.label}
                    </p>
                    <p className="text-w-caption text-wtext-3 mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <div className="text-ice-500">
                    <Icon name="check_circle" className="text-2xl" filled />
                  </div>
                )}
                {isDisabled && !isSelected && (
                  <span className="text-w-caption font-medium text-wtext-4 px-2 py-1 rounded-md bg-wbg border border-wline-2">
                    지원 예정
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </MobileContainer>
  );
}
