'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/messages';
import { useModal } from '@/components/ui/Modal/ModalContext';
import { useToast } from '@/components/ui/Toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { ParentUpcomingSchedule } from '@/hooks/useParentHome';
import {
  getAttendanceWindowState,
  type AttendanceWindowState as WindowState,
} from '@/lib/attendance-window';

/**
 * ParentTodaySchedules — 학부모 대시보드 "오늘 일정" 카드 리스트.
 *
 * 설계서 §4.1 ④ Hot zone — 미니 캘린더 직후 배치.
 *  - 자녀 슬라이드(selectedChildId) 와 동기화하여 해당 자녀가 등록한 일정만 표시
 *  - selectedChildId === undefined → "전체 보기" 슬라이드 → 모든 자녀 일정
 *  - 빈 상태: "오늘 일정이 없어요" 안내
 *
 * 데이터 소스
 *  - useParentHome.upcomingSchedules — 자녀가 등록한 수업만 (참여 기준)
 *  - /parent-calendar 와의 차이: 풀페이지는 팀 전체 일정(자녀 등록 무관)
 *
 * 디자인 규칙 (WEB_DESIGN_SYSTEM.md 준수)
 *  - 카드: bg-white + border-wline-2, rounded-2xl
 *  - dot 색상: 미니 캘린더와 동일 (emerald=정규훈련, blue=대회, rose=레슨)
 *  - 다크 모드 대응
 *  - AI 스타일 금지 (gradient/blur 금지)
 */

type ParentEventType = 'team_training' | 'team_tournament' | 'open_lesson';

interface ParentTodaySchedulesProps {
  /** Hook 에서 가져온 자녀 참여 일정 원본 */
  schedules: ParentUpcomingSchedule[];
  /** 선택된 자녀 id — undefined 면 전체 보기 */
  childId?: string;
  /** 오늘 날짜 키 YYYY-MM-DD ("오늘로" 복귀 + 헤더 분기 기준) */
  todayKey: string;
  /**
   * 2026-04-27 (방안 A · D-06): 표시 대상 날짜 키 YYYY-MM-DD.
   * 미지정 시 todayKey 로 폴백 (기존 "오늘 일정" 동작과 100% 호환).
   */
  selectedDateKey?: string;
  /** "오늘로" 보조 액션 클릭 콜백. selectedDateKey ≠ todayKey 일 때만 노출됨 */
  onResetToToday?: () => void;
  /** 전체 캘린더 페이지 경로 (기본 /parent-calendar) */
  viewAllHref?: string;
  /**
   * 2026-04-27: 전체 보기 슬라이드(childId === undefined)에서 일정 카드에
   * 자녀 이름을 표시하기 위한 매핑 소스. ChildInfo 전체 의존을 피해 최소
   * 인터페이스만 받음. 누락된 id 는 표시 시 스킵.
   *
   * ⚠️ prop 이름은 React 예약 'children' 충돌 회피를 위해 'members' 사용
   * (ParentChildSelector 의 items 패턴과 동일).
   */
  members?: Array<{ id: string; name: string }>;
  /**
   * 2026-04-27 (Phase 2 · D-A~E): 학부모 자녀 출석 mutation.
   * useParentHome.checkInChild 함수 그대로 전달. 미지정 시 출석 버튼 비활성.
   */
  onCheckInChild?: (
    scheduleId: string,
    childId: string,
  ) => Promise<
    | { ok: true; remainingSessions: number; className: string }
    | { ok: false; message: string }
  >;
}

/** trainingType → 미니 캘린더와 동일한 분류
 *  deprecated 키(academy_lesson/game_lesson)도 lesson 계열로 인식 (과거 데이터 호환). */
function mapEventType(trainingType: string | null): ParentEventType {
  const t = String(trainingType ?? '').toLowerCase();
  if (t === 'lesson' || t === 'academy_lesson' || t === 'game_lesson') {
    return 'open_lesson';
  }
  return 'team_training';
}

