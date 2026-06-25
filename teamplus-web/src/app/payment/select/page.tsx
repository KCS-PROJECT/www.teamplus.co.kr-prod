'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { PaymentStepIndicator, StepHeadline } from '@/components/payment/PaymentStepIndicator';
import { BottomSheetSelector } from '@/components/ui';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useChildren } from '@/hooks/useChildren';
import { api } from '@/services/api-client';
import { usePageReady } from '@/hooks/usePageReady';

const GlobalMenu = dynamic(() => import('@/components/layout/GlobalMenu').then(mod => ({ default: mod.GlobalMenu })), { ssr: false });

interface ClassOption {
  id: string;
  productId: string;
  level: string;
  levelColor: string;
  title: string;
  schedule: string;
  price: number;
  instructor?: string;
}

interface ApiClass {
  id: string;
  className: string;
  instructorName: string;
  capacity: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  levelRequired?: string | null;
}

interface ClassProduct {
  id: string;
  productName: string;
  price: number;
  sessionsPerMonth: number;
  durationDays: number;
}

const categories = ['전체', '유아반', '초등반', '성인반', '선수반'];

function getLevelColor(level?: string | null): string {
  const map: Record<string, string> = {
    '초급': 'bg-it-blue-50 text-it-blue-500 border-it-blue-500/20',
    '중급': 'bg-mint/10 text-success border-mint/30',
    '선수반': 'bg-it-red-50 text-it-red-600 border-it-red-500/20',
  };
  return map[level ?? ''] ?? 'bg-it-fill text-it-ink-600 border-it-line-strong';
}

