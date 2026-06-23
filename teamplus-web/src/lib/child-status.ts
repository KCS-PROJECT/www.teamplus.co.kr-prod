/**
 * 자녀 상태 판정 SoT (Source of Truth).
 *
 * 활성 자녀 = 최소 1개 팀에 approved 멤버인 자녀.
 *  - 팀 수업(정규)의 신청·결제·출석 게이트 (오픈클래스는 제외 — 아래)
 *  - 활성화는 §4.5 팀 가입 절차(회원가입 → 감독 승인)로만 가능
 *
 * 수업별 자격:
 *  - 오픈클래스 (academyId): 팀 멤버십과 무관 — 등록된 모든 자녀 OK
 *    (§4.6 "오픈클래스 자체에는 가입 없음" + 백엔드 enrollments 가드도 오픈클래스는 멤버십 검증 제외)
 *  - 팀 수업 (teamId):       자녀가 해당 팀에 approved 상태이면 OK
 *
 * ⚠️ `Child.isActive` 필드는 계정·프로필 활성 플래그로, 본 모듈의 "활성"(팀 멤버십)과 별개 개념.
 *    혼동 방지를 위해 본 모듈은 `clubIds.length > 0` 기준만 사용한다.
 */
import type { Child } from '@/components/children/ChildCard';

/** 활성 자녀 여부 — 어떤 팀에든 approved 멤버이면 true */
export function isActiveChild(child: Child): boolean {
  return (child.clubIds ?? []).length > 0;
}

/** 활성 자녀 목록만 추출 */
export function getActiveChildren(children: Child[]): Child[] {
  return children.filter(isActiveChild);
}

/**
 * 자녀 선택 스코프(사이드메뉴·대시보드 칩·전역 SelectedChildContext) 노출 대상 여부.
 *
 * [2026-06-17] 팀 가입 정책 전환(무소속 자녀 허용)에 따라 **등록된 모든 자녀를 선택 가능**으로 변경.
 *   - 과거에는 자녀가 반드시 팀 소속이어야 했기에 pending/rejected(관계 미확정)를 제외했으나,
 *     이제는 자녀가 소속 팀이 없는 상태(무소속·대기·거절)가 정상 상태이므로 모두 노출한다.
 *   - 거절 자녀도 선택 영역에서 보여 재신청 흐름으로 진입할 수 있어야 한다.
 *
 * ⚠️ `isActiveChild`(팀 approved 게이트)와 구분 — 결제·출석 자격은 여전히 isActiveChild 기준.
 *    본 함수는 "선택 칩에 노출/선택 가능한가"만 판정하며, 자격 게이트와 무관하다.
 */
export function isSelectableChild(): boolean {
  return true;
}

/** 선택 스코프 노출 대상 자녀 목록 (무소속 포함, pending/rejected 제외) */
export function getSelectableChildren(children: Child[]): Child[] {
  return children.filter(isSelectableChild);
}

/** 비활성 사유 — 우선순위: rejected > pending > not_member */
export type ChildInactiveReason = 'rejected' | 'pending' | 'not_member';

export function getChildInactiveReason(child: Child): ChildInactiveReason | null {
  if (isActiveChild(child)) return null;
  if (child.rejectedClubId) return 'rejected';
  if (child.pendingClubId) return 'pending';
  return 'not_member';
}

/** 특정 수업에 대한 자녀 등록 자격 — `payment/options`, `classes/[id]` 공통 사용 */
export type ClassEligibility =
  | { eligible: true }
  | { eligible: false; reason: ChildInactiveReason };

/**
 * 수업 대상 연령에 자녀가 부합하는지 — `classes/[id]`, `payment/options` 공통.
 *
 *  · targetBirthYears(출생연도 개별 목록, SoT)가 있으면 자녀 출생연도가 그 안에 포함되어야 적격.
 *    (비연속 선택까지 정확히 매칭 — 예: [2015,2017]이면 2016년생은 부적격)
 *  · targetBirthYears가 비었거나 없으면 레거시 ageMin/ageMax(한국나이) 범위로 폴백.
 *  · 둘 다 없으면 전 연령 대상(true).
 *
 * 자녀 출생연도는 birthDate 우선, 없으면 한국나이(age = currentYear - birthYear + 1)로 역산.
 * 연령 정보가 전혀 없으면 차단하지 않는다(기존 동작 유지 — true).
 */
export function isChildAgeEligibleForClass(
  child: { age?: number | null; birthDate?: string | null },
  cls: {
    targetBirthYears?: number[] | null;
    ageMin?: number | null;
    ageMax?: number | null;
  },
): boolean {
  const targetYears = cls.targetBirthYears ?? [];
  const currentYear = new Date().getFullYear();

  if (targetYears.length > 0) {
    const fromBirthDate = child.birthDate
      ? new Date(child.birthDate).getFullYear()
      : null;
    const birthYear =
      fromBirthDate && !Number.isNaN(fromBirthDate)
        ? fromBirthDate
        : child.age != null
          ? currentYear - child.age + 1
          : null;
    if (birthYear == null) return true; // 연령 정보 없음 → 차단하지 않음
    return targetYears.includes(birthYear);
  }

  // 레거시 폴백 — ageMin/ageMax(한국나이) 범위
  const { ageMin, ageMax } = cls;
  if (ageMin == null && ageMax == null) return true;
  if (child.age == null) return true;
  if (ageMin != null && child.age < ageMin) return false;
  if (ageMax != null && child.age > ageMax) return false;
  return true;
}

export function getChildEligibilityForClass(
  child: Child,
  ctx: { isOpenClass: boolean; eligibleTeamId: string | null },
): ClassEligibility {
  // 오픈클래스: 가입 개념 없음 (§4.6) — 팀 멤버십(거절/대기/무소속)과 무관하게 등록된 모든 자녀 통과.
  //  연령 자격은 호출 측에서 isChildAgeEligibleForClass 로 별도 판정.
  if (ctx.isOpenClass) return { eligible: true };
  // 팀 수업: 해당 팀에 approved 자녀만 통과 (§4.2 정규 훈련)
  const teamId = ctx.eligibleTeamId;
  if (!teamId) return { eligible: false, reason: 'not_member' };
  if ((child.clubIds ?? []).includes(teamId)) return { eligible: true };
  if (child.rejectedClubId === teamId) return { eligible: false, reason: 'rejected' };
  if (child.pendingClubId === teamId) return { eligible: false, reason: 'pending' };
  return { eligible: false, reason: 'not_member' };
}