const TYPE_DOT: Record<ParentEventType, string> = {
  team_training: 'bg-emerald-500',
  team_tournament: 'bg-blue-500',
  open_lesson: 'bg-rose-500',
};

const TYPE_LABEL: Record<ParentEventType, string> = {
  team_training: '정규훈련',
  team_tournament: '팀 대회',
  open_lesson: '레슨',
};

const TYPE_CHIP: Record<ParentEventType, string> = {
  team_training:
    'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/20',
  team_tournament:
    'text-ice-500 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20',
  open_lesson:
    'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/20',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 2026-04-27: 출석 시간 윈도우는 `@/lib/attendance-window` SoT 사용.
// 코치 대시보드("현재 진행 중 수업")와 학부모(이 컴포넌트)가 동일한 헬퍼를 공유한다.

/**
 * 2026-04-27: dateKey(YYYY-MM-DD) → "M월 D일 (요일)" 한글 라벨.
 * dateKey 가 todayKey 와 같으면 호출부에서 별도 분기(아래 헤더 로직 참조).
 */
function formatDateLabel(dateKey: string): string {
  const [yStr, mStr, dStr] = dateKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return dateKey;
  const dow = new Date(y, m - 1, d).getDay();
  return `${m}월 ${d}일 (${DAY_LABELS[dow]})`;
}

export function ParentTodaySchedules({
  schedules,
  childId,
  todayKey,
  selectedDateKey,
  onResetToToday,
  viewAllHref = '/parent-calendar',
  members,
  onCheckInChild,
}: ParentTodaySchedulesProps) {
  const { modal } = useModal();
  const { toast } = useToast();
  // 다중 자녀 동시 등록 시 자녀 선택 모달 (D-E)
  const [pickerSchedule, setPickerSchedule] = useState<ParentUpcomingSchedule | null>(null);
  // 진행 중 상태 (중복 클릭 방지)
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  // 표시 대상 날짜 — selectedDateKey 미지정 시 todayKey 폴백 (기존 동작 호환).
  const targetKey = selectedDateKey ?? todayKey;
  const isToday = targetKey === todayKey;

  // 표시 대상 날짜 + 자녀 필터링 + 시간순 정렬.
  // childIds 가 비어있는 레거시 데이터는 안전장치로 표시 (백엔드 응답 누락 보호).
  const todayItems = useMemo(() => {
    return schedules
      .filter((s) => s.dateKey === targetKey)
      .filter((s) => {
        if (!childId) return true;
        if (!s.childIds || s.childIds.length === 0) return true;
        return s.childIds.includes(childId);
      })
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  }, [schedules, childId, targetKey]);

  // 전체 보기 모드에서 일정 카드에 자녀 이름을 노출하기 위한 id → name 매핑.
  // members prop 이 없으면 빈 Map (이름 미표시).
  const childIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of members ?? []) map.set(c.id, c.name);
    return map;
  }, [members]);

  // 전체 보기 슬라이드일 때만 자녀 이름 표시 (특정 자녀 슬라이드는 이미 컨텍스트가 명확).
  const showChildNames = !childId;

  /**
   * 2026-04-27 (Phase 2 · D-C/D-E): 출석 처리 흐름.
   * 1) 자녀 1명 등록 → 직접 confirm → API
   * 2) 자녀 2명 이상 등록 (전체 보기 모드) → 자녀 선택 모달 → confirm → API
   * 3) 특정 자녀 슬라이드 → 직접 confirm → API
   */
  const performCheckIn = async (
    scheduleId: string,
    targetChildId: string,
    childName: string | null,
    className: string,
    // [Phase B] 후불(POSTPAID) 수업은 출석 시 결제권을 차감하지 않으므로(사후 정산)
    //   "결제권 1회 차감" 안내·"잔여 결제권" 표기를 노출하지 않는다.
    isPostpaid = false,
  ) => {
    if (!onCheckInChild) return;
    const submitKey = `${scheduleId}:${targetChildId}`;
    if (submittingKey) return;

    const subject = childName
      ? `${childName}의 '${className}'`
      : `'${className}'`;
    const ok = await modal.confirm({
      title: '출석 처리',
      message: isPostpaid
        ? `${subject} 출석을 처리할까요?`
        : `${subject} 출석을 처리할까요?\n결제권 1회가 차감됩니다.`,
      confirmText: '출석하기',
      cancelText: '취소',
      variant: 'default',
    });
    if (!ok) return;

    setSubmittingKey(submitKey);
    try {
      const result = await onCheckInChild(scheduleId, targetChildId);
      if (result.ok) {
        toast.success(
          isPostpaid
            ? '출석 완료'
            : `출석 완료 · 잔여 결제권 ${result.remainingSessions}회`,
        );
      } else {
        toast.error(result.message);
      }
    } finally {
      setSubmittingKey(null);
    }
  };

  const handleCheckInClick = (s: ParentUpcomingSchedule) => {
    if (!onCheckInChild) return;
    // 특정 자녀 슬라이드 (childId 지정) → 즉시 confirm
    if (childId) {
      const name = childIdToName.get(childId) ?? null;
      performCheckIn(
        s.scheduleId,
        childId,
        name,
        s.className,
        s.billingMode === 'POSTPAID',
      );
      return;
    }
    // 전체 보기 모드 — 등록된 자녀 1명이면 그 자녀로 직접 처리
    const eligible = s.childIds.filter((cid) => {
      const status = s.attendanceByChild[cid];
      return status !== 'present';
    });
    if (eligible.length === 0) {
      toast.info('이미 모든 자녀가 출석 완료되었습니다.');
      return;
    }
    if (eligible.length === 1) {
      const onlyChildId = eligible[0];
      const name = childIdToName.get(onlyChildId) ?? null;
      performCheckIn(
        s.scheduleId,
        onlyChildId,
        name,
        s.className,
        s.billingMode === 'POSTPAID',
      );
      return;
    }
    // 자녀 ≥ 2 + 모두 미체크 → 자녀 선택 모달 (D-E)
    setPickerSchedule(s);
  };

  return (
    <section
      aria-label={isToday ? '오늘 일정' : `${formatDateLabel(targetKey)} 일정`}
      className="rounded-2xl border border-wline-2 bg-white p-4 shadow-sm dark:border-rink-700 dark:bg-rink-800"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-bold text-wtext-1 dark:text-white">
          {isToday ? '오늘 일정' : `${formatDateLabel(targetKey)} 일정`}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {/* 선택일 ≠ 오늘 일 때만 "오늘로" 보조 액션 노출 (Hot zone 압축성 유지) */}
          {!isToday && onResetToToday && (
            <button
              type="button"
              onClick={onResetToToday}
              className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-ice-500 hover:bg-ice-500/10"
              aria-label="오늘로 돌아가기"
            >
              <Icon name="today" className="text-base" aria-hidden="true" />
              오늘로
            </button>
          )}
          <NavLink
            href={viewAllHref}
            className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-wtext-3 hover:text-ice-500 dark:text-rink-300"
            aria-label="전체 캘린더 보기"
          >
            전체 캘린더
            <Icon name="chevron_right" className="text-base" aria-hidden="true" />
          </NavLink>
        </div>
      </div>

      {todayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          {/* 2026-05-16 Empty State 친근감 강화 — event_busy 아이콘 옆 💭 이모지 */}
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-full bg-wline-2 dark:bg-rink-700">
              <Icon
                name="event_busy"
                className="text-xl text-wtext-3 dark:text-rink-300"
                aria-hidden="true"
              />
            </div>
            <span className="text-2xl" aria-hidden="true">💭</span>
          </div>
          <p className="text-xs text-wtext-3 dark:text-rink-300">
            {isToday
              ? MESSAGES.dashboard.parentDashboard.noTodaySchedule
              : MESSAGES.dashboard.parentDashboard.noSelectedDateSchedule}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {todayItems.map((s, idx) => {
            const type = mapEventType(s.trainingType);
            const childNames = showChildNames
              ? s.childIds
                  .map((id) => childIdToName.get(id))
                  .filter((n): n is string => Boolean(n))
              : [];

            // 2026-04-27 (Phase 2): 출석 버튼 상태 분기
            // 우선순위: 출석 완료 > 시간 윈도우 외(시작 전 / 체크 종료) > 출석 가능
            const isAllPresent =
              s.childIds.length > 0 &&
              s.childIds.every((cid) => s.attendanceByChild[cid] === 'present');
            const isSelectedChildPresent =
              !!childId && s.attendanceByChild[childId] === 'present';
            const isPresent = childId ? isSelectedChildPresent : isAllPresent;
            const submitKeyPrefix = `${s.scheduleId}:`;
            const isSubmittingThisCard =
              submittingKey != null && submittingKey.startsWith(submitKeyPrefix);

            // 시간 윈도우 분기 — 오늘 일정만 평가 (다른 날은 카드만 표시)
            const windowState: WindowState = isToday
              ? getAttendanceWindowState(s.scheduledDate, s.startTime)
              : 'before'; // 미래 일정은 "수업 전" 으로 분류

            // PR-D Hotfix #4 (v1.1): 자녀별 출석 가능 여부 (수업권 잔량 > 0)
            //   - 전체 보기: 자녀 중 1명 이상 canCheckIn=true 면 출석 버튼 노출
            //   - 선택 자녀: 그 자녀의 canCheckIn=true 여야 출석 버튼 노출
            //   - 모든 자녀가 canCheckIn=false 면 [수업권이 필요해요] 분기
            //   - canCheckInByChild 응답에 없으면 기본 true (하위 호환)
            const canCheckInMap = s.canCheckInByChild ?? {};
            const isSelectedChildCanCheckIn = childId
              ? canCheckInMap[childId] !== false
              : true;
            const isAnyCanCheckIn = childId
              ? isSelectedChildCanCheckIn
              : s.childIds.length === 0 ||
                s.childIds.some((cid) => canCheckInMap[cid] !== false);
            const needsPayment = !isPresent && isToday && !isAnyCanCheckIn;

            const canShowCheckInButton =
              !!onCheckInChild &&
              isToday &&
              !isPresent &&
              !!s.scheduleId &&
              windowState === 'open' &&
              isAnyCanCheckIn;

            return (
              <li
                key={`${s.dateKey}-${s.hhmm}-${idx}`}
                className="flex items-center gap-3 rounded-xl bg-wbg px-3 py-2.5 dark:bg-rink-700/40"
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    TYPE_DOT[type],
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-wtext-1 dark:text-white">
                    {s.className}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-wtext-3 dark:text-rink-300">
                    <span className="tabular-nums">{s.hhmm}</span>
                    {childNames.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {childNames.join(', ')}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                {/* type 칩 */}
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold',
                    TYPE_CHIP[type],
                  )}
                >
                  {TYPE_LABEL[type]}
                </span>

                {/* 2026-04-27 (Phase 2): 우측 액션 — 4가지 분기 */}
                {/* 2026-05-16 강화: 출석 완료(emerald-600 solid), 출석하기 CTA(44dp+text-card-emphasis),
                    수업 전(amber-600), 체크 종료(grey 유지) — WCAG AAA 7:1 보장. */}
                {/* 1) 출석 완료 (최우선) */}
                {isToday && isPresent && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white dark:bg-emerald-500 dark:text-white">
                    <Icon name="check_circle" className="text-sm" aria-hidden="true" />
                    출석 완료
                  </span>
                )}
                {/* 2) 출석 가능 — 시간 윈도우 내 + 미체크 — Critical CTA 강화 (44dp+) */}
                {!isPresent && canShowCheckInButton && (
                  <button
                    type="button"
                    onClick={() => handleCheckInClick(s)}
                    disabled={isSubmittingThisCard}
                    className={cn(
                      'shrink-0 min-h-[44px] rounded-lg bg-ice-500 px-3 py-2 text-card-emphasis font-bold text-white shadow-sm transition-colors motion-reduce:transition-none',
                      'hover:bg-ice-700 active:brightness-95',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                    aria-label={`${s.className} 출석하기`}
                  >
                    {isSubmittingThisCard ? '처리 중…' : '출석하기'}
                  </button>
                )}
                {/* 2-b) 수업권 필요 — PR-D Hotfix #4 (v1.1) — canCheckIn=false 자녀 결제 안내 */}
                {needsPayment && windowState !== 'before' && (
                  <NavLink
                    href={`/payment/options?classId=${s.classId}`}
                    className={cn(
                      'shrink-0 min-h-[44px] inline-flex items-center gap-1 rounded-lg bg-flame px-3 py-2 text-[11px] font-bold text-white shadow-sm transition-colors motion-reduce:transition-none',
                      'hover:brightness-95 active:brightness-90',
                    )}
                    aria-label={`${s.className} ${MESSAGES.attendance.payNow}`}
                  >
                    <Icon name="payment" className="text-sm" aria-hidden="true" />
                    {MESSAGES.attendance.creditRequired}
                  </NavLink>
                )}
                {/* 3) 수업 시작 전 — 윈도우 미진입 — amber-600 강화 */}
                {isToday && !isPresent && windowState === 'before' && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-bold text-white dark:bg-amber-500 dark:text-white">
                    <Icon name="schedule" className="text-sm" aria-hidden="true" />
                    수업 전
                  </span>
                )}
                {/* 4) 체크 종료 — 윈도우 경과 + 미체크 (grey 유지 — 종료 상태) */}
                {isToday && !isPresent && windowState === 'closed' && (
                  <span className="shrink-0 inline-flex items-center gap-0.5 rounded-md bg-wline-2 px-2 py-1 text-[11px] font-semibold text-wtext-1 dark:bg-rink-700 dark:text-rink-100">
                    <Icon name="timer_off" className="text-sm" aria-hidden="true" />
                    체크 종료
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
       * 2026-04-27 (Phase 2 · D-E): 자녀 선택 바텀시트 — 형제자매 동시 등록 + 전체 보기 모드
       * 2026-04-28: 인라인 모달 → 공통 BottomSheet 로 교체
       *   - z-[9990] 로 BottomNav 위에 표시
       *   - createPortal 로 MobileContainer overflow-hidden 클리핑 우회
       *   - safe-area-inset-bottom 자동 처리
       */}
      <BottomSheet
        isOpen={!!pickerSchedule}
        onClose={() => setPickerSchedule(null)}
        title="어느 자녀의 출석을 처리할까요?"
        footer={
          <button
            type="button"
            onClick={() => setPickerSchedule(null)}
            className="w-full rounded-xl bg-wline-2 py-2.5 text-sm font-semibold text-wtext-2 hover:bg-wline dark:bg-rink-700 dark:text-rink-100 dark:hover:bg-rink-500"
          >
            취소
          </button>
        }
      >
        {pickerSchedule && (
          <>
            <p className="mb-3 text-xs text-wtext-3 dark:text-rink-300">
              {pickerSchedule.className} · {pickerSchedule.hhmm}
            </p>
            <ul className="flex flex-col gap-2">
              {pickerSchedule.childIds
                .filter(
                  (cid) => pickerSchedule.attendanceByChild[cid] !== 'present',
                )
                .map((cid) => {
                  const name = childIdToName.get(cid) ?? '자녀';
                  return (
                    <li key={cid}>
                      <button
                        type="button"
                        onClick={() => {
                          const s = pickerSchedule;
                          setPickerSchedule(null);
                          performCheckIn(
                            s.scheduleId,
                            cid,
                            name,
                            s.className,
                            s.billingMode === 'POSTPAID',
                          );
                        }}
                        className="flex w-full items-center justify-between rounded-xl border border-wline px-4 py-3 text-left text-sm font-semibold text-wtext-1 hover:border-ice-500 hover:bg-ice-500/5 dark:border-rink-700 dark:text-white"
                      >
                        <span>{name}</span>
                        <Icon
                          name="chevron_right"
                          className="text-base text-wtext-3"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </BottomSheet>
    </section>
  );
}

export default ParentTodaySchedules;
