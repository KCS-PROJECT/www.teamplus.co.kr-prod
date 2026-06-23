'use client';

/**
 * UnpaidMembersSection — 미결제 학부모 코치 대시보드 위젯 (Step 10)
 *
 * 표시 조건 (위젯 자체 비노출 = return null):
 *  1. 현재 날짜가 매월 28일~다음달 5일 사이일 것 (등록 마감 그레이스 기간)
 *  2. API 응답이 200 이고 count > 0 일 것
 *
 * API:
 *  GET /dashboard/coach/unpaid-members?month=YYYY-MM
 *  응답 실패/404 → return null (위젯 비노출)
 *
 * 동작:
 *  - 첫 3명 미리보기 (학부모명 · 자녀명 · 수업명)
 *  - "전체 보기" 클릭 → 모달 확장 (전체 목록 + 알림 발송 placeholder)
 *
 * 디자인:
 *  - 카드: bg-wsurface dark:bg-rink-800 rounded-w-xl
 *  - 강조 배지: flame-500 (주의 색)
 *  - gradient/blur/colored-shadow 금지
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal/Modal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';

interface UnpaidMember {
  /** 복합 식별자 (userId::classId) */
  id: string;
  /** 학생(자녀) userId */
  userId: string;
  /** 학부모 표시명 */
  parentName: string;
  /** 자녀 표시명 */
  childName: string;
  /** 수업 ID */
  classId: string;
  /** 수업명 */
  className: string;
  /** (선택) 학부모 ID — 향후 알림톡 발송 시 사용 */
  parentId?: string;
}

interface UnpaidMembersResponse {
  /** 대상 월 (YYYY-MM) */
  month: string;
  /** 미결제 회원 총 수 */
  count: number;
  /** 회원 목록 */
  members: UnpaidMember[];
}

/**
 * 현재 결제 청구 기간 (다음달) 을 YYYY-MM 으로 반환.
 *  - 매월 15일 등록 오픈 → 매월 5일 마감.
 *  - 28일~말일 진입: 다음달 (예: 5/30 → "2026-06")
 *  - 1일~5일 진입: 당월 (예: 6/3 → "2026-06")
 *  - 6~14일 또는 16~27일: 위젯 자체 비노출 → 호출 시점은 28~5일 사이로 한정.
 */
