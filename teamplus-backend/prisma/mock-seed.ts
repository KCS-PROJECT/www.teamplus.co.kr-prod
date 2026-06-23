/**
 * TEAMPLUS 목데이터 시드 스크립트
 *
 * 생성 도메인:
 * 1. 사용자 (ADMIN 1 + DIRECTOR 2 + COACH 5 + PARENT 10 + TEEN 5 + CHILD 10 = 33명)
 * 2. 팀 (4팀: U10, U12, U15, U18)
 * 3. 수업 스케줄 (앞뒤 1개월치 추가 스케줄)
 * 4. 코치-클럽 매핑 (CoachProfile)
 * 5. 학부모-자녀 매핑 (ParentChild)
 * 6. 클럽 멤버십 (ClubMember)
 * 7. 팀 로스터 (TeamRoster)
 * 8. 결제 + 크레딧 (Payment + MemberCredit)
 * 9. 출석 기록 (ClassAttendance) - 최근 2주
 *
 * 실행: cd teamplus-backend && npx ts-node prisma/mock-seed.ts
 * 멱등성: email UNIQUE + ON CONFLICT 패턴으로 중복 실행 안전
 */

import { PrismaClient, UserType } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

const DEFAULT_PASSWORD = "Test1234!";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// cuid-like ID 생성 (prisma @default(cuid()) 대신 수동 생성용)
function makeCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 12);
  return `c${timestamp}${random}`;
}

// 본인인증 미완료가 의도된 UserType (청소년·아동만 isVerified=false)
// SYSTEM/OPER/ADMIN/DIRECTOR/ACADEMY_DIRECTOR/COACH/PARENT 는 모두 인증 완료로 간주.
// enum 확장 시 자동 안전 (블랙리스트 방식).
const UNVERIFIED_USER_TYPES = new Set<UserType>([
  UserType.TEEN,
  UserType.CHILD,
]);

