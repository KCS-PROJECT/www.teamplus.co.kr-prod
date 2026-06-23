'use client';

/**
 * ApplicantCard - TEAMPLUS Shared Component
 * 회원/매치 참가 승인 대기 카드. 체크박스·레벨 배지·메타 정보·승인/거절 액션.
 * 사용 화면: /director-approvals
 */

import { cn } from '@/lib/utils';

/**
 * 생년월일 라벨 포맷 — ISO/YYYY-MM-DD 문자열을 "2015.03.21" 로 변환.
 * Date 파싱 없이 문자열 slice 로 처리해 타임존 시프트(하루 밀림)를 회피한다.
 */
export function formatBirthDateLabel(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.slice(0, 10));
  if (!m) return undefined;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

export interface ApplicantData {
  id: string | number;
  name: string;
  /** 레벨 라벨 (예: "입문", "중급", "상급") */
  level?: string;
  /** 생년월일 (ISO/YYYY-MM-DD). 있으면 "2015.03.21" 로 표시하며 birthYear/age 보다 우선. */
  birthDate?: string;
  /** 출생연도 (예: 2015). birthDate 없을 때 "2015년생" 폴백, age 보다 우선. */
  birthYear?: number;
  /** 나이 (birthDate·birthYear 없을 때 "N세" 폴백) */
  age?: number;
  /** 성별 라벨 ("남", "여") */
  gender?: string;
  /** 경력/소속 라벨 (예: "팀 3년", "신규") */
  careerLabel?: string;
  /** 신청일시 (표시용) */
  createdAt?: string;
}

export interface ApplicantCardProps {
  applicant: ApplicantData;
  /** 선택 여부 */
  selected?: boolean;
  /** 체크박스 토글 핸들러 */
  onToggleSelect?: (id: ApplicantData['id']) => void;
  /** 승인 버튼 핸들러 */
  onApprove?: (id: ApplicantData['id']) => void;
  /** 거절 버튼 핸들러 */
  onReject?: (id: ApplicantData['id']) => void;
  /** 추가 className */
  className?: string;
}

export function ApplicantCard({
  applicant,
  selected = false,
  onToggleSelect,
  onApprove,
  onReject,
  className,
}: ApplicantCardProps) {
  const { id, name, level, birthDate, birthYear, age, gender, careerLabel, createdAt } = applicant;

  // 생년월일 우선("2015.03.21"), 없으면 출생연도("2015년생"), 그래도 없으면 나이("8세").
  const ageLabel =
    formatBirthDateLabel(birthDate) ??
    (typeof birthYear === 'number'
      ? `${birthYear}년생`
      : typeof age === 'number'
        ? `${age}세`
        : undefined);

  // 2번째 줄(보조 정보): 성별 · 경력 · 신청일 — 출생연도는 이름 줄로 올려 2줄 컴팩트화.
  const subParts: string[] = [];
  if (gender) subParts.push(gender);
  if (careerLabel) subParts.push(careerLabel);
  if (createdAt) subParts.push(`신청일 ${createdAt}`);
  const subText = subParts.join(' · ');

  return (
    <div
      className={cn(
        'bg-white dark:bg-rink-800',
        'p-3 rounded-xl',
        'border border-wline dark:border-rink-700',
        'transition-colors duration-150',
        selected && 'ring-2 ring-ice-500 border-ice-500',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        {onToggleSelect && (
          <label className="shrink-0 inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(id)}
              aria-label={`${name}님 선택`}
              className="w-5 h-5 rounded border-wline text-ice-500 focus:ring-2 focus:ring-ice-500/40 cursor-pointer"
            />
          </label>
        )}

        {/* Info — 2줄 컴팩트: 1줄 이름·레벨·출생연도 / 2줄 보조 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[15px] font-bold text-wtext-1 dark:text-white truncate">
              {name}
            </p>
            {level && (
              <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded bg-ice-500/10 text-ice-500">
                {level}
              </span>
            )}
            {ageLabel && (
              <span className="text-xs font-medium text-wtext-3 dark:text-rink-300 tabular-nums">
                {ageLabel}
              </span>
            )}
          </div>
          {subText && (
            <p className="mt-0.5 text-[11px] text-wtext-3 dark:text-rink-300 truncate">
              {subText}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {(onApprove || onReject) && (
        <div className="mt-4 flex items-center gap-2">
          {onReject && (
            <button
              type="button"
              onClick={() => onReject(id)}
              aria-label={`${name}님 거절`}
              className={cn(
                'flex-1 h-10 rounded-lg text-sm font-semibold',
                'bg-wline-2 dark:bg-rink-700 text-wtext-2 dark:text-rink-100',
                'hover:bg-wline dark:hover:bg-rink-500',
                'active:brightness-95 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ice-500/30/40'
              )}
            >
              거절
            </button>
          )}
          {onApprove && (
            <button
              type="button"
              onClick={() => onApprove(id)}
              aria-label={`${name}님 승인`}
              className={cn(
                'flex-1 h-10 rounded-lg text-sm font-semibold',
                'bg-ice-500 text-white',
                'hover:bg-ice-500/90',
                'active:brightness-95 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ice-500/40'
              )}
            >
              승인
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ApplicantCard;
