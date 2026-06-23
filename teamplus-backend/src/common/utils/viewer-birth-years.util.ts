import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * 수업 대상 연령(출생연도) 노출 필터 공용 유틸.
 *
 * 나이 SoT 는 birthDate (age.util.ts §) — ChildProfile.birthDate 우선, User.birthDate 폴백.
 * Class.targetBirthYears(Int[]) 와 비교하기 위해 birthDate 에서 출생연도(getFullYear)만 추출한다.
 *
 * 사용처: classes(getAllClasses) · academy(getAcademyClasses) · search(searchClasses) 공통.
 */

export interface ViewerLike {
  id: string;
  userType?: string | null;
}

/**
 * 뷰어(PARENT=자녀 합집합 / CHILD·TEEN=본인)의 출생연도 집합을 반환한다.
 *  - PARENT/CHILD/TEEN 이 아니면 빈 배열(연령 필터 미적용 의미).
 *  - 생년 정보가 전혀 없어도 빈 배열 → 호출부에서 전체 노출 폴백.
 */
export async function resolveViewerBirthYears(
  prisma: PrismaService,
  user: ViewerLike | null | undefined,
): Promise<number[]> {
  if (!user) return [];

  let userIds: string[] = [];
  if (user.userType === "PARENT") {
    const pcs = await prisma.parentChild.findMany({
      where: { parentId: user.id },
      select: { childId: true },
    });
    userIds = pcs.map((p) => p.childId);
  } else if (user.userType === "CHILD" || user.userType === "TEEN") {
    userIds = [user.id];
  }
  if (userIds.length === 0) return [];

  const found = new Map<string, Date>();
  const profiles = await prisma.childProfile.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, birthDate: true },
  });
  profiles.forEach((p) => p.birthDate && found.set(p.userId, p.birthDate));

  const missing = userIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, birthDate: true },
    });
    users.forEach((u) => u.birthDate && found.set(u.id, u.birthDate));
  }

  const years = new Set<number>();
  found.forEach((d) => {
    const y = new Date(d).getFullYear();
    if (!Number.isNaN(y)) years.add(y);
  });
  return Array.from(years);
}

/**
 * 출생연도 집합 → Class 노출 필터 조건.
 *  - 빈 배열(전 연령 대상) 수업은 항상 노출 + 뷰어 출생연도가 포함된 수업.
 *  - birthYears 가 비면 null 반환 → 호출부에서 필터 미적용.
 */
export function buildBirthYearWhere(
  birthYears: number[],
): Prisma.ClassWhereInput | null {
  if (!birthYears || birthYears.length === 0) return null;
  return {
    OR: [
      { targetBirthYears: { isEmpty: true } },
      { targetBirthYears: { hasSome: birthYears } },
    ],
  };
}
