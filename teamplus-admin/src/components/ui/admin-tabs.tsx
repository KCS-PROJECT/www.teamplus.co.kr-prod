'use client';

/**
 * AdminTabs - TEAMPLUS 표준 탭 컴포넌트
 *
 * === Design 7 Principles ===
 * 1. 화면 분석: 업무관리 전체 화면의 탭 일관성
 * 2. 휴먼 디자인: 세그먼트 컨트롤 스타일
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 색상: Ice Blue (#1E40AF) 통일
 */

import { ReactNode, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

// ============================================
// 타입 정의
// ============================================

interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

interface AdminTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'segment' | 'pill' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

interface AdminTabButtonProps {
  tab: TabItem;
  isActive: boolean;
  onClick: () => void;
  variant: 'segment' | 'pill' | 'underline';
  size: 'sm' | 'md' | 'lg';
}

// ============================================
// 스타일 상수
// ============================================

const sizeStyles = {
  sm: {
    container: 'p-1 gap-0.5',
    button: 'px-3 py-1.5 text-xs',
    icon: 'w-3.5 h-3.5',
  },
  md: {
    container: 'p-1 gap-1',
    button: 'px-4 py-2 text-sm',
    icon: 'w-4 h-4',
  },
  lg: {
    container: 'p-1.5 gap-1',
    button: 'px-5 py-2.5 text-sm',
    icon: 'w-4 h-4',
  },
};

const variantStyles = {
  segment: {
    container: 'bg-slate-100 dark:bg-slate-800 rounded-xl',
    active: 'bg-primary text-white shadow-md',
    inactive: 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50',
    buttonBase: 'rounded-lg',
  },
  pill: {
    container: 'gap-2',
    active: 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100 shadow-sm',
    inactive: 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-white',
    buttonBase: 'rounded-full border-2',
  },
  underline: {
    container: 'border-b border-slate-200 dark:border-slate-700 gap-0',
    active: 'text-primary dark:text-primary-light border-b-2 border-primary dark:border-primary-light -mb-px',
    inactive: 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 border-b-2 border-transparent -mb-px',
    buttonBase: 'rounded-none',
  },
};

// ============================================
// 탭 버튼 컴포넌트
// ============================================

function AdminTabButton({ tab, isActive, onClick, variant, size }: AdminTabButtonProps) {
  const Icon = tab.icon;
  const styles = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 font-semibold transition-all duration-200',
        styles.buttonBase,
        sizeStyle.button,
        isActive ? styles.active : styles.inactive,
        'active:scale-[0.98]'
      )}
    >
      {Icon && <Icon className={sizeStyle.icon} />}
      <span>{tab.label}</span>
      {tab.count !== undefined && (
        <span className={cn(
          'px-1.5 py-0.5 rounded-full text-xs font-medium',
          isActive
            ? 'bg-primary/10 text-primary dark:bg-primary-light/20 dark:text-primary-light'
            : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
        )}>
          {tab.count}
        </span>
      )}
    </button>
  );
}

// ============================================
// 메인 탭 컴포넌트
// ============================================

export function AdminTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'segment',
  size = 'md',
  fullWidth = false,
  className,
}: AdminTabsProps) {
  const styles = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  return (
    <div
      className={cn(
        'inline-flex',
        styles.container,
        sizeStyle.container,
        fullWidth && 'w-full',
        className
      )}
    >
      {tabs.map((tab) => (
        <div key={tab.id} className={fullWidth ? 'flex-1' : undefined}>
          <AdminTabButton
            tab={tab}
            isActive={activeTab === tab.id}
            onClick={() => onChange(tab.id)}
            variant={variant}
            size={size}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================
// 필터 탭 (Pill 스타일 래퍼)
// ============================================

interface FilterTabsProps {
  options: string[];
  selected: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterTabs({ options, selected, onChange, className }: FilterTabsProps) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-full border-2 transition-all duration-150 whitespace-nowrap',
            'active:scale-95',
            selected === option
              ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100 shadow-sm'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-white'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// ============================================
// 상태 필터 탭 (Segment 스타일 래퍼)
// ============================================

interface StatusFilterProps {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
  className?: string;
}

export function StatusFilter({ options, selected, onChange, className }: StatusFilterProps) {
  const selectedIndex = options.findIndex(opt => opt.value === selected);
  const itemWidth = 100 / options.length;

  return (
    <div className={cn('relative flex gap-0 bg-slate-100 dark:bg-slate-700 rounded-lg p-1 min-w-[200px]', className)}>
      {/* 슬라이딩 인디케이터 */}
      <div 
        className="absolute top-1 bottom-1 transition-all duration-300 ease-in-out bg-primary rounded-md shadow-sm"
        style={{ 
          left: `calc(${selectedIndex * itemWidth}% + 4px)`, 
          width: `calc(${itemWidth}% - 8px)` 
        }}
      />
      
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'relative z-10 flex-1 px-3 py-1.5 text-sm font-semibold transition-colors duration-300 whitespace-nowrap',
            selected === option.value
              ? 'text-white'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default AdminTabs;

// ============================================
// Radix UI 스타일 탭 컴포넌트
// ============================================

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs 컴포넌트 내부에서 사용해야 합니다.');
  }
  return context;
}

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl',
        className
      )}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { value: activeValue, onValueChange } = useTabsContext();
  const isActive = activeValue === value;

  return (
    <button
      onClick={() => onValueChange(value)}
      className={cn(
        'px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200',
        'active:scale-[0.98]',
        isActive
          ? 'bg-primary text-white shadow-md'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-700/50',
        className
      )}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { value: activeValue } = useTabsContext();

  if (activeValue !== value) {
    return null;
  }

  return <div className={cn('mt-4', className)}>{children}</div>;
}