function formatSchedule(startTime: string, endTime: string): string {
  const s = new Date(startTime);
  const e = new Date(endTime);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${days[s.getDay()]}요일 ${fmt(s)} - ${fmt(e)}`;
}

function ClassOptionCard({
  option,
  isSelected,
  onSelect,
}: {
  option: ClassOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`group relative flex items-start gap-3 cursor-pointer border-b border-it-line dark:border-rink-700 py-4 last:border-b-0 transition-colors motion-reduce:transition-none ${
        isSelected ? 'bg-it-blue-50/60 dark:bg-it-blue-500/10' : ''
      }`}
    >
      {/* Selection Indicator */}
      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          type="radio"
          name="class-selection"
          checked={isSelected}
          onChange={onSelect}
          className="peer sr-only"
          aria-label={`${option.title} 선택, ${option.schedule}, ${option.price.toLocaleString()}원${option.instructor ? `, 강사 ${option.instructor}` : ''}`}
        />
        <div
          className={`w-6 h-6 rounded-w-pill border-2 transition-all motion-reduce:transition-none relative ${
            isSelected
              ? 'border-it-blue-500 bg-it-blue-500'
              : 'border-it-line-strong dark:border-rink-300'
          }`}
        >
          <div
            className={`absolute inset-0 m-auto w-2.5 h-2.5 rounded-w-pill bg-white transition-transform motion-reduce:transition-none ${
              isSelected ? 'scale-100' : 'scale-0'
            }`}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Badge */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-w-pill text-[10px] font-bold uppercase tracking-wide border ${option.levelColor}`}
          >
            {option.level}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-it-ink-900 dark:text-white text-[15.5px] font-bold leading-snug mb-1">
          {option.title}
        </h3>

        {/* Schedule & Instructor */}
        <div className="flex items-center gap-3 text-card-meta text-it-ink-500 dark:text-rink-300 mb-2.5">
          <div className="flex items-center gap-1">
            <Icon name="schedule" className="text-card-emphasis" />
            <span>{option.schedule}</span>
          </div>
          {option.instructor && (
            <div className="flex items-center gap-1">
              <Icon name="person" className="text-card-emphasis" />
              <span>{option.instructor}</span>
            </div>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-[22px] font-extrabold tracking-tight tabular-nums transition-colors motion-reduce:transition-none ${
              isSelected
                ? 'text-it-blue-600 dark:text-it-blue-300'
                : 'text-it-ink-900 dark:text-white'
            }`}
          >
            {option.price.toLocaleString()}
          </span>
          <span className="text-card-meta text-it-ink-500 dark:text-rink-300 font-medium">
            원 / 월
          </span>
        </div>
      </div>

      {/* Selected Checkmark */}
      {isSelected && (
        <div className="shrink-0 self-center">
          <div className="w-6 h-6 rounded-w-pill bg-it-blue-500 flex items-center justify-center">
            <Icon name="check" className="text-white text-card-body" />
          </div>
        </div>
      )}
    </label>
  );
}

export default function PaymentSelectPage() {
  const { back } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // 자녀 컨텍스트 — Phase 2 P3 BottomSheetSelector 통합 (자녀 선택)
  // 이 단계에서 미리 자녀를 선택해두면 옵션(Step 2) 페이지에서 자동 적용된다.
  const { children } = useChildren();
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [isChildSheetOpen, setIsChildSheetOpen] = useState(false);

  // 자녀 자동 선택: 첫 자녀가 로드되면 기본값으로 사용
  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId),
    [children, selectedChildId],
  );

  // Native UI 설정
  useNativeUI({
    showStatusBar: true,
    showAppBar: true,
    appBarTitle: '수업 결제',
    showBottomNav: false,
    showBackButton: true,
    onBackPress: () => back(),
  });

  // 수업 목록 — useState + useEffect 기반 로드
  const [classOptionsData, setClassOptionsData] = useState<ClassOption[]>([]);
  const [isClassesLoading, setIsClassesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsClassesLoading(true);
        const listRes = await api.get<Array<{ id: string }>>('/teams/my/list');
        if (!listRes.success || !listRes.data?.[0]) {
          if (mounted) setClassOptionsData([]);
          return;
        }
        const clubId = listRes.data[0].id;

        const classesRes = await api.get<ApiClass[]>(`/teams/${clubId}/classes`);
        if (!classesRes.success || !Array.isArray(classesRes.data)) {
          if (mounted) setClassOptionsData([]);
          return;
        }

        const activeClasses = classesRes.data.filter((c) => c.isActive);
        const productsResults = await Promise.all(
          activeClasses.map((c) =>
            api.get<ClassProduct[]>(`/teams/${clubId}/classes/${c.id}/products`),
          ),
        );
        const result = activeClasses.map((cls, i) => {
          const firstProduct = productsResults[i]?.data?.[0];
          return {
            id: cls.id,
            productId: firstProduct?.id ?? '',
            level: cls.levelRequired ?? '일반',
            levelColor: getLevelColor(cls.levelRequired),
            title: cls.className,
            schedule: formatSchedule(cls.startTime, cls.endTime),
            price: firstProduct?.price ?? 0,
            instructor: cls.instructorName,
          };
        });
        if (mounted) setClassOptionsData(result);
      } finally {
        if (mounted) setIsClassesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const classOptions = useMemo(() => classOptionsData, [classOptionsData]);
  const isLoading = isClassesLoading;
  usePageReady(!isLoading); // v16 — 수업 목록 로드 완료 시 hide 신호

  // 최초 로딩 완료 시 첫 번째 수업 기본 선택 (선택 상태 유지를 위해 effect 로 분리)
  useEffect(() => {
    if (classOptions.length > 0 && !selectedClassId) {
      setSelectedClassId(classOptions[0].id);
      setSelectedProductId(classOptions[0].productId);
    }
  }, [classOptions, selectedClassId]);

  const selectedClass = useMemo(
    () => classOptions.find((c) => c.id === selectedClassId),
    [classOptions, selectedClassId]
  );

  const filteredClasses = useMemo(() => {
    return classOptions.filter((c) => {
      if (searchQuery) {
        return c.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [classOptions, searchQuery]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="수업 결제" />

      {/* Step Indicator */}
      <div className="px-6 py-4 bg-it-canvas dark:bg-puck">
        <PaymentStepIndicator currentStep={1} iceTheme />
      </div>

      {/* Scroll body — ICETIMES flat (it-canvas) */}
      <div className="flex-1 overflow-y-auto flex flex-col bg-it-canvas dark:bg-puck [&>*]:shrink-0">
        {/* Step Headline + 자녀 선택 + 검색 + 카테고리 — 흰 섹션 */}
        <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-3">
          <StepHeadline currentStep={1} iceTheme />

          {/* 자녀 컨텍스트 — Phase 2 P3 BottomSheetSelector 통합 */}
          {/* 자녀가 1명 이상 등록된 학부모에게만 노출 (코치/감독 진입 시 graceful hide) */}
          {children.length > 0 && (
            <button
              type="button"
              onClick={() => setIsChildSheetOpen(true)}
              className="flex w-full items-center justify-between rounded-w-md border border-it-line-strong bg-it-fill px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:border-it-blue-500/40 active:brightness-95 dark:border-rink-700 dark:bg-rink-800 mb-3"
              aria-haspopup="dialog"
              aria-expanded={isChildSheetOpen}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-w-pill bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-500">
                  <Icon name="person" className="text-card-title" aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-it-ink-500 dark:text-rink-300">
                    수강생
                  </span>
                  <span className="text-card-body font-bold text-it-ink-900 dark:text-white">
                    {selectedChild ? `${selectedChild.name} 위한 수업` : '수강생을 선택하세요'}
                  </span>
                </div>
              </div>
              <Icon
                name="expand_more"
                className="text-xl text-it-ink-400 dark:text-rink-300"
                aria-hidden="true"
              />
            </button>
          )}

          {/* Search Bar */}
          <div className="relative group mb-3">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Icon
                name="search"
                className="text-it-ink-400 dark:text-rink-300 group-focus-within:text-it-blue-500 transition-colors motion-reduce:transition-none"
              />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full p-4 pl-12 text-card-body text-it-ink-900 dark:text-white bg-it-fill dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 rounded-w-md focus:ring-2 focus:ring-it-blue-500/40 focus:border-it-blue-500 placeholder-it-ink-400 dark:placeholder-rink-300 transition-colors motion-reduce:transition-none"
              placeholder="수업명, 강사명 검색..."
            />
          </div>

          {/* Category Chips — ICETIMES chip (pill h36 · border 1.5px) */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {categories.map((category, index) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(index)}
                className={`shrink-0 h-9 px-4 text-[14px] font-bold rounded-w-pill border-[1.5px] transition-colors motion-reduce:transition-none active:brightness-95 ${
                  selectedCategory === index
                    ? 'bg-it-blue-500 text-white border-it-blue-500'
                    : 'bg-it-surface dark:bg-rink-800 text-it-ink-600 dark:text-rink-100 border-it-line-strong dark:border-rink-700 hover:border-it-blue-500/50 hover:text-it-blue-500'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        {/* Class Options List — 흰 섹션 (8px 회색 갭 위 hairline 행) */}
        {isLoading ? null : filteredClasses.length > 0 ? (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5">
            {filteredClasses.map((option) => (
              <ClassOptionCard
                key={option.id}
                option={option}
                isSelected={selectedClassId === option.id}
                onSelect={() => { setSelectedClassId(option.id); setSelectedProductId(option.productId); }}
              />
            ))}
          </section>
        ) : (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 flex flex-col items-center justify-center py-16 text-center">
            <Icon name="search_off" className="text-5xl text-it-ink-400 dark:text-rink-500 mb-4" />
            <p className="text-it-ink-500 dark:text-rink-300 font-medium">
              검색 결과가 없습니다
            </p>
            <p className="text-card-body text-it-ink-400 dark:text-rink-300 mt-1">
              다른 검색어로 시도해보세요
            </p>
          </section>
        )}

        {/* Selected Summary + CTA — 흰 섹션 (스크롤 마지막) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4 flex flex-col gap-4">
          <div
            className="flex items-center justify-between"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-card-body font-medium text-it-ink-500 dark:text-rink-300">
              선택한 수업
            </span>
            <span className="text-card-body font-bold text-it-ink-900 dark:text-white">
              {selectedClass ? (
                <span className="flex items-center gap-2">
                  <span>{selectedClass.title}</span>
                  <span className="text-card-meta text-it-ink-500 dark:text-rink-300">
                    ({selectedClass.level})
                  </span>
                </span>
              ) : (
                '선택 필요'
              )}
            </span>
          </div>
          <NavLink
            href={`/payment/options?classId=${selectedClassId}&productId=${selectedProductId}${
              selectedChildId ? `&childId=${selectedChildId}` : ''
            }`}
            className="w-full h-14 bg-it-blue-500 hover:bg-it-blue-600 text-white font-bold rounded-w-md shadow-sh-1 flex items-center justify-center gap-2 transition-colors motion-reduce:transition-none active:brightness-95"
          >
            <span>다음 단계로</span>
            <Icon name="arrow_forward" className="text-card-title" />
          </NavLink>
        </section>
      </div>

      <GlobalMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      {/* Phase 2 P3 — 자녀 선택 BottomSheetSelector */}
      <BottomSheetSelector<string>
        isOpen={isChildSheetOpen}
        title="수강생을 선택해주세요."
        items={children.map((c) => ({
          id: c.id,
          name: c.name,
          sub: typeof c.age === 'number' ? `만 ${c.age}세` : undefined,
          selected: c.id === selectedChildId,
        }))}
        onSelect={(id) => {
          setSelectedChildId(id);
          setIsChildSheetOpen(false);
        }}
        onClose={() => setIsChildSheetOpen(false)}
      />
    </MobileContainer>
  );
}
