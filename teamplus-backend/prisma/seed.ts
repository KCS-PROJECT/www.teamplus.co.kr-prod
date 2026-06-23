/**
 * Prisma Seed Script - TEAMPLUS 기본 데이터 생성
 *
 * 사용법: npm run db:seed
 *
 * 생성되는 데이터:
 * - 6가지 사용자 역할 (ADMIN, DIRECTOR, COACH, PARENT, TEEN, CHILD)
 * - 샘플 클럽 (TEAMPLUS Hockey Club)
 * - 각 역할별 프로필 정보
 *
 * 테스트 계정 (모든 비밀번호: Test1234!)
 * - system@teamplus.com (SYSTEM · ADM 화면 로그인)
 * - oper@teamplus.com (OPER · ADM 화면 로그인)
 * - admin@teamplus.com (ADMIN · APP 화면 로그인 · 레거시 테스트 계정)
 * - director@teamplus.com (감독)
 * - academy@teamplus.com (아카데미원장 ACADEMY_DIRECTOR · 2026-04-22 추가)
 * - coach@teamplus.com (코치)
 * - parent@teamplus.com (학부모)
 * - teen@teamplus.com (10세 이상 학생)
 * - child@teamplus.com (10세 미만 학생)
 */

import { PrismaClient, UserType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { seedAppMenus } from "./seeds/app-menus";

// 한국나이 inline 헬퍼 (src/common/utils/age.util.ts:calculateKoreanAge 와 동일)
// 한국나이 = 현재 연도 - 출생 연도 + 1 (생일 무관)
const krAge = (birth: Date): number =>
  new Date().getFullYear() - birth.getFullYear() + 1;

const prisma = new PrismaClient();

// 비밀번호 해시 생성 (10 salt rounds - auth.service.ts와 동일)
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

// 테스트용 기본 비밀번호
const DEFAULT_PASSWORD = "Test1234!";

async function main() {
  // ────────────────────────────────────────────────────────────────────
  // [DISABLED] 사용자 요청으로 메인 시드 영구 비활성화 (2026-04-29)
  // 기존 main() 은 director/coach/parent/teen/child/academy + TEAMPLUS Hockey
  // Club 등 옛 fixture 를 매 실행마다 부활시켰음. 운영 데이터와 충돌하므로 차단.
  // 신규 시드는 prisma/seeds/run-team-data.ts (운영 시드) +
  // prisma/seeds/run-app-menus.ts (메뉴 시드) 만 사용.
  // npm run db:seed 호출되어도 NO-OP 으로 종료됨.
  // ────────────────────────────────────────────────────────────────────
  console.log("⛔ 메인 시드(prisma/seed.ts) 는 비활성화 상태입니다.");
  console.log("   운영 시드: npx tsx prisma/seeds/run-team-data.ts");
  console.log("   메뉴 시드: npx tsx prisma/seeds/run-app-menus.ts");
  return;

  /* eslint-disable @typescript-eslint/no-unreachable */
  console.log("🌱 TEAMPLUS 시드 데이터 생성 시작...\n");

  // 비밀번호 해시 생성
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  console.log("🔐 비밀번호 해시 생성 완료");

  // 사용자 upsert 헬퍼 함수
  // userType 이 변경된 경우에도 자동 마이그레이션 (예: SYSTEM/OPER enum 도입)
  const upsertUser = async (email: string, data: any, label: string) => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const updates: Record<string, unknown> = {};
      if (
        data.firstName !== undefined &&
        (existing.firstName !== data.firstName ||
          existing.lastName !== (data.lastName ?? ""))
      ) {
        updates.firstName = data.firstName;
        updates.lastName = data.lastName ?? "";
      }
      if (data.userType && existing.userType !== data.userType) {
        updates.userType = data.userType;
      }
      if (Object.keys(updates).length > 0) {
        const updated = await prisma.user.update({
          where: { email },
          data: updates,
        });
        console.log(
          `🔄 ${label} 계정 업데이트: ${email} → ${updates.userType ?? existing.userType}${updates.lastName !== undefined ? ` / ${updates.lastName}${updates.firstName}` : ""}`,
        );
        return updated;
      }
      console.log(`⏭️ ${label} 계정 이미 존재: ${email}`);
      return existing;
    }
    const user = await prisma.user.create({ data: { email, ...data } });
    console.log(`✅ ${label} 계정 생성: ${email}`);
    return user;
  };

  // ========================================
  // 1. 운영자 (OPER) — 어드민 화면(ADM) 로그인 전용
  // ========================================
  await upsertUser(
    "oper@teamplus.com",
    {
      phone: "010-0000-0001",
      firstName: "업무관리자",
      lastName: "",
      passwordHash,
      userType: UserType.OPER,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "운영자",
  );

  // ========================================
  // 1-2. 시스템관리자 (SYSTEM) — 어드민 화면(ADM) 로그인 전용
  // ========================================
  await upsertUser(
    "system@teamplus.com",
    {
      phone: "010-0000-0000",
      firstName: "시스템관리자",
      lastName: "",
      passwordHash,
      userType: UserType.SYSTEM,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "시스템관리자",
  );

  // ========================================
  // 1-3. 레거시 ADMIN — APP 화면(APP) 로그인 호환 (tbot 테스트 하네스용)
  // ========================================
  await upsertUser(
    "admin@teamplus.com",
    {
      phone: "010-0000-0099",
      firstName: "관리자",
      lastName: "",
      passwordHash,
      userType: UserType.ADMIN,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "레거시관리자",
  );

  // ========================================
  // 2. 감독 (DIRECTOR) 생성 - 클럽 생성을 위해 먼저 생성
  // ========================================
  const directorUser = await upsertUser(
    "director@teamplus.com",
    {
      phone: "010-0000-0002",
      firstName: "감독",
      lastName: "김",
      passwordHash,
      userType: UserType.DIRECTOR,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "감독",
  );

  // ========================================
  // 2-1. 아카데미 감독 (ACADEMY_DIRECTOR) — 2026-04-22 추가
  // CLAUDE.md 테스트 계정 완전성 · tbot 자동 테스트 커버리지용.
  // (coach) 라우트 그룹을 COACH 와 공용. DASHBOARD_PATHS.academy_director = '/coach'.
  // ========================================
  const academyDirectorUser = await upsertUser(
    "academy@teamplus.com",
    {
      phone: "010-0000-0022",
      firstName: "원장",
      lastName: "박",
      passwordHash,
      userType: UserType.ACADEMY_DIRECTOR,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "아카데미원장",
  );

  // ========================================
  // 2-2. 샘플 아카데미 생성 (DIRECTOR→Club 패턴과 대칭)
  //      auth.service.ts:262-277 회원가입 트랜잭션과 동일 구조.
  //      가입 시 자동 코드는 ACAD-XXXXXX, 시드 전용 고정 코드는 ACAD-SAMPLE.
  // ========================================
  let sampleAcademy = await prisma.academy.findUnique({
    where: { code: "ACAD-SAMPLE" },
  });
  if (!sampleAcademy) {
    sampleAcademy = await prisma.academy.create({
      data: {
        directorId: academyDirectorUser.id,
        name: "TEAMPLUS 오픈 아카데미",
        code: "ACAD-SAMPLE",
        region: "서울",
        description: "샘플 오픈클래스 학원입니다.",
        contactPhone: "02-1234-5678",
        contactEmail: "academy@teamplus.com",
        isActive: true,
      },
    });
    console.log("🎓 샘플 아카데미 생성:", sampleAcademy.name);
  } else {
    console.log("⏭️ 샘플 아카데미 이미 존재:", sampleAcademy.name);
  }

  // 본인을 HEAD_COACH 로 AcademyCoach 등록
  // (Club 의 ClubMember(HEAD_COACH, approved) 와 대칭 구조)
  const existingAcademyHead = await prisma.academyCoach.findUnique({
    where: {
      academyId_userId: {
        academyId: sampleAcademy.id,
        userId: academyDirectorUser.id,
      },
    },
  });
  if (!existingAcademyHead) {
    await prisma.academyCoach.create({
      data: {
        academyId: sampleAcademy.id,
        userId: academyDirectorUser.id,
        role: "HEAD_COACH",
        isActive: true,
      },
    });
  }

  // ========================================
  // 3. 샘플 팀 생성 (감독을 코치로 설정)
  // 2026-05-12: Phase 4 rename(Club → Team) 반영 — teamCode/name/teamId 필드 사용.
  // ========================================
  let sampleTeam = await prisma.team.findUnique({
    where: { teamCode: "ICE-HOCKEY-001" },
  });
  if (!sampleTeam) {
    sampleTeam = await prisma.team.create({
      data: {
        teamCode: "ICE-HOCKEY-001",
        name: "TEAMPLUS Hockey Club",
        coachId: directorUser.id,
        location: "서울시 강남구 테헤란로 123",
        phone: "02-1234-5678",
      },
    });
    console.log("🏒 샘플 팀 생성:", sampleTeam.name);
  } else {
    console.log("⏭️ 샘플 팀 이미 존재:", sampleTeam.name);
  }

  // 감독 프로필 (CoachProfile 사용)
  const existingDirectorProfile = await prisma.coachProfile.findUnique({
    where: { userId: directorUser.id },
  });
  if (!existingDirectorProfile) {
    await prisma.coachProfile.create({
      data: {
        userId: directorUser.id,
        teamId: sampleTeam.id,
      },
    });
  }

  // ========================================
  // 4. 코치 (COACH) 생성
  // ========================================
  const coachUser = await upsertUser(
    "coach@teamplus.com",
    {
      phone: "010-0000-0003",
      firstName: "코치",
      lastName: "이",
      passwordHash,
      userType: UserType.COACH,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "코치",
  );

  // 코치 프로필
  const existingCoachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coachUser.id },
  });
  if (!existingCoachProfile) {
    await prisma.coachProfile.create({
      data: {
        userId: coachUser.id,
        teamId: sampleTeam.id,
      },
    });
  }

  // ========================================
  // 5. 학부모 (PARENT) 생성
  // ========================================
  const parentUser = await upsertUser(
    "parent@teamplus.com",
    {
      phone: "010-0000-0004",
      firstName: "부모",
      lastName: "박",
      passwordHash,
      userType: UserType.PARENT,
      isVerified: true,
      verifiedAt: new Date(),
    },
    "학부모",
  );

  // 학부모 프로필
  const existingParentProfile = await prisma.parentProfile.findUnique({
    where: { userId: parentUser.id },
  });
  if (!existingParentProfile) {
    await prisma.parentProfile.create({
      data: {
        userId: parentUser.id,
      },
    });
  }

  // ========================================
  // 6. 10세 이상 학생 (TEEN) 생성
  // ========================================
  const teenBirthDate = new Date();
  teenBirthDate.setFullYear(teenBirthDate.getFullYear() - 12); // 12세

  const teenUser = await upsertUser(
    "teen@teamplus.com",
    {
      phone: "010-0000-0005",
      firstName: "청소년",
      lastName: "최",
      passwordHash,
      userType: UserType.TEEN,
      isVerified: false, // 청소년은 본인인증 미완료 상태
      birthDate: teenBirthDate,
      koreanAge: krAge(teenBirthDate),
    },
    "한국나이 10세 이상 학생",
  );

  // 청소년 프로필

  const existingTeenProfile = await prisma.childProfile.findUnique({
    where: { userId: teenUser.id },
  });
  if (!existingTeenProfile) {
    await prisma.childProfile.create({
      data: {
        userId: teenUser.id,
        birthDate: teenBirthDate,
        currentLevel: 4,
        levelLabel: "상급",
        progressPercent: 40,
        nextTestDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastEvaluatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ========================================
  // 7. 10세 미만 학생 (CHILD) 생성
  // ========================================
  const childBirthDate = new Date();
  childBirthDate.setFullYear(childBirthDate.getFullYear() - 7); // 7세

  const childUser = await upsertUser(
    "child@teamplus.com",
    {
      phone: "010-0000-0006",
      firstName: "아동",
      lastName: "정",
      passwordHash,
      userType: UserType.CHILD,
      isVerified: false, // 아동은 본인인증 불필요
      birthDate: childBirthDate,
      koreanAge: krAge(childBirthDate),
    },
    "한국나이 10세 미만 학생",
  );

  // 아동 프로필

  const existingChildProfile = await prisma.childProfile.findUnique({
    where: { userId: childUser.id },
  });
  if (!existingChildProfile) {
    await prisma.childProfile.create({
      data: {
        userId: childUser.id,
        birthDate: childBirthDate,
        currentLevel: 2,
        levelLabel: "기초",
        progressPercent: 65,
        nextTestDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
        lastEvaluatedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // ========================================
  // 8. 학부모-자녀 관계 설정
  // ========================================
  const existingTeenRelation = await prisma.parentChild.findUnique({
    where: {
      parentId_childId: {
        parentId: parentUser.id,
        childId: teenUser.id,
      },
    },
  });
  if (!existingTeenRelation) {
    await prisma.parentChild.create({
      data: {
        parentId: parentUser.id,
        childId: teenUser.id,
        relationship: "parent",
        isPrimary: true,
      },
    });
  }

  const existingChildRelation = await prisma.parentChild.findUnique({
    where: {
      parentId_childId: {
        parentId: parentUser.id,
        childId: childUser.id,
      },
    },
  });
  if (!existingChildRelation) {
    await prisma.parentChild.create({
      data: {
        parentId: parentUser.id,
        childId: childUser.id,
        relationship: "parent",
        isPrimary: true,
      },
    });
  }
  console.log("👨‍👩‍👧‍👦 학부모-자녀 관계 설정 완료");

  // ========================================
  // 9. 팀 멤버십 설정
  // 2026-05-12: Phase 4 rename(ClubMember → TeamMember) 반영.
  // ========================================
  const now = new Date();
  const memberData = [
    {
      userId: directorUser.id,
      teamId: sampleTeam.id,
      playerName: "김감독",
      playerAge: 46, // 한국나이 (만 45 → 한국 46)
      playerLevel: "advanced",
      approvalStatus: "approved",
      roleInTeam: "HEAD_COACH",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: coachUser.id,
      teamId: sampleTeam.id,
      playerName: "이코치",
      playerAge: 36, // 한국나이 (만 35 → 한국 36)
      playerLevel: "advanced",
      approvalStatus: "approved",
      roleInTeam: "COACH",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: parentUser.id,
      teamId: sampleTeam.id,
      playerName: "박부모",
      playerAge: 0, // placeholder — 학부모는 선수 아님 (SPEC §2 #11)
      playerLevel: "beginner",
      approvalStatus: "approved",
      roleInTeam: "PARENT",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: teenUser.id,
      teamId: sampleTeam.id,
      playerName: "최청소년",
      playerAge: krAge(teenBirthDate), // 한국나이, teenBirthDate 기반 동기화
      playerLevel: "intermediate",
      approvalStatus: "approved",
      roleInTeam: "PLAYER",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      userId: childUser.id,
      teamId: sampleTeam.id,
      playerName: "정아동",
      playerAge: krAge(childBirthDate), // 한국나이, childBirthDate 기반 동기화
      playerLevel: "beginner",
      approvalStatus: "approved",
      roleInTeam: "PLAYER",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const member of memberData) {
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: member.userId,
          teamId: member.teamId,
        },
      },
    });
    if (!existingMember) {
      // Prisma client 사용 — id(cuid), createdAt(@default(now())), updatedAt(@updatedAt) 자동 처리
      await prisma.teamMember.create({
        data: {
          userId: member.userId,
          teamId: member.teamId,
          playerName: member.playerName,
          playerAge: member.playerAge,
          playerLevel: member.playerLevel,
          approvalStatus: member.approvalStatus,
          roleInTeam: member.roleInTeam,
          joinedAt: member.joinedAt,
        },
      });
    }
  }
  console.log("🎫 팀 멤버십 설정 완료");

  // ========================================
  // 10. 쇼핑몰 카테고리 설정 (4단계 계층 구조: 대/중/소/세부)
  // ========================================
  console.log("🛒 쇼핑몰 카테고리 생성 중 (114개 카테고리)...");

  // 기존 카테고리 전체 삭제 후 새 코드체계로 교체.
  // 단, ShopOrderItem(주문 이력)이 존재하면 ShopProduct cascade 삭제가 막혀 P2003 발생.
  // → 주문 이력이 없을 때만 deleteMany, 있으면 upsert 모드로 전환.
  const orderItemCount = await prisma.shopOrderItem.count();
  if (orderItemCount === 0) {
    await prisma.shopCategory.deleteMany({});
  } else {
    console.log(
      `⚠️ 주문 이력 ${orderItemCount}건 존재 → deleteMany 스킵, upsert 모드로 동기화`,
    );
  }

  const categories: {
    name: string;
    code: string;
    level: number;
    path: string;
    displayOrder: number;
    parentCode?: string;
    description?: string;
    isActive?: boolean;
  }[] = [
    // ══════════════════════════════════════════
    // Level 1 — 대분류 (6개)
    // ══════════════════════════════════════════
    {
      name: "장비",
      code: "CAT-EQP",
      level: 1,
      path: "장비",
      displayOrder: 1,
      description: "스케이트, 스틱, 헬멧, 보호장비 등",
    },
    {
      name: "의류",
      code: "CAT-APR",
      level: 1,
      path: "의류",
      displayOrder: 2,
      description: "유니폼, 연습복, 이너웨어 등",
    },
    {
      name: "악세서리",
      code: "CAT-ACC",
      level: 1,
      path: "악세서리",
      displayOrder: 3,
      description: "테이프, 왁스, 소품 등",
    },
    {
      name: "골키퍼",
      code: "CAT-GKP",
      level: 1,
      path: "골키퍼",
      displayOrder: 4,
      description: "골키퍼 전용 장비",
    },
    {
      name: "훈련용품",
      code: "CAT-TRN",
      level: 1,
      path: "훈련용품",
      displayOrder: 5,
      description: "훈련 보조 기구",
    },
    {
      name: "기타",
      code: "CAT-ETC",
      level: 1,
      path: "기타",
      displayOrder: 6,
      description: "선물, 서적 등",
    },

    // ══════════════════════════════════════════
    // Level 2 — 중분류 (31개)
    // ══════════════════════════════════════════

    // ── 장비 (CAT-EQP) — 7개
    {
      name: "스케이트",
      code: "CAT-EQP-SKT",
      level: 2,
      path: "장비 > 스케이트",
      displayOrder: 1,
      parentCode: "CAT-EQP",
    },
    {
      name: "스틱",
      code: "CAT-EQP-STK",
      level: 2,
      path: "장비 > 스틱",
      displayOrder: 2,
      parentCode: "CAT-EQP",
    },
    {
      name: "헬멧",
      code: "CAT-EQP-HLM",
      level: 2,
      path: "장비 > 헬멧",
      displayOrder: 3,
      parentCode: "CAT-EQP",
    },
    {
      name: "글러브",
      code: "CAT-EQP-GLV",
      level: 2,
      path: "장비 > 글러브",
      displayOrder: 4,
      parentCode: "CAT-EQP",
    },
    {
      name: "보호대",
      code: "CAT-EQP-PAD",
      level: 2,
      path: "장비 > 보호대",
      displayOrder: 5,
      parentCode: "CAT-EQP",
    },
    {
      name: "하키 바지",
      code: "CAT-EQP-PNT",
      level: 2,
      path: "장비 > 하키 바지",
      displayOrder: 6,
      parentCode: "CAT-EQP",
    },
    {
      name: "장비 가방",
      code: "CAT-EQP-BAG",
      level: 2,
      path: "장비 > 장비 가방",
      displayOrder: 7,
      parentCode: "CAT-EQP",
    },

    // ── 의류 (CAT-APR) — 5개
    {
      name: "저지/유니폼",
      code: "CAT-APR-JRS",
      level: 2,
      path: "의류 > 저지/유니폼",
      displayOrder: 1,
      parentCode: "CAT-APR",
    },
    {
      name: "연습복",
      code: "CAT-APR-PRC",
      level: 2,
      path: "의류 > 연습복",
      displayOrder: 2,
      parentCode: "CAT-APR",
    },
    {
      name: "이너웨어",
      code: "CAT-APR-UND",
      level: 2,
      path: "의류 > 이너웨어",
      displayOrder: 3,
      parentCode: "CAT-APR",
    },
    {
      name: "양말",
      code: "CAT-APR-SCK",
      level: 2,
      path: "의류 > 양말",
      displayOrder: 4,
      parentCode: "CAT-APR",
    },
    {
      name: "아우터",
      code: "CAT-APR-OTR",
      level: 2,
      path: "의류 > 아우터",
      displayOrder: 5,
      parentCode: "CAT-APR",
    },

    // ── 악세서리 (CAT-ACC) — 5개
    {
      name: "테이프",
      code: "CAT-ACC-TPE",
      level: 2,
      path: "악세서리 > 테이프",
      displayOrder: 1,
      parentCode: "CAT-ACC",
    },
    {
      name: "왁스",
      code: "CAT-ACC-WAX",
      level: 2,
      path: "악세서리 > 왁스",
      displayOrder: 2,
      parentCode: "CAT-ACC",
    },
    {
      name: "스케이트 날/끈",
      code: "CAT-ACC-LCE",
      level: 2,
      path: "악세서리 > 스케이트 날/끈",
      displayOrder: 3,
      parentCode: "CAT-ACC",
    },
    {
      name: "물병",
      code: "CAT-ACC-BTL",
      level: 2,
      path: "악세서리 > 물병",
      displayOrder: 4,
      parentCode: "CAT-ACC",
    },
    {
      name: "기타 소품",
      code: "CAT-ACC-ETC",
      level: 2,
      path: "악세서리 > 기타 소품",
      displayOrder: 5,
      parentCode: "CAT-ACC",
    },

    // ── 골키퍼 (CAT-GKP) — 6개
    {
      name: "골키퍼 마스크",
      code: "CAT-GKP-MSK",
      level: 2,
      path: "골키퍼 > 골키퍼 마스크",
      displayOrder: 1,
      parentCode: "CAT-GKP",
    },
    {
      name: "레그패드",
      code: "CAT-GKP-PAD",
      level: 2,
      path: "골키퍼 > 레그패드",
      displayOrder: 2,
      parentCode: "CAT-GKP",
    },
    {
      name: "글러브/블로커",
      code: "CAT-GKP-GLV",
      level: 2,
      path: "골키퍼 > 글러브/블로커",
      displayOrder: 3,
      parentCode: "CAT-GKP",
    },
    {
      name: "체스트 프로텍터",
      code: "CAT-GKP-CHP",
      level: 2,
      path: "골키퍼 > 체스트 프로텍터",
      displayOrder: 4,
      parentCode: "CAT-GKP",
    },
    {
      name: "골키퍼 스틱",
      code: "CAT-GKP-STK",
      level: 2,
      path: "골키퍼 > 골키퍼 스틱",
      displayOrder: 5,
      parentCode: "CAT-GKP",
    },
    {
      name: "골키퍼 바지",
      code: "CAT-GKP-PNT",
      level: 2,
      path: "골키퍼 > 골키퍼 바지",
      displayOrder: 6,
      parentCode: "CAT-GKP",
    },

    // ── 훈련용품 (CAT-TRN) — 5개
    {
      name: "퍽",
      code: "CAT-TRN-PUK",
      level: 2,
      path: "훈련용품 > 퍽",
      displayOrder: 1,
      parentCode: "CAT-TRN",
    },
    {
      name: "콘/마커",
      code: "CAT-TRN-CON",
      level: 2,
      path: "훈련용품 > 콘/마커",
      displayOrder: 2,
      parentCode: "CAT-TRN",
    },
    {
      name: "미니골대/리바운더",
      code: "CAT-TRN-NET",
      level: 2,
      path: "훈련용품 > 미니골대/리바운더",
      displayOrder: 3,
      parentCode: "CAT-TRN",
    },
    {
      name: "슈팅패드",
      code: "CAT-TRN-SHT",
      level: 2,
      path: "훈련용품 > 슈팅패드",
      displayOrder: 4,
      parentCode: "CAT-TRN",
    },
    {
      name: "훈련 보조기구",
      code: "CAT-TRN-AID",
      level: 2,
      path: "훈련용품 > 훈련 보조기구",
      displayOrder: 5,
      parentCode: "CAT-TRN",
    },

    // ── 기타 (CAT-ETC) — 3개
    {
      name: "선물/기념품",
      code: "CAT-ETC-GFT",
      level: 2,
      path: "기타 > 선물/기념품",
      displayOrder: 1,
      parentCode: "CAT-ETC",
    },
    {
      name: "서적/DVD",
      code: "CAT-ETC-BKS",
      level: 2,
      path: "기타 > 서적/DVD",
      displayOrder: 2,
      parentCode: "CAT-ETC",
    },
    {
      name: "차량용품",
      code: "CAT-ETC-CAR",
      level: 2,
      path: "기타 > 차량용품",
      displayOrder: 3,
      parentCode: "CAT-ETC",
    },

    // ══════════════════════════════════════════
    // Level 3 — 소분류 (55개)
    // ══════════════════════════════════════════

    // ── 스케이트 (CAT-EQP-SKT) — 3개
    {
      name: "시니어",
      code: "CAT-EQP-SKT-SNR",
      level: 3,
      path: "장비 > 스케이트 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-EQP-SKT",
    },
    {
      name: "주니어",
      code: "CAT-EQP-SKT-JNR",
      level: 3,
      path: "장비 > 스케이트 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-EQP-SKT",
    },
    {
      name: "유소년",
      code: "CAT-EQP-SKT-YTH",
      level: 3,
      path: "장비 > 스케이트 > 유소년",
      displayOrder: 3,
      parentCode: "CAT-EQP-SKT",
    },

    // ── 스틱 (CAT-EQP-STK) — 4개
    {
      name: "시니어",
      code: "CAT-EQP-STK-SNR",
      level: 3,
      path: "장비 > 스틱 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-EQP-STK",
    },
    {
      name: "인터미디엇",
      code: "CAT-EQP-STK-INT",
      level: 3,
      path: "장비 > 스틱 > 인터미디엇",
      displayOrder: 2,
      parentCode: "CAT-EQP-STK",
    },
    {
      name: "주니어",
      code: "CAT-EQP-STK-JNR",
      level: 3,
      path: "장비 > 스틱 > 주니어",
      displayOrder: 3,
      parentCode: "CAT-EQP-STK",
    },
    {
      name: "유소년",
      code: "CAT-EQP-STK-YTH",
      level: 3,
      path: "장비 > 스틱 > 유소년",
      displayOrder: 4,
      parentCode: "CAT-EQP-STK",
    },

    // ── 헬멧 (CAT-EQP-HLM) — 3개
    {
      name: "풀 페이스",
      code: "CAT-EQP-HLM-FUL",
      level: 3,
      path: "장비 > 헬멧 > 풀 페이스",
      displayOrder: 1,
      parentCode: "CAT-EQP-HLM",
    },
    {
      name: "하프 바이저",
      code: "CAT-EQP-HLM-HLF",
      level: 3,
      path: "장비 > 헬멧 > 하프 바이저",
      displayOrder: 2,
      parentCode: "CAT-EQP-HLM",
    },
    {
      name: "케이지",
      code: "CAT-EQP-HLM-CGE",
      level: 3,
      path: "장비 > 헬멧 > 케이지",
      displayOrder: 3,
      parentCode: "CAT-EQP-HLM",
    },

    // ── 글러브 (CAT-EQP-GLV) — 3개
    {
      name: "시니어",
      code: "CAT-EQP-GLV-SNR",
      level: 3,
      path: "장비 > 글러브 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-EQP-GLV",
    },
    {
      name: "주니어",
      code: "CAT-EQP-GLV-JNR",
      level: 3,
      path: "장비 > 글러브 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-EQP-GLV",
    },
    {
      name: "유소년",
      code: "CAT-EQP-GLV-YTH",
      level: 3,
      path: "장비 > 글러브 > 유소년",
      displayOrder: 3,
      parentCode: "CAT-EQP-GLV",
    },

    // ── 보호대 (CAT-EQP-PAD) — 6개
    {
      name: "숄더패드",
      code: "CAT-EQP-PAD-SHD",
      level: 3,
      path: "장비 > 보호대 > 숄더패드",
      displayOrder: 1,
      parentCode: "CAT-EQP-PAD",
    },
    {
      name: "엘보패드",
      code: "CAT-EQP-PAD-ELB",
      level: 3,
      path: "장비 > 보호대 > 엘보패드",
      displayOrder: 2,
      parentCode: "CAT-EQP-PAD",
    },
    {
      name: "신가드",
      code: "CAT-EQP-PAD-SHN",
      level: 3,
      path: "장비 > 보호대 > 신가드",
      displayOrder: 3,
      parentCode: "CAT-EQP-PAD",
    },
    {
      name: "넥가드",
      code: "CAT-EQP-PAD-NEC",
      level: 3,
      path: "장비 > 보호대 > 넥가드",
      displayOrder: 4,
      parentCode: "CAT-EQP-PAD",
    },
    {
      name: "보호컵",
      code: "CAT-EQP-PAD-JOK",
      level: 3,
      path: "장비 > 보호대 > 보호컵",
      displayOrder: 5,
      parentCode: "CAT-EQP-PAD",
    },
    {
      name: "마우스가드",
      code: "CAT-EQP-PAD-MTH",
      level: 3,
      path: "장비 > 보호대 > 마우스가드",
      displayOrder: 6,
      parentCode: "CAT-EQP-PAD",
    },

    // ── 하키 바지 (CAT-EQP-PNT) — 3개
    {
      name: "시니어",
      code: "CAT-EQP-PNT-SNR",
      level: 3,
      path: "장비 > 하키 바지 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-EQP-PNT",
    },
    {
      name: "주니어",
      code: "CAT-EQP-PNT-JNR",
      level: 3,
      path: "장비 > 하키 바지 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-EQP-PNT",
    },
    {
      name: "거들",
      code: "CAT-EQP-PNT-GRD",
      level: 3,
      path: "장비 > 하키 바지 > 거들",
      displayOrder: 3,
      parentCode: "CAT-EQP-PNT",
    },

    // ── 장비 가방 (CAT-EQP-BAG) — 3개
    {
      name: "휠백",
      code: "CAT-EQP-BAG-WHL",
      level: 3,
      path: "장비 > 장비 가방 > 휠백",
      displayOrder: 1,
      parentCode: "CAT-EQP-BAG",
    },
    {
      name: "캐리백",
      code: "CAT-EQP-BAG-CRY",
      level: 3,
      path: "장비 > 장비 가방 > 캐리백",
      displayOrder: 2,
      parentCode: "CAT-EQP-BAG",
    },
    {
      name: "스틱백",
      code: "CAT-EQP-BAG-STK",
      level: 3,
      path: "장비 > 장비 가방 > 스틱백",
      displayOrder: 3,
      parentCode: "CAT-EQP-BAG",
    },

    // ── 저지/유니폼 (CAT-APR-JRS) — 2개
    {
      name: "경기용",
      code: "CAT-APR-JRS-GME",
      level: 3,
      path: "의류 > 저지/유니폼 > 경기용",
      displayOrder: 1,
      parentCode: "CAT-APR-JRS",
    },
    {
      name: "연습용",
      code: "CAT-APR-JRS-PRC",
      level: 3,
      path: "의류 > 저지/유니폼 > 연습용",
      displayOrder: 2,
      parentCode: "CAT-APR-JRS",
    },

    // ── 연습복 (CAT-APR-PRC) — 2개
    {
      name: "상의",
      code: "CAT-APR-PRC-TOP",
      level: 3,
      path: "의류 > 연습복 > 상의",
      displayOrder: 1,
      parentCode: "CAT-APR-PRC",
    },
    {
      name: "하의",
      code: "CAT-APR-PRC-BTM",
      level: 3,
      path: "의류 > 연습복 > 하의",
      displayOrder: 2,
      parentCode: "CAT-APR-PRC",
    },

    // ── 이너웨어 (CAT-APR-UND) — 2개
    {
      name: "상의",
      code: "CAT-APR-UND-TOP",
      level: 3,
      path: "의류 > 이너웨어 > 상의",
      displayOrder: 1,
      parentCode: "CAT-APR-UND",
    },
    {
      name: "하의",
      code: "CAT-APR-UND-BTM",
      level: 3,
      path: "의류 > 이너웨어 > 하의",
      displayOrder: 2,
      parentCode: "CAT-APR-UND",
    },

    // ── 양말 (CAT-APR-SCK) — 2개
    {
      name: "하키양말",
      code: "CAT-APR-SCK-HKY",
      level: 3,
      path: "의류 > 양말 > 하키양말",
      displayOrder: 1,
      parentCode: "CAT-APR-SCK",
    },
    {
      name: "일반양말",
      code: "CAT-APR-SCK-GNR",
      level: 3,
      path: "의류 > 양말 > 일반양말",
      displayOrder: 2,
      parentCode: "CAT-APR-SCK",
    },

    // ── 아우터 (CAT-APR-OTR) — 3개
    {
      name: "벤치코트",
      code: "CAT-APR-OTR-BNC",
      level: 3,
      path: "의류 > 아우터 > 벤치코트",
      displayOrder: 1,
      parentCode: "CAT-APR-OTR",
    },
    {
      name: "점퍼",
      code: "CAT-APR-OTR-JKT",
      level: 3,
      path: "의류 > 아우터 > 점퍼",
      displayOrder: 2,
      parentCode: "CAT-APR-OTR",
    },
    {
      name: "후드",
      code: "CAT-APR-OTR-HOD",
      level: 3,
      path: "의류 > 아우터 > 후드",
      displayOrder: 3,
      parentCode: "CAT-APR-OTR",
    },

    // ── 테이프 (CAT-ACC-TPE) — 2개
    {
      name: "스틱테이프",
      code: "CAT-ACC-TPE-STK",
      level: 3,
      path: "악세서리 > 테이프 > 스틱테이프",
      displayOrder: 1,
      parentCode: "CAT-ACC-TPE",
    },
    {
      name: "양말테이프",
      code: "CAT-ACC-TPE-SCK",
      level: 3,
      path: "악세서리 > 테이프 > 양말테이프",
      displayOrder: 2,
      parentCode: "CAT-ACC-TPE",
    },

    // ── 스케이트 날/끈 (CAT-ACC-LCE) — 2개
    {
      name: "스케이트 날",
      code: "CAT-ACC-LCE-BLD",
      level: 3,
      path: "악세서리 > 스케이트 날/끈 > 스케이트 날",
      displayOrder: 1,
      parentCode: "CAT-ACC-LCE",
    },
    {
      name: "스케이트 끈",
      code: "CAT-ACC-LCE-STR",
      level: 3,
      path: "악세서리 > 스케이트 날/끈 > 스케이트 끈",
      displayOrder: 2,
      parentCode: "CAT-ACC-LCE",
    },

    // ── 골키퍼 마스크 (CAT-GKP-MSK) — 2개
    {
      name: "시니어",
      code: "CAT-GKP-MSK-SNR",
      level: 3,
      path: "골키퍼 > 골키퍼 마스크 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-GKP-MSK",
    },
    {
      name: "주니어",
      code: "CAT-GKP-MSK-JNR",
      level: 3,
      path: "골키퍼 > 골키퍼 마스크 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-GKP-MSK",
    },

    // ── 골키퍼 레그패드 (CAT-GKP-PAD) — 2개
    {
      name: "시니어",
      code: "CAT-GKP-PAD-SNR",
      level: 3,
      path: "골키퍼 > 레그패드 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-GKP-PAD",
    },
    {
      name: "주니어",
      code: "CAT-GKP-PAD-JNR",
      level: 3,
      path: "골키퍼 > 레그패드 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-GKP-PAD",
    },

    // ── 골키퍼 글러브/블로커 (CAT-GKP-GLV) — 2개
    {
      name: "캐쳐",
      code: "CAT-GKP-GLV-CTH",
      level: 3,
      path: "골키퍼 > 글러브/블로커 > 캐쳐",
      displayOrder: 1,
      parentCode: "CAT-GKP-GLV",
    },
    {
      name: "블로커",
      code: "CAT-GKP-GLV-BLK",
      level: 3,
      path: "골키퍼 > 글러브/블로커 > 블로커",
      displayOrder: 2,
      parentCode: "CAT-GKP-GLV",
    },

    // ── 골키퍼 체스트 프로텍터 (CAT-GKP-CHP) — 2개
    {
      name: "시니어",
      code: "CAT-GKP-CHP-SNR",
      level: 3,
      path: "골키퍼 > 체스트 프로텍터 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-GKP-CHP",
    },
    {
      name: "주니어",
      code: "CAT-GKP-CHP-JNR",
      level: 3,
      path: "골키퍼 > 체스트 프로텍터 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-GKP-CHP",
    },

    // ── 골키퍼 스틱 (CAT-GKP-STK) — 2개
    {
      name: "시니어",
      code: "CAT-GKP-STK-SNR",
      level: 3,
      path: "골키퍼 > 골키퍼 스틱 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-GKP-STK",
    },
    {
      name: "주니어",
      code: "CAT-GKP-STK-JNR",
      level: 3,
      path: "골키퍼 > 골키퍼 스틱 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-GKP-STK",
    },

    // ── 골키퍼 바지 (CAT-GKP-PNT) — 2개
    {
      name: "시니어",
      code: "CAT-GKP-PNT-SNR",
      level: 3,
      path: "골키퍼 > 골키퍼 바지 > 시니어",
      displayOrder: 1,
      parentCode: "CAT-GKP-PNT",
    },
    {
      name: "주니어",
      code: "CAT-GKP-PNT-JNR",
      level: 3,
      path: "골키퍼 > 골키퍼 바지 > 주니어",
      displayOrder: 2,
      parentCode: "CAT-GKP-PNT",
    },

    // ── 퍽 (CAT-TRN-PUK) — 3개
    {
      name: "경기용",
      code: "CAT-TRN-PUK-GME",
      level: 3,
      path: "훈련용품 > 퍽 > 경기용",
      displayOrder: 1,
      parentCode: "CAT-TRN-PUK",
    },
    {
      name: "훈련용",
      code: "CAT-TRN-PUK-PRC",
      level: 3,
      path: "훈련용품 > 퍽 > 훈련용",
      displayOrder: 2,
      parentCode: "CAT-TRN-PUK",
    },
    {
      name: "스트릿용",
      code: "CAT-TRN-PUK-STR",
      level: 3,
      path: "훈련용품 > 퍽 > 스트릿용",
      displayOrder: 3,
      parentCode: "CAT-TRN-PUK",
    },

    // ══════════════════════════════════════════
    // Level 4 — 세부분류: 제품 등급 (22개)
    // ══════════════════════════════════════════

    // ── 스케이트 시니어 등급 — 3개
    {
      name: "프로급",
      code: "CAT-EQP-SKT-SNR-PRO",
      level: 4,
      path: "장비 > 스케이트 > 시니어 > 프로급",
      displayOrder: 1,
      parentCode: "CAT-EQP-SKT-SNR",
    },
    {
      name: "중급",
      code: "CAT-EQP-SKT-SNR-MID",
      level: 4,
      path: "장비 > 스케이트 > 시니어 > 중급",
      displayOrder: 2,
      parentCode: "CAT-EQP-SKT-SNR",
    },
    {
      name: "입문급",
      code: "CAT-EQP-SKT-SNR-ENT",
      level: 4,
      path: "장비 > 스케이트 > 시니어 > 입문급",
      displayOrder: 3,
      parentCode: "CAT-EQP-SKT-SNR",
    },

    // ── 스케이트 주니어 등급 — 3개
    {
      name: "프로급",
      code: "CAT-EQP-SKT-JNR-PRO",
      level: 4,
      path: "장비 > 스케이트 > 주니어 > 프로급",
      displayOrder: 1,
      parentCode: "CAT-EQP-SKT-JNR",
    },
    {
      name: "중급",
      code: "CAT-EQP-SKT-JNR-MID",
      level: 4,
      path: "장비 > 스케이트 > 주니어 > 중급",
      displayOrder: 2,
      parentCode: "CAT-EQP-SKT-JNR",
    },
    {
      name: "입문급",
      code: "CAT-EQP-SKT-JNR-ENT",
      level: 4,
      path: "장비 > 스케이트 > 주니어 > 입문급",
      displayOrder: 3,
      parentCode: "CAT-EQP-SKT-JNR",
    },

    // ── 스케이트 유소년 등급 — 2개
    {
      name: "상급",
      code: "CAT-EQP-SKT-YTH-PRO",
      level: 4,
      path: "장비 > 스케이트 > 유소년 > 상급",
      displayOrder: 1,
      parentCode: "CAT-EQP-SKT-YTH",
    },
    {
      name: "입문급",
      code: "CAT-EQP-SKT-YTH-ENT",
      level: 4,
      path: "장비 > 스케이트 > 유소년 > 입문급",
      displayOrder: 2,
      parentCode: "CAT-EQP-SKT-YTH",
    },

    // ── 스틱 시니어 등급 — 3개
    {
      name: "프로급",
      code: "CAT-EQP-STK-SNR-PRO",
      level: 4,
      path: "장비 > 스틱 > 시니어 > 프로급",
      displayOrder: 1,
      parentCode: "CAT-EQP-STK-SNR",
    },
    {
      name: "중급",
      code: "CAT-EQP-STK-SNR-MID",
      level: 4,
      path: "장비 > 스틱 > 시니어 > 중급",
      displayOrder: 2,
      parentCode: "CAT-EQP-STK-SNR",
    },
    {
      name: "입문급",
      code: "CAT-EQP-STK-SNR-ENT",
      level: 4,
      path: "장비 > 스틱 > 시니어 > 입문급",
      displayOrder: 3,
      parentCode: "CAT-EQP-STK-SNR",
    },

    // ── 스틱 인터미디엇 등급 — 3개
    {
      name: "프로급",
      code: "CAT-EQP-STK-INT-PRO",
      level: 4,
      path: "장비 > 스틱 > 인터미디엇 > 프로급",
      displayOrder: 1,
      parentCode: "CAT-EQP-STK-INT",
    },
    {
      name: "중급",
      code: "CAT-EQP-STK-INT-MID",
      level: 4,
      path: "장비 > 스틱 > 인터미디엇 > 중급",
      displayOrder: 2,
      parentCode: "CAT-EQP-STK-INT",
    },
    {
      name: "입문급",
      code: "CAT-EQP-STK-INT-ENT",
      level: 4,
      path: "장비 > 스틱 > 인터미디엇 > 입문급",
      displayOrder: 3,
      parentCode: "CAT-EQP-STK-INT",
    },

    // ── 스틱 주니어 등급 — 2개
    {
      name: "상급",
      code: "CAT-EQP-STK-JNR-PRO",
      level: 4,
      path: "장비 > 스틱 > 주니어 > 상급",
      displayOrder: 1,
      parentCode: "CAT-EQP-STK-JNR",
    },
    {
      name: "입문급",
      code: "CAT-EQP-STK-JNR-ENT",
      level: 4,
      path: "장비 > 스틱 > 주니어 > 입문급",
      displayOrder: 2,
      parentCode: "CAT-EQP-STK-JNR",
    },

    // ── 글러브 시니어 등급 — 3개
    {
      name: "프로급",
      code: "CAT-EQP-GLV-SNR-PRO",
      level: 4,
      path: "장비 > 글러브 > 시니어 > 프로급",
      displayOrder: 1,
      parentCode: "CAT-EQP-GLV-SNR",
    },
    {
      name: "중급",
      code: "CAT-EQP-GLV-SNR-MID",
      level: 4,
      path: "장비 > 글러브 > 시니어 > 중급",
      displayOrder: 2,
      parentCode: "CAT-EQP-GLV-SNR",
    },
    {
      name: "입문급",
      code: "CAT-EQP-GLV-SNR-ENT",
      level: 4,
      path: "장비 > 글러브 > 시니어 > 입문급",
      displayOrder: 3,
      parentCode: "CAT-EQP-GLV-SNR",
    },

    // ── 골키퍼 레그패드 시니어 등급 — 3개
    {
      name: "프로급",
      code: "CAT-GKP-PAD-SNR-PRO",
      level: 4,
      path: "골키퍼 > 레그패드 > 시니어 > 프로급",
      displayOrder: 1,
      parentCode: "CAT-GKP-PAD-SNR",
    },
    {
      name: "중급",
      code: "CAT-GKP-PAD-SNR-MID",
      level: 4,
      path: "골키퍼 > 레그패드 > 시니어 > 중급",
      displayOrder: 2,
      parentCode: "CAT-GKP-PAD-SNR",
    },
    {
      name: "입문급",
      code: "CAT-GKP-PAD-SNR-ENT",
      level: 4,
      path: "골키퍼 > 레그패드 > 시니어 > 입문급",
      displayOrder: 3,
      parentCode: "CAT-GKP-PAD-SNR",
    },
  ];

  // 레벨 순서대로 삽입 (부모 → 자식)
  const sortedCategories = categories.sort((a, b) => a.level - b.level);

  for (const cat of sortedCategories) {
    let parentId: string | null = null;
    if (cat.parentCode) {
      const parent = await prisma.shopCategory.findUnique({
        where: { code: cat.parentCode },
      });
      parentId = parent?.id || null;
    }

    // upsert — deleteMany 스킵된 환경에서도 안전하게 동기화
    await prisma.shopCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        parentId,
        level: cat.level,
        path: cat.path,
        displayOrder: cat.displayOrder,
        description: cat.description ?? null,
        isActive: cat.isActive ?? true,
      },
      create: {
        name: cat.name,
        code: cat.code,
        parentId,
        level: cat.level,
        path: cat.path,
        displayOrder: cat.displayOrder,
        description: cat.description ?? null,
        isActive: cat.isActive ?? true,
      },
    });
  }
  console.log(
    "✅ 쇼핑몰 카테고리 114개 동기화 완료 (대6 / 중31 / 소55 / 세부22)",
  );

  // ========================================
  // 11. 앱 메뉴 설정 (외부 파일로 분리)
  // ========================================
  await seedAppMenus(prisma);

  // ========================================
  // 12. 픽업 매치 샘플 데이터
  // ========================================
  console.log("🏒 픽업 매치 시드 데이터 생성 중...");

  // 미래 날짜 계산 (오늘 기준)
  const seedToday = new Date();
  const seedDay = (daysFromNow: number) => {
    const d = new Date(seedToday);
    d.setDate(d.getDate() + daysFromNow);
    return d;
  };

  const pickupMatchData = [
    {
      managerId: coachUser.id,
      title: "주말 픽업 게임 (중급)",
      scheduledAt: seedDay(7),
      rinkName: "목동아이스링크",
      rinkAddress: "서울시 양천구 목동 622-3",
      price: 15000,
      level: "중급",
      maxParticipants: 12,
      status: "recruiting",
      rules: ["헬멧 착용 필수", "풀 장비 착용 필수"],
    },
    {
      managerId: coachUser.id,
      title: "입문자 환영 매치",
      scheduledAt: seedDay(14),
      rinkName: "태릉국제스케이트장",
      rinkAddress: "서울시 노원구 화랑로 406",
      price: 10000,
      level: "초급",
      maxParticipants: 8,
      status: "recruiting",
      rules: ["헬멧 착용 필수"],
    },
    {
      managerId: coachUser.id,
      title: "마감 임박! 고급 스크림",
      scheduledAt: seedDay(3),
      rinkName: "과천시 아이스링크",
      rinkAddress: "경기도 과천시 갈현동 산24",
      price: 20000,
      level: "고급",
      maxParticipants: 10,
      status: "closing_soon",
      rules: ["헬멧 착용 필수", "풀 장비 착용 필수", "수준 확인 후 참가"],
    },
  ];

  for (const matchData of pickupMatchData) {
    const existing = await prisma.pickupMatch.findFirst({
      where: {
        managerId: matchData.managerId,
        title: matchData.title,
      },
    });
    if (existing) {
      await prisma.pickupMatch.update({
        where: { id: existing.id },
        data: { scheduledAt: matchData.scheduledAt },
      });
    } else {
      await prisma.pickupMatch.create({ data: matchData });
    }
  }
  console.log("✅ 픽업 매치 3건 생성/업데이트 완료");

  // ========================================
  // 12-2. 토너먼트(대회) 샘플 데이터
  // ========================================
  console.log("🏆 토너먼트 시드 데이터 생성 중...");

  const tournamentData = [
    {
      name: "전국 챔피언십 결선",
      description: "2026 전국 유소년 아이스하키 챔피언십 결선 대회",
      teamId: sampleTeam.id,
      startDate: seedDay(5),
      endDate: seedDay(6),
      status: "scheduled",
    },
    {
      name: "지역 친선 경기",
      description: "수도권 아이스하키 클럽 친선 교류전",
      teamId: sampleTeam.id,
      startDate: seedDay(12),
      endDate: seedDay(12),
      status: "scheduled",
    },
    {
      name: "동계 리그 개막전",
      description: "2026 동계 유소년 리그 시즌 개막전",
      teamId: sampleTeam.id,
      startDate: seedDay(20),
      endDate: seedDay(21),
      status: "scheduled",
    },
  ];

  for (const tData of tournamentData) {
    const existing = await prisma.tournament.findFirst({
      where: { name: tData.name, teamId: tData.teamId },
    });
    if (existing) {
      await prisma.tournament.update({
        where: { id: existing.id },
        data: { startDate: tData.startDate, endDate: tData.endDate },
      });
    } else {
      await prisma.tournament.create({ data: tData });
    }
  }
  console.log("✅ 토너먼트 3건 생성/업데이트 완료");

  // ========================================
  // 앱 약관 기본 데이터
  // [2026-06-13] isActive: false 로 시드 — 약식 본문이 활성화되면 웹 /terms 의
  // 상세 처리방침 fallback(policy-content.ts)을 가려 앱 심사(Data Safety 대조) 리젝 사유가 됨.
  // 변호사 최종본은 어드민에서 등록·활성화한다.
  // ========================================
  const termsData = [
    {
      type: "terms_of_service",
      title: "서비스 이용약관",
      content:
        '본 약관은 TEAMPLUS(이하 "서비스")을 이용함에 있어 필요한 사항을 규정합니다.\n\n제1조 (목적)\n이 약관은 아이스하키 클럽 통합 관리 플랫폼 TEAMPLUS이 제공하는 서비스의 이용 조건 및 절차, 회사와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.\n\n제2조 (용어 정의)\n"서비스"란 회사가 제공하는 아이스하키 클럽 관리, 수업 예약, 출석 관리, 결제 등 일체의 서비스를 의미합니다.\n\n제3조 (서비스 이용)\n이용자는 본 약관에 동의하고 회원가입 절차를 완료한 후 서비스를 이용할 수 있습니다.',
      version: "1.0.0",
      isActive: false,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      type: "privacy_policy",
      title: "개인정보 처리방침",
      content:
        "TEAMPLUS은 개인정보보호법에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하게 처리할 수 있도록 다음과 같이 개인정보 처리방침을 수립·공개합니다.\n\n제1조 (수집하는 개인정보)\n서비스 이용을 위해 다음의 개인정보를 수집합니다.\n- 필수: 이름, 이메일, 휴대폰 번호, 생년월일\n- 아동 등록 시: 자녀 이름, 생년월일\n\n제2조 (개인정보 이용 목적)\n수집된 개인정보는 서비스 제공, 본인 인증, 수업 예약 및 결제 처리에 활용됩니다.\n\n제3조 (개인정보 보유 기간)\n회원 탈퇴 시 즉시 삭제하며, 관련 법령에 따라 일정 기간 보관이 필요한 정보는 별도 보관합니다.",
      version: "1.0.0",
      isActive: false,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      type: "marketing",
      title: "마케팅 정보 수신 동의",
      content:
        "TEAMPLUS의 마케팅 정보 수신에 동의하시면 다음과 같은 혜택을 받으실 수 있습니다.\n\n수신 동의 내용:\n- 신규 수업 및 이벤트 안내\n- 할인 혜택 및 쿠폰 발송\n- 대회 및 특별 프로그램 안내\n\n수신 채널:\n- 카카오 알림톡, 문자메시지, 이메일, 앱 푸시\n\n동의 철회:\n마케팅 정보 수신 동의는 언제든지 회원정보 설정에서 철회하실 수 있습니다. 동의 철회 시 기존 서비스 이용에는 영향이 없습니다.",
      version: "1.0.0",
      isActive: false,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];

  for (const terms of termsData) {
    const existing = await prisma.appTerms.findFirst({
      where: { type: terms.type, version: terms.version },
    });
    if (!existing) {
      await prisma.appTerms.create({ data: terms });
    }
  }
  console.log(
    "✅ 기본 약관 3종 생성 완료 (서비스이용약관, 개인정보처리방침, 마케팅수신동의)",
  );

  // ========================================
  // 프리미엄 이벤트 기본 데이터
  // ========================================
  const premiumEventSeed = {
    title: "겨울 프리미엄 캠프",
    subtitle: "한정 이벤트",
    description:
      "상위 코치진과 함께하는 집중 캠프입니다. 팀 전략, 스킬 트레이닝, 경기 분석까지 하루에 완성하세요.",
    eventDate: new Date("2026-02-08T10:00:00.000Z"),
    venueName: "올림픽 링크",
    venueAddress: "서울시 송파구 올림픽로 25",
    benefitsJson: JSON.stringify([
      "코치진 1:1 피드백 세션",
      "팀 전술 영상 분석 리포트",
      "프리미엄 장비 렌탈 패키지",
    ]),
    ctaLabel: "이벤트 신청하기",
    ctaUrl: "/events",
    imageUrl: "/images/events/premium-camp.png",
    isActive: true,
    sortOrder: 1,
    startAt: new Date("2026-01-01T00:00:00.000Z"),
    endAt: new Date("2026-12-31T23:59:59.000Z"),
  };

  const existingPremiumEvent = await prisma.appPremiumEvent.findFirst({
    where: {
      title: premiumEventSeed.title,
      eventDate: premiumEventSeed.eventDate,
    },
  });

  if (!existingPremiumEvent) {
    await prisma.appPremiumEvent.create({ data: premiumEventSeed });
    console.log("✅ 프리미엄 이벤트 기본 데이터 1건 생성 완료");
  } else {
    console.log("⏭️ 프리미엄 이벤트 기본 데이터 이미 존재");
  }

  // ========================================
  // 앱 설정 기본 데이터 (싱글턴)
  // ========================================
  const existingSettings = await prisma.appSettings.findFirst();
  if (!existingSettings) {
    await prisma.appSettings.create({
      data: {
        appName: "TEAMPLUS",
        appVersion: "1.0.0",
        apiUrl: process.env.API_BASE_URL ?? "http://localhost:5003",
        supportEmail: "admin@teamplus.com",
        maintenanceMode: false,
        debugMode: false,
        maxUploadSize: 10,
        sessionTimeout: 60,
        minimumAppVersionIos: "1.0.0",
        minimumAppVersionAnd: "1.0.0",
        signupEnabled: true,
        socialLoginEnabled: true,
        maxLoginAttempts: 5,
        creditExpireDays: 90,
        qrExpireMinutes: 5,
        termsVersion: "1.0",
        privacyVersion: "1.0",
      },
    });
    console.log("✅ 앱 설정 기본 데이터 생성 완료");
  } else {
    console.log("⏭️ 앱 설정 기본 데이터 이미 존재");
  }

  // ========================================
  // 기본 배송 정책 (ShippingPolicy)
  // ========================================
  const existingDefaultPolicy = await prisma.shippingPolicy.findFirst({
    where: { isDefault: true },
  });
  if (!existingDefaultPolicy) {
    await prisma.shippingPolicy.createMany({
      data: [
        {
          name: "기본배송",
          type: "standard",
          shippingFee: 3000,
          freeShippingThreshold: 50000,
          additionalFee: 0,
          estimatedDays: "2-3일",
          regions: null,
          surcharge: 0,
          isActive: true,
          isDefault: true,
        },
        {
          name: "도서산간 추가배송비",
          type: "standard",
          shippingFee: 3000,
          freeShippingThreshold: null,
          additionalFee: 5000,
          estimatedDays: "3-5일",
          regions: JSON.stringify(["제주", "도서", "산간"]),
          surcharge: 5000,
          isActive: true,
          isDefault: false,
        },
        {
          name: "당일특급배송",
          type: "express",
          shippingFee: 10000,
          freeShippingThreshold: null,
          additionalFee: 0,
          estimatedDays: "당일",
          regions: JSON.stringify(["서울", "경기"]),
          surcharge: 0,
          isActive: true,
          isDefault: false,
        },
      ],
    });
    console.log(
      "✅ 기본 배송 정책 3건 생성 완료 (기본배송 / 도서산간 / 당일특급)",
    );
  } else {
    console.log("⏭️ 기본 배송 정책 이미 존재");
  }

  // ========================================
  // 완료 메시지
  // ========================================
  console.log("\n🎉 시드 데이터 생성 완료!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 테스트 계정 목록 (비밀번호: Test1234!)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔧 system@teamplus.com    - 시스템관리자 (SYSTEM · ADM)");
  console.log("🔴 oper@teamplus.com      - 업무관리자 (OPER · ADM)");
  console.log("⚪ admin@teamplus.com     - 레거시 관리자 (ADMIN · APP)");
  console.log("🟠 director@teamplus.com  - 감독 (DIRECTOR)");
  console.log("🟤 academy@teamplus.com   - 아카데미원장 (ACADEMY_DIRECTOR)");
  console.log("🟡 coach@teamplus.com     - 코치 (COACH)");
  console.log("🟢 parent@teamplus.com    - 학부모 (PARENT)");
  console.log("🔵 teen@teamplus.com      - 10세이상 학생 (TEEN)");
  console.log("🟣 child@teamplus.com     - 10세미만 학생 (CHILD)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n🏒 샘플 클럽: TEAMPLUS Hockey Club (ICE-HOCKEY-001)");
  console.log("🎓 샘플 아카데미: TEAMPLUS 오픈 아카데미 (ACAD-SAMPLE)");
}

main()
  .catch((e) => {
    console.error("❌ 시드 실행 중 오류 발생:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