function currentBillingPeriod(): string {
  const today = new Date();
  const day = today.getDate();
  // 28일 이후면 다음달 청구 기간 조회 / 1~5일이면 당월
  const monthOffset = day >= 28 ? 1 : 0;
  const target = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** 표시 조건 — 매월 28일~다음달 5일 사이만 위젯 활성. */
function isWithinUnpaidWindow(now: Date = new Date()): boolean {
  const day = now.getDate();
  return day >= 28 || day <= 5;
}

/** "2026-06" → "6월" 포맷 */
function formatMonthLabel(yyyyMm: string): string {
  const parts = yyyyMm.split('-');
  if (parts.length !== 2) return yyyyMm;
  const m = parseInt(parts[1], 10);
  return Number.isNaN(m) ? yyyyMm : `${m}월`;
}

export const UnpaidMembersSection = memo(function UnpaidMembersSection() {
  const { toast } = useToast();
  const [data, setData] = useState<UnpaidMembersResponse | null>(null);
  // null: 미조회 / true: 표시 / false: 비노출 (조건 미충족 또는 API 실패).
  const [isVisible, setIsVisible] = useState<boolean | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 표시 조건 (날짜 윈도우) 사전 체크 — 비활성 기간이면 API 호출 자체 스킵.
  const withinWindow = useMemo(() => isWithinUnpaidWindow(), []);

  useEffect(() => {
    let cancelled = false;
    if (!withinWindow) {
      setIsVisible(false);
      return;
    }

    (async () => {
      const month = currentBillingPeriod();
      try {
        const res = await api.get<UnpaidMembersResponse>(
          `/dashboard/coach/unpaid-members?month=${month}`,
        );
        if (cancelled) return;

        if (!res.success || !res.data) {
          // 404/500 등 — 위젯 자체 비노출.
          setIsVisible(false);
          return;
        }

        const responseData = res.data;
        const count = responseData.count ?? responseData.members?.length ?? 0;
        if (count <= 0) {
          setIsVisible(false);
          return;
        }

        setData(responseData);
        setIsVisible(true);
      } catch {
        if (!cancelled) setIsVisible(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [withinWindow]);

  const handleSendAlertPlaceholder = useCallback(() => {
    toast.info(MESSAGES.coachDashboard.unpaidMembers.sendAlertComingSoon);
  }, [toast]);

  // 위젯 비노출 조건 — null(미조회) 또는 false(조건 미충족) 시 렌더링 안 함.
  if (isVisible !== true || !data) return null;

  const monthLabel = formatMonthLabel(data.month);
  const preview = data.members.slice(0, 3);
  const remaining = Math.max(0, data.count - preview.length);

  return (
    <>
      <section className="px-4 sm:px-5 mt-5" aria-label="미결제 회원">
        <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 p-5 shadow-sh-1">
          {/* ─── 헤더 ─── */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-w-pill bg-flame-500/15"
                aria-hidden="true"
              >
                <Icon
                  name="payments"
                  className="text-[20px] text-flame-500"
                />
              </div>
              <div className="flex flex-col">
                <h2 className="text-card-title font-extrabold text-wtext-1 dark:text-white tracking-tight">
                  {MESSAGES.coachDashboard.unpaidMembers.title(monthLabel)}
                </h2>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300">
                  결제 마감 안내가 필요합니다
                </p>
              </div>
            </div>
            <span className="shrink-0 inline-flex items-center justify-center min-w-[44px] h-7 px-2.5 rounded-w-pill bg-flame-500 text-white text-card-meta font-extrabold tabular-nums">
              {MESSAGES.coachDashboard.unpaidMembers.countLabel(data.count)}
            </span>
          </div>

          {/* ─── 미리보기 (첫 3명) ─── */}
          <ul className="flex flex-col gap-2 list-none" role="list">
            {preview.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-wbg dark:bg-rink-900/40 rounded-w-md border border-wline-2 dark:border-rink-700"
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-w-pill bg-flame-500/15 shrink-0"
                  aria-hidden="true"
                >
                  <Icon
                    name="person"
                    className="text-[16px] text-flame-500"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-card-body font-bold text-wtext-1 dark:text-rink-100 truncate">
                    {m.parentName}
                    <span className="ml-1.5 text-card-meta font-medium text-wtext-3 dark:text-rink-300">
                      {m.childName}
                    </span>
                  </p>
                  <p className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                    {m.className}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {remaining > 0 && (
            <p className="mt-2 text-card-meta text-wtext-4 dark:text-rink-400 text-center">
              외 {remaining}명
            </p>
          )}

          {/* ─── 전체 보기 버튼 ─── */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className={cn(
              'mt-4 w-full min-h-[48px] rounded-w-md bg-ice-500 hover:bg-ice-700 text-white text-card-body font-bold',
              'transition-colors motion-reduce:transition-none active:brightness-95 shadow-sh-1',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
            )}
            aria-label={`${MESSAGES.coachDashboard.unpaidMembers.title(monthLabel)} ${MESSAGES.coachDashboard.unpaidMembers.viewAll}`}
          >
            {MESSAGES.coachDashboard.unpaidMembers.viewAll}
          </button>
        </div>
      </section>

      {/* ─── 전체 목록 모달 ─── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={MESSAGES.coachDashboard.unpaidMembers.title(monthLabel)}
        size="lg"
        showCloseButton
        closeOnOverlayClick
      >
        <div className="flex flex-col gap-4">
          {/* 헤더 정보 */}
          <div className="flex items-center justify-between px-1">
            <p className="text-card-meta text-wtext-3 dark:text-rink-300">
              총 {data.count}명
            </p>
            <button
              type="button"
              onClick={handleSendAlertPlaceholder}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-w-md',
                'bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700',
                'text-card-meta font-bold text-wtext-2 dark:text-rink-100',
                'hover:bg-wbg dark:hover:bg-rink-700/40 active:brightness-95',
                'transition-colors motion-reduce:transition-none',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40',
              )}
            >
              <Icon name="notifications_active" className="text-[16px]" aria-hidden="true" />
              {MESSAGES.coachDashboard.unpaidMembers.sendAlertAction}
            </button>
          </div>

          {/* 컬럼 헤더 */}
          <div
            className="grid grid-cols-[1fr_1fr_1.2fr] gap-2 px-3 py-2 bg-wbg dark:bg-rink-900/40 rounded-w-md text-card-meta font-bold text-wtext-3 dark:text-rink-300 uppercase tracking-wider"
            role="row"
          >
            <span>{MESSAGES.coachDashboard.unpaidMembers.columnHeaderName}</span>
            <span>{MESSAGES.coachDashboard.unpaidMembers.columnHeaderChild}</span>
            <span>{MESSAGES.coachDashboard.unpaidMembers.columnHeaderClass}</span>
          </div>

          {/* 전체 목록 */}
          <ul className="flex flex-col gap-2 list-none max-h-[50vh] overflow-y-auto hide-scrollbar" role="list">
            {data.members.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-[1fr_1fr_1.2fr] gap-2 items-center px-3 py-3 bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 rounded-w-md"
                role="row"
              >
                <span className="text-card-body font-bold text-wtext-1 dark:text-rink-100 truncate">
                  {m.parentName}
                </span>
                <span className="text-card-body text-wtext-2 dark:text-rink-100 truncate">
                  {m.childName}
                </span>
                <span className="text-card-meta text-wtext-3 dark:text-rink-300 truncate">
                  {m.className}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </>
  );
});
