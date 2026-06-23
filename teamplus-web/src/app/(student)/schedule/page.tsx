'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { SubmainAppBar } from '@/components/layout/SubmainAppBar';
import { Icon } from '@/components/ui/Icon';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
import { api } from '@/services/api-client';
import { cn } from '@/lib/utils';

// 아이스하키 일정 공통 카테고리 — 수업·훈련·시합·캠프·픽업매치·대회 전부 포함
type EntryCategory =
  | 'LESSON'      // 개인/그룹 레슨 (PERSONAL · GROUP)
  | 'TRAINING'    // 정규훈련 (REGULAR · REGULAR_TRAINING)
  | 'GAME'        // 시합 (GAME · 경기)
  | 'FUN'         // 펀하키
  | 'CAMP'        // 캠프
  | 'PICKUP'      // 픽업 매치
  | 'TOURNAMENT'  // 대회
  | 'OTHER';

// 통합 일정 항목
interface ScheduleEntry {
  id: string;
  category: EntryCategory;
  title: string;
  startTime: string; // ISO
  endTime?: string;
  classDays?: string[]; // ['월','화'...] — 반복 스케줄
}

// 백엔드 `/classes` 원본 응답
interface ClassItem {
  id: string;
  className: string;
  instructorName?: string;
  trainingType?: string;
  startTime: string;
  endTime: string;
  classDays?: string[];
}

// 백엔드 `/matches` 픽업 매치 응답 (최소 필드만)
interface PickupMatch {
  id: string;
  title?: string;
  matchName?: string;
  startTime?: string;
  matchDate?: string;
  endTime?: string;
}

// trainingType → EntryCategory 매핑
function classifyTrainingType(type?: string): EntryCategory {
  const t = (type ?? '').toUpperCase();
  if (t === 'PERSONAL' || t === 'GROUP') return 'LESSON';
  if (t === 'REGULAR' || t === 'REGULAR_TRAINING') return 'TRAINING';
  if (t === 'GAME') return 'GAME';
  if (t === 'FUN' || t === 'FUN_HOCKEY') return 'FUN';
  if (t === 'CAMP') return 'CAMP';
  if (t === 'PICKUP') return 'PICKUP';
  // 한글 라벨도 방어적으로 처리
  if (type === '개인레슨' || type === '그룹레슨') return 'LESSON';
  if (type === '정규훈련') return 'TRAINING';
  if (type === '시합' || type === '경기') return 'GAME';
  if (type === '펀하키') return 'FUN';
  if (type === '캠프') return 'CAMP';
  return 'OTHER';
}

// 카테고리별 표기 메타 — 색상은 lib/calendar-colors.ts SoT 의 TRAINING_SUBTLE_COLORS 사용
// (라벨/아이콘은 schedule 화면 고유 톤 유지: '시합', emoji_events 등)
import { TRAINING_SUBTLE_COLORS } from '@/lib/calendar-colors';

const CATEGORY_META: Record<
  EntryCategory,
  { icon: string; label: string; accent: string; bg: string }
> = {
  LESSON:     { icon: 'sports_hockey',         label: '수업',   accent: TRAINING_SUBTLE_COLORS.LESSON.accent,    bg: TRAINING_SUBTLE_COLORS.LESSON.bg },
  TRAINING:   { icon: 'fitness_center',        label: '훈련',   accent: TRAINING_SUBTLE_COLORS.TRAINING.accent,  bg: TRAINING_SUBTLE_COLORS.TRAINING.bg },
  GAME:       { icon: 'emoji_events',          label: '시합',   accent: TRAINING_SUBTLE_COLORS.GAME.accent,      bg: TRAINING_SUBTLE_COLORS.GAME.bg },
  FUN:        { icon: 'celebration',           label: '펀하키', accent: TRAINING_SUBTLE_COLORS.FUN.accent,       bg: TRAINING_SUBTLE_COLORS.FUN.bg },
  CAMP:       { icon: 'local_fire_department', label: '캠프',   accent: TRAINING_SUBTLE_COLORS.CAMP.accent,      bg: TRAINING_SUBTLE_COLORS.CAMP.bg },
  PICKUP:     { icon: 'group_add',             label: '픽업',   accent: TRAINING_SUBTLE_COLORS.PICKUP.accent,    bg: TRAINING_SUBTLE_COLORS.PICKUP.bg },
  TOURNAMENT: { icon: 'military_tech',         label: '대회',   accent: TRAINING_SUBTLE_COLORS.ACADEMY.accent,   bg: TRAINING_SUBTLE_COLORS.ACADEMY.bg },
  OTHER:      { icon: 'sports_hockey',         label: '일정',   accent: 'text-ice-500',                          bg: 'bg-ice-500/10' },
};

