import { PrismaClient, UserType } from "@prisma/client";
import {
  APP_MENU_USER_TYPES,
  getAppMenuSpec,
  type AppMenuUserType,
} from "../../../shared/constants/app-menu-spec";

/**
 * AppMenu 시드 — `shared/constants/app-menu-spec.ts` 단일 진실의 원천 사용.
 *
 * 7개 UserType (ADMIN, DIRECTOR, ACADEMY_DIRECTOR, COACH, PARENT, TEEN, CHILD)
 * 모든 메뉴는 공통지원 그룹 포함 (도움말/FAQ/공지/피드백/약관).
 * 아이콘은 Lucide kebab-case (web Icon 컴포넌트가 Material Symbol 로 자동 매핑).
 */
export async function seedAppMenus(prisma: PrismaClient): Promise<void> {
  console.log("📱 AppMenu 시드 시작 (spec 기반, 7개 역할)...");

  await prisma.appMenu.deleteMany({});

  let totalGroups = 0;
  let totalItems = 0;

  for (const userType of APP_MENU_USER_TYPES) {
    const groups = getAppMenuSpec(userType as AppMenuUserType);
    for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
      const group = groups[groupIdx];
      const parent = await prisma.appMenu.create({
        data: {
          userType: userType as UserType,
          label: group.label,
          icon: group.icon,
          href: "#",
          order: groupIdx + 1,
          isActive: true,
        },
      });
      totalGroups += 1;

      for (let childIdx = 0; childIdx < group.children.length; childIdx++) {
        const child = group.children[childIdx];
        await prisma.appMenu.create({
          data: {
            userType: userType as UserType,
            label: child.label,
            icon: child.icon,
            href: child.href,
            order: childIdx + 1,
            isActive: true,
            parentId: parent.id,
          },
        });
        totalItems += 1;
      }
    }
  }

  console.log(
    `✅ AppMenu 시드 완료 (${APP_MENU_USER_TYPES.length}개 역할 / ${totalGroups}개 그룹 / ${totalItems}개 항목)`,
  );
}
