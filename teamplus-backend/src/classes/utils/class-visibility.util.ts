import { BadRequestException } from "@nestjs/common";
import { ClassVisibility, Prisma } from "@prisma/client";
import type { ViewerLike } from "@/common/utils/viewer-birth-years.util";

export const CLASS_VISIBILITY_MESSAGES = {
  SELECTED_TEAMS_REQUIRED: "노출할 팀을 1개 이상 선택해주세요.",
} as const;

/**
 * 수업 공개범위(Class.visibility) 노출 게이트 — 목록·상세·검색 공용 SoT.
 *
 * [2026-08-04] 수업이 소속 팀 안에서만 보이는 폐쇄 구조를 열기 위해 도입.
 *   감독/코치가 수업 단위로 공개 범위를 고르고, 전국 탐색(GET /api/v1/classes/explore)이
 *   이 함수로 뷰어별 노출을 판정한다. SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
 *
 * 노출 매트릭스:
 *   | 뷰어                    | PUBLIC | PARENTS_ONLY | SELECTED_TEAMS  | TEAM_ONLY |
 *   | 비로그인                |   ✅   |      ✗       |       ✗         |     ✗     |
 *   | PARENT/CHILD/TEEN       |   ✅   |      ✅      | 지정 팀 소속 시 | 소속 팀만 |
 *   | COACH/DIRECTOR/A_DIR    |   ✅   |      ✅      | 지정 팀 소속 시 | 소속 팀만 |
 *   | ADMIN                   |   ✅   |      ✅      |       ✅        |    ✅     |
 *
 * ⚠️ 반환값은 `where` 에 그대로 병합하지 말고 `AND: [...]` 로 감쌀 것.
 *   내부가 `OR` 배열이므로 최상위에 직접 펼치면 호출부의 다른 `OR` 와 충돌한다.
 */
export function buildClassVisibilityWhere(
  user: ViewerLike | null | undefined,
  viewerTeamIds: string[],
): Prisma.ClassWhereInput {
  // ADMIN — 운영 목적 전체 열람. 빈 조건이면 AND 병합 시 무영향.
  if (user?.userType === "ADMIN") return {};

  const or: Prisma.ClassWhereInput[] = [{ visibility: "PUBLIC" }];

  // 비로그인 — 전체공개만. 아동 대상 정보의 외부 노출을 최소 범위로 묶는다.
  if (!user) return { OR: or };

  // 로그인 사용자 공통 — 학부모공개까지.
  //   COACH/DIRECTOR 도 포함한다: 감독이 타 클럽 수업을 참고·벤치마킹하는 것을 막을 이유가 없고,
  //   PARENTS_ONLY 는 "비로그인 차단" 이 목적이지 "학부모 전용" 이 아니다.
  or.push({ visibility: "PARENTS_ONLY" });

  if (viewerTeamIds.length > 0) {
    // 비공개 — 내 소속 팀 수업만.
    or.push({ visibility: "TEAM_ONLY", teamId: { in: viewerTeamIds } });
    // 지정 팀 노출 — 기존 ClassTeamVisibility(N:M) 재활용.
    //   2026-06-29 정책 변경으로 조회 경로에서 폐지됐던 테이블을 SELECTED_TEAMS 전용으로 되살린다.
    or.push({
      visibility: "SELECTED_TEAMS",
      teamVisibilities: { some: { teamId: { in: viewerTeamIds } } },
    });
  }

  return { OR: or };
}

/**
 * 공개범위 ↔ 노출 팀 정합성 검증.
 *
 * SELECTED_TEAMS 인데 노출 팀이 비어 있으면 아무에게도 보이지 않는 수업이 만들어지고,
 * 감독은 "등록했는데 아무도 못 본다"는 원인을 알기 어렵다. 생성·수정 진입점에서 막는다.
 *
 * 수정(update) 경로에서 visibility 는 그대로 두고 visibleTeamIds 만 []로 보내는 경우도
 * 같은 결과이므로, 호출부는 "변경 후 최종 상태" 를 넘겨야 한다.
 */
export function assertVisibilitySelection(
  visibility: ClassVisibility | undefined,
  visibleTeamIds: string[] | undefined,
): void {
  if (visibility !== ClassVisibility.SELECTED_TEAMS) return;
  if (!visibleTeamIds || visibleTeamIds.length === 0) {
    throw new BadRequestException(
      CLASS_VISIBILITY_MESSAGES.SELECTED_TEAMS_REQUIRED,
    );
  }
}

/*
 * [설계 메모] 수업 "상세"(GET /classes/:id)에는 visibility 게이트를 적용하지 않는다.
 *
 * 목록만 막고 상세를 열어두면 비대칭이지만, 상세에 같은 규칙을 걸면 회귀가 발생한다:
 *   · 오픈클래스는 teamId=null 이고 기존 수업의 백필값은 TEAM_ONLY 다.
 *     → TEAM_ONLY + teamId=null 은 어떤 뷰어로도 매칭되지 않아
 *       "이미 등록한 학부모가 자기 수업 상세를 못 보는" 상태가 된다.
 *   · `assertClassAccessForManager` 의 PARENT/CHILD/TEEN 통과는 의도된 것이다
 *     ("학부모 결제 검토·오픈클래스 영업 흐름 보존" — 기존 주석).
 *
 * 실질 노출 위험도 낮다 — 상세 API 는 JWT 필수(@Public 아님)이고 cuid 를 알아야 도달한다.
 * 목록·검색·탐색 3개 진입점을 게이트하면 발견 경로는 닫힌다.
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md §5-4
 */
