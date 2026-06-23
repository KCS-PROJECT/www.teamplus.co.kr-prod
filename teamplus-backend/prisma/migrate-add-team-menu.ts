/**
 * 일회성 마이그레이션: 팀 관리 메뉴 항목을 기존 DB에 안전하게 추가.
 *
 * 목적:
 *   TEAMPLUS 팀 관리 기능(/team) 출시에 맞춰, 이미 운영 중인 DB의 app_menus 테이블에
 *   seed.ts 전체 재실행 없이 "팀 관리" 서브메뉴만 추가한다.
 *
 * 대상 역할:
 *   - ADMIN:   "회원 관리" 그룹 상단에 추가
 *   - COACH:   "회원 관리" 그룹 상단에 추가
 *   - DIRECTOR: 기존 "팀 관리" 서브메뉴 아이콘만 groups → sports_hockey 로 업데이트
 *
 * 실행:
 *   cd teamplus-backend && npx tsx prisma/migrate-add-team-menu.ts
 *
 * 안전성:
 *   - 이미 존재하는 "팀 관리" 항목은 중복 추가하지 않는다 (upsert 패턴)
 *   - 기존 메뉴/부모 그룹 정보는 변경하지 않는다
 *   - 실패 시 트랜잭션 롤백
 */

import { PrismaClient, UserType } from "@prisma/client";

const prisma = new PrismaClient();

const TARGETS: Array<{
  userType: UserType;
  parentLabel: string;
  description: string;
}> = [
  {
    userType: UserType.ADMIN,
    parentLabel: "회원 관리",
    description: "ADMIN 회원 관리 그룹",
  },
  {
    userType: UserType.COACH,
    parentLabel: "회원 관리",
    description: "COACH 회원 관리 그룹",
  },
];

async function main() {
  console.log("🏒 팀 관리 메뉴 마이그레이션 시작...\n");

  await prisma.$transaction(async (tx) => {
    // ───────────────────────────────────────────────
    // 1. DIRECTOR: 기존 "팀 관리" 항목 아이콘 업데이트
    // ───────────────────────────────────────────────
    const directorTeamMenu = await tx.appMenu.findFirst({
      where: {
        userType: UserType.DIRECTOR,
        label: "팀 관리",
        href: "/team",
        parentId: { not: null },
      },
    });

    if (directorTeamMenu) {
      if (directorTeamMenu.icon !== "sports_hockey") {
        await tx.appMenu.update({
          where: { id: directorTeamMenu.id },
          data: { icon: "sports_hockey" },
        });
        console.log(
          `✅ DIRECTOR "팀 관리" 아이콘 업데이트: groups → sports_hockey`,
        );
      } else {
        console.log(`ℹ️  DIRECTOR "팀 관리" 아이콘 이미 최신 (sports_hockey)`);
      }
    } else {
      console.log(
        `⚠️  DIRECTOR "팀 관리" 서브메뉴를 찾을 수 없음 — seed.ts 재실행 권장`,
      );
    }

    // ───────────────────────────────────────────────
    // 2. ADMIN / COACH: "회원 관리" 그룹 상단에 "팀 관리" 추가
    // ───────────────────────────────────────────────
    for (const target of TARGETS) {
      // 부모 그룹(회원 관리) 찾기
      const parent = await tx.appMenu.findFirst({
        where: {
          userType: target.userType,
          label: target.parentLabel,
          parentId: null,
        },
      });

      if (!parent) {
        console.log(`⚠️  ${target.description}을 찾을 수 없음 — 건너뜁니다`);
        continue;
      }

      // 이미 "팀 관리" 서브메뉴가 있는지 확인 (중복 방지)
      const existing = await tx.appMenu.findFirst({
        where: {
          userType: target.userType,
          label: "팀 관리",
          href: "/team",
          parentId: parent.id,
        },
      });

      if (existing) {
        // 아이콘만 업데이트
        if (existing.icon !== "sports_hockey") {
          await tx.appMenu.update({
            where: { id: existing.id },
            data: { icon: "sports_hockey" },
          });
          console.log(
            `✅ ${target.userType} "팀 관리" 이미 존재 → 아이콘만 업데이트`,
          );
        } else {
          console.log(`ℹ️  ${target.userType} "팀 관리" 이미 최신 상태`);
        }
        continue;
      }

      // 기존 서브메뉴들의 order 뒤로 밀기 (신규를 order:1로)
      const siblings = await tx.appMenu.findMany({
        where: {
          userType: target.userType,
          parentId: parent.id,
        },
        orderBy: { order: "asc" },
      });

      for (const sibling of siblings) {
        await tx.appMenu.update({
          where: { id: sibling.id },
          data: { order: sibling.order + 1 },
        });
      }

      // 신규 "팀 관리" 추가 (맨 앞)
      await tx.appMenu.create({
        data: {
          userType: target.userType,
          label: "팀 관리",
          icon: "sports_hockey",
          href: "/team",
          parentId: parent.id,
          order: 1,
          isActive: true,
        },
      });

      console.log(
        `✅ ${target.userType} "${target.parentLabel}" 그룹에 "팀 관리" 추가 완료`,
      );
    }
  });

  console.log("\n🏒 팀 관리 메뉴 마이그레이션 완료.");
}

main()
  .catch((e) => {
    console.error("❌ 마이그레이션 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
