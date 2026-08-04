/**
 * 수업 공개 범위 — 백엔드 Prisma `ClassVisibility` enum 과 1:1 동기화.
 *
 * [2026-08-04] 수업이 소속 팀 안에서만 보이던 폐쇄 구조를 열기 위해 도입.
 *   감독/코치가 수업 생성 시 선택하고, 전국 수업 탐색(`/classes-explore`)의 노출을 결정한다.
 *
 * ⚠️ 값 추가·변경 시 백엔드 `prisma/schema.prisma` 의 enum 과 반드시 함께 갱신할 것.
 * 라벨·설명 문구는 `MESSAGES.class.visibility.*` 를 사용한다(한글 하드코딩 금지).
 *
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
 */
export const CLASS_VISIBILITY_VALUES = [
  'PUBLIC',
  'PARENTS_ONLY',
  'SELECTED_TEAMS',
  'TEAM_ONLY',
] as const;

export type ClassVisibility = (typeof CLASS_VISIBILITY_VALUES)[number];

/**
 * 생성 폼 기본값 — 학부모공개.
 *
 * DB 기본값은 `TEAM_ONLY`(기존 수업 백필값과 일치시켜 배포 시 동작 변화 0)지만,
 * 폼에서는 발견성을 기본으로 둔다. 감독이 의식적으로 좁히도록 유도하는 편이
 * "만들었는데 아무에게도 안 보인다"는 기존 문제를 반복하지 않는다.
 */
export const DEFAULT_CLASS_VISIBILITY: ClassVisibility = 'PARENTS_ONLY';

export function isClassVisibility(v: unknown): v is ClassVisibility {
  return (
    typeof v === 'string' &&
    (CLASS_VISIBILITY_VALUES as readonly string[]).includes(v)
  );
}
