'use client';

/**
 * ChildSelector — 자녀 단일 선택 컴포넌트.
 *
 * [생성 2026-05-18] 자녀 선택 단일 진입점 통일 (수업 상세 → 결제 옵션 readonly).
 *   - 기존 결제 옵션 페이지(/payment/options) 인라인 ChildSelector 를 추출.
 *   - 수업 상세(/classes/[id]) 학부모 CTA 위에서 동일 UI 로 노출.
 *   - 결제 옵션 페이지에서는 더 이상 자녀 변경 불가 → SelectedChildDisplay 로 교체.
 *
 * 디자인 규칙 (CLAUDE.md / DESIGN.md):
 *  - gradient / backdrop-blur / 컬러 그림자 사용 금지.
 *  - dark: 변형 필수.
 *  - motion-reduce: 대응.
 *  - 토큰만 사용 (ice-500, wline, wtext-3, rink-700/300 등).
 *
 * 비활성 사유 우선순위:
 *  '이미 수강 중' > '가입 반려' > '가입 승인 대기' > '미가입 팀' > '연령 제한'
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import type { Child } from '@/components/children/ChildCard';

interface ChildSelectorProps {
  childList: Child[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 본 수업에 신청/수강 중인 자녀 ID 집합 (pending/pending_approval/approved). paid 는 제외 */
  enrolledChildIds: Set<string>;
  /** 수업 ageMin/ageMax 와 맞지 않는 자녀 ID 집합 */
  ageIncompatibleChildIds: Set<string>;
  /** 팀 가입 승인 상태가 'approved' 가 아닌 자녀 ID 집합 (설계서 §4.5 + BR-12) */
  notApprovedChildIds: Set<string>;
  /** 자녀별 disable 사유 세분화 라벨 ('pending' | 'rejected' | 'not_member') */
  approvalStatusById: Map<string, 'pending' | 'rejected' | 'not_member'>;
  /**
   * [추가 2026-05-18] 결제완료(paid) 자녀 ID 집합. 다자녀 시나리오 지원.
   *   - 잠금하지 않고 "결제완료" 배지를 표시해 다른 자녀와 구별.
   *   - 선택 시 부모(CTA) 가 "결제취소" 모드로 분기 (handleCancelPayment 진입).
   *   - 선택사항 (undefined 시 빈 Set 으로 처리).
   */
  paidChildIds?: Set<string>;
  /** [2026-06-09] 복수 선택 모드 — 오픈클래스 자녀 복수 결제. true 면 체크박스 + selectedIds/onToggle 사용. */
  multiSelect?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
}

export function ChildSelector({
  childList,
  selectedId,
  onSelect,
  enrolledChildIds,
  ageIncompatibleChildIds,
  notApprovedChildIds,
  approvalStatusById,
  paidChildIds,
  multiSelect = false,
  selectedIds,
  onToggle,
}: ChildSelectorProps) {
  return (
    <div
      className="flex gap-4 overflow-x-auto no-scrollbar py-2 -mx-5 px-5 snap-x"
      role={multiSelect ? 'group' : 'radiogroup'}
      aria-label={MESSAGES.enrollment.childSelectorAriaLabel}
    >
      {childList.map((child) => {
        const isPaid = paidChildIds?.has(child.id) ?? false;
        // paid 는 잠금 X — 선택 가능 (결제취소 진입). enrolled/notApproved/ageIncompatible 만 잠금.
        const isEnrolled = enrolledChildIds.has(child.id);
        const isNotApproved = !isEnrolled && notApprovedChildIds.has(child.id);
        const isAgeIncompatible =
          !isEnrolled &&
          !isNotApproved &&
          ageIncompatibleChildIds.has(child.id);
        const isDisabled = isEnrolled || isNotApproved || isAgeIncompatible;
        const isSelected =
          !isDisabled &&
          (multiSelect
            ? (selectedIds?.has(child.id) ?? false)
            : selectedId === child.id);
        // 비활성 사유 우선순위: '이미 수강 중' > '가입 반려' > '가입 승인 대기' > '미가입 팀' > '연령 제한'
        //   paid 는 잠금이 아니므로 별도 "결제완료" 배지로 표시.
        const approvalKind = approvalStatusById.get(child.id);
        const disabledLabel = isEnrolled
          ? MESSAGES.enrollment.disabledEnrolledLabel
          : isNotApproved
            ? approvalKind === 'rejected'
              ? MESSAGES.team.disabledRejectedLabel
              : approvalKind === 'pending'
                ? MESSAGES.team.disabledPendingLabel
                : MESSAGES.team.disabledNotMemberLabel
            : isAgeIncompatible
              ? MESSAGES.enrollment.disabledAgeLabel
              : null;
        // paid 자녀 배지 — disabledLabel 보다 우선 (paid 시 disabledLabel 은 null)
        const paidLabel = isPaid && !disabledLabel ? MESSAGES.enrollment.paidBadgeLabel : null;
        return (
          <label
            key={child.id}
            className={`snap-start group relative flex flex-col items-center gap-2 min-w-[80px] ${
              isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
            }`}
            aria-disabled={isDisabled}
          >
            <input
              type={multiSelect ? 'checkbox' : 'radio'}
              name={multiSelect ? undefined : 'child'}
              checked={isSelected}
              disabled={isDisabled}
              onChange={() => {
                if (isDisabled) return;
                if (multiSelect) onToggle?.(child.id);
                else onSelect(child.id);
              }}
              className="peer sr-only"
              aria-label={`${child.name}${disabledLabel ? ` (${disabledLabel})` : ''}`}
            />
            <div
              className={`relative size-16 rounded-w-pill p-0.5 transition-all motion-reduce:transition-none ${
                isDisabled
                  ? 'ring-2 ring-transparent ring-offset-2 opacity-40'
                  : isSelected
                    ? isPaid
                      ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 scale-105 shadow-md'
                      : 'ring-2 ring-ice-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 scale-105 shadow-md'
                    : 'ring-2 ring-transparent ring-offset-2 opacity-60 hover:ring-wline dark:hover:ring-rink-700'
              }`}
            >
              <div className="size-full rounded-w-pill overflow-hidden bg-wline dark:bg-rink-700 flex items-center justify-center">
                <Icon name="person" className="text-3xl text-wtext-3" />
              </div>
              {isSelected && (
                <div className="absolute bottom-0 right-0 bg-ice-500 text-white rounded-w-pill p-1 shadow-sm">
                  <Icon name="check" className="text-[12px] font-bold" />
                </div>
              )}
              {isDisabled && (
                <div className="absolute inset-0.5 rounded-w-pill bg-rink-900/30 dark:bg-rink-900/50 flex items-center justify-center">
                  <Icon
                    name="lock"
                    className="text-white text-card-emphasis"
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>
            <span
              className={`text-card-body font-medium transition-colors motion-reduce:transition-none ${
                isDisabled
                  ? 'text-wtext-3 dark:text-rink-300'
                  : isSelected
                    ? 'font-bold text-ice-500'
                    : 'text-wtext-3 group-hover:text-wtext-2 dark:group-hover:text-wtext-4'
              }`}
            >
              {child.name}
            </span>
            {disabledLabel && (
              <span className="px-2 py-0.5 rounded-w-pill bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300 text-[10px] font-medium whitespace-nowrap">
                {disabledLabel}
              </span>
            )}
            {paidLabel && (
              <span className="px-2 py-0.5 rounded-w-pill bg-ice-500/10 text-ice-500 text-[10px] font-bold whitespace-nowrap">
                {paidLabel}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