async function upsertUser(
  email: string,
  phone: string,
  firstName: string,
  lastName: string,
  userType: UserType,
  passwordHash: string,
  extra: Record<string, unknown> = {},
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  skip  ${userType} ${email}`);
    return existing;
  }
  // phone unique check
  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) {
    console.log(`  skip(phone dup)  ${email}`);
    return existingPhone;
  }
  const isVerified = !UNVERIFIED_USER_TYPES.has(userType);
  const user = await prisma.user.create({
    data: {
      email,
      phone,
      firstName,
      lastName,
      passwordHash,
      userType,
      isVerified,
      verifiedAt: isVerified ? new Date() : undefined,
      status: "ACTIVE",
      ...extra,
    },
  });
  console.log(`  create ${userType} ${email}`);
  return user;
}

async function ensureClubMember(
  userId: string,
  clubId: string,
  playerName: string,
  playerAge: number,
  playerLevel: string,
  roleInTeam: string | null, // COACH|HEAD_COACH|PLAYER|MANAGER|PARENT (SPEC §2 #12)
) {
  const existing = await prisma.clubMember.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (existing) return existing;

  // Prisma client 사용 — id(cuid), createdAt/updatedAt 자동 처리.
  // 동시 실행 race 시 P2002(unique violation) 흡수해 기존 레코드 반환.
  try {
    return await prisma.clubMember.create({
      data: {
        userId,
        clubId,
        playerName,
        playerAge,
        playerLevel,
        approvalStatus: "approved",
        roleInTeam,
      },
    });
  } catch (err) {
    // P2002 race 안전망 — 동시 다른 프로세스가 먼저 INSERT 한 경우 기존 레코드 반환
    return prisma.clubMember.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
  }
}

async function main() {
  // ────────────────────────────────────────────────────────────────────
  // [DISABLED] 사용자 요청으로 mock-seed 영구 비활성화 (2026-04-29)
  // 옛 director/coach/parent/teen/child 계정을 매 실행마다 부활시켰음.
  // 운영 시드는 prisma/seeds/run-team-data.ts 만 사용한다.
  // ────────────────────────────────────────────────────────────────────
  console.log("⛔ mock-seed.ts 는 비활성화 상태입니다.");
  console.log("   운영 시드: npx tsx prisma/seeds/run-team-data.ts");
  return;
  // eslint-disable-next-line @typescript-eslint/no-unreachable
  console.log("\n========================================");
  console.log("TEAMPLUS 목데이터 시드 시작");
  console.log("========================================\n");

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  console.log("[0] bcrypt 해시 생성 완료\n");

  // ============================
  // 기존 핵심 ID 조회
  // ============================
  const adminUser =
    (await prisma.user.findUnique({
      where: { email: "admin@teamplus.com" },
    })) ??
    (await prisma.user.findUnique({ where: { email: "oper@teamplus.com" } }));

  const directorBase = await prisma.user.findUnique({
    where: { email: "director@teamplus.com" },
  });
  const coachBase = await prisma.user.findUnique({
    where: { email: "coach@teamplus.com" },
  });
  const parentBase = await prisma.user.findUnique({
    where: { email: "parent@teamplus.com" },
  });

  const sampleClub = await prisma.club.findUnique({
    where: { clubCode: "ICE-HOCKEY-001" },
  });
  if (!sampleClub) {
    console.error(
      "ERROR: ICE-HOCKEY-001 클럽이 없습니다. npm run db:seed 먼저 실행하세요.",
    );
    process.exit(1);
  }
  console.log(`[기존] 클럽: ${sampleClub.clubName} (${sampleClub.id})\n`);

  // ============================
  // 1. 추가 사용자 생성
  // ============================
  console.log("[1] 사용자 생성 시작...");

  // --- DIRECTOR 2명 ---
  const director2 = await upsertUser(
    "director02@teamplus.com",
    "010-1100-0001",
    "민준",
    "이",
    UserType.DIRECTOR,
    passwordHash,
  );
  // director base already exists; use directorBase

  // --- COACH 5명 (coach@teamplus.com 기존 1명 + 4명 추가) ---
  const coachDefs = [
    {
      email: "coach02@teamplus.com",
      phone: "010-2200-0001",
      first: "수현",
      last: "박",
    },
    {
      email: "coach03@teamplus.com",
      phone: "010-2200-0002",
      first: "지훈",
      last: "최",
    },
    {
      email: "coach04@teamplus.com",
      phone: "010-2200-0003",
      first: "현우",
      last: "정",
    },
    {
      email: "coach05@teamplus.com",
      phone: "010-2200-0004",
      first: "유진",
      last: "한",
    },
  ];
  const coaches: Array<{ id: string }> = [];
  if (coachBase) coaches.push(coachBase);
  for (const c of coachDefs) {
    const u = await upsertUser(
      c.email,
      c.phone,
      c.first,
      c.last,
      UserType.COACH,
      passwordHash,
    );
    coaches.push(u);
  }

  // --- PARENT 10명 ---
  const parentDefs = [
    {
      email: "parent02@teamplus.com",
      phone: "010-3300-0001",
      first: "지영",
      last: "김",
    },
    {
      email: "parent03@teamplus.com",
      phone: "010-3300-0002",
      first: "성훈",
      last: "이",
    },
    {
      email: "parent04@teamplus.com",
      phone: "010-3300-0003",
      first: "미란",
      last: "윤",
    },
    {
      email: "parent05@teamplus.com",
      phone: "010-3300-0004",
      first: "준혁",
      last: "강",
    },
    {
      email: "parent06@teamplus.com",
      phone: "010-3300-0005",
      first: "선희",
      last: "조",
    },
    {
      email: "parent07@teamplus.com",
      phone: "010-3300-0006",
      first: "태원",
      last: "장",
    },
    {
      email: "parent08@teamplus.com",
      phone: "010-3300-0007",
      first: "수정",
      last: "임",
    },
    {
      email: "parent09@teamplus.com",
      phone: "010-3300-0008",
      first: "재현",
      last: "오",
    },
    {
      email: "parent10@teamplus.com",
      phone: "010-3300-0009",
      first: "은지",
      last: "신",
    },
  ];
  const parents: Array<{ id: string }> = [];
  if (parentBase) parents.push(parentBase);
  for (const p of parentDefs) {
    const u = await upsertUser(
      p.email,
      p.phone,
      p.first,
      p.last,
      UserType.PARENT,
      passwordHash,
    );
    parents.push(u);
  }

  // --- TEEN 5명 ---
  // 한국나이 → 출생일 환산 (한국나이 N → currentYear - N + 1 년생, 1/1 기준 단순화)
  const teenBirth = (koreanAge: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - koreanAge + 1);
    return d;
  };
  const teenDefs = [
    {
      email: "teen02@teamplus.com",
      phone: "010-4400-0001",
      first: "준서",
      last: "김",
      age: 14,
    },
    {
      email: "teen03@teamplus.com",
      phone: "010-4400-0002",
      first: "하은",
      last: "이",
      age: 13,
    },
    {
      email: "teen04@teamplus.com",
      phone: "010-4400-0003",
      first: "도윤",
      last: "박",
      age: 15,
    },
    {
      email: "teen05@teamplus.com",
      phone: "010-4400-0004",
      first: "서연",
      last: "최",
      age: 12,
    },
  ];
  const teens: Array<{ id: string }> = [];
  const teenBase = await prisma.user.findUnique({
    where: { email: "teen@teamplus.com" },
  });
  if (teenBase) teens.push(teenBase);
  for (const t of teenDefs) {
    const u = await upsertUser(
      t.email,
      t.phone,
      t.first,
      t.last,
      UserType.TEEN,
      passwordHash,
      { birthDate: teenBirth(t.age), koreanAge: t.age },
    );
    teens.push(u);
  }

  // --- CHILD 10명 ---
  const childDefs = [
    {
      email: "child02@teamplus.com",
      phone: "010-5500-0001",
      first: "지민",
      last: "이",
      age: 8,
    },
    {
      email: "child03@teamplus.com",
      phone: "010-5500-0002",
      first: "예은",
      last: "박",
      age: 7,
    },
    {
      email: "child04@teamplus.com",
      phone: "010-5500-0003",
      first: "민서",
      last: "김",
      age: 9,
    },
    {
      email: "child05@teamplus.com",
      phone: "010-5500-0004",
      first: "현준",
      last: "정",
      age: 8,
    },
    {
      email: "child06@teamplus.com",
      phone: "010-5500-0005",
      first: "수아",
      last: "윤",
      age: 7,
    },
    {
      email: "child07@teamplus.com",
      phone: "010-5500-0006",
      first: "태양",
      last: "강",
      age: 9,
    },
    {
      email: "child08@teamplus.com",
      phone: "010-5500-0007",
      first: "나린",
      last: "조",
      age: 8,
    },
    {
      email: "child09@teamplus.com",
      phone: "010-5500-0008",
      first: "성민",
      last: "한",
      age: 7,
    },
    {
      email: "child10@teamplus.com",
      phone: "010-5500-0009",
      first: "유리",
      last: "신",
      age: 8,
    },
  ];
  const children: Array<{ id: string }> = [];
  const childBase = await prisma.user.findUnique({
    where: { email: "child@teamplus.com" },
  });
  if (childBase) children.push(childBase);
  for (const c of childDefs) {
    const u = await upsertUser(
      c.email,
      c.phone,
      c.first,
      c.last,
      UserType.CHILD,
      passwordHash,
      { birthDate: teenBirth(c.age), koreanAge: c.age },
    );
    children.push(u);
  }

  console.log(
    `\n  사용자 현황: admin=${adminUser ? 1 : 0}, director=${2}, coach=${coaches.length}, parent=${parents.length}, teen=${teens.length}, child=${children.length}`,
  );

  // ============================
  // 2. CoachProfile 생성
  // ============================
  console.log("\n[2] CoachProfile 생성...");
  for (const coach of coaches) {
    const existing = await prisma.coachProfile.findUnique({
      where: { userId: coach.id },
    });
    if (!existing) {
      await prisma.coachProfile.create({
        data: { userId: coach.id, clubId: sampleClub.id },
      });
      console.log(`  CoachProfile 생성: ${coach.id}`);
    }
  }
  // director2 coachProfile
  if (director2) {
    const existing = await prisma.coachProfile.findUnique({
      where: { userId: director2.id },
    });
    if (!existing) {
      await prisma.coachProfile.create({
        data: { userId: director2.id, clubId: sampleClub.id },
      });
    }
  }

  // ============================
  // 3. ParentProfile + ChildProfile 생성
  // ============================
  console.log("\n[3] ParentProfile / ChildProfile 생성...");
  for (const parent of parents) {
    const existing = await prisma.parentProfile.findUnique({
      where: { userId: parent.id },
    });
    if (!existing) {
      await prisma.parentProfile.create({ data: { userId: parent.id } });
    }
  }
  const allStudents = [...teens, ...children];
  for (const student of allStudents) {
    const existing = await prisma.childProfile.findUnique({
      where: { userId: student.id },
    });
    if (!existing) {
      const bd = new Date();
      bd.setFullYear(bd.getFullYear() - 10);
      await prisma.childProfile.create({
        data: {
          userId: student.id,
          birthDate: bd,
          currentLevel: 1,
          levelLabel: "입문",
          progressPercent: 20,
        },
      });
    }
  }

  // ============================
  // 4. 학부모-자녀 매핑
  // ============================
  console.log("\n[4] 학부모-자녀 매핑...");
  // parent[0] → teens[0], children[0]
  // parent[1] → teens[1], children[1]
  // parent[2] → teens[2], children[2]
  // parent[3] → teens[3], children[3]
  // parent[4] → teens[4], children[4]
  // parent[5..9] → children[5..9] (1:1)
  const pairings: Array<{ parentIdx: number; childId: string }> = [];
  for (let i = 0; i < Math.min(parents.length, teens.length); i++) {
    pairings.push({ parentIdx: i, childId: teens[i].id });
  }
  for (let i = 0; i < Math.min(parents.length, children.length); i++) {
    pairings.push({ parentIdx: i, childId: children[i].id });
  }
  for (const pair of pairings) {
    const parentId = parents[pair.parentIdx].id;
    const childId = pair.childId;
    const existing = await prisma.parentChild.findUnique({
      where: { parentId_childId: { parentId, childId } },
    });
    if (!existing) {
      await prisma.parentChild.create({
        data: { parentId, childId, relationship: "parent", isPrimary: true },
      });
    }
  }
  console.log(`  ${pairings.length}개 매핑 처리 완료`);

  // ============================
  // 5. 클럽 멤버십 등록
  // ============================
  console.log("\n[5] ClubMember 등록...");
  const coachMembers: string[] = [];
  for (const coach of coaches) {
    const m = await ensureClubMember(
      coach.id,
      sampleClub.id,
      "코치",
      30,
      "advanced",
      "COACH",
    );
    if (m) coachMembers.push(m.id);
  }

  const parentMembers: string[] = [];
  for (const parent of parents) {
    const u = await prisma.user.findUnique({ where: { id: parent.id } });
    const m = await ensureClubMember(
      parent.id,
      sampleClub.id,
      `${u?.lastName ?? ""}${u?.firstName ?? ""}학부모`,
      38,
      "beginner",
      "PARENT",
    );
    if (m) parentMembers.push(m.id);
  }

  const studentMembers: string[] = [];
  for (const student of allStudents) {
    const u = await prisma.user.findUnique({ where: { id: student.id } });
    const age = u?.koreanAge ?? 12;
    const level =
      age >= 14 ? "advanced" : age >= 11 ? "intermediate" : "beginner";
    const m = await ensureClubMember(
      student.id,
      sampleClub.id,
      `${u?.lastName ?? ""}${u?.firstName ?? ""}`,
      age,
      level,
      "PLAYER",
    );
    if (m) studentMembers.push(m.id);
  }
  console.log(
    `  코치 멤버 ${coachMembers.length}명 / 학부모 멤버 ${parentMembers.length}명 / 학생 멤버 ${studentMembers.length}명`,
  );

  // ============================
  // 6. 팀 생성 (4팀)
  // ============================
  console.log("\n[6] 팀 생성...");
  const teamDefs = [
    {
      name: "TEAMPLUS U10",
      shortName: "ICE U10",
      division: "U10",
      primaryColor: "#1E3FAE",
      secondaryColor: "#FFFFFF",
    },
    {
      name: "TEAMPLUS U12",
      shortName: "ICE U12",
      division: "U12",
      primaryColor: "#DC2626",
      secondaryColor: "#FFFFFF",
    },
    {
      name: "TEAMPLUS U15",
      shortName: "ICE U15",
      division: "U15",
      primaryColor: "#16A34A",
      secondaryColor: "#FFFFFF",
    },
    {
      name: "TEAMPLUS U18",
      shortName: "ICE U18",
      division: "U18",
      primaryColor: "#7C3AED",
      secondaryColor: "#FFFFFF",
    },
  ];
  const teams: Array<{ id: string; division: string | null }> = [];
  for (const td of teamDefs) {
    const existing = await prisma.team.findFirst({
      where: { clubId: sampleClub.id, name: td.name },
    });
    if (existing) {
      console.log(`  skip team: ${td.name}`);
      teams.push(existing);
    } else {
      const team = await prisma.team.create({
        data: {
          clubId: sampleClub.id,
          name: td.name,
          shortName: td.shortName,
          division: td.division,
          primaryColor: td.primaryColor,
          secondaryColor: td.secondaryColor,
          isActive: true,
          foundingDate: new Date("2020-01-01"),
          homeArena: "TEAMPLUS 아이스링크",
          description: `${td.division} 연령대 팀`,
        },
      });
      console.log(`  create team: ${td.name}`);
      teams.push(team);
    }
  }

  // ============================
  // 7. TeamRoster (학생 → 팀 배정)
  // ============================
  console.log("\n[7] TeamRoster 배정...");
  // 학생 멤버 ID 목록 가져오기
  const studentMemberRecords = await prisma.clubMember.findMany({
    where: {
      userId: { in: allStudents.map((s) => s.id) },
      clubId: sampleClub.id,
    },
    select: { id: true, userId: true, playerAge: true },
  });

  let rosterCount = 0;
  for (const sm of studentMemberRecords) {
    const age = sm.playerAge;
    // 나이에 따라 팀 배정
    const teamIndex = age <= 10 ? 0 : age <= 12 ? 1 : age <= 15 ? 2 : 3;
    const team = teams[Math.min(teamIndex, teams.length - 1)];

    const existingRoster = await prisma.teamRoster.findFirst({
      where: { teamId: team.id, memberId: sm.id },
    });
    if (!existingRoster) {
      await prisma.teamRoster.create({
        data: {
          teamId: team.id,
          memberId: sm.id,
          position: "FORWARD",
          jerseyNumber: 10 + rosterCount,
          isCaptain: false,
          isAltCaptain: false,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
      rosterCount++;
    }
  }
  console.log(`  ${rosterCount}개 로스터 배정 완료`);

  // ============================
  // 8. 추가 수업 스케줄 (앞뒤 1개월)
  // ============================
  console.log("\n[8] 수업 스케줄 추가...");
  const existingClasses = await prisma.class.findMany({
    where: { clubId: sampleClub.id },
    select: { id: true, className: true, startTime: true, classDays: true },
  });

  const now = new Date();
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthLater = new Date(now);
  oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

  // 기존 schedule 키 Set (classId + ISO date+hour) — 시각까지 포함하여 같은 날 다중 시간 schedule 방지.
  const existingSchedules = await prisma.classSchedule.findMany({
    select: { classId: true, scheduledDate: true },
  });
  const existingScheduleKeys = new Set(
    existingSchedules.map(
      (s) => `${s.classId}|${s.scheduledDate.toISOString().slice(0, 13)}`,
    ),
  );

  // 2026-04-28: class 본래 요일/시간 기반으로 schedule 생성 (seed-classes 와 정합).
  // 기존: 모든 class 화/목 08:00 강제 → seed-classes 가 만든 정상 schedule 과 시간 다른 중복 발생.
  // ⚠️ Class.startTime 은 시즌 시작 일자(00:00)이라 수업 시각 정보가 아님 →
  //    각 class 의 가장 이른 정상 schedule(seed-classes 산) 시각을 참조하여 정합성 확보.
  const KOREAN_DAY_INDEX: Record<string, number> = {
    일: 0,
    월: 1,
    화: 2,
    수: 3,
    목: 4,
    금: 5,
    토: 6,
  };

  let scheduleCount = 0;
  for (const cls of existingClasses) {
    const days = Array.isArray(cls.classDays)
      ? (cls.classDays as string[])
          .map((d) => KOREAN_DAY_INDEX[d])
          .filter((d): d is number => d !== undefined)
      : [];
    if (days.length === 0) continue; // 요일 정보 없으면 skip

    // 기존 정상 schedule 의 시각 추출 (seed-classes 가 만든 정확한 시각)
    const refSched = await prisma.classSchedule.findFirst({
      where: { classId: cls.id, isCancelled: false },
      orderBy: { scheduledDate: "asc" },
      select: { scheduledDate: true },
    });
    if (!refSched) continue; // 참조 schedule 없으면 skip
    const startHour = refSched.scheduledDate.getHours();
    const startMin = refSched.scheduledDate.getMinutes();
    // 0시 0분이면 신뢰 불가 (시즌 시작 일자만 저장된 경우) → skip
    if (startHour === 0 && startMin === 0) continue;

    const cursor = new Date(oneMonthAgo);
    while (cursor <= oneMonthLater) {
      const dow = cursor.getDay();
      if (days.includes(dow)) {
        const schedDate = new Date(cursor);
        schedDate.setHours(startHour, startMin, 0, 0);
        const key = `${cls.id}|${schedDate.toISOString().slice(0, 13)}`;
        if (!existingScheduleKeys.has(key)) {
          await prisma.classSchedule.create({
            data: {
              classId: cls.id,
              scheduledDate: schedDate,
              isCancelled: false,
            },
          });
          existingScheduleKeys.add(key);
          scheduleCount++;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  console.log(`  ${scheduleCount}개 스케줄 생성`);

  // ============================
  // 9. 수업 등록 (ClassRegistration)
  // ============================
  console.log("\n[9] ClassRegistration 등록...");
  let regCount = 0;
  for (const sm of studentMemberRecords) {
    // 2026-04-27: 모든 클래스에 자녀 등록 → 학부모 대시보드 오늘 일정 풍성하게 노출.
    for (const cls of existingClasses) {
      // 2026-04-27 (N-9): ClassRegistration User 기반 통일
      const existing = await prisma.classRegistration.findFirst({
        where: { classId: cls.id, userId: sm.userId },
      });
      if (!existing) {
        await prisma.classRegistration.create({
          data: {
            classId: cls.id,
            userId: sm.userId,
            registrationDate: new Date(),
            status: "active",
          },
        });
        regCount++;
      }
    }
  }
  console.log(`  ${regCount}개 수업 등록 완료`);

  // ============================
  // 10. 결제 + 크레딧 생성
  // ============================
  console.log("\n[10] Payment + MemberCredit 생성...");
  let paymentCount = 0;
  let creditCount = 0;

  // 학부모 각자 결제 이력 생성
  for (let i = 0; i < parents.length; i++) {
    const parentId = parents[i].id;
    // 각 학부모에 대응하는 학생 찾기
    const linkedStudentIds = pairings
      .filter((p) => p.parentIdx === i)
      .map((p) => p.childId);

    for (const studentId of linkedStudentIds) {
      // 해당 학생의 ClubMember (가입 자격 보조 검증)
      const memberRecord = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: studentId, clubId: sampleClub.id } },
      });
      if (!memberRecord) continue;

      // 2026-04-27 (N-9): 학생이 등록한 모든 수업에 대해 수업권 발급.
      // 자녀의 ClassRegistration 중 active 한 클래스 모두에 대해 결제+수업권 생성.
      // 결과: 학부모 자녀가 등록한 모든 수업에 출석 가능 (수업권 부족 차단 회피).
      const childRegs = await prisma.classRegistration.findMany({
        where: { userId: studentId, status: "active" },
        select: { classId: true },
      });
      if (childRegs.length === 0) continue;

      // 자녀 등록 클래스마다 × 2개월치 결제 (과거)
      for (const reg of childRegs) {
        for (let month = 0; month < 2; month++) {
          const payDate = new Date();
          payDate.setMonth(payDate.getMonth() - month);
          payDate.setDate(1);

          const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

          const existingPay = await prisma.payment.findUnique({
            where: { orderNumber },
          });
          if (existingPay) continue;

          const payment = await prisma.payment.create({
            data: {
              orderNumber,
              userId: parentId,
              amount: 150000,
              paymentStatus: "completed",
              paymentMethod: "card",
              tid: `TID-${Date.now()}`,
              completedAt: payDate,
              createdAt: payDate,
            },
          });
          paymentCount++;

          // 수업권 발행 (90일 유효, User × Class 단위)
          const expiresAt = new Date(payDate);
          expiresAt.setDate(expiresAt.getDate() + 90);

          await prisma.memberCredit.create({
            data: {
              userId: studentId,
              classId: reg.classId,
              totalSessions: 8,
              usedSessions: month === 0 ? 0 : 4, // 이전 달은 절반 사용
              expiresAt,
              paymentId: payment.id,
              issuedDate: payDate,
              createdAt: payDate,
            },
          });
          creditCount++;
        }
      }
    }
  }
  console.log(`  결제 ${paymentCount}건 / 수업권 ${creditCount}건 생성`);

  // ============================
  // 11. 출석 기록 (최근 2주)
  // ============================
  console.log("\n[11] ClassAttendance 생성 (최근 2주)...");
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const recentSchedules = await prisma.classSchedule.findMany({
    where: {
      scheduledDate: { gte: twoWeeksAgo, lte: now },
      isCancelled: false,
    },
    include: { class: { select: { clubId: true } } },
  });

  let attendanceCount = 0;
  for (const sched of recentSchedules) {
    if (sched.class.clubId !== sampleClub.id) continue;

    // 각 스케줄에 학생 멤버 중 일부 출석
    for (const sm of studentMemberRecords.slice(0, 5)) {
      const existing = await prisma.classAttendance.findUnique({
        where: {
          scheduleId_memberId: { scheduleId: sched.id, memberId: sm.userId },
        },
      });
      if (existing) continue;

      const isPresent = Math.random() > 0.2; // 80% 출석
      await prisma.classAttendance.create({
        data: {
          scheduleId: sched.id,
          memberId: sm.userId,
          attendanceStatus: isPresent ? "present" : "absent",
          checkedInAt: isPresent
            ? new Date(sched.scheduledDate.getTime() + 5 * 60 * 1000)
            : null,
          creditDeducted: isPresent,
          createdAt: sched.scheduledDate,
        },
      });
      attendanceCount++;
    }
  }
  console.log(`  출석 기록 ${attendanceCount}건 생성`);

  // ===================================================
  // PHASE 2: 확장 도메인 목데이터
  // ===================================================

  // 공통 참조 데이터 재로드
  const allClubs = await prisma.club.findMany({
    select: { id: true, coachId: true },
  });
  const club = allClubs[0];
  const allCoaches = await prisma.user.findMany({
    where: { userType: "COACH" },
    select: { id: true },
    take: 5,
  });
  const allParents = await prisma.user.findMany({
    where: { userType: "PARENT" },
    select: { id: true, email: true, firstName: true, lastName: true },
    take: 10,
  });
  const allChildren = await prisma.user.findMany({
    where: { userType: { in: ["TEEN", "CHILD"] as UserType[] } },
    select: { id: true },
    take: 15,
  });
  const allClasses = await prisma.class.findMany({
    where: { clubId: club.id },
    select: { id: true, className: true },
    take: 5,
  });
  const allStudentMembers = await prisma.clubMember.findMany({
    where: { clubId: club.id, playerAge: { lt: 20 } },
    select: { id: true, userId: true },
    take: 15,
  });
  const allTeams = await prisma.team.findMany({
    where: { clubId: club.id },
    select: { id: true, name: true },
  });

  // ----------------------------
  // 12. CreditTransaction (크레딧 차감·충전 이력)
  // ----------------------------
  console.log("\n[12] CreditTransaction 생성...");
  const allCredits = await prisma.memberCredit.findMany({
    take: 20,
    select: { id: true },
  });
  let txCount = 0;
  for (const credit of allCredits) {
    const existing = await prisma.creditTransaction.findFirst({
      where: { memberCreditId: credit.id },
    });
    if (existing) continue;
    await prisma.creditTransaction.create({
      data: {
        memberCreditId: credit.id,
        type: "earned",
        amount: 8,
        balanceAfter: 8,
        reason: "월정액 결제 크레딧 발행",
      },
    });
    await prisma.creditTransaction.create({
      data: {
        memberCreditId: credit.id,
        type: "deducted",
        amount: -1,
        balanceAfter: 7,
        reason: "QR 출석 차감",
      },
    });
    txCount += 2;
  }
  console.log(`  CreditTransaction ${txCount}건`);

  // ----------------------------
  // 13. RefundLog (환불 로그)
  // ----------------------------
  console.log("\n[13] RefundLog 생성...");
  const completedPayments = await prisma.payment.findMany({
    where: { paymentStatus: "completed" },
    select: { id: true },
    take: 5,
  });
  let refundCount = 0;
  for (const pay of completedPayments.slice(0, 2)) {
    const existing = await prisma.refundLog.findFirst({
      where: { paymentId: pay.id },
    });
    if (!existing) {
      await prisma.refundLog.create({
        data: {
          paymentId: pay.id,
          refundAmount: 50000,
          refundReason: "수업 취소로 인한 부분 환불",
        },
      });
      refundCount++;
    }
  }
  console.log(`  RefundLog ${refundCount}건`);

  // ----------------------------
  // 14. ClassProduct (수업 상품)
  // ----------------------------
  console.log("\n[14] ClassProduct 생성...");
  let classProductCount = 0;
  for (const cls of allClasses.slice(0, 3)) {
    const existing = await prisma.classProduct.findFirst({
      where: { classId: cls.id },
    });
    if (!existing) {
      await prisma.classProduct.create({
        data: {
          classId: cls.id,
          productName: `${cls.className} 월정액 8회권`,
          price: 160000,
          sessionsPerMonth: 8,
          durationDays: 30,
          feeType: "PER_SESSION",
          billingTiming: "PREPAID",
          isActive: true,
        },
      });
      classProductCount++;
    }
  }
  console.log(`  ClassProduct ${classProductCount}건`);

  // ----------------------------
  // 15. Enrollment (수강신청)
  // ----------------------------
  console.log("\n[15] Enrollment 생성...");
  let enrollCount = 0;
  const childUsers = allChildren.slice(0, 5);
  const parentUsers = allParents.slice(0, 5);
  const expiresAt72h = new Date(Date.now() + 72 * 60 * 60 * 1000);

  for (let i = 0; i < Math.min(childUsers.length, allClasses.length); i++) {
    const child = childUsers[i];
    const cls = allClasses[i % allClasses.length];
    const parent = parentUsers[i % parentUsers.length];
    const existing = await prisma.enrollment.findFirst({
      where: { childId: child.id, classId: cls.id },
    });
    if (!existing) {
      await prisma.enrollment.create({
        data: {
          childId: child.id,
          classId: cls.id,
          requestedBy: parent.id,
          requestType: "parent_direct",
          status: "paid",
          approvedBy: parent.id,
          approvedAt: new Date(),
          paidAt: new Date(),
          expiresAt: expiresAt72h,
        },
      });
      enrollCount++;
    }
  }
  console.log(`  Enrollment ${enrollCount}건`);

  // ----------------------------
  // 16. AttendanceQR (QR 출석 코드)
  // ----------------------------
  console.log("\n[16] AttendanceQR 생성...");
  const recentScheds = await prisma.classSchedule.findMany({
    where: { isCancelled: false },
    take: 5,
    orderBy: { scheduledDate: "desc" },
    select: { id: true },
  });
  let qrCount = 0;
  const coach1Id = allCoaches[0]?.id;
  for (const sched of recentScheds) {
    const qrData = `QR-${sched.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = await prisma.attendanceQR.findUnique({
      where: { qrData },
    });
    if (!existing && coach1Id) {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await prisma.attendanceQR.create({
        data: {
          scheduleId: sched.id,
          generatedBy: coach1Id,
          qrData,
          expiresAt,
        },
      });
      qrCount++;
    }
  }
  console.log(`  AttendanceQR ${qrCount}건`);

  // ----------------------------
  // 17. ClassRsvp (RSVP 참석/불참)
  // ----------------------------
  console.log("\n[17] ClassRsvp 생성...");
  let rsvpCount = 0;
  for (const sched of recentScheds.slice(0, 3)) {
    for (const parent of allParents.slice(0, 5)) {
      try {
        // Prisma upsert 는 nullable unique key(childId=null) 매칭 불가 →
        // findFirst + 조건부 create 패턴으로 멱등성 확보.
        // PostgreSQL 은 unique 제약에서 NULL 을 distinct 로 취급하므로
        // (scheduleId, userId, NULL) 조합 중복 INSERT 가 가능 → 사전 조회 필수.
        const existing = await prisma.classRsvp.findFirst({
          where: {
            scheduleId: sched.id,
            userId: parent.id,
            childId: null,
          },
          select: { id: true },
        });
        if (!existing) {
          await prisma.classRsvp.create({
            data: {
              scheduleId: sched.id,
              userId: parent.id,
              status: Math.random() > 0.3 ? "ATTENDING" : "DECLINED",
              respondedAt: new Date(),
            },
          });
          rsvpCount++;
        }
      } catch {
        // 동시 실행 race / 기타 INSERT 실패 흡수
      }
    }
  }
  console.log(`  ClassRsvp ${rsvpCount}건`);

  // ----------------------------
  // 18. Notification (알림)
  // ----------------------------
  console.log("\n[18] Notification 생성...");
  const notifTargets = [...allParents.slice(0, 5), ...allCoaches.slice(0, 3)];
  let notifCount = 0;
  const notifDefs = [
    {
      type: "payment_success",
      title: "결제가 완료되었습니다",
      message: "150,000원 결제가 정상 처리되었습니다.",
    },
    {
      type: "membership_approved",
      title: "클럽 가입이 승인되었습니다",
      message: "TEAMPLUS Hockey Club 가입이 승인되었습니다.",
    },
    {
      type: "class_reminder",
      title: "내일 수업 알림",
      message: "내일 오전 8시 수업이 있습니다. 준비물을 확인하세요.",
    },
    {
      type: "attendance_check",
      title: "출석이 기록되었습니다",
      message: "자녀의 출석이 확인되었습니다.",
    },
    {
      type: "notice_posted",
      title: "새 공지사항",
      message: "클럽에서 새 공지사항을 등록했습니다.",
    },
  ];
  for (const user of notifTargets) {
    for (const def of notifDefs.slice(0, 3)) {
      const existing = await prisma.notification.findFirst({
        where: { userId: user.id, notificationType: def.type },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: user.id,
            notificationType: def.type,
            title: def.title,
            message: def.message,
            isRead: Math.random() > 0.5,
          },
        });
        notifCount++;
      }
    }
  }
  console.log(`  Notification ${notifCount}건`);

  // ----------------------------
  // 19. SystemNotice (공지사항)
  // ----------------------------
  console.log("\n[19] SystemNotice 생성...");
  const adminUser2 = await prisma.user.findFirst({
    where: { userType: "ADMIN" },
  });
  const noticeDefs = [
    {
      title: "2026 봄 시즌 일정 안내",
      content: "봄 시즌 수업 일정이 확정되었습니다. 확인 부탁드립니다.",
      targetType: "all",
      pinned: true,
    },
    {
      title: "아이스하키 장비 점검의 날",
      content: "매월 첫째 주 토요일은 장비 점검의 날입니다.",
      targetType: "parent",
      pinned: false,
    },
    {
      title: "코치 교육 워크숍 참가 안내",
      content: "4월 코치 교육 워크숍이 진행됩니다.",
      targetType: "coach",
      pinned: false,
    },
    {
      title: "U12 대회 참가 신청 마감 임박",
      content: "U12 대회 신청 마감이 이번 주 금요일입니다.",
      targetType: "all",
      pinned: false,
    },
    {
      title: "앱 업데이트 안내 v2.1",
      content: "새로운 기능이 추가되었습니다. 앱을 업데이트해주세요.",
      targetType: "all",
      pinned: false,
    },
  ];
  let noticeCount = 0;
  for (const nd of noticeDefs) {
    const existing = await prisma.systemNotice.findFirst({
      where: { title: nd.title },
    });
    if (!existing) {
      await prisma.systemNotice.create({
        data: {
          title: nd.title,
          content: nd.content,
          targetType: nd.targetType,
          pinned: nd.pinned,
          isActive: true,
          priority: nd.pinned ? 10 : 0,
          createdBy: adminUser2?.id,
        },
      });
      noticeCount++;
    }
  }
  console.log(`  SystemNotice ${noticeCount}건`);

  // ----------------------------
  // 20. ChatRoom + ChatRoomMember + ChatMessage
  // ----------------------------
  console.log("\n[20] ChatRoom / ChatRoomMember / ChatMessage 생성...");
  let chatRoomCount = 0;
  let chatMsgCount = 0;

  // 수업 채팅방 (CLASS 타입)
  for (const cls of allClasses.slice(0, 2)) {
    const existing = await prisma.chatRoom.findFirst({
      where: { classId: cls.id, type: "CLASS" },
    });
    let chatRoom = existing;
    if (!chatRoom) {
      chatRoom = await prisma.chatRoom.create({
        data: {
          name: `${cls.className} 채팅방`,
          type: "CLASS",
          classId: cls.id,
          clubId: club.id,
          isActive: true,
        },
      });
      chatRoomCount++;
    }

    // 멤버 추가 (코치 + 학부모 3명)
    const roomMembers = [
      coach1Id,
      ...allParents.slice(0, 3).map((p) => p.id),
    ].filter(Boolean) as string[];
    for (const uid of roomMembers) {
      const mExist = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId: chatRoom.id, userId: uid } },
      });
      if (!mExist) {
        await prisma.chatRoomMember.create({
          data: {
            roomId: chatRoom.id,
            userId: uid,
            role: uid === coach1Id ? "admin" : "member",
          },
        });
      }
    }

    // 메시지 5건
    const messages = [
      "안녕하세요! 내일 수업 일정 확인 부탁드립니다.",
      "네, 확인했습니다. 내일 오전 8시에 뵙겠습니다.",
      "장비 꼭 챙겨오세요 - 헬멧, 스케이트, 글러브",
      "알겠습니다 코치님!",
      "오늘 수업 수고하셨습니다. 아이들이 정말 열심히 했네요.",
    ];
    const senders = [
      coach1Id,
      allParents[0]?.id,
      coach1Id,
      allParents[1]?.id,
      allParents[2]?.id,
    ].filter(Boolean) as string[];
    for (let mi = 0; mi < messages.length && mi < senders.length; mi++) {
      await prisma.chatMessage.create({
        data: {
          roomId: chatRoom.id,
          senderId: senders[mi],
          type: "TEXT",
          content: messages[mi],
          createdAt: new Date(
            Date.now() - (messages.length - mi) * 10 * 60 * 1000,
          ),
        },
      });
      chatMsgCount++;
    }
  }

  // 1:1 상담 채팅방
  if (allParents[0] && coach1Id) {
    const existDirect = await prisma.chatRoom.findFirst({
      where: { type: "DIRECT", clubId: club.id },
    });
    if (!existDirect) {
      const directRoom = await prisma.chatRoom.create({
        data: {
          type: "DIRECT",
          clubId: club.id,
          isActive: true,
          lastMessage: "수업 진행 상황에 대해 문의드립니다.",
          lastMessageAt: new Date(),
        },
      });
      chatRoomCount++;
      await prisma.chatRoomMember.createMany({
        data: [
          { roomId: directRoom.id, userId: allParents[0].id, role: "member" },
          { roomId: directRoom.id, userId: coach1Id, role: "member" },
        ],
        skipDuplicates: true,
      });
      await prisma.chatMessage.create({
        data: {
          roomId: directRoom.id,
          senderId: allParents[0].id,
          receiverId: coach1Id,
          type: "TEXT",
          content: "수업 진행 상황에 대해 문의드립니다.",
        },
      });
      chatMsgCount++;
    }
  }

  console.log(`  ChatRoom ${chatRoomCount}건 / ChatMessage ${chatMsgCount}건`);

  // ----------------------------
  // 21. SkillEvaluation + SkillDimension (기술 평가)
  // ----------------------------
  console.log("\n[21] SkillEvaluation 생성...");
  let skillEvalCount = 0;
  for (const sm of allStudentMembers.slice(0, 5)) {
    const existing = await prisma.skillEvaluation.findFirst({
      where: { memberId: sm.id },
    });
    if (!existing && coach1Id) {
      const ev = await prisma.skillEvaluation.create({
        data: {
          memberId: sm.id,
          coachId: coach1Id,
          evaluationDate: new Date(),
          overallScore: 60 + Math.floor(Math.random() * 35),
          coachComment: "전반적으로 스케이팅 기술이 향상되고 있습니다.",
          improvementAreas: "퍽핸들링과 패싱 능력 강화 필요",
          status: "published",
        },
      });
      const dims = ["스케이팅", "퍽핸들링", "패싱", "슛팅", "게임운영"];
      for (const dim of dims) {
        await prisma.skillDimension.create({
          data: {
            evaluationId: ev.id,
            dimensionName: dim,
            score: 50 + Math.floor(Math.random() * 40),
            comment: `${dim} 훈련 지속 필요`,
          },
        });
      }
      skillEvalCount++;
    }
  }
  console.log(`  SkillEvaluation ${skillEvalCount}건 (차원 포함)`);

  // ----------------------------
  // 22. Badge + ChildBadge (뱃지)
  // ----------------------------
  console.log("\n[22] Badge / ChildBadge 생성...");
  const badgeDefs = [
    {
      name: "출석왕",
      description: "한 달 개근",
      category: "attendance",
      rarity: "common",
    },
    {
      name: "스케이팅 마스터",
      description: "스케이팅 평가 90점 이상",
      category: "skill",
      rarity: "rare",
    },
    {
      name: "팀플레이어",
      description: "팀워크 우수",
      category: "achievement",
      rarity: "uncommon",
    },
    {
      name: "첫 골",
      description: "첫 경기 득점",
      category: "special",
      rarity: "uncommon",
    },
    {
      name: "10회 연속 출석",
      description: "10회 연속 출석 달성",
      category: "attendance",
      rarity: "rare",
    },
  ];
  let badgeCount = 0;
  const createdBadges: Array<{ id: string }> = [];
  for (const bd of badgeDefs) {
    const existing = await prisma.badge.findFirst({ where: { name: bd.name } });
    if (existing) {
      createdBadges.push(existing);
    } else {
      const b = await prisma.badge.create({ data: { ...bd, isActive: true } });
      createdBadges.push(b);
      badgeCount++;
    }
  }
  let childBadgeCount = 0;
  for (const child of allChildren.slice(0, 5)) {
    for (const badge of createdBadges.slice(0, 2)) {
      const existing = await prisma.childBadge.findUnique({
        where: { childId_badgeId: { childId: child.id, badgeId: badge.id } },
      });
      if (!existing) {
        await prisma.childBadge.create({
          data: {
            childId: child.id,
            badgeId: badge.id,
            earnedReason: "시드 데이터",
            isDisplayed: true,
          },
        });
        childBadgeCount++;
      }
    }
  }
  console.log(`  Badge ${badgeCount}건 / ChildBadge ${childBadgeCount}건`);

  // ----------------------------
  // 23. ClubPost + ClubPostComment + ClubPostLike (게시글)
  // ----------------------------
  console.log("\n[23] ClubPost / Comment / Like 생성...");
  const postDefs = [
    {
      title: "4월 수업 일정 변경 안내",
      content: "4월 마지막 주 수업은 링크장 보수 관계로 일정이 변경됩니다.",
      postType: "announcement",
      isPinned: true,
    },
    {
      title: "U10 팀 첫 경기 결과",
      content: "지난 주말 U10 팀이 첫 친선경기에서 좋은 활약을 보여줬습니다!",
      postType: "tournament",
      isPinned: false,
    },
    {
      title: "스케이트 날갈이 공지",
      content: "매주 목요일 훈련 전 스케이트 날갈이 서비스를 제공합니다.",
      postType: "announcement",
      isPinned: false,
    },
  ];
  let postCount = 0;
  const createdPosts: Array<{ id: string }> = [];
  const directorUser = await prisma.user.findFirst({
    where: { userType: "DIRECTOR" },
  });
  for (const pd of postDefs) {
    const existing = await prisma.clubPost.findFirst({
      where: { title: pd.title, clubId: club.id },
    });
    if (existing) {
      createdPosts.push(existing);
    } else {
      const post = await prisma.clubPost.create({
        data: {
          clubId: club.id,
          authorId: directorUser?.id ?? coach1Id ?? allCoaches[0].id,
          title: pd.title,
          content: pd.content,
          postType: pd.postType,
          isPinned: pd.isPinned,
          isActive: true,
        },
      });
      createdPosts.push(post);
      postCount++;
    }
  }
  let commentCount = 0;
  let likeCount = 0;
  for (const post of createdPosts.slice(0, 2)) {
    for (const parent of allParents.slice(0, 3)) {
      const existing = await prisma.clubPostComment.findFirst({
        where: { postId: post.id, authorId: parent.id },
      });
      if (!existing) {
        await prisma.clubPostComment.create({
          data: {
            postId: post.id,
            authorId: parent.id,
            content: "감사합니다! 확인했습니다.",
          },
        });
        commentCount++;
      }
      const likeExisting = await prisma.clubPostLike.findUnique({
        where: { postId_userId: { postId: post.id, userId: parent.id } },
      });
      if (!likeExisting) {
        await prisma.clubPostLike.create({
          data: { postId: post.id, userId: parent.id },
        });
        likeCount++;
      }
    }
  }
  console.log(
    `  ClubPost ${postCount}건 / Comment ${commentCount}건 / Like ${likeCount}건`,
  );

  // ----------------------------
  // 24. Venue (시설) + VenueTimeSlot
  // ----------------------------
  console.log("\n[24] Venue / VenueTimeSlot 생성...");
  let venueCreated = false;
  let venueId: string;
  const existVenue = await prisma.venue.findFirst({
    where: { clubId: club.id },
  });
  if (existVenue) {
    venueId = existVenue.id;
  } else {
    const venue = await prisma.venue.create({
      data: {
        clubId: club.id,
        name: "TEAMPLUS 아이스링크",
        address: "서울특별시 송파구 올림픽로 240",
        city: "서울",
        capacity: 500,
        rinkSize: "NHL",
        status: "active",
        hourlyRate: 200000,
        description: "TEAMPLUS 전용 아이스하키 링크장",
      },
    });
    venueId = venue.id;
    venueCreated = true;
  }
  let slotCount = 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const timeSlots = [
    { start: "07:00", end: "08:00" },
    { start: "08:00", end: "09:00" },
    { start: "09:00", end: "10:00" },
    { start: "18:00", end: "19:00" },
    { start: "19:00", end: "20:00" },
  ];
  for (const slot of timeSlots) {
    const existing = await prisma.venueTimeSlot.findUnique({
      where: {
        venueId_date_startTime: {
          venueId,
          date: tomorrow,
          startTime: slot.start,
        },
      },
    });
    if (!existing) {
      await prisma.venueTimeSlot.create({
        data: {
          venueId,
          date: tomorrow,
          startTime: slot.start,
          endTime: slot.end,
          slotType: "open",
          status: "available",
          price: 200000,
        },
      });
      slotCount++;
    }
  }
  console.log(
    `  Venue ${venueCreated ? "1건 생성" : "기존 재사용"} / VenueTimeSlot ${slotCount}건`,
  );

  // ----------------------------
  // 25. Settlement + SettlementTransaction (정산)
  // ----------------------------
  console.log("\n[25] Settlement / SettlementTransaction 생성...");
  const settlementMonth = "2026-03";
  let settlementCount = 0;
  let stxCount = 0;
  const existSettlement = await prisma.settlement.findUnique({
    where: { clubId_settlementMonth: { clubId: club.id, settlementMonth } },
  });
  let settlement = existSettlement;
  if (!settlement) {
    settlement = await prisma.settlement.create({
      data: {
        clubId: club.id,
        settlementMonth,
        totalRevenue: 4500000,
        platformFee: 135000,
        paymentFee: 67500,
        refundAmount: 100000,
        netAmount: 4197500,
        status: "completed",
        bankName: "국민은행",
        bankAccount: "123-456-789012",
        accountHolder: "TEAMPLUS Hockey Club",
        completedAt: new Date("2026-04-05"),
      },
    });
    settlementCount++;
  }
  // SettlementTransaction 추가
  for (const pay of completedPayments.slice(0, 3)) {
    const existing = await prisma.settlementTransaction.findFirst({
      where: { settlementId: settlement.id, paymentId: pay.id },
    });
    if (!existing) {
      await prisma.settlementTransaction.create({
        data: {
          settlementId: settlement.id,
          paymentId: pay.id,
          transactionType: "class_payment",
          amount: 150000,
          description: "수업 월정액 결제",
          transactionDate: new Date("2026-03-15"),
        },
      });
      stxCount++;
    }
  }
  console.log(
    `  Settlement ${settlementCount}건 / SettlementTransaction ${stxCount}건`,
  );

  // ----------------------------
  // 26. StaffCareer (코치 경력)
  // ----------------------------
  console.log("\n[26] StaffCareer 생성...");
  let staffCareerCount = 0;
  const careerDefs = [
    {
      role: "head_coach",
      org: "강남 아이스하키 클럽",
      start: new Date("2020-01-01"),
      end: new Date("2023-12-31"),
      isCurrent: false,
    },
    {
      role: "assistant_coach",
      org: "TEAMPLUS Hockey Club",
      start: new Date("2024-01-01"),
      end: null,
      isCurrent: true,
    },
  ];
  for (const coach of allCoaches.slice(0, 3)) {
    for (const cd of careerDefs) {
      const existing = await prisma.staffCareer.findFirst({
        where: { userId: coach.id, role: cd.role, organizationName: cd.org },
      });
      if (!existing) {
        await prisma.staffCareer.create({
          data: {
            userId: coach.id,
            role: cd.role,
            organizationName: cd.org,
            startDate: cd.start,
            endDate: cd.end,
            isCurrent: cd.isCurrent,
            description: "아이스하키 지도 및 선수 육성",
          },
        });
        staffCareerCount++;
      }
    }
  }
  console.log(`  StaffCareer ${staffCareerCount}건`);

  // ----------------------------
  // 27. PlayerCareer (선수 경력)
  // ----------------------------
  console.log("\n[27] PlayerCareer 생성...");
  let playerCareerCount = 0;
  for (const sm of allStudentMembers.slice(0, 5)) {
    const existing = await prisma.playerCareer.findFirst({
      where: { memberId: sm.id },
    });
    if (!existing) {
      await prisma.playerCareer.create({
        data: {
          memberId: sm.id,
          teamName: "TEAMPLUS U10",
          position: "forward",
          jerseyNumber: 10 + playerCareerCount,
          startDate: new Date("2023-09-01"),
          isCurrent: true,
          description: "포워드 포지션으로 활동 중",
        },
      });
      playerCareerCount++;
    }
  }
  console.log(`  PlayerCareer ${playerCareerCount}건`);

  // ----------------------------
  // 28. PlayerAward + TeamAward (수상)
  // ----------------------------
  console.log("\n[28] PlayerAward / TeamAward 생성...");
  let playerAwardCount = 0;
  let teamAwardCount = 0;
  for (const sm of allStudentMembers.slice(0, 3)) {
    const existing = await prisma.playerAward.findFirst({
      where: { memberId: sm.id },
    });
    if (!existing) {
      await prisma.playerAward.create({
        data: {
          memberId: sm.id,
          awardName: "이달의 선수",
          awardType: "mvp",
          awardedAt: new Date(),
          season: "2025-2026",
          awardedBy: "TEAMPLUS Hockey Club",
          isDisplayed: true,
        },
      });
      playerAwardCount++;
    }
  }
  for (const team of allTeams.slice(0, 2)) {
    const existing = await prisma.teamAward.findFirst({
      where: { teamId: team.id },
    });
    if (!existing) {
      await prisma.teamAward.create({
        data: {
          teamId: team.id,
          awardName: "2025 친선대회 우승",
          awardType: "champion",
          awardedAt: new Date("2025-12-15"),
          season: "2025-2026",
          awardedBy: "대한아이스하키협회",
        },
      });
      teamAwardCount++;
    }
  }
  console.log(
    `  PlayerAward ${playerAwardCount}건 / TeamAward ${teamAwardCount}건`,
  );

  // ----------------------------
  // 29. PlayerClassHistory (수업 이력)
  // ----------------------------
  console.log("\n[29] PlayerClassHistory 생성...");
  let historyCount = 0;
  for (
    let i = 0;
    i < Math.min(allStudentMembers.length, allClasses.length * 2);
    i++
  ) {
    const sm = allStudentMembers[i % allStudentMembers.length];
    const cls = allClasses[i % allClasses.length];
    const existing = await prisma.playerClassHistory.findUnique({
      where: { memberId_classId: { memberId: sm.id, classId: cls.id } },
    });
    if (!existing && i < 8) {
      await prisma.playerClassHistory.create({
        data: {
          memberId: sm.id,
          classId: cls.id,
          startDate: new Date("2026-01-01"),
          totalSessions: 8,
          attendedSessions: 6,
          attendanceRate: 75,
          status: "active",
        },
      });
      historyCount++;
    }
  }
  console.log(`  PlayerClassHistory ${historyCount}건`);

  // ----------------------------
  // 30. MemberLevel + PointTransaction (레벨·포인트)
  // ----------------------------
  console.log("\n[30] MemberLevel / PointTransaction 생성...");
  let levelCount = 0;
  let pointCount = 0;
  for (const parent of allParents.slice(0, 5)) {
    const existing = await prisma.memberLevel.findUnique({
      where: { userId: parent.id },
    });
    if (!existing) {
      await prisma.memberLevel.create({
        data: {
          userId: parent.id,
          level: 2,
          levelName: "Silver",
          totalPoints: 1500,
          currentPoints: 800,
          pointsToNext: 500,
          benefits: { discount: "5%", priority: true },
        },
      });
      levelCount++;
    }
    const ptExist = await prisma.pointTransaction.findFirst({
      where: { userId: parent.id },
    });
    if (!ptExist) {
      await prisma.pointTransaction.create({
        data: {
          userId: parent.id,
          type: "EARN",
          amount: 500,
          balance: 500,
          description: "수업 결제 포인트 적립",
          referenceType: "payment",
        },
      });
      pointCount++;
    }
  }
  console.log(
    `  MemberLevel ${levelCount}건 / PointTransaction ${pointCount}건`,
  );

  // ----------------------------
  // 31. ShopCategory + ShopProduct + ShopOrder + ShopOrderItem
  // ----------------------------
  console.log("\n[31] Shop 데이터 생성...");
  let shopCatCount = 0;
  let shopProdCount = 0;
  let shopOrderCount = 0;

  const existCat = await prisma.shopCategory.findFirst({
    where: { code: "ICE-HOCKEY" },
  });
  let catId: string;
  if (existCat) {
    catId = existCat.id;
  } else {
    const cat = await prisma.shopCategory.create({
      data: {
        name: "아이스하키",
        code: "ICE-HOCKEY",
        level: 1,
        path: "아이스하키",
        displayOrder: 1,
        isActive: true,
      },
    });
    catId = cat.id;
    shopCatCount++;
  }

  const productDefs = [
    {
      name: "CCM 아이스하키 헬멧 S",
      code: "CCM-HELMET-S",
      price: 85000,
      brand: "CCM",
      stock: 20,
    },
    {
      name: "Bauer 스케이트 클리너",
      code: "BAUER-CLEANER",
      price: 15000,
      brand: "Bauer",
      stock: 50,
    },
    {
      name: "TEAMPLUS 팀 져지 U10",
      code: "JERSEY-U10",
      price: 45000,
      brand: "TEAMPLUS",
      stock: 30,
    },
    {
      name: "아이스하키 퍽 (10개입)",
      code: "PUCK-10PCS",
      price: 18000,
      brand: "JOFA",
      stock: 100,
    },
    {
      name: "스케이트 가방 Large",
      code: "SKATE-BAG-L",
      price: 35000,
      brand: "CCM",
      stock: 15,
    },
  ];
  const createdProducts: Array<{ id: string; name: string; price: number }> =
    [];
  for (const pd of productDefs) {
    const existing = await prisma.shopProduct.findUnique({
      where: { code: pd.code },
    });
    if (existing) {
      createdProducts.push({
        id: existing.id,
        name: existing.name,
        price: existing.price,
      });
    } else {
      const p = await prisma.shopProduct.create({
        data: {
          categoryId: catId,
          name: pd.name,
          code: pd.code,
          price: pd.price,
          brand: pd.brand,
          stock: pd.stock,
          isActive: true,
          isNew: true,
        },
      });
      createdProducts.push({ id: p.id, name: p.name, price: p.price });
      shopProdCount++;
    }
  }

  // ShopOrder + ShopOrderItem
  for (const parent of allParents.slice(0, 3)) {
    const orderNum = `SHOP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const prod = createdProducts[shopOrderCount % createdProducts.length];
    const existOrder = await prisma.shopOrder.findFirst({
      where: { userId: parent.id },
    });
    if (!existOrder && prod) {
      const order = await prisma.shopOrder.create({
        data: {
          orderNumber: orderNum,
          userId: parent.id,
          orderStatus: "delivered",
          totalAmount: prod.price,
          paymentAmount: prod.price,
          paymentMethod: "card",
          paymentStatus: "completed",
          recipientName: "수령인",
          recipientPhone: "010-0000-0001",
          zipCode: "06300",
          address: "서울시 강남구 테헤란로 123",
          deliveredAt: new Date(),
          shippedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      });
      await prisma.shopOrderItem.create({
        data: {
          orderId: order.id,
          productId: prod.id,
          productName: prod.name,
          quantity: 1,
          unitPrice: prod.price,
          totalPrice: prod.price,
        },
      });
      shopOrderCount++;
    }
  }
  console.log(
    `  ShopCategory ${shopCatCount}건 / ShopProduct ${shopProdCount}건 / ShopOrder ${shopOrderCount}건`,
  );

  // ----------------------------
  // 32. Coupon + UserCoupon
  // ----------------------------
  console.log("\n[32] Coupon / UserCoupon 생성...");
  let couponCount = 0;
  let userCouponCount = 0;
  const existCoupon = await prisma.coupon.findUnique({
    where: { code: "WELCOME2026" },
  });
  let coupon = existCoupon;
  if (!coupon) {
    coupon = await prisma.coupon.create({
      data: {
        code: "WELCOME2026",
        name: "신규가입 5,000원 할인",
        discountType: "FIXED",
        discountValue: 5000,
        minOrderAmount: 30000,
        usageLimit: 100,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        isActive: true,
        targetType: "ALL",
        targetIds: [],
      },
    });
    couponCount++;
  }
  for (const parent of allParents.slice(0, 5)) {
    const existing = await prisma.userCoupon.findUnique({
      where: { userId_couponId: { userId: parent.id, couponId: coupon.id } },
    });
    if (!existing) {
      await prisma.userCoupon.create({
        data: { userId: parent.id, couponId: coupon.id, isUsed: false },
      });
      userCouponCount++;
    }
  }
  console.log(`  Coupon ${couponCount}건 / UserCoupon ${userCouponCount}건`);

  // ----------------------------
  // 33. Tournament + HockeyMatch (대회·경기)
  // ----------------------------
  console.log("\n[33] Tournament / HockeyMatch 생성...");
  let tournamentCount = 0;
  let matchCount = 0;

  const existRink = await prisma.rink.findFirst();
  let rinkId: string;
  if (existRink) {
    rinkId = existRink.id;
  } else {
    const rink = await prisma.rink.create({
      data: {
        name: "잠실 아이스아레나",
        location: "서울특별시 송파구",
        phone: "02-000-0000",
      },
    });
    rinkId = rink.id;
  }

  const existTournament = await prisma.tournament.findFirst({
    where: { clubId: club.id },
  });
  let tournament = existTournament;
  if (!tournament) {
    tournament = await prisma.tournament.create({
      data: {
        name: "2026 TEAMPLUS 봄 친선대회",
        description: "U10/U12 연령대 봄 친선대회",
        clubId: club.id,
        rinkId,
        startDate: new Date("2026-05-10"),
        endDate: new Date("2026-05-11"),
        status: "scheduled",
        feeType: "PER_GAME",
        feePerGame: 5000,
        maxParticipants: 40,
        registrationDeadline: new Date("2026-04-30"),
      },
    });
    tournamentCount++;
  }

  const existMatch = await prisma.hockeyMatch.findFirst({
    where: { tournamentId: tournament.id },
  });
  if (!existMatch && allTeams.length >= 2) {
    await prisma.hockeyMatch.create({
      data: {
        tournamentId: tournament.id,
        rinkId,
        homeTeamId: allTeams[0].id,
        awayTeamId: allTeams[1].id,
        homeClubId: club.id,
        awayClubId: club.id,
        scheduledAt: new Date("2026-05-10T09:00:00"),
        homeScore: 0,
        awayScore: 0,
        status: "scheduled",
        round: "group",
      },
    });
    matchCount++;
  }
  console.log(
    `  Tournament ${tournamentCount}건 / HockeyMatch ${matchCount}건`,
  );

  // ----------------------------
  // 34. DailyMetrics (일간 지표)
  // ----------------------------
  console.log("\n[34] DailyMetrics 생성...");
  let metricsCount = 0;
  for (let d = 6; d >= 0; d--) {
    const metricDate = new Date();
    metricDate.setDate(metricDate.getDate() - d);
    const dateOnly = new Date(metricDate.toISOString().slice(0, 10));
    const existing = await prisma.dailyMetrics.findUnique({
      where: { clubId_metricDate: { clubId: club.id, metricDate: dateOnly } },
    });
    if (!existing) {
      await prisma.dailyMetrics.create({
        data: {
          clubId: club.id,
          metricDate: dateOnly,
          activeMembers: 28 + Math.floor(Math.random() * 5),
          newMembers: Math.floor(Math.random() * 3),
          classesHeld: 2 + Math.floor(Math.random() * 3),
          totalAttendees: 15 + Math.floor(Math.random() * 10),
          attendanceRate: 75 + Math.floor(Math.random() * 20),
          totalRevenue: 300000 + Math.floor(Math.random() * 200000),
        },
      });
      metricsCount++;
    }
  }
  console.log(`  DailyMetrics ${metricsCount}건`);

  // ----------------------------
  // 35. TrainingSession + TrainingMetric (훈련 스탯)
  // ----------------------------
  console.log("\n[35] TrainingSession / TrainingMetric 생성...");
  let trainingCount = 0;
  let metricCount2 = 0;
  for (const sm of allStudentMembers.slice(0, 5)) {
    const existing = await prisma.trainingSession.findFirst({
      where: { memberId: sm.id },
    });
    if (!existing && coach1Id) {
      const ts = await prisma.trainingSession.create({
        data: {
          memberId: sm.id,
          clubId: club.id,
          classId: allClasses[0]?.id,
          sessionDate: new Date(),
          durationMin: 60,
          intensityLvl: "medium",
          focusArea: "skating",
          notes: "기본 엣지 워크 훈련",
          recordedBy: coach1Id,
        },
      });
      trainingCount++;
      const metrics = [
        { name: "speed", value: 12.5, unit: "km/h" },
        { name: "accuracy", value: 72.0, unit: "%" },
      ];
      for (const m of metrics) {
        await prisma.trainingMetric.create({
          data: {
            sessionId: ts.id,
            metricName: m.name,
            metricValue: m.value,
            unit: m.unit,
          },
        });
        metricCount2++;
      }
    }
  }
  console.log(
    `  TrainingSession ${trainingCount}건 / TrainingMetric ${metricCount2}건`,
  );

  // ----------------------------
  // 36. ClassDiary (수업 일지)
  // ----------------------------
  console.log("\n[36] ClassDiary 생성...");
  let diaryCount = 0;
  for (const cls of allClasses.slice(0, 3)) {
    const existing = await prisma.classDiary.findFirst({
      where: { classId: cls.id },
    });
    if (!existing && coach1Id) {
      await prisma.classDiary.create({
        data: {
          classId: cls.id,
          clubId: club.id,
          coachId: coach1Id,
          sessionDate: new Date(),
          mainFocus: "스케이팅 기본기",
          drillDesc: "포워드 스케이팅, 후진 스케이팅, 크로스오버 연습",
          intensityLevel: "medium",
          presentCount: 8,
          absentCount: 2,
          totalCount: 10,
          coachNotes:
            "전반적으로 집중력이 향상되고 있음. 후진 스케이팅 지속 연습 필요.",
          isPublished: true,
        },
      });
      diaryCount++;
    }
  }
  console.log(`  ClassDiary ${diaryCount}건`);

  // ----------------------------
  // 37. WorkSchedule (코치 근무 일정)
  // ----------------------------
  console.log("\n[37] WorkSchedule 생성...");
  let workSchedCount = 0;
  for (const coach of allCoaches.slice(0, 3)) {
    for (let d = 0; d < 5; d++) {
      const schedDate = new Date();
      schedDate.setDate(schedDate.getDate() + d);
      const existing = await prisma.workSchedule.findFirst({
        where: { coachId: coach.id, scheduleDate: schedDate },
      });
      if (!existing) {
        await prisma.workSchedule.create({
          data: {
            coachId: coach.id,
            clubId: club.id,
            classId: allClasses[0]?.id,
            scheduleDate: schedDate,
            startTime: "08:00",
            endTime: "10:00",
            title: "오전 수업",
            location: "TEAMPLUS 아이스링크",
            status: "scheduled",
          },
        });
        workSchedCount++;
      }
    }
  }
  console.log(`  WorkSchedule ${workSchedCount}건`);

  // ----------------------------
  // 38. StickerBoard + StickerSlot (칭찬 스티커)
  // ----------------------------
  console.log("\n[38] StickerBoard / StickerSlot 생성...");
  let stickerBoardCount = 0;
  let stickerSlotCount = 0;
  for (const child of allChildren.slice(0, 4)) {
    const existing = await prisma.stickerBoard.findFirst({
      where: { childId: child.id, clubId: club.id },
    });
    if (!existing) {
      const board = await prisma.stickerBoard.create({
        data: {
          childId: child.id,
          clubId: club.id,
          title: "이달의 칭찬 스티커판",
          goalCount: 10,
          rewardName: "아이스크림 쿠폰",
          isActive: true,
        },
      });
      stickerBoardCount++;
      // 슬롯 10개 생성, 5개 획득
      for (let s = 1; s <= 10; s++) {
        await prisma.stickerSlot.create({
          data: {
            boardId: board.id,
            slotNumber: s,
            isEarned: s <= 5,
            stickerType: "star",
            earnedAt: s <= 5 ? new Date() : undefined,
            earnedReason: s <= 5 ? "출석 완료" : undefined,
            awardedBy: s <= 5 ? coach1Id : undefined,
          },
        });
        stickerSlotCount++;
      }
    }
  }
  console.log(
    `  StickerBoard ${stickerBoardCount}건 / StickerSlot ${stickerSlotCount}건`,
  );

  // ----------------------------
  // 39. EquipmentChecklist + ChecklistItem (준비물)
  // ----------------------------
  console.log("\n[39] EquipmentChecklist / ChecklistItem 생성...");
  let checklistCount = 0;
  let checklistItemCount = 0;
  for (const child of allChildren.slice(0, 3)) {
    const existing = await prisma.equipmentChecklist.findFirst({
      where: { userId: child.id },
    });
    if (!existing) {
      const checklist = await prisma.equipmentChecklist.create({
        data: {
          userId: child.id,
          classId: allClasses[0]?.id,
          clubId: club.id,
          title: "수업 준비물 체크리스트",
          totalItems: 5,
          isCompleted: false,
        },
      });
      checklistCount++;
      const items = ["헬멧", "스케이트", "글러브", "스틱", "유니폼"];
      for (let ii = 0; ii < items.length; ii++) {
        await prisma.checklistItem.create({
          data: {
            checklistId: checklist.id,
            itemName: items[ii],
            isChecked: ii < 3,
            checkedAt: ii < 3 ? new Date() : undefined,
            sortOrder: ii,
          },
        });
        checklistItemCount++;
      }
    }
  }
  console.log(
    `  EquipmentChecklist ${checklistCount}건 / ChecklistItem ${checklistItemCount}건`,
  );

  // ----------------------------
  // 40. UserNotificationPreference (알림 설정)
  // ----------------------------
  console.log("\n[40] UserNotificationPreference 생성...");
  let prefCount = 0;
  const prefTargets = [...allParents.slice(0, 5), ...allCoaches.slice(0, 3)];
  for (const user of prefTargets) {
    const existing = await prisma.userNotificationPreference.findUnique({
      where: { userId: user.id },
    });
    if (!existing) {
      await prisma.userNotificationPreference.create({
        data: {
          userId: user.id,
          pushEnabled: true,
          smsEnabled: true,
          emailEnabled: false,
          soundEnabled: true,
          vibrationEnabled: true,
          categories: {
            class: true,
            payment: true,
            notice: true,
            system: true,
          },
        },
      });
      prefCount++;
    }
  }
  console.log(`  UserNotificationPreference ${prefCount}건`);

  // ----------------------------
  // 41. Waitlist (대기자)
  // ----------------------------
  console.log("\n[41] Waitlist 생성...");
  let waitlistCount = 0;
  for (const parent of allParents.slice(5, 8)) {
    const cls = allClasses[0];
    if (!cls) continue;
    const existing = await prisma.waitlist.findFirst({
      where: { classId: cls.id, userId: parent.id },
    });
    if (!existing) {
      await prisma.waitlist.create({
        data: {
          classId: cls.id,
          userId: parent.id,
          position: waitlistCount + 1,
          status: "WAITING",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      waitlistCount++;
    }
  }
  console.log(`  Waitlist ${waitlistCount}건`);

  // ----------------------------
  // 42. Gallery + GalleryPhoto (갤러리)
  // ----------------------------
  console.log("\n[42] Gallery / GalleryPhoto 생성...");
  let galleryCount = 0;
  let photoCount = 0;
  const existGallery = await prisma.gallery.findFirst({
    where: { clubId: club.id },
  });
  if (!existGallery && coach1Id) {
    const gallery = await prisma.gallery.create({
      data: {
        clubId: club.id,
        coachId: coach1Id,
        title: "2026 봄 시즌 훈련 사진",
        description: "봄 시즌 훈련 현장 사진 모음",
        category: "TRAINING",
        visibility: "CLUB_ONLY",
      },
    });
    galleryCount++;
    for (let gi = 1; gi <= 5; gi++) {
      await prisma.galleryPhoto.create({
        data: {
          galleryId: gallery.id,
          uploaderId: coach1Id,
          photoUrl: `https://example.com/photos/training-${gi}.jpg`,
          thumbnailUrl: `https://example.com/photos/thumb-training-${gi}.jpg`,
          caption: `훈련 사진 ${gi}`,
          takenAt: new Date(),
          sortOrder: gi,
        },
      });
      photoCount++;
    }
  }
  console.log(`  Gallery ${galleryCount}건 / GalleryPhoto ${photoCount}건`);

  // ----------------------------
  // 43. AuditLog (감사 로그)
  // ----------------------------
  console.log("\n[43] AuditLog 생성...");
  let auditCount = 0;
  const auditDefs = [
    { action: "LOGIN", resource: "auth" },
    { action: "PAYMENT_COMPLETE", resource: "payment" },
    { action: "MEMBER_APPROVE", resource: "club_member" },
    { action: "CLASS_CREATE", resource: "class" },
    { action: "QR_GENERATE", resource: "attendance_qr" },
  ];
  for (const coach of allCoaches.slice(0, 2)) {
    for (const def of auditDefs.slice(0, 3)) {
      await prisma.auditLog.create({
        data: {
          userId: coach.id,
          action: def.action,
          resource: def.resource,
          ipAddress: "192.168.1.100",
        },
      });
      auditCount++;
    }
  }
  console.log(`  AuditLog ${auditCount}건`);

  // ----------------------------
  // 44. UserDevice (FCM 디바이스)
  // ----------------------------
  console.log("\n[44] UserDevice 생성...");
  let deviceCount = 0;
  for (const parent of allParents.slice(0, 5)) {
    const fcmToken = `fcm-token-${parent.id}-${Date.now()}`;
    const existing = await prisma.userDevice.findFirst({
      where: { userId: parent.id },
    });
    if (!existing) {
      await prisma.userDevice.create({
        data: {
          userId: parent.id,
          fcmToken,
          platform: Math.random() > 0.5 ? "ios" : "android",
          deviceModel: "iPhone 15",
          osVersion: "17.0",
          appVersion: "1.2.0",
          isActive: true,
        },
      });
      deviceCount++;
    }
  }
  console.log(`  UserDevice ${deviceCount}건`);

  // ----------------------------
  // 45. DailyViewLog (조회수 로그)
  // ----------------------------
  console.log("\n[45] DailyViewLog 생성...");
  let viewLogCount = 0;
  const notices = await prisma.systemNotice.findMany({
    take: 3,
    select: { id: true },
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const notice of notices) {
    for (const parent of allParents.slice(0, 3)) {
      try {
        await prisma.dailyViewLog.create({
          data: {
            entityType: "notice",
            entityId: notice.id,
            userId: parent.id,
            viewedDate: today,
          },
        });
        viewLogCount++;
      } catch {
        // unique constraint 중복 스킵
      }
    }
  }
  console.log(`  DailyViewLog ${viewLogCount}건`);

  // ----------------------------
  // 46. AppBanner / AppFaq / AppFeedback / AppVersion
  // ----------------------------
  console.log("\n[46] AppBanner / AppFaq / AppFeedback / AppVersion 생성...");
  let appBannerCount = 0;
  const bannerDefs = [
    {
      title: "신규가입 이벤트",
      imageUrl: "https://example.com/banners/welcome.jpg",
      linkUrl: "/signup",
      targetRole: "all",
      sortOrder: 1,
    },
    {
      title: "봄 시즌 개강 안내",
      imageUrl: "https://example.com/banners/spring.jpg",
      linkUrl: "/classes",
      targetRole: "PARENT",
      sortOrder: 2,
    },
    {
      title: "코치 전용 공지",
      imageUrl: "https://example.com/banners/coach.jpg",
      linkUrl: "/notices",
      targetRole: "COACH",
      sortOrder: 3,
    },
  ];
  for (const b of bannerDefs) {
    const existing = await prisma.appBanner.findFirst({
      where: { title: b.title },
    });
    if (!existing) {
      await prisma.appBanner.create({
        data: {
          title: b.title,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          linkType: "internal",
          targetRole: b.targetRole,
          targetRolesJson: [b.targetRole],
          displayLocationsJson: ["app_home"],
          sortOrder: b.sortOrder,
          isActive: true,
          startAt: new Date("2026-01-01"),
          endAt: new Date("2026-12-31"),
        },
      });
      appBannerCount++;
    }
  }
  let appFaqCount = 0;
  const faqDefs = [
    {
      category: "class",
      question: "수업 결석 시 크레딧은 어떻게 되나요?",
      answer:
        "결석 시 크레딧은 차감되지 않으며, 사전 통보(24시간 전) 시 1회에 한해 보충 수업이 가능합니다.",
    },
    {
      category: "payment",
      question: "환불은 어떻게 신청하나요?",
      answer:
        "앱 내 결제 내역에서 환불 신청이 가능합니다. 수업 시작 7일 전까지 전액 환불됩니다.",
    },
    {
      category: "general",
      question: "아이스하키 장비는 어디서 구매할 수 있나요?",
      answer: "클럽 내 쇼핑몰에서 구매하거나 코치에게 문의하시면 됩니다.",
    },
    {
      category: "club",
      question: "클럽 멤버십 등록 방법은?",
      answer:
        "앱에서 클럽 검색 후 가입 신청을 하시면 코치 승인 후 활동이 가능합니다.",
    },
  ];
  for (let fi = 0; fi < faqDefs.length; fi++) {
    const f = faqDefs[fi];
    const existing = await prisma.appFaq.findFirst({
      where: { question: f.question },
    });
    if (!existing) {
      await prisma.appFaq.create({
        data: {
          category: f.category,
          question: f.question,
          answer: f.answer,
          sortOrder: fi + 1,
          isActive: true,
        },
      });
      appFaqCount++;
    }
  }
  let appFeedbackCount = 0;
  for (const parent of allParents.slice(0, 3)) {
    const existing = await prisma.appFeedback.findFirst({
      where: { userId: parent.id, category: "improvement" },
    });
    if (!existing) {
      await prisma.appFeedback.create({
        data: {
          userId: parent.id,
          category: "improvement",
          content: "출석 QR 스캔 속도가 좀 더 빨라졌으면 합니다.",
          rating: 4,
          appVersion: "1.2.0",
          platform: "ios",
          status: "pending",
        },
      });
      appFeedbackCount++;
    }
  }
  let appVersionCount = 0;
  const versionDefs = [
    {
      platform: "ios",
      version: "1.2.0",
      minVersion: "1.0.0",
      forceUpdate: false,
    },
    {
      platform: "android",
      version: "1.2.0",
      minVersion: "1.0.0",
      forceUpdate: false,
    },
  ];
  for (const v of versionDefs) {
    const existing = await prisma.appVersion.findUnique({
      where: { platform_version: { platform: v.platform, version: v.version } },
    });
    if (!existing) {
      await prisma.appVersion.create({
        data: {
          platform: v.platform,
          version: v.version,
          minVersion: v.minVersion,
          forceUpdate: v.forceUpdate,
          releaseNotes: "버그 수정 및 성능 개선",
          isActive: true,
        },
      });
      appVersionCount++;
    }
  }
  console.log(
    `  AppBanner ${appBannerCount}건 / AppFaq ${appFaqCount}건 / AppFeedback ${appFeedbackCount}건 / AppVersion ${appVersionCount}건`,
  );

  // ----------------------------
  // 47. Academy + AcademyCoach + AcademyMember + AcademyPromotion
  // ----------------------------
  console.log("\n[47] Academy / AcademyCoach / AcademyMember 생성...");
  let academyCount = 0;
  let academyCoachCount = 0;
  let academyMemberCount = 0;
  let academyPromoCount = 0;

  // ACADEMY_DIRECTOR 유저 확보 (기존 DIRECTOR 사용, 상단 선언된 directorUser 재사용)
  if (!directorUser) {
    console.log("  DIRECTOR 유저 없음 — Academy 섹션 스킵");
  } else {
    const existAcademy = await prisma.academy.findUnique({
      where: { code: "BLACKICE-2026" },
    });
    let academy = existAcademy;
    if (!academy) {
      academy = await prisma.academy.create({
        data: {
          directorId: directorUser.id,
          name: "블랙아이스 아카데미",
          code: "BLACKICE-2026",
          description:
            "아이스하키 전문 아카데미 — 유청소년 대상 개인/소그룹 레슨",
          region: "서울",
          contactPhone: "010-1234-5678",
          contactEmail: "academy@blackice.kr",
          isActive: true,
        },
      });
      academyCount++;
    }
    for (const coach of allCoaches.slice(0, 2)) {
      const existing = await prisma.academyCoach.findUnique({
        where: {
          academyId_userId: { academyId: academy.id, userId: coach.id },
        },
      });
      if (!existing) {
        await prisma.academyCoach.create({
          data: {
            academyId: academy.id,
            userId: coach.id,
            role: "ASSISTANT_COACH",
            isActive: true,
          },
        });
        academyCoachCount++;
      }
    }
    for (const parent of allParents.slice(0, 4)) {
      const child = allChildren.find((c) => c.id);
      try {
        await prisma.academyMember.create({
          data: {
            academyId: academy.id,
            userId: parent.id,
            childId: child?.id ?? null,
            status: "ACTIVE",
          },
        });
        academyMemberCount++;
      } catch {
        // unique constraint
      }
    }
    // AcademyPromotion
    const existPromo = await prisma.academyPromotion.findFirst({
      where: { academyId: academy.id },
    });
    if (!existPromo && coach1Id) {
      await prisma.academyPromotion.create({
        data: {
          coachId: coach1Id,
          clubId: club.id,
          academyId: academy.id,
          title: "2026 봄 개인레슨 모집",
          content:
            "블랙아이스 아카데미에서 개인레슨 수강생을 모집합니다. 주 2회, 60분 세션.",
          imageUrl: "https://example.com/promos/spring-lesson.jpg",
          lessonType: "PRIVATE",
          scheduleInfo: "매주 월/수 19:30~21:00",
          priceInfo: "4회 120,000원",
          capacity: 4,
          venueInfo: "잠실 아이스아레나",
          viewCount: 0,
          isActive: true,
        },
      });
      academyPromoCount++;
    }
  }
  console.log(
    `  Academy ${academyCount}건 / AcademyCoach ${academyCoachCount}건 / AcademyMember ${academyMemberCount}건 / AcademyPromotion ${academyPromoCount}건`,
  );

  // ----------------------------
  // 48. Camp + CampRegistration
  // ----------------------------
  console.log("\n[48] Camp / CampRegistration 생성...");
  let campCount = 0;
  let campRegCount = 0;
  const venueForCamp = await prisma.venue.findFirst({
    where: { clubId: club.id },
  });
  const existCamp = await prisma.camp.findFirst({
    where: { clubId: club.id, name: "2026 여름 아이스하키 캠프" },
  });
  let camp = existCamp;
  if (!camp) {
    camp = await prisma.camp.create({
      data: {
        clubId: club.id,
        name: "2026 여름 아이스하키 캠프",
        description: "U10~U15 대상 5박 6일 집중 훈련 캠프",
        venueId: venueForCamp?.id ?? null,
        startDate: new Date("2026-07-20"),
        endDate: new Date("2026-07-25"),
        maxCapacity: 30,
        price: 350000,
        accommodation: "잠실 아이스파크 인근 숙소",
        address: "서울특별시 송파구 잠실동",
        status: "open",
        imageUrl: "https://example.com/camps/summer.jpg",
      },
    });
    campCount++;
  }
  for (const sm of allStudentMembers.slice(0, 5)) {
    try {
      await prisma.campRegistration.create({
        data: {
          campId: camp.id,
          memberId: sm.id,
          status: "approved",
          paidAmount: 350000,
          memo: "캠프 등록 완료",
          respondedAt: new Date(),
        },
      });
      campRegCount++;
    } catch {
      // unique constraint
    }
  }
  console.log(`  Camp ${campCount}건 / CampRegistration ${campRegCount}건`);

  // ----------------------------
  // 49. ClassReview + ShopReview + ShopWishlist + ShopCart + ShopCartItem
  // ----------------------------
  console.log(
    "\n[49] ClassReview / ShopReview / ShopWishlist / ShopCart / ShopCartItem 생성...",
  );
  let classReviewCount = 0;
  let shopReviewCount = 0;
  let shopWishlistCount = 0;
  let shopCartCount = 0;
  let shopCartItemCount = 0;

  for (const parent of allParents.slice(0, 3)) {
    for (const cls of allClasses.slice(0, 2)) {
      try {
        await prisma.classReview.create({
          data: {
            userId: parent.id,
            classId: cls.id,
            rating: 4 + Math.floor(Math.random() * 2),
            content:
              "코치님의 설명이 매우 친절하고 아이가 즐겁게 배우고 있어요.",
            isVisible: true,
          },
        });
        classReviewCount++;
      } catch {
        // unique 1인 1수업
      }
    }
  }
  if (createdProducts.length > 0) {
    for (const parent of allParents.slice(0, 3)) {
      for (const prod of createdProducts.slice(0, 2)) {
        try {
          await prisma.shopReview.create({
            data: {
              userId: parent.id,
              productId: prod.id,
              rating: 4,
              title: "좋은 제품",
              content: "품질이 매우 좋습니다. 아이가 만족해합니다.",
              isVerified: true,
              isVisible: true,
            },
          });
          shopReviewCount++;
        } catch {
          // 중복
        }
      }
      for (const prod of createdProducts.slice(0, 3)) {
        try {
          await prisma.shopWishlist.create({
            data: { userId: parent.id, productId: prod.id },
          });
          shopWishlistCount++;
        } catch {
          // unique
        }
      }
      // 장바구니
      let cart = await prisma.shopCart.findUnique({
        where: { userId: parent.id },
      });
      if (!cart) {
        cart = await prisma.shopCart.create({ data: { userId: parent.id } });
        shopCartCount++;
      }
      for (const prod of createdProducts.slice(0, 2)) {
        try {
          await prisma.shopCartItem.create({
            data: {
              cartId: cart.id,
              productId: prod.id,
              optionId: null,
              quantity: 1,
            },
          });
          shopCartItemCount++;
        } catch {
          // unique
        }
      }
    }
  }
  console.log(
    `  ClassReview ${classReviewCount}건 / ShopReview ${shopReviewCount}건 / ShopWishlist ${shopWishlistCount}건 / ShopCart ${shopCartCount}건 / ShopCartItem ${shopCartItemCount}건`,
  );

  // ----------------------------
  // 50. ClubEvent + ClubEventRegistration + ClubInvite
  // ----------------------------
  console.log("\n[50] ClubEvent / ClubEventRegistration / ClubInvite 생성...");
  let clubEventCount = 0;
  let clubEventRegCount = 0;
  let clubInviteCount = 0;

  const existEvent = await prisma.clubEvent.findFirst({
    where: { clubId: club.id, title: "2026 봄 클리닉" },
  });
  let clubEvent = existEvent;
  if (!clubEvent) {
    clubEvent = await prisma.clubEvent.create({
      data: {
        clubId: club.id,
        title: "2026 봄 클리닉",
        description: "U10-U12 대상 스케이팅 집중 클리닉 (2시간)",
        eventType: "clinic",
        targetLevel: "beginner",
        capacity: 20,
        startAt: new Date("2026-05-01T09:00:00"),
        endAt: new Date("2026-05-01T11:00:00"),
        priceMode: "payment",
        priceAmount: 30000,
        status: "published",
      },
    });
    clubEventCount++;
  }
  for (const sm of allStudentMembers.slice(0, 5)) {
    try {
      await prisma.clubEventRegistration.create({
        data: {
          eventId: clubEvent.id,
          memberId: sm.id,
          status: "confirmed",
          paid: true,
          memo: "클리닉 등록",
        },
      });
      clubEventRegCount++;
    } catch {
      // unique
    }
  }
  const existInvite = await prisma.clubInvite.findUnique({
    where: { inviteCode: "TEAMPLUS-2026-INV" },
  });
  if (!existInvite && coach1Id) {
    await prisma.clubInvite.create({
      data: {
        clubId: club.id,
        inviteCode: "TEAMPLUS-2026-INV",
        inviteType: "code",
        expiresAt: new Date("2026-12-31"),
        usageLimit: 50,
        currentUsage: 3,
        isActive: true,
        createdBy: coach1Id,
      },
    });
    clubInviteCount++;
  }
  console.log(
    `  ClubEvent ${clubEventCount}건 / ClubEventRegistration ${clubEventRegCount}건 / ClubInvite ${clubInviteCount}건`,
  );

  // ----------------------------
  // 51. Consultation (상담) — 새 DIRECT ChatRoom 생성 후 연결
  // ----------------------------
  console.log("\n[51] Consultation 생성...");
  let consultationCount = 0;
  if (allParents.length > 0 && allCoaches.length > 0) {
    const consultParent = allParents[0];
    const consultCoach = allCoaches[0];
    const existConsult = await prisma.consultation.findFirst({
      where: { parentId: consultParent.id, coachId: consultCoach.id },
    });
    if (!existConsult) {
      // 전용 1:1 채팅방 생성
      const consultRoom = await prisma.chatRoom.create({
        data: {
          type: "DIRECT",
          category: "GENERAL",
          isActive: true,
        },
      });
      // 채팅방 참가자 추가
      await prisma.chatRoomMember.createMany({
        data: [
          { roomId: consultRoom.id, userId: consultParent.id, role: "member" },
          { roomId: consultRoom.id, userId: consultCoach.id, role: "member" },
        ],
        skipDuplicates: true,
      });
      await prisma.consultation.create({
        data: {
          parentId: consultParent.id,
          coachId: consultCoach.id,
          chatRoomId: consultRoom.id,
          category: "CLASS_CONTENT",
          status: "ACTIVE",
          unreadCountForParent: 0,
          unreadCountForCoach: 1,
        },
      });
      consultationCount++;
    }
  }
  console.log(`  Consultation ${consultationCount}건`);

  // ----------------------------
  // 52. League + Division + TeamDivision + TournamentMatch
  // ----------------------------
  console.log(
    "\n[52] League / Division / TeamDivision / TournamentMatch 생성...",
  );
  let leagueCount = 0;
  let divisionCount = 0;
  let teamDivisionCount = 0;
  let tournamentMatchCount = 0;

  const existLeague = await prisma.league.findFirst({
    where: { name: "2026 유청소년 클럽리그(i-League)" },
  });
  let league = existLeague;
  if (!league) {
    league = await prisma.league.create({
      data: {
        name: "2026 유청소년 클럽리그(i-League)",
        season: "2026",
        year: 2026,
        description: "전국 유청소년 아이스하키 클럽리그",
        ageGroup: "U12",
        region: "중부권",
        status: "active",
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-11-30"),
        clubId: club.id,
      },
    });
    leagueCount++;
  }
  const existDiv = await prisma.division.findFirst({
    where: { leagueId: league.id, name: "DIV 1" },
  });
  let division = existDiv;
  if (!division) {
    division = await prisma.division.create({
      data: {
        leagueId: league.id,
        name: "DIV 1",
        level: 1,
        description: "중부권 1부 디비전",
        maxTeams: 8,
        sortOrder: 1,
      },
    });
    divisionCount++;
  }
  for (const team of allTeams.slice(0, 2)) {
    try {
      await prisma.teamDivision.create({
        data: {
          teamId: team.id,
          divisionId: division.id,
          season: "2026",
          status: "active",
          wins: 3,
          losses: 1,
          draws: 0,
          points: 9,
        },
      });
      teamDivisionCount++;
    } catch {
      // unique
    }
  }
  if (allTeams.length >= 2) {
    const existTMatch = await prisma.tournamentMatch.findFirst({
      where: { tournamentId: tournament.id },
    });
    if (!existTMatch) {
      await prisma.tournamentMatch.create({
        data: {
          tournamentId: tournament.id,
          divisionId: division.id,
          homeTeamId: allTeams[0].id,
          awayTeamId: allTeams[1].id,
          matchDate: new Date("2026-05-10"),
          startTime: "09:30",
          endTime: "10:45",
          round: "group",
          status: "scheduled",
          period: "U12 DIV 1",
        },
      });
      tournamentMatchCount++;
    }
  }
  console.log(
    `  League ${leagueCount}건 / Division ${divisionCount}건 / TeamDivision ${teamDivisionCount}건 / TournamentMatch ${tournamentMatchCount}건`,
  );

  // ----------------------------
  // 53. MatchPeriod + MatchEvent (기존 HockeyMatch에 연결)
  // ----------------------------
  console.log("\n[53] MatchPeriod / MatchEvent 생성...");
  let matchPeriodCount = 0;
  let matchEventCount = 0;
  const existHockeyMatch = await prisma.hockeyMatch.findFirst({
    where: { tournamentId: tournament.id },
  });
  if (existHockeyMatch) {
    for (let p = 1; p <= 3; p++) {
      try {
        await prisma.matchPeriod.create({
          data: {
            matchId: existHockeyMatch.id,
            periodNumber: p,
            startedAt: new Date(`2026-05-10T${8 + p}:00:00`),
            endedAt: new Date(`2026-05-10T${8 + p}:20:00`),
            homeScore: p === 1 ? 1 : 0,
            awayScore: p === 2 ? 1 : 0,
          },
        });
        matchPeriodCount++;
      } catch {
        // unique
      }
    }
    const existEvent = await prisma.matchEvent.findFirst({
      where: { matchId: existHockeyMatch.id },
    });
    if (!existEvent) {
      await prisma.matchEvent.create({
        data: {
          matchId: existHockeyMatch.id,
          periodNumber: 1,
          eventTime: "05:30",
          eventType: "goal",
          teamId: allTeams[0]?.id ?? null,
          isGameWinner: false,
          isPowerPlay: false,
          isShortHanded: false,
          description: "첫 번째 골",
        },
      });
      matchEventCount++;
    }
  }
  console.log(
    `  MatchPeriod ${matchPeriodCount}건 / MatchEvent ${matchEventCount}건`,
  );

  // ----------------------------
  // 54. GameExpense (경기 비용)
  // ----------------------------
  console.log("\n[54] GameExpense 생성...");
  let gameExpenseCount = 0;
  const existHockeyMatchForExpense = await prisma.hockeyMatch.findFirst({
    where: { tournamentId: tournament.id },
  });
  if (existHockeyMatchForExpense && coach1Id) {
    const existExpense = await prisma.gameExpense.findFirst({
      where: { matchId: existHockeyMatchForExpense.id },
    });
    if (!existExpense) {
      const expenseDefs = [
        {
          category: "participation_fee",
          description: "대회 참가비",
          amount: 150000,
        },
        {
          category: "ice_rental",
          description: "아이스링크 대여비",
          amount: 300000,
        },
        { category: "meal", description: "선수단 식비", amount: 80000 },
      ];
      for (const e of expenseDefs) {
        await prisma.gameExpense.create({
          data: {
            matchId: existHockeyMatchForExpense.id,
            tournamentId: tournament.id,
            clubId: club.id,
            category: e.category,
            description: e.description,
            amount: e.amount,
            paidById: coach1Id,
            status: "approved",
          },
        });
        gameExpenseCount++;
      }
    }
  }
  console.log(`  GameExpense ${gameExpenseCount}건`);

  // ----------------------------
  // 55. IdentityVerification + IdentityWebhookLog
  // ----------------------------
  console.log("\n[55] IdentityVerification / IdentityWebhookLog 생성...");
  let idvCount = 0;
  let idvWebhookCount = 0;
  for (const parent of allParents.slice(0, 3)) {
    const existing = await prisma.identityVerification.findFirst({
      where: { userId: parent.id },
    });
    if (!existing) {
      const idv = await prisma.identityVerification.create({
        data: {
          userId: parent.id,
          requestId: `REQ-${parent.id}-${Date.now()}`,
          provider: "nice",
          status: "completed",
          verifiedName: "홍길동",
          verifiedPhone: "01012345678",
          verifiedBirth: "19850315",
          verifiedGender: "M",
          purpose: "registration",
          clientIp: "192.168.1.1",
          requestedAt: new Date(),
          verifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      idvCount++;
      await prisma.identityWebhookLog.create({
        data: {
          identityVerificationId: idv.id,
          provider: "nice",
          webhookType: "callback",
          webhookPayload: { result: "SUCCESS", name: "홍길동" },
          verified: true,
          processedAt: new Date(),
        },
      });
      idvWebhookCount++;
    }
  }
  console.log(
    `  IdentityVerification ${idvCount}건 / IdentityWebhookLog ${idvWebhookCount}건`,
  );

  // ----------------------------
  // 56. LessonPackage + LessonPackageEnrollment
  // ----------------------------
  console.log("\n[56] LessonPackage / LessonPackageEnrollment 생성...");
  let lessonPackageCount = 0;
  let lessonPackageEnrollCount = 0;
  const venueForLesson = await prisma.venue.findFirst({
    where: { clubId: club.id },
  });
  const existLP = await prisma.lessonPackage.findFirst({
    where: { clubId: club.id, name: "펀블랙 4회권" },
  });
  let lessonPackage = existLP;
  if (!lessonPackage) {
    lessonPackage = await prisma.lessonPackage.create({
      data: {
        clubId: club.id,
        name: "펀블랙 4회권",
        description: "주 1회, 4주 레슨 패키지",
        trainingType: "lesson",
        venueId: venueForLesson?.id ?? null,
        totalSessions: 4,
        price: 120000,
        dayOfWeek: "SAT",
        startTime: "10:00",
        endTime: "11:00",
        startDate: new Date("2026-05-03"),
        endDate: new Date("2026-05-24"),
        maxCapacity: 8,
        status: "open",
      },
    });
    lessonPackageCount++;
  }
  for (const sm of allStudentMembers.slice(0, 4)) {
    try {
      await prisma.lessonPackageEnrollment.create({
        data: {
          packageId: lessonPackage.id,
          memberId: sm.id,
          status: "enrolled",
          attendedCount: 1,
          paidAmount: 120000,
          enrolledAt: new Date(),
        },
      });
      lessonPackageEnrollCount++;
    } catch {
      // unique
    }
  }
  console.log(
    `  LessonPackage ${lessonPackageCount}건 / LessonPackageEnrollment ${lessonPackageEnrollCount}건`,
  );

  // ----------------------------
  // 57. MemberApprovalLog
  // ----------------------------
  console.log("\n[57] MemberApprovalLog 생성...");
  let approvalLogCount = 0;
  if (allStudentMembers.length > 0 && coach1Id) {
    for (const sm of allStudentMembers.slice(0, 5)) {
      const existing = await prisma.memberApprovalLog.findFirst({
        where: { memberId: sm.id },
      });
      if (!existing) {
        await prisma.memberApprovalLog.create({
          data: {
            memberId: sm.id,
            action: "APPROVED",
            reason: "신청서 검토 완료 — 정상 승인",
            actorId: coach1Id,
            actorRole: "COACH",
          },
        });
        approvalLogCount++;
      }
    }
  }
  console.log(`  MemberApprovalLog ${approvalLogCount}건`);

  // ----------------------------
  // 58. NoticeRead + NoticeComment
  // ----------------------------
  console.log("\n[58] NoticeRead / NoticeComment 생성...");
  let noticeReadCount = 0;
  let noticeCommentCount = 0;
  const systemNotices = await prisma.systemNotice.findMany({
    take: 5,
    select: { id: true },
  });
  for (const notice of systemNotices) {
    for (const parent of allParents.slice(0, 4)) {
      try {
        await prisma.noticeRead.create({
          data: { noticeId: notice.id, userId: parent.id },
        });
        noticeReadCount++;
      } catch {
        // unique
      }
    }
    for (const parent of allParents.slice(0, 2)) {
      const existing = await prisma.noticeComment.findFirst({
        where: { noticeId: notice.id, userId: parent.id },
      });
      if (!existing) {
        await prisma.noticeComment.create({
          data: {
            noticeId: notice.id,
            userId: parent.id,
            content: "공지 감사합니다. 잘 확인했습니다.",
          },
        });
        noticeCommentCount++;
      }
    }
  }
  console.log(
    `  NoticeRead ${noticeReadCount}건 / NoticeComment ${noticeCommentCount}건`,
  );

  // ----------------------------
  // 59. OverseasTrip + OverseasTripRegistration
  // ----------------------------
  console.log("\n[59] OverseasTrip / OverseasTripRegistration 생성...");
  let overseasTripCount = 0;
  let overseasTripRegCount = 0;
  if (coach1Id) {
    const existTrip = await prisma.overseasTrip.findFirst({
      where: { clubId: club.id, title: "2026 캐나다 원정 훈련" },
    });
    let overseasTrip = existTrip;
    if (!overseasTrip) {
      overseasTrip = await prisma.overseasTrip.create({
        data: {
          clubId: club.id,
          title: "2026 캐나다 원정 훈련",
          country: "Canada",
          city: "Toronto",
          description: "캐나다 현지 클럽과의 교류 훈련 및 대회 참가",
          startDate: new Date("2026-08-10"),
          endDate: new Date("2026-08-20"),
          registrationDeadline: new Date("2026-07-01"),
          maxParticipants: 20,
          ageGroup: "U12-U15",
          estimatedCost: 2500000,
          depositAmount: 500000,
          depositDeadline: new Date("2026-07-15"),
          flightInfo: "인천 → 토론토 직항 (대한항공)",
          hotelInfo: "Toronto Marriott City Centre",
          status: "open",
          contactPhone: "010-1111-2222",
          contactEmail: "overseas@teamplus.com",
          createdById: coach1Id,
        },
      });
      overseasTripCount++;
    }
    for (const sm of allStudentMembers.slice(0, 4)) {
      const parent = allParents[0];
      try {
        await prisma.overseasTripRegistration.create({
          data: {
            tripId: overseasTrip.id,
            memberId: sm.id,
            parentId: parent.id,
            status: "confirmed",
            depositAmount: 500000,
            depositPaidAt: new Date(),
            passportVerified: true,
            passportExpiryDate: new Date("2030-01-01"),
          },
        });
        overseasTripRegCount++;
      } catch {
        // unique
      }
    }
  }
  console.log(
    `  OverseasTrip ${overseasTripCount}건 / OverseasTripRegistration ${overseasTripRegCount}건`,
  );

  // ----------------------------
  // 60. PaymentReceipt + PaymentWebhook
  // ----------------------------
  console.log("\n[60] PaymentReceipt / PaymentWebhook 생성...");
  let paymentReceiptCount = 0;
  let paymentWebhookCount = 0;
  const allPayments = await prisma.payment.findMany({
    take: 5,
    select: { id: true, orderNumber: true, amount: true },
  });
  for (let pi = 0; pi < allPayments.length; pi++) {
    const pmt = allPayments[pi];
    const existing = await prisma.paymentReceipt.findUnique({
      where: { paymentId: pmt.id },
    });
    if (!existing) {
      await prisma.paymentReceipt.create({
        data: {
          paymentId: pmt.id,
          receiptNumber: `RCP-2026-${String(pi + 1).padStart(5, "0")}`,
          issuedAt: new Date(),
          taxable: true,
          taxAmount: Math.floor(pmt.amount * 0.1),
          receiptUrl: `https://example.com/receipts/rcp-${pi + 1}.pdf`,
          emailSent: true,
          smsSent: false,
        },
      });
      paymentReceiptCount++;
    }
    const existWebhook = await prisma.paymentWebhook.findFirst({
      where: { paymentId: pmt.id },
    });
    if (!existWebhook) {
      await prisma.paymentWebhook.create({
        data: {
          paymentId: pmt.id,
          webhookType: "kg_inicis",
          webhookPayload: {
            mid: "teamplus01",
            orderNumber: pmt.orderNumber,
            resultCode: "00",
          },
          verified: true,
          status: "success",
          retryCount: 0,
          processedAt: new Date(),
          completedAt: new Date(),
        },
      });
      paymentWebhookCount++;
    }
  }
  console.log(
    `  PaymentReceipt ${paymentReceiptCount}건 / PaymentWebhook ${paymentWebhookCount}건`,
  );

  // ----------------------------
  // 61. NotificationTemplate + PushNotificationLog + AlimtalkLog
  // ----------------------------
  console.log(
    "\n[61] NotificationTemplate / PushNotificationLog / AlimtalkLog 생성...",
  );
  let templateCount = 0;
  let pushLogCount = 0;
  let alimtalkCount = 0;

  const templateDefs = [
    {
      code: "payment_success",
      name: "결제 완료 알림",
      content: "{{name}}님의 결제({{amount}}원)가 완료되었습니다.",
      channel: "alimtalk",
    },
    {
      code: "class_reminder",
      name: "수업 리마인더",
      content: "{{name}}님, 내일 {{time}} 수업이 예정되어 있습니다.",
      channel: "push",
    },
    {
      code: "membership_approved",
      name: "회원 승인 알림",
      content: "{{name}}님의 클럽 가입이 승인되었습니다.",
      channel: "alimtalk",
    },
  ];
  for (const t of templateDefs) {
    const existing = await prisma.notificationTemplate.findUnique({
      where: { templateCode: t.code },
    });
    if (!existing) {
      await prisma.notificationTemplate.create({
        data: {
          templateCode: t.code,
          templateName: t.name,
          content: t.content,
          channel: t.channel,
          isActive: true,
        },
      });
      templateCount++;
    }
  }
  if (coach1Id) {
    const existPushLog = await prisma.pushNotificationLog.findFirst({
      where: { sentBy: coach1Id },
    });
    if (!existPushLog) {
      await prisma.pushNotificationLog.create({
        data: {
          title: "수업 일정 변경 안내",
          body: "다음 주 수요일 수업 시간이 변경되었습니다. 앱에서 확인해주세요.",
          targetType: "role",
          targetValue: "PARENT",
          sentBy: coach1Id,
          totalCount: allParents.length,
          successCount: allParents.length,
          failCount: 0,
          status: "sent",
        },
      });
      pushLogCount++;
    }
  }
  // AlimtalkLog — Notification과 1:1 unique
  const unloggedNotifications = await prisma.notification.findMany({
    where: {
      alimtalkLog: null,
    },
    take: 5,
    select: { id: true },
  });
  for (const n of unloggedNotifications) {
    try {
      await prisma.alimtalkLog.create({
        data: {
          notificationId: n.id,
          phone: "01012345678",
          templateCode: "payment_success",
          status: "sent",
          sentAt: new Date(),
          responseData: { code: "E000", message: "정상" },
        },
      });
      alimtalkCount++;
    } catch {
      // unique
    }
  }
  console.log(
    `  NotificationTemplate ${templateCount}건 / PushNotificationLog ${pushLogCount}건 / AlimtalkLog ${alimtalkCount}건`,
  );

  // ----------------------------
  // 62. ScheduleSwapRequest (근무 스왑 요청)
  // ----------------------------
  console.log("\n[62] ScheduleSwapRequest 생성...");
  let swapRequestCount = 0;
  const workSchedules = await prisma.workSchedule.findMany({
    take: 3,
    select: { id: true, coachId: true },
  });
  if (workSchedules.length >= 2 && allCoaches.length >= 2) {
    const ws = workSchedules[0];
    const existing = await prisma.scheduleSwapRequest.findFirst({
      where: { scheduleId: ws.id },
    });
    if (!existing) {
      await prisma.scheduleSwapRequest.create({
        data: {
          scheduleId: ws.id,
          requesterId: ws.coachId,
          targetCoachId: allCoaches[1]?.id ?? null,
          reason: "개인 사정으로 인해 근무 교대 요청드립니다.",
          status: "pending",
        },
      });
      swapRequestCount++;
    }
  }
  console.log(`  ScheduleSwapRequest ${swapRequestCount}건`);

  // ----------------------------
  // 63. SettlementDetail
  // ----------------------------
  console.log("\n[63] SettlementDetail 생성...");
  let settlementDetailCount = 0;
  const settlement2 = await prisma.settlement.findFirst();
  if (settlement2) {
    const paymentsForSettlement = await prisma.payment.findMany({
      where: { paymentStatus: "completed" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        amount: true,
        paymentMethod: true,
        completedAt: true,
      },
    });
    for (const pmt of paymentsForSettlement) {
      try {
        await prisma.settlementDetail.create({
          data: {
            settlementId: settlement2.id,
            paymentId: pmt.id,
            orderNumber: pmt.orderNumber,
            productName: "수업 수강료",
            paymentDate: pmt.completedAt ?? new Date(),
            paymentMethod: pmt.paymentMethod ?? "card",
            paymentAmount: pmt.amount,
            feeRate: 0.035,
            feeAmount: Math.floor(pmt.amount * 0.035),
            actualAmount: pmt.amount - Math.floor(pmt.amount * 0.035),
            status: "PENDING",
            memo: "자동 생성 정산 상세",
          },
        });
        settlementDetailCount++;
      } catch {
        // unique orderNumber
      }
    }
  }
  console.log(`  SettlementDetail ${settlementDetailCount}건`);

  // ----------------------------
  // 64. ShopProductImage + ShopProductOption + ShopShippingCompany + ShopShipping
  // ----------------------------
  console.log(
    "\n[64] ShopProductImage / ShopProductOption / ShopShippingCompany / ShopShipping 생성...",
  );
  let productImageCount = 0;
  let productOptionCount = 0;
  let shippingCompanyCount = 0;
  let shippingCount = 0;

  for (const prod of createdProducts.slice(0, 3)) {
    const existImg = await prisma.shopProductImage.findFirst({
      where: { productId: prod.id, isMain: true },
    });
    if (!existImg) {
      await prisma.shopProductImage.create({
        data: {
          productId: prod.id,
          imageUrl: `https://example.com/products/${prod.id}-main.jpg`,
          altText: `${prod.name} 대표 이미지`,
          displayOrder: 1,
          isMain: true,
        },
      });
      productImageCount++;
    }
    for (const [optName, optValue] of [
      ["사이즈", "S"],
      ["사이즈", "M"],
      ["사이즈", "L"],
    ]) {
      const existOpt = await prisma.shopProductOption.findFirst({
        where: {
          productId: prod.id,
          optionName: optName,
          optionValue: optValue,
        },
      });
      if (!existOpt) {
        await prisma.shopProductOption.create({
          data: {
            productId: prod.id,
            optionName: optName,
            optionValue: optValue,
            additionalPrice: 0,
            stock: 20,
            isActive: true,
          },
        });
        productOptionCount++;
      }
    }
  }
  const companyCodes = [
    {
      name: "CJ대한통운",
      code: "CJ",
      trackingUrl:
        "https://trace.cjlogistics.com/web/detail.jsp?slipno={tracking}",
    },
    {
      name: "한진택배",
      code: "HANJIN",
      trackingUrl:
        "https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumList={tracking}",
    },
  ];
  for (const c of companyCodes) {
    const existing = await prisma.shopShippingCompany.findUnique({
      where: { code: c.code },
    });
    let company = existing;
    if (!company) {
      company = await prisma.shopShippingCompany.create({
        data: {
          name: c.name,
          code: c.code,
          trackingUrl: c.trackingUrl,
          isActive: true,
          displayOrder: 1,
        },
      });
      shippingCompanyCount++;
    }
    const existShipping = await prisma.shopShipping.findFirst({
      where: { companyId: company.id },
    });
    if (!existShipping) {
      await prisma.shopShipping.create({
        data: {
          companyId: company.id,
          trackingNumber: `${c.code}${Date.now()}`,
          status: "delivered",
          shippedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          deliveredAt: new Date(),
        },
      });
      shippingCount++;
    }
  }
  console.log(
    `  ShopProductImage ${productImageCount}건 / ShopProductOption ${productOptionCount}건 / ShopShippingCompany ${shippingCompanyCount}건 / ShopShipping ${shippingCount}건`,
  );

  // ----------------------------
  // 65. SocialAccount + TmsPost + TmsComment + TmsAttachment + UploadedFile + Video
  // ----------------------------
  console.log(
    "\n[65] SocialAccount / TmsPost / TmsComment / TmsAttachment / UploadedFile / Video 생성...",
  );
  let socialCount = 0;
  let tmsPostCount = 0;
  let tmsCommentCount = 0;
  let tmsAttachmentCount = 0;
  let uploadedFileCount = 0;
  let videoCount = 0;

  for (const parent of allParents.slice(0, 3)) {
    try {
      await prisma.socialAccount.create({
        data: {
          userId: parent.id,
          provider: "kakao",
          socialId: `kakao-${parent.id}`,
          email: parent.email,
          name: `${parent.lastName ?? ""}${parent.firstName ?? ""}` || null,
        },
      });
      socialCount++;
    } catch {
      // unique provider + socialId
    }
  }
  const tmsPostDefs = [
    {
      title: "로그인 화면 버튼 색상 오류",
      content: "iOS 17 이상에서 로그인 버튼이 흰색으로 표시되는 문제",
      platform: "app",
      category: "bug",
      priority: "high",
      status: "in_progress",
      author: "디자이너 김모",
    },
    {
      title: "수업 목록 페이지 무한 스크롤 개선",
      content: "수업 목록에서 100건 이상 스크롤 시 로딩 지연 발생",
      platform: "web",
      category: "improvement",
      priority: "medium",
      status: "todo",
      author: "개발자 이모",
    },
    {
      title: "결제 완료 후 크레딧 반영 지연",
      content: "결제 완료 후 크레딧이 5~10초 후에 반영되는 문제 확인",
      platform: "backend",
      category: "bug",
      priority: "critical",
      status: "review",
      author: "QA 박모",
    },
  ];
  for (const t of tmsPostDefs) {
    const existing = await prisma.tmsPost.findFirst({
      where: { title: t.title },
    });
    let tmsPost;
    if (!existing) {
      tmsPost = await prisma.tmsPost.create({
        data: {
          title: t.title,
          content: t.content,
          platform: t.platform,
          category: t.category,
          priority: t.priority,
          status: t.status,
          authorName: t.author,
          isActive: true,
        },
      });
      tmsPostCount++;
    } else {
      tmsPost = existing;
    }
    const existComment = await prisma.tmsComment.findFirst({
      where: { postId: tmsPost.id },
    });
    if (!existComment) {
      await prisma.tmsComment.create({
        data: {
          postId: tmsPost.id,
          authorName: "개발팀장",
          content: "확인 후 다음 스프린트에서 처리 예정입니다.",
        },
      });
      tmsCommentCount++;
    }
    const existAttachment = await prisma.tmsAttachment.findFirst({
      where: { postId: tmsPost.id },
    });
    if (!existAttachment) {
      await prisma.tmsAttachment.create({
        data: {
          postId: tmsPost.id,
          fileUrl: `https://example.com/tms/${tmsPost.id}-screenshot.png`,
          fileName: "screenshot.png",
          fileType: "image/png",
          fileSize: 245760,
          displayOrder: 1,
        },
      });
      tmsAttachmentCount++;
    }
  }
  if (coach1Id) {
    const existUpload = await prisma.uploadedFile.findFirst({
      where: { uploaderId: coach1Id },
    });
    if (!existUpload) {
      await prisma.uploadedFile.create({
        data: {
          category: "IMAGE",
          originalName: "team-photo-2026.jpg",
          storedName: `upload-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          size: 1048576,
          path: "/uploads/images/team-photo-2026.jpg",
          url: "https://example.com/uploads/team-photo-2026.jpg",
          uploaderId: coach1Id,
          refType: "club",
          refId: club.id,
        },
      });
      uploadedFileCount++;
    }
    const existVideo = await prisma.video.findFirst({
      where: { uploaderId: coach1Id },
    });
    if (!existVideo) {
      await prisma.video.create({
        data: {
          uploaderId: coach1Id,
          clubId: club.id,
          title: "2026 봄 시즌 하이라이트",
          description: "2026년 봄 시즌 주요 경기 하이라이트 영상",
          videoUrl: "https://example.com/videos/2026-spring-highlight.mp4",
          thumbnailUrl: "https://example.com/videos/2026-spring-thumb.jpg",
          duration: 180,
          fileSize: 52428800,
          mimeType: "video/mp4",
          videoType: "highlight",
          tournamentId: tournament.id,
          isPublic: false,
          viewCount: 15,
          status: "ready",
        },
      });
      videoCount++;
    }
  }
  console.log(
    `  SocialAccount ${socialCount}건 / TmsPost ${tmsPostCount}건 / TmsComment ${tmsCommentCount}건 / TmsAttachment ${tmsAttachmentCount}건 / UploadedFile ${uploadedFileCount}건 / Video ${videoCount}건`,
  );

  // ----------------------------
  // 66. UserBlock + UserReport
  // ----------------------------
  console.log("\n[66] UserBlock / UserReport 생성...");
  let userBlockCount = 0;
  let userReportCount = 0;
  if (allParents.length >= 3) {
    try {
      await prisma.userBlock.create({
        data: {
          blockerId: allParents[0].id,
          blockedId: allParents[2].id,
          reason: "스팸 메시지 발송",
        },
      });
      userBlockCount++;
    } catch {
      // unique
    }
    const existing = await prisma.userReport.findFirst({
      where: { reporterId: allParents[1].id },
    });
    if (!existing) {
      await prisma.userReport.create({
        data: {
          reporterId: allParents[1].id,
          reportedId: allParents[2].id,
          targetType: "user",
          category: "spam",
          description: "반복적인 광고성 메시지 전송",
          status: "pending",
        },
      });
      userReportCount++;
    }
  }
  console.log(
    `  UserBlock ${userBlockCount}건 / UserReport ${userReportCount}건`,
  );

  // ----------------------------
  // 67. Venue 관련: VenueBooking + VenueHoliday + VenueRentalContract + VenueRentalSchedule
  // ----------------------------
  console.log(
    "\n[67] VenueBooking / VenueHoliday / VenueRentalContract / VenueRentalSchedule 생성...",
  );
  let venueBookingCount = 0;
  let venueHolidayCount = 0;
  let venueContractCount = 0;
  let venueScheduleCount = 0;

  const venueForRental = await prisma.venue.findFirst();
  if (venueForRental && coach1Id) {
    // VenueHoliday
    const holidayDate = new Date("2026-05-05");
    try {
      await prisma.venueHoliday.create({
        data: {
          venueId: venueForRental.id,
          date: holidayDate,
          reason: "어린이날 정기 휴무",
          type: "holiday",
          isAllDay: true,
        },
      });
      venueHolidayCount++;
    } catch {
      // unique
    }
    // VenueRentalContract
    const existContract = await prisma.venueRentalContract.findFirst({
      where: { clubId: club.id, venueId: venueForRental.id },
    });
    let rentalContract = existContract;
    if (!rentalContract) {
      rentalContract = await prisma.venueRentalContract.create({
        data: {
          clubId: club.id,
          venueId: venueForRental.id,
          title: "2026년 정기 대관 계약",
          contractType: "monthly",
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
          monthlyFee: 800000,
          totalAmount: 9600000,
          depositAmount: 1600000,
          status: "active",
          signedAt: new Date("2026-01-01"),
          memo: "주 5회 오전/저녁 정기 대관",
          createdById: coach1Id,
        },
      });
      venueContractCount++;
    }
    // VenueRentalSchedule
    const existSchedule = await prisma.venueRentalSchedule.findFirst({
      where: { contractId: rentalContract.id },
    });
    let rentalSchedule = existSchedule;
    if (!rentalSchedule) {
      rentalSchedule = await prisma.venueRentalSchedule.create({
        data: {
          contractId: rentalContract.id,
          venueId: venueForRental.id,
          clubId: club.id,
          title: "월요일 정규훈련",
          trainingType: "REGULAR_TRAINING",
          dayOfWeek: 1,
          startTime: "20:10",
          endTime: "22:00",
          pricePerSession: 160000,
          colorCode: "#1E3FAE",
          isActive: true,
        },
      });
      venueScheduleCount++;
    }
    // VenueBooking
    const bookingDate = new Date("2026-05-12");
    const existBooking = await prisma.venueBooking.findFirst({
      where: { venueId: venueForRental.id, bookedById: coach1Id },
    });
    if (!existBooking) {
      await prisma.venueBooking.create({
        data: {
          venueId: venueForRental.id,
          clubId: club.id,
          contractId: rentalContract.id,
          scheduleId: rentalSchedule.id,
          bookedById: coach1Id,
          date: bookingDate,
          startTime: "20:10",
          endTime: "22:00",
          purpose: "training",
          totalPrice: 160000,
          status: "confirmed",
        },
      });
      venueBookingCount++;
    }
  }
  console.log(
    `  VenueBooking ${venueBookingCount}건 / VenueHoliday ${venueHolidayCount}건 / VenueRentalContract ${venueContractCount}건 / VenueRentalSchedule ${venueScheduleCount}건`,
  );

  // ----------------------------
  // 68. Wishlist + ClubPostAttachment
  // ----------------------------
  // NOTE: ChildPin은 목데이터로 생성하지 않는다.
  //  - 실제 자녀 등록 플로우(children.service.ts createChild)는 ChildPin을 만들지 않으며,
  //    parent가 /parent/child-auth/pin 페이지에서 별도로 설정해야 한다.
  //  - fake bcrypt 해시를 넣어두면 자녀가 영영 PIN 로그인 불가 상태가 되어 테스트에 방해된다.
  console.log("\n[68] Wishlist / ClubPostAttachment 생성...");
  let wishlistCount = 0;
  let postAttachCount = 0;

  for (const parent of allParents.slice(0, 3)) {
    try {
      await prisma.wishlist.create({
        data: {
          userId: parent.id,
          targetType: "CLUB",
          targetId: club.id,
        },
      });
      wishlistCount++;
    } catch {
      // unique
    }
    try {
      await prisma.wishlist.create({
        data: {
          userId: parent.id,
          targetType: "TOURNAMENT",
          targetId: tournament.id,
        },
      });
      wishlistCount++;
    } catch {
      // unique
    }
  }
  // ClubPostAttachment: ClubPost 필요
  const clubPosts = await prisma.clubPost.findMany({
    take: 3,
    select: { id: true },
  });
  for (const post of clubPosts) {
    const existing = await prisma.clubPostAttachment.findFirst({
      where: { postId: post.id },
    });
    if (!existing) {
      await prisma.clubPostAttachment.create({
        data: {
          postId: post.id,
          fileUrl: `https://example.com/posts/${post.id}/attachment.jpg`,
          fileName: "attachment.jpg",
          fileType: "image/jpeg",
          fileSize: 512000,
          displayOrder: 1,
        },
      });
      postAttachCount++;
    }
  }
  console.log(
    `  Wishlist ${wishlistCount}건 / ClubPostAttachment ${postAttachCount}건`,
  );

  // ----------------------------
  // 69. MemberLevelHistory + CommonCodeGroup + CommonCode
  // ----------------------------
  console.log(
    "\n[69] MemberLevelHistory / CommonCodeGroup / CommonCode 생성...",
  );
  let memberLevelHistCount = 0;
  let commonCodeGroupCount = 0;
  let commonCodeCount = 0;

  for (const child of allChildren.slice(0, 3)) {
    const existing = await prisma.memberLevelHistory.findFirst({
      where: { userId: child.id },
    });
    if (!existing) {
      await prisma.memberLevelHistory.create({
        data: {
          userId: child.id,
          previousLevel: 1,
          newLevel: 2,
          previousName: "화이트",
          newName: "옐로우",
          reason: "정기 평가 통과",
          season: "2026",
        },
      });
      memberLevelHistCount++;
    }
  }
  if (coach1Id) {
    const existGroup = await prisma.commonCodeGroup.findUnique({
      where: { groupCode: "TRAINING_TYPE" },
    });
    let codeGroup = existGroup;
    if (!codeGroup) {
      codeGroup = await prisma.commonCodeGroup.create({
        data: {
          groupCode: "TRAINING_TYPE",
          groupName: "훈련유형",
          description: "수업/훈련 유형 분류",
          isActive: true,
          sortOrder: 1,
          createdById: coach1Id,
        },
      });
      commonCodeGroupCount++;
    }
    const codeDefs = [
      { code: "LESSON", name: "레슨" },
      { code: "REGULAR", name: "정규훈련" },
      { code: "GAME", name: "시합" },
      { code: "FUN", name: "펀하키" },
    ];
    for (let ci = 0; ci < codeDefs.length; ci++) {
      const cd = codeDefs[ci];
      try {
        await prisma.commonCode.create({
          data: {
            groupId: codeGroup.id,
            code: cd.code,
            name: cd.name,
            level: 1,
            isActive: true,
            sortOrder: ci + 1,
            createdById: coach1Id,
          },
        });
        commonCodeCount++;
      } catch {
        // unique groupId + code
      }
    }
  }
  console.log(
    `  MemberLevelHistory ${memberLevelHistCount}건 / CommonCodeGroup ${commonCodeGroupCount}건 / CommonCode ${commonCodeCount}건`,
  );

  // ----------------------------
  // 70. PickupMatch + PickupMatchApplicant (추가 데이터)
  // ----------------------------
  console.log("\n[70] PickupMatch / PickupMatchApplicant 추가 생성...");
  let pickupMatchCount = 0;
  let pickupApplicantCount = 0;
  const pickupManagerUser =
    allCoaches[0] ??
    (await prisma.user.findFirst({ where: { userType: "DIRECTOR" } }));
  if (pickupManagerUser) {
    for (let pm = 1; pm <= 5; pm++) {
      const matchTitle = `2026 픽업매치 ${pm}회`;
      const existing = await prisma.pickupMatch.findFirst({
        where: { title: matchTitle },
      });
      if (!existing) {
        const pickupMatch = await prisma.pickupMatch.create({
          data: {
            managerId: pickupManagerUser.id,
            title: matchTitle,
            scheduledAt: new Date(
              `2026-06-${String(pm * 4).padStart(2, "0")}T10:00:00`,
            ),
            rinkName: "잠실 아이스아레나",
            rinkAddress: "서울특별시 송파구 잠실동 10",
            price: 20000 + pm * 1000,
            level: pm <= 2 ? "초급" : pm <= 4 ? "중급" : "고급",
            levelCode: pm <= 2 ? "Level A" : pm <= 4 ? "Level B" : "Level C",
            gender: pm % 2 === 0 ? "남성" : "혼성",
            maxParticipants: 16 + pm * 2,
            homeTeamName: "블루팀",
            awayTeamName: "레드팀",
            rules: ["IIHF 규정", "3피리어드", "아이싱 적용"],
            description: `픽업매치 ${pm}회차 — 실력자 우대, 장비 필수`,
            status: "recruiting",
          },
        });
        pickupMatchCount++;
        for (const parent of allParents.slice(0, 3)) {
          try {
            await prisma.pickupMatchApplicant.create({
              data: {
                matchId: pickupMatch.id,
                userId: parent.id,
                position: "FW",
                level: pm <= 2 ? "초급" : "중급",
                paymentStatus: "paid",
                status: "approved",
              },
            });
            pickupApplicantCount++;
          } catch {
            // unique
          }
        }
      }
    }
  }
  console.log(
    `  PickupMatch ${pickupMatchCount}건 / PickupMatchApplicant ${pickupApplicantCount}건`,
  );

  // ============================
  // 완료 요약
  // ============================
  const userCount = await prisma.user.count();
  const clubMemberCount = await prisma.clubMember.count();
  const teamCount = await prisma.team.count();
  const scheduleCount2 = await prisma.classSchedule.count();
  const paymentCount2 = await prisma.payment.count();
  const creditCount2 = await prisma.memberCredit.count();
  const attendanceCount2 = await prisma.classAttendance.count();
  const notificationCount2 = await prisma.notification.count();
  const chatRoomCount2 = await prisma.chatRoom.count();
  const chatMsgCount2 = await prisma.chatMessage.count();
  const shopProductCount2 = await prisma.shopProduct.count();
  const shopOrderCount2 = await prisma.shopOrder.count();

  console.log("\n========================================");
  console.log("완료 요약 (Phase 1 + Phase 2)");
  console.log("========================================");
  console.log(`users                    : ${userCount}명`);
  console.log(`club_members             : ${clubMemberCount}명`);
  console.log(`teams                    : ${teamCount}팀`);
  console.log(`class_schedules          : ${scheduleCount2}건`);
  console.log(`payments                 : ${paymentCount2}건`);
  console.log(`member_credits           : ${creditCount2}건`);
  console.log(`class_attendances        : ${attendanceCount2}건`);
  console.log(`notifications            : ${notificationCount2}건`);
  console.log(`chat_rooms               : ${chatRoomCount2}건`);
  console.log(`chat_messages            : ${chatMsgCount2}건`);
  console.log(`shop_products            : ${shopProductCount2}건`);
  console.log(`shop_orders              : ${shopOrderCount2}건`);
  console.log("========================================\n");
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