// 주간 일정 셀 — 날짜 단위로 일정 목록을 담음
interface ScheduleDay {
  dayKr: string;        // '월' ~ '일'
  dayEn: string;        // 'Mon' ~ 'Sun'
  date: Date;
  isToday: boolean;
  isRest: boolean;      // 일정 없음 → 쉬는 날
  entries: ScheduleEntry[];
}

// ISO week(월~일) 주차 계산 — 해당 날짜가 속한 주의 월요일 반환
function getMondayOfWeek(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토
  // 월요일 기준으로 offset — 일요일(0)이면 -6, 그 외는 1-day
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

// 해당 년도의 ISO week 번호 (Jan 4 기준, ISO 8601)
function getIsoWeekNumber(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7; // 0=월 ... 6=일
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

const DAY_KR = ['월', '화', '수', '목', '금', '토', '일'];
const DAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ChildSchedulePage() {
  // Native 앱에서 BottomNav 표시 (기본 UI 설정)
  useDefaultUI();

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  // 이번 주(월~일) 7일 날짜 배열 + 주차 번호
  const { weekDates, weekNumber } = useMemo(() => {
    const today = new Date();
    const monday = getMondayOfWeek(today);
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      return {
        dayKr: DAY_KR[i],
        dayEn: DAY_EN[i],
        date: d,
        isToday: key === todayKey,
      };
    });
    return { weekDates: days, weekNumber: getIsoWeekNumber(today) };
  }, []);

  // API 호출 — /classes(수업·훈련·시합·캠프·펀하키·픽업 trainingType 포함)
  // + /matches/my(내가 참가하는 픽업 매치)를 병렬로 가져와 단일 ScheduleEntry 배열로 정규화.
  // 실패한 엔드포인트는 조용히 무시 (TEEN 역할에 권한 없는 경로가 있을 수 있음).
  const fetchSchedule = useCallback(async () => {
    setIsLoading(true);
    try {
      const [classesRes, matchesRes] = await Promise.all([
        api.get<ClassItem[] | { data: ClassItem[] }>('/classes', { retry: false }),
        api.get<PickupMatch[] | { data: PickupMatch[] }>('/matches/my', { retry: false }),
      ]);

      const merged: ScheduleEntry[] = [];

      // /classes — trainingType 으로 카테고리 분류
      if (classesRes.success && classesRes.data) {
        const list = Array.isArray(classesRes.data)
          ? classesRes.data
          : (classesRes.data as { data: ClassItem[] }).data;
        if (Array.isArray(list)) {
          list.forEach((c) => {
            merged.push({
              id: `class-${c.id}`,
              category: classifyTrainingType(c.trainingType),
              title: c.className,
              startTime: c.startTime,
              endTime: c.endTime,
              classDays: c.classDays,
            });
          });
        }
      }

      // /matches/my — 픽업 매치(시합/대회 성격)
      if (matchesRes.success && matchesRes.data) {
        const list = Array.isArray(matchesRes.data)
          ? matchesRes.data
          : (matchesRes.data as { data: PickupMatch[] }).data;
        if (Array.isArray(list)) {
          list.forEach((m) => {
            const start = m.startTime ?? m.matchDate;
            if (!start) return;
            merged.push({
              id: `match-${m.id}`,
              category: 'PICKUP',
              title: m.title ?? m.matchName ?? '픽업 매치',
              startTime: start,
              endTime: m.endTime,
            });
          });
        }
      }

      setEntries(merged);
    } catch {
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  // 주간 7일 + 해당 날짜의 일정 그룹핑 (반복 요일 또는 startTime 매칭)
  const weekSchedule: ScheduleDay[] = useMemo(() => {
    return weekDates.map(({ dayKr, dayEn, date, isToday }) => {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayEntries = entries.filter((e) => {
        // 1) 반복 스케줄
        if (e.classDays && e.classDays.length > 0) {
          return e.classDays.includes(dayKr);
        }
        // 2) 단발 일정 — startTime 이 해당 날짜 범위 안인가?
        const start = new Date(e.startTime);
        if (isNaN(start.getTime())) return false;
        return start >= dayStart && start <= dayEnd;
      });

      return {
        dayKr,
        dayEn,
        date,
        isToday,
        isRest: dayEntries.length === 0,
        entries: dayEntries,
      };
    });
  }, [weekDates, entries]);

  const todaySchedule = weekSchedule.find((d) => d.isToday);
  const hasClassToday = !!todaySchedule && !todaySchedule.isRest;
  const todayFirstEntry = todaySchedule?.entries[0];
  const todayMeta = todayFirstEntry ? CATEGORY_META[todayFirstEntry.category] : CATEGORY_META.LESSON;
  const todayTitle = todayFirstEntry?.title ?? '하키';

  const handleSpeakSchedule = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(
        hasClassToday
          ? `네! 오늘은 ${todayMeta.label} 가는 날이에요! ${todayTitle} 일정이 있어요!`
          : '오늘은 쉬는 날이에요!'
      );
      utterance.lang = 'ko-KR';
      speechSynthesis.speak(utterance);
    }
  };

  return (
    <MobileContainer hasBottomNav className="bg-wbg dark:bg-rink-900">
      <SubmainAppBar title="주간 시간표" />

      <main className="flex-1 flex flex-col overflow-x-hidden pb-8">
        {/* Hero Question */}
        <section className="px-6 pt-4 pb-2">
          <h1 className="text-w-h1 leading-[1.2] font-black text-center text-wtext-1 dark:text-white break-keep">
            오늘 <span className="text-ice-500">하키</span> 가는
            <br />날인가요?
          </h1>
        </section>

        {/* Main Answer Card — 오늘 수업 여부에 따라 YES/NO 분기 */}
        <section className="px-6 py-4 flex-1 flex flex-col min-h-[400px]">
          <div className="relative group w-full h-full bg-white dark:bg-rink-800 rounded-3xl p-6 shadow-md flex flex-col items-center justify-between border-2 border-ice-500/20 overflow-hidden active:brightness-95 transition-all duration-300 motion-reduce:transition-none">
            {/* Background decorations */}
            <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] bg-ice-500/10 rounded-w-pill pointer-events-none" aria-hidden="true" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-ice-500/5 rounded-w-pill pointer-events-none" aria-hidden="true" />

            {/* Text Content */}
            <div className="relative z-10 w-full text-center mt-4">
              <div className={cn(
                'inline-flex items-center justify-center gap-1 px-4 py-1.5 rounded-w-pill text-white font-bold text-card-title mb-4 shadow-sm',
                hasClassToday ? 'bg-ice-500' : 'bg-wbg0',
              )}>
                <Icon
                  name={hasClassToday ? 'check_circle' : 'cottage'}
                  className="text-[20px]"
                  filled
                  aria-hidden="true"
                />
                {hasClassToday ? 'YES!' : 'REST'}
              </div>
              <p className="text-w-display font-black leading-tight text-wtext-1 dark:text-white mb-2">
                {hasClassToday ? '네! 가요!' : '쉬는 날!'}
              </p>
              <p className="text-xl text-wtext-3 dark:text-rink-300 font-medium">
                {hasClassToday
                  ? `${todayTitle} ${todayMeta.label} 일정이 있어요`
                  : '오늘은 일정이 없어요'}
              </p>
            </div>

            {/* Illustration — 수업 있으면 하키, 없으면 쉬는 집 아이콘 */}
            <div className="relative z-10 w-full flex-1 min-h-[180px] rounded-2xl flex items-center justify-center my-6">
              <div className={cn(
                'w-32 h-32 rounded-w-pill flex items-center justify-center',
                hasClassToday ? 'bg-ice-500/10' : 'bg-wline/60 dark:bg-rink-700/50',
              )}>
                <Icon
                  name={hasClassToday ? 'sports_hockey' : 'cottage'}
                  className={cn(
                    'text-[80px]',
                    hasClassToday ? 'text-ice-500' : 'text-wtext-3 dark:text-rink-300',
                  )}
                  filled
                  weight={600}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Sound Button */}
            <button
              type="button"
              onClick={handleSpeakSchedule}
              aria-label="오늘 일정 소리로 듣기"
              className="relative z-10 w-full min-h-[56px] py-4 rounded-2xl bg-wbg dark:bg-rink-700 border border-transparent hover:border-ice-500/30 flex items-center justify-center gap-3 active:bg-ice-500/10 transition-colors motion-reduce:transition-none"
            >
              <Icon name="volume_up" className="text-ice-500 text-[28px]" filled aria-hidden="true" />
              <span className="text-card-title font-bold text-wtext-1 dark:text-white">소리로 듣기</span>
            </button>
          </div>
        </section>

        {/* Weekly Schedule — 월~일 7일 전체 · 아이스하키 수업만 · 없으면 쉬는 날 */}
        <section className="mt-4 flex flex-col gap-4">
          <div className="px-6 flex items-center justify-between">
            <h3 className="text-2xl font-bold text-wtext-1 dark:text-white">이번 주 일정</h3>
            <span className="text-card-body font-semibold text-ice-500 bg-ice-500/10 px-3 py-1 rounded-w-pill tabular-nums">
              Week {weekNumber}
            </span>
          </div>

          {/* 주간 카드 리스트 (월~일 7장 가로 스크롤) */}
          <div className="w-full overflow-x-auto pb-6 pl-6 pr-6 pt-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex gap-4 w-max">
              {!isLoading && (
                weekSchedule.map((day) => {
                  const firstEntry = day.entries[0];
                  const meta = firstEntry ? CATEGORY_META[firstEntry.category] : null;
                  const label = day.isRest ? '쉬는 날' : (firstEntry?.title ?? '하키');
                  const extraCount = day.entries.length > 1 ? day.entries.length - 1 : 0;
                  const dateLabel = `${day.date.getMonth() + 1}/${day.date.getDate()}`;
                  // 오늘 카드는 항상 primary 톤으로 강조, 그 외엔 카테고리 컬러 사용
                  const iconName = day.isRest ? 'cottage' : meta?.icon ?? 'sports_hockey';

                  return (
                    <div key={day.dayEn} className="flex flex-col gap-3 group">
                      <div
                        className={cn(
                          'relative w-[140px] h-[200px] rounded-3xl p-4',
                          'flex flex-col items-center justify-between shrink-0',
                          'transition-all duration-300 motion-reduce:transition-none',
                          day.isToday
                            ? 'bg-white dark:bg-rink-800 border-[4px] border-ice-500 shadow-md hover:-translate-y-1'
                            : day.isRest
                              ? 'bg-wline-2 dark:bg-rink-800/60 shadow-sm active:brightness-95'
                              : 'bg-white dark:bg-rink-800 border border-transparent hover:border-ice-500/30 shadow-sm active:brightness-95',
                        )}
                      >
                        {/* Today Badge */}
                        {day.isToday && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-ice-500 text-white text-card-meta font-bold px-3 py-1 rounded-w-pill shadow-sm z-10 whitespace-nowrap">
                            오늘 Today
                          </div>
                        )}

                        {/* 요일 · 날짜 + 카테고리 배지 */}
                        <div className="text-center mt-2 w-full">
                          <p className={cn(
                            'text-card-title font-bold leading-tight',
                            day.isToday
                              ? 'text-ice-500'
                              : day.isRest
                                ? 'text-wtext-3 dark:text-rink-300'
                                : 'text-wtext-1 dark:text-white',
                          )}>
                            {day.dayKr} ({day.dayEn})
                          </p>
                          <p className={cn(
                            'text-card-meta font-medium tabular-nums mt-0.5',
                            day.isToday
                              ? 'text-ice-500/80'
                              : 'text-wtext-3 dark:text-rink-300',
                          )}>
                            {dateLabel}
                          </p>
                          {!day.isRest && meta && (
                            <span
                              className={cn(
                                'mt-1.5 inline-block px-2 py-0.5 rounded-w-pill text-card-meta font-bold',
                                meta.bg,
                                meta.accent,
                              )}
                            >
                              {meta.label}
                            </span>
                          )}
                        </div>

                        {/* Icon — 카테고리별 아이콘 + 쉬는 날은 cottage */}
                        <div className={cn(
                          'rounded-w-pill flex items-center justify-center mb-1 transition-colors motion-reduce:transition-none',
                          day.isToday
                            ? 'size-16 bg-ice-500/10 animate-bounce motion-reduce:animate-none'
                            : day.isRest
                              ? 'size-14 bg-wline/70 dark:bg-rink-700/60'
                              : cn('size-14', meta?.bg ?? 'bg-wline-2 dark:bg-white/5'),
                        )}
                        style={{ animationDuration: day.isToday ? '2s' : '0s' }}
                        >
                          <Icon
                            name={iconName}
                            className={cn(
                              day.isToday
                                ? 'text-[40px] text-ice-500'
                                : day.isRest
                                  ? 'text-[32px] text-wtext-3 dark:text-rink-300'
                                  : cn('text-[34px]', meta?.accent ?? 'text-wtext-3 dark:text-rink-300'),
                            )}
                            filled={day.isToday || !day.isRest}
                            aria-hidden="true"
                          />
                        </div>

                        {/* Label (타이틀) + 추가 일정 개수 */}
                        <div className="w-full text-center pb-1">
                          <p
                            className={cn(
                              'text-card-body font-bold leading-tight px-1 truncate',
                              day.isToday
                                ? 'text-wtext-1 dark:text-white'
                                : day.isRest
                                  ? 'text-wtext-3 dark:text-rink-300'
                                  : 'text-wtext-1 dark:text-white',
                            )}
                            title={label}
                          >
                            {label}
                          </p>
                          {extraCount > 0 && (
                            <p className="text-card-meta font-semibold text-ice-500 mt-0.5 tabular-nums">
                              +{extraCount}개 일정
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
