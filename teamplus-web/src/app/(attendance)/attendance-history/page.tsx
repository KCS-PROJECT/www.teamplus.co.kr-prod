'use client';

import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNavigation } from '@/components/ui/NavLink';
import { Icon } from '@/components/ui/Icon';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { BackHeader } from '@/components/layout/Header';
import { BottomSheetSelector } from '@/components/ui/BottomSheetSelector';
import { usePageReady } from '@/hooks/usePageReady';
import { useNativeUI } from '@/hooks/useNativeUI';
import { useChildren } from '@/hooks/useChildren';
import { useSelectedChild } from '@/contexts/SelectedChildContext';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { TimelineItem } from '@/components/shared/TimelineItem';
import type { TimelineStatus } from '@/components/shared/TimelineItem';

/**
 * Attendance History - API 연동
 * - useChildren() (GET /children) -> 자녀 목록 (앱 공용 단일 소스)
 * - GET /attendance/member/:childUserId?limit=50 -> 출석 기록
 */

interface AttendanceRecord {
  id: string;
  classId: string;
  className: string;
  date: string;
  dayOfWeek: string;
  dayNumber: number;
  status: 'present' | 'absent';
  month: string;
  time: string;
  location: string;
  rawDate: Date;
}

interface Child {
  id: string;
  name: string;
}

const KOR_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseRecord(a: {
  id: string;
  classId: string;
  className: string;
  scheduledDate: string;
  attendanceStatus: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}): AttendanceRecord {
  const d = new Date(a.scheduledDate);
  const startTime = a.startTime ?? '';
  const endTime = a.endTime ?? '';
  const time = startTime && endTime ? `${startTime} - ${endTime}` : startTime || '';
  return {
    id: a.id,
    classId: a.classId,
    className: a.className,
    date: a.scheduledDate,
    dayOfWeek: KOR_DAYS[d.getDay()],
    dayNumber: d.getDate(),
    status: a.attendanceStatus === 'present' ? 'present' : 'absent',
    month: `${d.getFullYear()}년 ${d.getMonth() + 1}월`,
    time,
    location: a.location ?? '',
    rawDate: d,
  };
}

function toTimelineStatus(status: 'present' | 'absent'): TimelineStatus {
  return status === 'present' ? 'attended' : 'absent';
}

