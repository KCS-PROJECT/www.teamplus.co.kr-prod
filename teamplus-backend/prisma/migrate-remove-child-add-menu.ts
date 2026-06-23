/**
 * 일회성 멱등 마이그레이션:
 *   PARENT 역할의 "자녀 관리" 그룹에서 "자녀 등록" 서브메뉴를 제거하고,
 *   "자녀 관리" 단일 서브메뉴만 유지하도록 운영 DB를 정리한다.
 *
 * 배경:
 *   기존 seed.ts 는 PARENT "자녀 관리" 그룹에 다음 6개 서브메뉴를 등록했다.
 *     1. 자녀 관리     /children
 *     2. 자녀 등록     /children/add
 *     3. 성장 기록     /progress
 *     4. 기술 평가     /skill-report
 *     5. 기술 평가 상세 /report
 *     6. 수상 내역     /awards
 *
 *   2026-04-11: 사용자 요청에 따라 "자녀 관리" 단일 엔트리만 유지하기로 한다.
 *   (자녀 등록은 /children 페이지 내부의 FAB/액션 버튼으로만 접근)
 *
 * 실행:
 *   cd teamplus-backend && npx tsx prisma/migrate-remove-child-add-menu.ts
 *
 * 안전성 (멱등):
 *   - 이미 정리된 DB 에서 재실행해도 에러 없이 종료 (no-op)
 *   - 트랜잭션으로 묶여 실패 시 전체 롤백
 *   - PARENT 이외 userType 의 메뉴는 절대 변경하지 않음
 *   - "자녀 관리" 단일 엔트리가 없으면 생성하여 자기 회복 가능
 */

import { PrismaClient, UserType, type AppMenu } from "@prisma/client";

const prisma = new PrismaClient();

/** 유지할 유일한 서브메뉴 */
const KEEP_SUB = {
  label: "자녀 관리",
  icon: "face",
  href: "/children",
  order: 1,
} as const;

async function main() {
  console.log("🏒 PARENT 자녀 관리 메뉴 정리 마이그레이션 시작...\n");

  await prisma.$transaction(async (tx) => {
    // ───────────────────────────────────────────────
    // 1. PARENT "자녀 관리" 부모 그룹 조회
    // ───────────────────────────────────────────────
    const parentGroup = await tx.appMenu.findFirst({
      where: {
        userType: UserType.PARENT,
        label: "자녀 관리",
        parentId: null,
      },
    });

    if (!parentGroup) {
      console.log(
        "⚠️  PARENT '자녀 관리' 부모 그룹을 찾을 수 없습니다 — seed.ts 실행이 필요합니다.",
      );
      return;
    }

    console.log(`ℹ️  PARENT '자녀 관리' 그룹 발견: id=${parentGroup.id}`);

    // ───────────────────────────────────────────────
    // 2. 현재 서브메뉴 스냅샷
    // ───────────────────────────────────────────────
    const existingSubs = await tx.appMenu.findMany({
      where: {
        userType: UserType.PARENT,
        parentId: parentGroup.id,
      },
      orderBy: { order: "asc" },
    });

    console.log(`ℹ️  현재 서브메뉴 ${existingSubs.length}개:`);
    for (const sub of existingSubs) {
      console.log(`   - [${sub.order}] ${sub.label} (${sub.href})`);
    }

    // ───────────────────────────────────────────────
    // 3. 유지할 서브메뉴(href=/children, label=자녀 관리) 찾기 or 생성
    //
    // `keepTarget` 은 이 블록에서 반드시 하나의 AppMenu 로 확정되므로,
    // 아래 삭제 루프에서 non-null assertion 없이 직접 참조한다.
    // ───────────────────────────────────────────────
    const exactMatch = existingSubs.find(
      (s) => s.href === KEEP_SUB.href && s.label === KEEP_SUB.label,
    );

    let keepTarget: AppMenu;

    if (exactMatch) {
      // 이미 올바른 엔트리가 있으면 order/icon만 보정
      if (
        exactMatch.order !== KEEP_SUB.order ||
        exactMatch.icon !== KEEP_SUB.icon ||
        !exactMatch.isActive
      ) {
        keepTarget = await tx.appMenu.update({
          where: { id: exactMatch.id },
          data: {
            order: KEEP_SUB.order,
            icon: KEEP_SUB.icon,
            isActive: true,
          },
        });
        console.log(
          `✅ '자녀 관리' 엔트리 메타데이터(icon/order/isActive) 정규화 완료.`,
        );
      } else {
        keepTarget = exactMatch;
        console.log(`ℹ️  '자녀 관리' 엔트리는 이미 정상입니다.`);
      }
    } else {
      // /children 을 href 로 가진 항목이 있지만 label 이 다른 경우 재사용
      const fallback = existingSubs.find((s) => s.href === KEEP_SUB.href);
      if (fallback) {
        keepTarget = await tx.appMenu.update({
          where: { id: fallback.id },
          data: {
            label: KEEP_SUB.label,
            icon: KEEP_SUB.icon,
            order: KEEP_SUB.order,
            isActive: true,
          },
        });
        console.log(
          `✅ '/children' 레코드를 '자녀 관리' 로 정규화하여 유지합니다.`,
        );
      } else {
        keepTarget = await tx.appMenu.create({
          data: {
            userType: UserType.PARENT,
            label: KEEP_SUB.label,
            icon: KEEP_SUB.icon,
            href: KEEP_SUB.href,
            order: KEEP_SUB.order,
            isActive: true,
            parentId: parentGroup.id,
          },
        });
        console.log(
          `✅ '자녀 관리' 단일 엔트리를 신규 생성했습니다 (자기회복).`,
        );
      }
    }

    // ───────────────────────────────────────────────
    // 4. 유지 대상 이외 모든 서브메뉴 삭제
    // ───────────────────────────────────────────────
    const keepTargetId = keepTarget.id;
    const toDelete = existingSubs.filter((s) => s.id !== keepTargetId);

    if (toDelete.length === 0) {
      console.log(`ℹ️  삭제할 서브메뉴 없음 — 이미 정리된 상태입니다.`);
    } else {
      const deleteResult = await tx.appMenu.deleteMany({
        where: { id: { in: toDelete.map((s) => s.id) } },
      });
      console.log(
        `🗑️  ${deleteResult.count}개 서브메뉴 삭제 완료: ${toDelete
          .map((s) => `'${s.label}'`)
          .join(", ")}`,
      );
    }

    // ───────────────────────────────────────────────
    // 5. 최종 상태 로그
    // ───────────────────────────────────────────────
    const finalSubs = await tx.appMenu.findMany({
      where: {
        userType: UserType.PARENT,
        parentId: parentGroup.id,
      },
      orderBy: { order: "asc" },
    });

    console.log(`\n📋 최종 상태 — 서브메뉴 ${finalSubs.length}개:`);
    for (const sub of finalSubs) {
      console.log(`   - [${sub.order}] ${sub.label} (${sub.href})`);
    }

    if (
      finalSubs.length !== 1 ||
      finalSubs[0].href !== KEEP_SUB.href ||
      finalSubs[0].label !== KEEP_SUB.label
    ) {
      throw new Error(
        `검증 실패 — 최종 상태가 기대와 다릅니다. 트랜잭션을 롤백합니다.`,
      );
    }
  });

  console.log("\n🏒 PARENT 자녀 관리 메뉴 정리 마이그레이션 완료.");
}

main()
  .catch((e) => {
    console.error("❌ 마이그레이션 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
