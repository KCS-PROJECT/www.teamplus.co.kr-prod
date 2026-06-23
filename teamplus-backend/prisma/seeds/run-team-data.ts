/**
 * 팀/하위그룹/감독/코치/학부모/학생 시드 스크립트
 *
 * 데이터 구성 (사용자 명세):
 *   Club: TEAMPLUS 클럽 (1개) — 기존 TEAMPLUS Hockey Club 삭제 후 신규 생성
 *   Team: 타이탄스, 블리자드 (2개)
 *   TeamGroup:
 *     - 타이탄스 → 리틀 타이탄스(U8), 아이언 타이탄스(U10)
 *     - 블리자드 → 화이트 블리자드(U11), 블랙 블리자드(U12)
 *   감독 2명: 임감독(타이탄스) / 도감독(블리자드)
 *   코치 2명: 김코치(타이탄스) / 강코치(블리자드)
 *   학생 20명 (팀당 10명, U8~U12 각 2명) — 모두 성 다름
 *   학부모 20명 (학생 1:1 매칭, 같은 성)
 *
 * 그룹 매칭:
 *   - 타이탄스 U8 박/이 → 리틀 타이탄스
 *   - 타이탄스 U10 한/오 → 아이언 타이탄스
 *   - 블리자드 U11 전/고 → 화이트 블리자드
 *   - 블리자드 U12 문/손 → 블랙 블리자드
 *
 * 비밀번호: Test1234! (전체 통일)
 * 부모 email: {romanized_surname}@teamplus.com
 * 학생 email: {romanized_surname}_stu@teamplus.com
 *
 * 부수 작업:
 *   - 기존 child@teamplus.com firstName: '아동' → '학생'
 *   - 기존 teen@teamplus.com  firstName: '청소년' → '학생'
 */

import { PrismaClient, UserType } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const PASSWORD = "Test1234!";

interface StudentSpec {
  surname: string; // 한국어 성 (1자)
  enSurname: string; // 영어 표기
  age: number; // 8~12
}

const TITANS_STUDENTS: StudentSpec[] = [
  { surname: "박", enSurname: "park", age: 8 },
  { surname: "이", enSurname: "lee", age: 8 },
  { surname: "최", enSurname: "choi", age: 9 },
  { surname: "정", enSurname: "jung", age: 9 },
  { surname: "한", enSurname: "han", age: 10 },
  { surname: "오", enSurname: "oh", age: 10 },
  { surname: "윤", enSurname: "yoon", age: 11 },
  { surname: "서", enSurname: "seo", age: 11 },
  { surname: "장", enSurname: "jang", age: 12 },
  { surname: "조", enSurname: "cho", age: 12 },
];

const BLIZZARD_STUDENTS: StudentSpec[] = [
  { surname: "신", enSurname: "shin", age: 8 },
  { surname: "권", enSurname: "kwon", age: 8 },
  { surname: "황", enSurname: "hwang", age: 9 },
  { surname: "안", enSurname: "ahn", age: 9 },
  { surname: "송", enSurname: "song", age: 10 },
  { surname: "홍", enSurname: "hong", age: 10 },
  { surname: "전", enSurname: "jeon", age: 11 },
  { surname: "고", enSurname: "go", age: 11 },
  { surname: "문", enSurname: "moon", age: 12 },
  { surname: "손", enSurname: "son", age: 12 },
];

const ROLES = {
  DIRECTOR: "DIRECTOR" as UserType,
  COACH: "COACH" as UserType,
  PARENT: "PARENT" as UserType,
  TEEN: "TEEN" as UserType,
  CHILD: "CHILD" as UserType,
};

function randomPhone(seed: number): string {
  const suffix = String((seed * 9301 + 49297) % 10000).padStart(4, "0");
  const middle = String(((seed + 1) * 10000) % 10000).padStart(4, "0");
  return `010-${middle}-${suffix}`;
}

function randomGender(seed: number): string {
  return seed % 2 === 0 ? "M" : "F";
}

