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
 *  '이미 수강 중' > '가입 반려' > '가입 승인 대기' > '이 수업 대상 아님' > '연령 제한'
 */

import { Icon } from '@/components/ui/Icon';
import { MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/utils';
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
  /**
   * 표시 변형 — 'list'(세로 리스트) | 'avatar'(원형 아바타 캐러셀) | 'pill'(가로 pill 토글).
   *
   * 수업 상세는 'list' 를 쓴다. 자녀마다 상태(수강중·승인대기·반려·대상아님·연령·결제완료)가
   * 붙는데 chip 규격에는 보조 텍스트 슬롯이 없어, pill 로 넣으면 상태 문구 길이만큼 폭이
   * 들쑥날쑥해진다. 리스트 행은 full-width 라 폭 편차가 생기지 않고 사유를 축약 없이 쓸 수 있다.
   */
  variant?: 'avatar' | 'pill' | 'list';
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
  variant = 'avatar',
}: ChildSelectorProps) {
  /* ── 세로 리스트 변형 (수업 상세 · 결제 대상 확정) ──────────────────────────
     행 = [아바타][이름 / 상태 사유][우측 상태]. 선택 동작·잠금 판정은 pill 과 100% 동일하고
     표현만 다르다. 사유는 축약(shortLabel) 대신 원문(disabledLabel)을 쓴다 — 폭 제약이 없다. */
  if (variant === 'list') {
    return (
      <ul
        className="flex flex-col overflow-hidden rounded-w-md border border-it-line dark:border-rink-700 bg-wsurface dark:bg-rink-900 divide-y divide-it-line dark:divide-rink-700"
        role={multiSelect ? 'group' : 'radiogroup'}
        aria-label={MESSAGES.enrollment.childSelectorAriaLabel}
      >
        {childList.map((child) => {
          const isPaid = paidChildIds?.has(child.id) ?? false;
          // paid 는 잠금 X — 선택 가능(결제취소 진입). enrolled/notApproved/ageIncompatible 만 잠금.
          const isEnrolled = enrolledChildIds.has(child.id);
          const isNotApproved = !isEnrolled && notApprovedChildIds.has(child.id);
          const isAgeIncompatible =
            !isEnrolled && !isNotApproved && ageIncompatibleChildIds.has(child.id);
          const isDisabled = isEnrolled || isNotApproved || isAgeIncompatible;
          const isSelected =
            !isDisabled &&
            (multiSelect
              ? (selectedIds?.has(child.id) ?? false)
              : selectedId === child.id);
          const approvalKind = approvalStatusById.get(child.id);
          // 비활성 사유 우선순위: '이미 수강 중' > '가입 반려' > '가입 승인 대기' > '이 수업 대상 아님' > '연령 제한'
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
          // paid 배지는 disabledLabel 보다 후순위 (paid 시 disabledLabel 은 null)
          const paidLabel =
            isPaid && !disabledLabel ? MESSAGES.enrollment.paidBadgeLabel : null;
          const subLabel = disabledLabel ?? paidLabel;
          return (
            <li key={child.id}>
              <button
                type="button"
                role={multiSelect ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
                disabled={isDisabled}
                aria-label={`${child.name}${subLabel ? ` (${subLabel})` : ''}`}
                onClick={() => {
                  if (isDisabled) return;
                  if (multiSelect) onToggle?.(child.id);
                  else onSelect(child.id);
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 min-h-[60px] text-left transition-colors motion-reduce:transition-none',
                  isDisabled
                    ? 'cursor-not-allowed opacity-60'
                    : isSelected
                      ? isPaid
                        ? 'bg-it-red-50 dark:bg-it-red-500/10'
                        : 'bg-it-blue-50 dark:bg-it-blue-900/30'
                      : 'hover:bg-it-fill dark:hover:bg-rink-800 active:brightness-95',
                )}
              >
                {/* 아바타 — 인물 자리이므로 person 아이콘 (이니셜 금지) */}
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-w-pill',
                    isDisabled
                      ? 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                      : isPaid
                        ? 'bg-it-red-500/10 text-it-red-500 dark:text-it-red-300'
                        : 'bg-it-blue-500/10 text-it-blue-600 dark:text-it-blue-300',
                  )}
                  aria-hidden="true"
                >
                  <Icon name="person" className="text-[20px]" />
                </span>

                {/* 이름 + 상태 사유 */}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      'truncate text-[15px] font-bold tracking-[-0.01em]',
                      isSelected
                        ? isPaid
                          ? 'text-it-red-600 dark:text-it-red-200'
                          : 'text-it-blue-700 dark:text-it-blue-200'
                        : 'text-it-ink-800 dark:text-white',
                    )}
                  >
                    {child.name}
                  </span>
                  {subLabel && (
                    <span
                      className={cn(
                        'truncate text-[12.5px] font-semibold',
                        paidLabel
                          ? 'text-it-red-500 dark:text-it-red-300'
                          : 'text-it-ink-500 dark:text-rink-300',
                      )}
                    >
                      {subLabel}
                    </span>
                  )}
                </span>

                {/* 우측 상태 — 잠금 / 선택됨 / 미선택 */}
                {isDisabled ? (
                  <Icon
                    name="lock"
                    className="shrink-0 text-[18px] text-wtext-3 dark:text-rink-300"
                    aria-hidden="true"
                  />
                ) : isSelected ? (
                  <Icon
                    name="check_circle"
                    filled
                    className={cn(
                      'shrink-0 text-[22px]',
                      isPaid ? 'text-it-red-500' : 'text-it-blue-500',
                    )}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="size-[22px] shrink-0 rounded-w-pill border-[1.5px] border-it-line-strong dark:border-rink-600"
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  /* ── ICETIMES 하우스 pill 변형 ── */
  if (variant === 'pill') {
    return (
      <div
        className="flex flex-wrap gap-2"
        role={multiSelect ? 'group' : 'radiogroup'}
        aria-label={MESSAGES.enrollment.childSelectorAriaLabel}
      >
        {childList.map((child) => {
          const isPaid = paidChildIds?.has(child.id) ?? false;
          const isEnrolled = enrolledChildIds.has(child.id);
          const isNotApproved = !isEnrolled && notApprovedChildIds.has(child.id);
          const isAgeIncompatible =
            !isEnrolled && !isNotApproved && ageIncompatibleChildIds.has(child.id);
          const isDisabled = isEnrolled || isNotApproved || isAgeIncompatible;
          const isSelected =
            !isDisabled &&
            (multiSelect
              ? (selectedIds?.has(child.id) ?? false)
              : selectedId === child.id);
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
          // pill 폭 절약용 축약 라벨 — 전체 사유는 aria-label 로 유지.
          const shortLabel = isEnrolled
            ? MESSAGES.enrollment.disabledEnrolledShort
            : isNotApproved
              ? approvalKind === 'rejected'
                ? MESSAGES.team.disabledRejectedShort
                : approvalKind === 'pending'
                  ? MESSAGES.team.disabledPendingShort
                  : MESSAGES.team.disabledNotMemberShort
              : isAgeIncompatible
                ? MESSAGES.enrollment.disabledAgeShort
                : null;
          const paidLabel =
            isPaid && !disabledLabel ? MESSAGES.enrollment.paidBadgeLabel : null;
          return (
            <button
              key={child.id}
              type="button"
              disabled={isDisabled}
              aria-pressed={isSelected}
              aria-label={`${child.name}${disabledLabel ? ` (${disabledLabel})` : ''}`}
              onClick={() => {
                if (isDisabled) return;
                if (multiSelect) onToggle?.(child.id);
                else onSelect(child.id);
              }}
              className={`inline-flex items-center gap-2 h-[42px] pl-2 pr-3.5 rounded-w-pill border-[1.5px] text-[14.5px] font-extrabold tracking-tight whitespace-nowrap transition-colors motion-reduce:transition-none ${
                isDisabled
                  ? 'bg-wbg dark:bg-rink-900/40 border-wline-2 dark:border-rink-700 text-wtext-3 dark:text-rink-300 opacity-60 cursor-not-allowed'
                  : isSelected
                    ? isPaid
                      ? 'bg-it-red-500 border-it-red-500 text-white'
                      : 'bg-it-blue-500 border-it-blue-500 text-white'
                    : 'bg-wsurface dark:bg-rink-900 border-wline dark:border-rink-600 text-wtext-2 dark:text-rink-100'
              }`}
            >
              {/* 좌측 슬롯 — 인물 자리이므로 이름 이니셜을 쓰지 않는다. 아래 아바타 variant·
                  SelectedChildDisplay(다음 단계 화면)와 동일하게 person 아이콘으로 통일. */}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-w-pill ${
                  isDisabled
                    ? 'bg-wline dark:bg-rink-700 text-wtext-3 dark:text-rink-300'
                    : isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-it-blue-500/10 text-it-blue-600'
                }`}
                aria-hidden="true"
              >
                <Icon
                  name={isDisabled ? 'lock' : 'person'}
                  className={isDisabled ? 'text-[14px]' : 'text-[16px]'}
                />
              </span>
              {child.name}
              {shortLabel && (
                <span className="text-[11px] font-bold text-wtext-3 dark:text-rink-300">
                  {shortLabel}
                </span>
              )}
              {paidLabel && (
                <span
                  className={`text-[11px] font-bold ${
                    isSelected ? 'text-white/80' : 'text-it-red-500'
                  }`}
                >
                  · {paidLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

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
        // 비활성 사유 우선순위: '이미 수강 중' > '가입 반려' > '가입 승인 대기' > '이 수업 대상 아님' > '연령 제한'
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