/** 슬라이딩 인디케이터 세그먼트 컨트롤 */
function ChildSegmentControl({
  items,
  selectedChild,
  onSelect,
}: {
  items: Child[];
  selectedChild: string;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const btn = btnRefs.current.get(selectedChild);
    const container = containerRef.current;
    if (!btn || !container) return;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setIndicator({ left: bRect.left - cRect.left, width: bRect.width });
  }, [selectedChild]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  return (
    <div className="px-6 pt-4 pb-2">
      <div
        ref={containerRef}
        role="radiogroup"
        aria-label="자녀 선택"
        className="relative flex p-1 bg-it-fill dark:bg-rink-800 rounded-w-md"
      >
        {/* 슬라이딩 배경 인디케이터 */}
        <div
          className="absolute top-1 bottom-1 rounded-w-md bg-it-surface dark:bg-rink-700 shadow-sh-1 transition-all motion-reduce:transition-none duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
        {items.map((child) => {
          const isSelected = selectedChild === child.id;
          return (
            <button
              key={child.id}
              ref={(el) => { if (el) btnRefs.current.set(child.id, el); }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(child.id)}
              className={`relative z-[1] flex-1 min-h-[44px] py-2.5 px-4 rounded-w-md text-card-body font-semibold transition-colors motion-reduce:transition-none duration-200 ${
                isSelected
                  ? 'text-it-blue-500'
                  : 'text-it-ink-500 dark:text-rink-300 hover:text-it-ink-800 dark:hover:text-rink-200'
              }`}
            >
              {child.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AttendanceHistoryPage() {
  const { back } = useNavigation();
  // 자녀 목록은 앱 공용 useChildren() (GET /children) 단일 소스 사용.
  //   이전 `/parent-profile/children` 는 parentProfile 미존재 시 404 → 자녀 선택 탭 미표시 버그.
  // 자녀 선택은 앱 공용 전역 컨텍스트(SelectedChildContext)와 동기화.
  //   `/classes`·드로어·대시보드와 동일한 선택 자녀를 공유 → 출석확인 딥링크 진입 시 자녀 일치 보장.
  const { selectableChildren, isLoading: isChildrenLoading } = useChildren();
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isRecordsLoading, setIsRecordsLoading] = useState(true);
  // 수업별 필터 — classId 기준 ('all' = 전체 수업). 옵션은 선택 자녀의 출석 레코드에서 파생.
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [isClassSheetOpen, setIsClassSheetOpen] = useState(false);

  // 딥링크 ?classId= — /classes "출석확인" 진입 시 해당 수업으로 초기 필터.
  const searchParams = useSearchParams();
  const classIdParam = searchParams.get('classId');

  // 자녀 로딩 + (자녀 존재 시) 출석 기록 로딩까지 완료되어야 페이지 ready.
  const isLoading = isChildrenLoading || (selectableChildren.length > 0 && isRecordsLoading);
  // 풀스크린 로더 fast-path — 데이터 셋팅 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // [appbar-harness] 이중 헤더 방지 — Web `<BackHeader />` 단독 렌더.
  //   Flutter Native AppBar 는 OFF (showAppBar:false) 하여 한 페이지 한 헤더 보장.
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  // 선택된 자녀의 출석 기록 로드 (+ 딥링크 classId 초기 필터 적용)
  useEffect(() => {
    if (!selectedChildId) return;
    const load = async () => {
      setIsRecordsLoading(true);
      const attRes = await api.get<{ id: string; classId: string; className: string; scheduledDate: string; attendanceStatus: string; startTime?: string; endTime?: string; location?: string }[]>(
        `/attendance/member/${selectedChildId}?limit=50`
      );
      if (attRes.success && attRes.data) {
        const parsed = attRes.data.map(parseRecord);
        setRecords(parsed);
        // ?classId= 가 이 자녀 레코드에 존재하면 그 수업으로, 아니면 전체로 초기화 (자녀 전환 시에도 리셋)
        setSelectedClass(
          classIdParam && parsed.some((r) => r.classId === classIdParam) ? classIdParam : 'all'
        );
      } else {
        setRecords([]);
        setSelectedClass('all');
      }
      setIsRecordsLoading(false);
    };
    load();
  }, [selectedChildId, classIdParam]);

  // 선택 자녀의 출석 레코드에 등장한 수업 목록 (classId 기준 중복 제거, 라벨=className) — 수업 필터 옵션 SoT
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.classId && !map.has(r.classId)) map.set(r.classId, r.className);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [records]);

  // 선택된 수업(classId)으로 좁힌 레코드 ('all' 이면 전체)
  const visibleRecords = useMemo(
    () => (selectedClass === 'all' ? records : records.filter((r) => r.classId === selectedClass)),
    [records, selectedClass]
  );

  // 선택된 수업 라벨 (버튼 표시용)
  const selectedClassName =
    selectedClass === 'all'
      ? '전체 수업'
      : (classOptions.find((c) => c.id === selectedClass)?.name ?? '전체 수업');

  const groupedRecords = useMemo(() => {
    return visibleRecords.reduce(
      (acc, record) => {
        if (!acc[record.month]) acc[record.month] = [];
        acc[record.month].push(record);
        return acc;
      },
      {} as Record<string, AttendanceRecord[]>
    );
  }, [visibleRecords]);

  return (
    <MobileContainer hasBottomNav={true}>
      <BackHeader title="출석 내역" onBack={() => back()} />

      <main className="flex-1 overflow-y-auto hide-scrollbar pb-30 bg-it-canvas dark:bg-puck">
        {/* 자녀 선택 세그먼트 컨트롤 (슬라이딩 인디케이터) */}
        {selectableChildren.length > 1 && (
          <ChildSegmentControl
            items={selectableChildren}
            selectedChild={selectedChildId ?? ''}
            onSelect={setSelectedChildId}
          />
        )}

        {/* 수업별 필터 진입 버튼 (수업 2종 이상일 때만) */}
        {!isLoading && classOptions.length > 1 && (
          <div className="px-6 pt-2 pb-2">
            <button
              type="button"
              onClick={() => setIsClassSheetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-w-md bg-it-surface dark:bg-rink-800 border-[1.5px] border-it-line-strong dark:border-rink-700 text-card-body font-semibold text-it-ink-700 dark:text-rink-200 hover:bg-it-fill dark:hover:bg-rink-700/50 transition-colors motion-reduce:transition-none active:brightness-95"
              aria-label="수업 선택"
            >
              <Icon name="filter_list" className="text-card-emphasis text-it-ink-600 dark:text-rink-300" aria-hidden="true" />
              {selectedClassName}
              <Icon name="expand_more" className="text-card-emphasis text-it-ink-500 dark:text-rink-300" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="flex justify-center py-12" role="status" aria-label="출석 내역 불러오는 중">
            <div className="w-8 h-8 border-2 border-it-blue-500 border-t-transparent rounded-w-pill animate-spin motion-reduce:animate-none" />
          </div>
        )}

        {/* 빈 상태 */}
        {!isLoading && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-w-md bg-it-surface dark:bg-rink-800 flex items-center justify-center mb-4">
              <Icon name="event_busy" className="text-3xl text-it-ink-400 dark:text-rink-400" aria-hidden="true" />
            </div>
            <p className="text-it-ink-500 dark:text-rink-300 font-medium">
              {MESSAGES.attendance2.emptyHistory}
            </p>
          </div>
        )}

        {/* 출석 타임라인 (월별 그룹) — flat: 흰 섹션 + hairline 월헤더, 섹션 간 8px 회색 갭 */}
        {!isLoading && visibleRecords.length > 0 && (
          <div>
            {Object.entries(groupedRecords).map(([month, monthRecords]) => (
              <div key={month} className="mt-2 bg-it-surface dark:bg-it-blue-950">
                {/* 월 헤더 - sticky, hairline */}
                <div className="flex items-center justify-between px-6 py-3 sticky top-0 bg-it-surface dark:bg-it-blue-950 z-10 border-b border-it-line dark:border-rink-700">
                  <h3 className="text-card-emphasis font-extrabold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                    {month}
                  </h3>
                  <span className="text-card-meta font-semibold text-it-ink-500 dark:text-rink-300 tabular-nums">
                    {monthRecords.filter((r) => r.status === 'present').length}/{monthRecords.length}회 출석
                  </span>
                </div>

                {/* TimelineItem 목록 (공유 컴포넌트 — iceTheme 미지원, page-local 래퍼만 it-* 정합) */}
                <div className="flex flex-col gap-3 px-6 py-4">
                  {monthRecords.map((record, idx) => (
                    <TimelineItem
                      key={record.id}
                      date={record.rawDate}
                      dayOfWeek={record.dayOfWeek}
                      title={record.className}
                      time={record.time || '-'}
                      location={record.location || undefined}
                      status={toTimelineStatus(record.status)}
                      isLast={idx === monthRecords.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 수업 선택 바텀시트 */}
      <BottomSheetSelector<string>
        isOpen={isClassSheetOpen}
        title="수업 선택"
        items={[
          { id: 'all', name: '전체 수업', selected: selectedClass === 'all' },
          ...classOptions.map((c) => ({
            id: c.id,
            name: c.name,
            selected: selectedClass === c.id,
          })),
        ]}
        onSelect={(id) => {
          setSelectedClass(id);
          setIsClassSheetOpen(false);
        }}
        onClose={() => setIsClassSheetOpen(false)}
      />
    </MobileContainer>
  );
}