function ageToUserType(_age: number): UserType {
  // 사용자 요청: 10세이상/10세미만 구분 안 함 → 모두 TEEN으로 통일
  return ROLES.TEEN;
}

async function main(): Promise<void> {
  console.log("🌱 팀/그룹/사용자 시드 시작...\n");

  // ── 1. 기존 데이터 정리 ────────────────────────────────────────
  console.log("🧹 기존 데이터 정리...");
  await prisma.teamGroupMember.deleteMany({});
  await prisma.teamGroup.deleteMany({});
  await prisma.teamRoster.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.parentChild.deleteMany({});
  await prisma.clubMember.deleteMany({});
  await prisma.club.deleteMany({});

  // 신규 학생/학부모 email 충돌 방지 — 기존 신규 시드 사용자 제거
  const seedEmails: string[] = [];
  for (const spec of [...TITANS_STUDENTS, ...BLIZZARD_STUDENTS]) {
    seedEmails.push(`${spec.enSurname}@teamplus.com`);
    seedEmails.push(`${spec.enSurname}_stu@teamplus.com`);
  }
  seedEmails.push(
    "lim@teamplus.com",
    "do@teamplus.com",
    "kim_coach@teamplus.com",
    "kang_coach@teamplus.com",
  );
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });

  // 기존 테스트 계정 삭제 (사용자 요청) — admin/system/oper/academy 는 유지
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "director@teamplus.com",
          "coach@teamplus.com",
          "parent@teamplus.com",
          "teen@teamplus.com",
          "child@teamplus.com",
        ],
      },
    },
  });

  console.log("✅ 정리 완료\n");

  // ── 2. 비밀번호 ────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ── 3. 감독·코치 4명 ──────────────────────────────────────────
  console.log("👤 감독·코치 4명 생성...");

  const directorTitans = await prisma.user.create({
    data: {
      email: "lim@teamplus.com",
      phone: "010-1000-0001",
      firstName: "감독",
      lastName: "임",
      passwordHash,
      userType: ROLES.DIRECTOR,
      gender: "M",
      isVerified: true,
    },
  });
  const directorBlizzard = await prisma.user.create({
    data: {
      email: "do@teamplus.com",
      phone: "010-1000-0002",
      firstName: "감독",
      lastName: "도",
      passwordHash,
      userType: ROLES.DIRECTOR,
      gender: "M",
      isVerified: true,
    },
  });
  const coachTitans = await prisma.user.create({
    data: {
      email: "kim_coach@teamplus.com",
      phone: "010-1000-0003",
      firstName: "코치",
      lastName: "김",
      passwordHash,
      userType: ROLES.COACH,
      gender: "M",
      isVerified: true,
    },
  });
  const coachBlizzard = await prisma.user.create({
    data: {
      email: "kang_coach@teamplus.com",
      phone: "010-1000-0004",
      firstName: "코치",
      lastName: "강",
      passwordHash,
      userType: ROLES.COACH,
      gender: "F",
      isVerified: true,
    },
  });

  console.log("  - 임감독 / 도감독 / 김코치 / 강코치");

  // ── 4. Club 생성 (코치 ID 필수) ──────────────────────────────
  // Club 은 schema 상 Team 의 외래키이므로 한 개를 만들어 두지만,
  // 사용자 화면에는 노출하지 않는다 (UI 용어/표시는 모두 "팀" 단위로 운영).
  const club = await prisma.club.create({
    data: {
      clubCode: "ICE-INTERNAL",
      clubName: "TEAMPLUS",
      coachId: directorTitans.id,
      location: "서울특별시",
      phone: "02-0000-0001",
    },
  });

  // ── 5. Team 2개 생성 ─────────────────────────────────────────
  console.log("🏒 Team 2개 생성: 타이탄스 / 블리자드");
  const teamTitans = await prisma.team.create({
    data: {
      clubId: club.id,
      name: "타이탄스",
      shortName: "TTN",
      isActive: true,
    },
  });
  const teamBlizzard = await prisma.team.create({
    data: {
      clubId: club.id,
      name: "블리자드",
      shortName: "BLZ",
      isActive: true,
    },
  });

  // ── 6. TeamGroup 4개 생성 ────────────────────────────────────
  console.log("🏒 TeamGroup 4개 생성");
  const groupLittleTitans = await prisma.teamGroup.create({
    data: {
      teamId: teamTitans.id,
      name: "리틀 타이탄스",
      ageGroup: "U8",
      createdId: directorTitans.id,
    },
  });
  const groupIronTitans = await prisma.teamGroup.create({
    data: {
      teamId: teamTitans.id,
      name: "아이언 타이탄스",
      ageGroup: "U10",
      createdId: directorTitans.id,
    },
  });
  const groupWhiteBlizzard = await prisma.teamGroup.create({
    data: {
      teamId: teamBlizzard.id,
      name: "화이트 블리자드",
      ageGroup: "U11",
      createdId: directorBlizzard.id,
    },
  });
  const groupBlackBlizzard = await prisma.teamGroup.create({
    data: {
      teamId: teamBlizzard.id,
      name: "블랙 블리자드",
      ageGroup: "U12",
      createdId: directorBlizzard.id,
    },
  });

  // ── 7. 감독·코치 ClubMember + TeamRoster 등록 ────────────────
  // 감독·코치는 ClubMember로도 등록하여 추후 권한/리포트 연결 가능
  async function attachStaffToTeam(
    user: {
      id: string;
      firstName: string;
      lastName: string;
      gender: string | null;
    },
    teamId: string,
    role: "HEAD_COACH" | "COACH",
  ): Promise<void> {
    const member = await prisma.clubMember.create({
      data: {
        userId: user.id,
        clubId: club.id,
        playerName: `${user.lastName}${user.firstName}`,
        playerAge: 35,
        approvalStatus: "approved",
        roleInTeam: role,
      },
    });
    await prisma.teamRoster.create({
      data: {
        teamId,
        memberId: member.id,
        position: null,
        isCaptain: false,
        isAltCaptain: false,
        status: "active",
      },
    });
  }

  // 사용자 최종 정정 (변수명은 옛 매핑 기준 유지):
  //   임감독 → 블리자드, 도감독 → 타이탄스
  //   김코치 → 블리자드, 강코치 → 타이탄스
  await attachStaffToTeam(directorTitans, teamBlizzard.id, "HEAD_COACH");
  await attachStaffToTeam(directorBlizzard, teamTitans.id, "HEAD_COACH");
  await attachStaffToTeam(coachTitans, teamBlizzard.id, "COACH");
  await attachStaffToTeam(coachBlizzard, teamTitans.id, "COACH");

  // CoachProfile — admin /coaches 페이지가 prisma.coachProfile 조회하므로 필수
  await prisma.coachProfile.createMany({
    data: [
      { userId: directorTitans.id, clubId: club.id },
      { userId: directorBlizzard.id, clubId: club.id },
      { userId: coachTitans.id, clubId: club.id },
      { userId: coachBlizzard.id, clubId: club.id },
    ],
    skipDuplicates: true,
  });

  // ── 8. 학생/학부모 생성 + 매칭 ───────────────────────────────
  console.log("👨‍👩‍👧‍👦 학부모 20명 + 학생 20명 생성 + 매핑...");

  /** 한 학생 + 한 학부모 + ParentChild + ClubMember + TeamRoster + (해당되면) TeamGroupMember 까지 한 번에 생성. */
  async function createFamilyAndAttach(
    spec: StudentSpec,
    teamId: string,
    teamLabel: string,
    targetGroupId: string | null,
    seed: number,
  ): Promise<void> {
    // 학부모
    const parent = await prisma.user.create({
      data: {
        email: `${spec.enSurname}@teamplus.com`,
        phone: randomPhone(seed * 2),
        firstName: "부모",
        lastName: spec.surname,
        passwordHash,
        userType: ROLES.PARENT,
        gender: randomGender(seed),
        isVerified: true,
      },
    });

    // 학생
    const birthYear = new Date().getFullYear() - spec.age;
    const studentBirthDate = new Date(`${birthYear}-06-15`);
    const student = await prisma.user.create({
      data: {
        email: `${spec.enSurname}_stu@teamplus.com`,
        phone: randomPhone(seed * 2 + 1),
        firstName: "학생",
        lastName: spec.surname,
        passwordHash,
        userType: ageToUserType(spec.age),
        gender: randomGender(seed + 1),
        isVerified: true,
        birthDate: studentBirthDate,
        koreanAge: spec.age,
      },
    });

    // ChildProfile 생성 (BE-038 재발 방지 · 2026-04-29)
    //  - User 만 생성하면 mapParentChildToResponse 가 NotFoundException 발생 → 자녀 목록 API 실패
    //  - 학생 1:1 ParentChild 가 다음 줄에서 생성되므로 ChildProfile 도 함께 보장.
    await prisma.childProfile.create({
      data: {
        userId: student.id,
        birthDate: studentBirthDate,
        currentLevel: 1,
        levelLabel: "입문",
        progressPercent: 0,
      },
    });

    // 부모-자녀 관계
    await prisma.parentChild.create({
      data: {
        parentId: parent.id,
        childId: student.id,
        relationship: "parent",
        isPrimary: true,
      },
    });

    // ClubMember (학생)
    const studentMember = await prisma.clubMember.create({
      data: {
        userId: student.id,
        clubId: club.id,
        playerName: `${spec.surname}학생`,
        playerAge: spec.age,
        approvalStatus: "approved",
        roleInTeam: "PLAYER",
      },
    });
    await prisma.teamRoster.create({
      data: { teamId, memberId: studentMember.id, status: "active" },
    });

    // 학부모는 팀 소속(ClubMember·TeamRoster)을 만들지 않는다 —
    // 부모의 '내 팀'은 자녀 멤버십으로 동적 산출 (register() Phase 1 정책).
    const member = studentMember;

    // TeamGroupMember (해당 연령 그룹이 있으면 매칭)
    if (targetGroupId) {
      await prisma.teamGroupMember.create({
        data: {
          groupId: targetGroupId,
          memberId: member.id,
        },
      });
    }
  }

  // 타이탄스 — U8 → 리틀 타이탄스, U10 → 아이언 타이탄스, 그 외 그룹 미매칭
  for (let i = 0; i < TITANS_STUDENTS.length; i++) {
    const spec = TITANS_STUDENTS[i];
    let groupId: string | null = null;
    if (spec.age === 8) groupId = groupLittleTitans.id;
    else if (spec.age === 10) groupId = groupIronTitans.id;
    await createFamilyAndAttach(
      spec,
      teamTitans.id,
      "타이탄스",
      groupId,
      i + 1,
    );
  }

  // 블리자드 — U11 → 화이트 블리자드, U12 → 블랙 블리자드
  for (let i = 0; i < BLIZZARD_STUDENTS.length; i++) {
    const spec = BLIZZARD_STUDENTS[i];
    let groupId: string | null = null;
    if (spec.age === 11) groupId = groupWhiteBlizzard.id;
    else if (spec.age === 12) groupId = groupBlackBlizzard.id;
    await createFamilyAndAttach(
      spec,
      teamBlizzard.id,
      "블리자드",
      groupId,
      i + 100,
    );
  }

  // ── 9. 결과 요약 ──────────────────────────────────────────────
  const counts = {
    clubs: await prisma.club.count(),
    teams: await prisma.team.count(),
    teamGroups: await prisma.teamGroup.count(),
    clubMembers: await prisma.clubMember.count(),
    teamRosters: await prisma.teamRoster.count(),
    teamGroupMembers: await prisma.teamGroupMember.count(),
    parentChildren: await prisma.parentChild.count(),
  };

  console.log("\n✅ 시드 완료");
  console.table(counts);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ 시드 오류:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
