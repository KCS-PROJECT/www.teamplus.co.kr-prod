'use client';

import { Icon } from '@/components/ui/Icon';
import { ChildLevelProgress } from '@/components/parent/ChildLevelProgress';
import { MESSAGES } from '@/lib/messages';
import { formatBirthYear } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/image-url';

export interface Child {
  id: string;
  name: string;
  age: number;
  /**
   * 생년월일 (ISO 8601 'YYYY-MM-DD'). 만나이(국제나이) 계산에 사용.
   * `age` 는 한국나이(세는나이) SoT 이며, 만나이가 필요한 검증·U카테고리 표시는
   * `calculateInternationalAge(birthDate)` (src/lib/utils.ts) 호출.
   */
  birthDate?: string | null;
  /** [추가 2026-05-13] 학생 본인 계정 이메일/ID — 학부모 홈 hero · 메뉴 상단에 노출 */
  email?: string | null;
  club: string | null;
  /** APPROVED 상태의 TeamMember.clubId 집합 (표시용 club 이름과 별개로 ID 기반 매핑 경로) */
  clubIds?: string[];
  /** 승인된 대표 팀 로고 URL — 사이드메뉴 자녀 스위처 좌측 표시. 무소속이면 null. */
  teamLogoUrl?: string | null;
  isActive: boolean;
  imageUrl: string | null;
  /** 학습 레벨 (1-5) - Phase 1 추가 */
  currentLevel?: number;
  /** 레벨 라벨 (입문/기초/중급/상급/마스터) */
  levelLabel?: string;
  /** 다음 레벨까지 진도율 (0-100) */
  progressPercent?: number;
  /** 다음 평가 테스트 예정일 */
  nextTestDate?: string | null;
  /** APPROVED 상태 TeamMember PK (수상/출석 등 memberId 참조용). 팀 미가입 시 null */
  memberId?: string | null;
  /** PENDING 상태의 팀 가입 신청(clubId). approved 가 있으면 미표시 */
  pendingClubId?: string | null;
  /** PENDING 상태의 팀 이름 (표시용) */
  pendingClubName?: string | null;
  /** REJECTED 상태의 팀 가입 신청(clubId). approved/pending 이 있으면 미표시 */
  rejectedClubId?: string | null;
  /** REJECTED 상태의 팀 이름 */
  rejectedClubName?: string | null;
  /** REJECTED 상태 TeamMember PK (재신청 API 호출용). 그 외 상태면 null */
  rejectedMemberId?: string | null;
  /** 감독이 입력한 반려 사유 */
  rejectionReason?: string | null;
}

interface ChildCardProps {
  child: Child;
  onEdit?: (id: string) => void;
}

export function ChildCard({ child, onEdit }: ChildCardProps) {
  const hasLevelData =
    typeof child.currentLevel === 'number' && typeof child.progressPercent === 'number';

  const hasValidImage = Boolean(
    child.imageUrl &&
      child.imageUrl.trim() !== '' &&
      child.imageUrl !== '/placeholder.svg' &&
      !child.imageUrl.endsWith('/placeholder.svg'),
  );
  const initial = child.name.charAt(0) || '?';

  return (
    <article className="group relative flex flex-col sm:flex-row items-stretch justify-between gap-4 rounded-3xl bg-white dark:bg-rink-800 p-5 shadow-sm hover:shadow-md transition-all motion-reduce:transition-none duration-300 border border-transparent hover:border-ice-500/10 dark:hover:border-ice-500/20">
      <div className="flex flex-[2_2_0px] flex-col justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            {child.isActive ? (
              <span className="bg-blue-100 dark:bg-blue-900/40 text-ice-500 dark:text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
                Active
              </span>
            ) : (
              <span className="bg-wline-2 dark:bg-rink-700 text-wtext-3 dark:text-rink-100 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
                Inactive
              </span>
            )}
            {child.pendingClubName && !child.club && (
              <span
                className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full"
                title={MESSAGES.team.pendingApproval(child.pendingClubName)}
              >
                <Icon name="hourglass_top" className="text-[12px]" aria-hidden="true" />
                {MESSAGES.team.pendingApprovalGeneric}
              </span>
            )}
            {!child.pendingClubName && child.rejectedClubName && !child.club && (
              <span
                className="inline-flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full"
                title={MESSAGES.team.detailRejectedTitle(child.rejectedClubName)}
              >
                <Icon name="block" className="text-[12px]" aria-hidden="true" />
                {MESSAGES.team.disabledRejectedLabel}
              </span>
            )}
          </div>
          <h3 className="text-wtext-1 dark:text-white text-xl font-bold leading-tight">
            {child.name}
          </h3>
          <p className="text-wtext-3 dark:text-rink-300 text-sm font-medium leading-normal flex items-center gap-1.5">
            <Icon
              name={
                child.club
                  ? 'sports_hockey'
                  : child.pendingClubName
                  ? 'hourglass_top'
                  : child.rejectedClubName
                  ? 'block'
                  : 'face'
              }
              className={`text-[16px] ${
                child.club
                  ? 'text-ice-500'
                  : child.pendingClubName
                  ? 'text-amber-500'
                  : child.rejectedClubName
                  ? 'text-red-500'
                  : 'text-wtext-3'
              }`}
            />
            {/* [2026-05-21] 나이(N세) → 출생연도(YYYY년생) */}
            {formatBirthYear(child.birthDate, child.age) || `${child.age}세`}{' '}
            {child.club
              ? `\u2022 ${child.club}`
              : child.pendingClubName
              ? `\u2022 ${MESSAGES.team.pendingApproval(child.pendingClubName)}`
              : child.rejectedClubName
              ? `\u2022 ${MESSAGES.team.disabledRejectedLabel} · ${child.rejectedClubName}`
              : '\u2022 미등록'}
          </p>

          {/* Phase 1 통합: 학습 레벨 + 진도 */}
          {hasLevelData && (
            <div className="mt-2">
              <ChildLevelProgress
                currentLevel={child.currentLevel ?? 1}
                levelLabel={child.levelLabel ?? '입문'}
                progressPercent={child.progressPercent ?? 0}
                nextTestDate={child.nextTestDate}
                variant="compact"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(child.id);
          }}
          className="group/btn flex items-center gap-2 bg-wbg dark:bg-rink-700 hover:bg-ice-500 hover:text-white dark:hover:bg-ice-500 text-wtext-2 dark:text-rink-100 text-xs font-semibold py-2.5 px-4 rounded-xl w-fit transition-all motion-reduce:transition-none duration-300"
        >
          <Icon
            name="edit"
            className="text-[16px] transition-transform motion-reduce:transition-none group-hover/btn:rotate-12"
          />
          정보 수정
        </button>
      </div>

      <div className="relative w-full sm:w-28 h-40 sm:h-auto shrink-0 overflow-hidden rounded-2xl bg-ice-500/10 dark:bg-ice-500/20">
        {hasValidImage ? (
          <>
            <div className="absolute inset-0 bg-black/10 z-10" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveImageSrc(child.imageUrl) as string}
              alt={child.name}
              className="absolute inset-0 size-full object-cover transform transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none motion-reduce:transform-none"
            />
          </>
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            role="img"
            aria-label={`${child.name} 프로필 사진 미등록`}
          >
            <span
              className="text-4xl font-extrabold text-ice-500 tracking-tight select-none"
              aria-hidden="true"
            >
              {initial}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-ice-500/70 dark:text-ice-500/80"
              aria-hidden="true"
            >
              <Icon name="photo_camera" className="text-[12px]" />
              사진 미등록
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
