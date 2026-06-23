/**
 * manual-demo.ts — 매뉴얼 캡처용 데모 시드 (Raw SQL 버전)
 *
 * 배경: 로컬 DB가 최신 schema.prisma보다 구 마이그레이션 상태여서
 *        Prisma Client ORM 레이어가 없는 컬럼(venue_id, image_url 등)을
 *        SELECT에 포함시켜 P2022 오류 발생 → 전체 raw SQL로 우회.
 *
 * 실행: npx tsx prisma/seeds/manual-demo.ts
 * 재실행 안전(idempotent): ON CONFLICT DO NOTHING / DO UPDATE 기반.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// ─── 날짜 헬퍼 ─────────────────────────────────────────────────────────────
const now = new Date();
const daysAgo = (n: number): Date => new Date(now.getTime() - n * 86400000);
const daysLater = (n: number): Date => new Date(now.getTime() + n * 86400000);

function fmt(d: Date): string {
  return d.toISOString();
}

// 이번 주 특정 요일의 날짜 (0=일 ~ 6=토)
function thisWeekDay(weekday: number, hour: number, minute = 0): Date {
  const d = new Date(now);
  const diff = weekday - d.getDay();
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ─── raw upsert 헬퍼 ───────────────────────────────────────────────────────
// gen_random_uuid() 쓰면 id를 미리 알 수 없으므로 cuid/uuid를 직접 생성
async function upsertUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  userType: string;
  phone?: string;
  gender?: string;
  birthDate?: Date;
  koreanAge?: number;
}): Promise<string> {
  // 이미 있으면 id만 반환
  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM users WHERE email = $1`,
    params.email,
  );
  if (existing.length > 0) {
    // 비번·상태만 갱신
    await prisma.$executeRawUnsafe(
      `UPDATE users SET password_hash = $1, status = 'ACTIVE', is_verified = true, first_name = $2, last_name = $3 WHERE email = $4`,
      params.passwordHash,
      params.firstName,
      params.lastName,
      params.email,
    );
    return existing[0].id;
  }
  const id = randomUUID();
  const phone = params.phone ?? null;
  const gender = params.gender ?? null;
  const birthDate = params.birthDate ? fmt(params.birthDate) : null;
  const koreanAge = params.koreanAge ?? null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO users
       (id, first_name, last_name, email, phone, password_hash, user_type, is_verified, status, gender, birth_date, korean_age, created_at, updated_at, token_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7::\"UserType\",true,'ACTIVE',$8,$9::timestamp,$10,NOW(),NOW(),1)
     ON CONFLICT (email) DO NOTHING`,
    id,
    params.firstName,
    params.lastName,
    params.email,
    phone,
    params.passwordHash,
    params.userType,
    gender,
    birthDate,
    koreanAge,
  );
  return id;
}

async function getUserId(email: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM users WHERE email = $1`, email);
  return rows[0].id;
}

async function rowExists(table: string, condition: string, ...args: unknown[]): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
    `SELECT COUNT(*) AS cnt FROM "${table}" WHERE ${condition}`,
    ...args,
  );
  return Number(rows[0].cnt) > 0;
}

async function getOne<T>(sql: string, ...args: unknown[]): Promise<T | null> {
  const rows = await prisma.$queryRawUnsafe<T[]>(sql, ...args);
  return rows[0] ?? null;
}

// ─── 메인 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('▶ [manual-demo] 시드 시작...');
  const hash = await bcrypt.hash('Test1234!', 10);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. 계정 upsert
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [1] 계정 upsert...');

  await upsertUser({ email: 'director@teamplus.com', firstName: '도', lastName: '감독', passwordHash: hash, userType: 'DIRECTOR', phone: '010-1111-0001', gender: 'M', birthDate: new Date('1980-03-15') });
  await upsertUser({ email: 'coach@teamplus.com', firstName: '강', lastName: '코치', passwordHash: hash, userType: 'COACH', phone: '010-2222-0001', gender: 'M', birthDate: new Date('1988-07-20') });
  await upsertUser({ email: 'coach2@teamplus.com', firstName: '박', lastName: '코치', passwordHash: hash, userType: 'COACH', phone: '010-2222-0002', gender: 'M', birthDate: new Date('1990-02-10') });
  await upsertUser({ email: 'parent@teamplus.com', firstName: '안', lastName: '학부모', passwordHash: hash, userType: 'PARENT', phone: '010-3333-0001', gender: 'F', birthDate: new Date('1982-09-25') });
  await upsertUser({ email: 'teen@teamplus.com', firstName: '안', lastName: '학생', passwordHash: hash, userType: 'TEEN', phone: '010-4444-0001', gender: 'M', birthDate: new Date('2011-04-05'), koreanAge: 15 });
  await upsertUser({ email: 'academy@teamplus.com', firstName: '김', lastName: '원장', passwordHash: hash, userType: 'ACADEMY_DIRECTOR', phone: '010-5555-0001', gender: 'M', birthDate: new Date('1975-11-12') });
  await upsertUser({ email: 'child1@teamplus.com', firstName: '안', lastName: '주니어', passwordHash: hash, userType: 'CHILD', gender: 'M', birthDate: new Date('2016-06-15'), koreanAge: 10 });
  // 더미 선수들
  await upsertUser({ email: 'player1@demo.com', firstName: '김', lastName: '동훈', passwordHash: hash, userType: 'TEEN', gender: 'M', birthDate: new Date('2013-01-01'), koreanAge: 13 });
  await upsertUser({ email: 'player2@demo.com', firstName: '이', lastName: '준서', passwordHash: hash, userType: 'TEEN', gender: 'M', birthDate: new Date('2014-01-01'), koreanAge: 12 });
  await upsertUser({ email: 'player3@demo.com', firstName: '박', lastName: '민재', passwordHash: hash, userType: 'TEEN', gender: 'M', birthDate: new Date('2012-01-01'), koreanAge: 14 });

  const directorId = await getUserId('director@teamplus.com');
  const coachId = await getUserId('coach@teamplus.com');
  const coach2Id = await getUserId('coach2@teamplus.com');
  const parentId = await getUserId('parent@teamplus.com');
  const teenId = await getUserId('teen@teamplus.com');
  const academyDirId = await getUserId('academy@teamplus.com');
  const child1Id = await getUserId('child1@teamplus.com');
  const player1Id = await getUserId('player1@demo.com');
  const player2Id = await getUserId('player2@demo.com');
  const player3Id = await getUserId('player3@demo.com');

  console.log(`    director: ${directorId}, coach: ${coachId}, parent: ${parentId}, teen: ${teenId}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. 프로필 upsert
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [2] 프로필 upsert...');

  // ParentProfile
  await prisma.$executeRawUnsafe(
    `INSERT INTO parent_profiles (id, user_id, created_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO NOTHING`,
    randomUUID(), parentId,
  );

  // ChildProfile (image_url 컬럼 없는 구 DB)
  await prisma.$executeRawUnsafe(
    `INSERT INTO child_profiles (id, user_id, birth_date, current_level, level_label, progress_percent, created_at)
     VALUES ($1,$2,$3::timestamp,2,'기초',45,NOW()) ON CONFLICT (user_id) DO NOTHING`,
    randomUUID(), child1Id, '2016-06-15',
  );

  // CoachProfile (team 배정은 팀 생성 후 UPDATE로 처리)
  await prisma.$executeRawUnsafe(
    `INSERT INTO coach_profiles (id, user_id, created_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO NOTHING`,
    randomUUID(), coachId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO coach_profiles (id, user_id, created_at) VALUES ($1,$2,NOW()) ON CONFLICT (user_id) DO NOTHING`,
    randomUUID(), coach2Id,
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. 학부모-자녀 관계
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [3] 학부모-자녀 관계...');

  await prisma.$executeRawUnsafe(
    `INSERT INTO parent_children (id, parent_id, child_id, relationship, is_primary, created_at, updated_at)
     VALUES ($1,$2,$3,'parent',true,NOW(),NOW()) ON CONFLICT (parent_id, child_id) DO NOTHING`,
    randomUUID(), parentId, teenId,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO parent_children (id, parent_id, child_id, relationship, is_primary, created_at, updated_at)
     VALUES ($1,$2,$3,'parent',true,NOW(),NOW()) ON CONFLICT (parent_id, child_id) DO NOTHING`,
    randomUUID(), parentId, child1Id,
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. 팀 생성 (teams.venue_id 없는 구 DB에 맞게 명시적 컬럼 지정)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [4] 팀 생성...');

  const titanId = randomUUID();
  const blizId = randomUUID();

  await prisma.$executeRawUnsafe(`
    INSERT INTO teams
      (id, team_code, name, coach_id, location, phone, default_billing_timing,
       short_name, division, primary_color, secondary_color, description, slogan,
       founding_date, home_arena, is_active, gender_type,
       season_wins, season_losses, season_draws, recent_attendance_rate, created_at, updated_at)
    VALUES ($1,'TITANS2026','인천 타이탄스',$2,'인천광역시 연수구','032-555-1001','PREPAID',
            '타이탄스','U12','#1B3FA6','#FFFFFF',
            '인천을 대표하는 아이스하키 클럽. 2018년 창단 이후 꾸준히 성장해온 팀입니다.',
            '얼음 위의 전사, 타이탄스!','2018-09-01','인천 블랙아이스 링크',true,'MIX',
            8,3,1,87,NOW(),NOW())
    ON CONFLICT (team_code) DO UPDATE SET name='인천 타이탄스', is_active=true`,
    titanId, directorId,
  );

  await prisma.$executeRawUnsafe(`
    INSERT INTO teams
      (id, team_code, name, coach_id, location, phone, default_billing_timing,
       short_name, division, primary_color, secondary_color, description, slogan,
       founding_date, home_arena, is_active, gender_type,
       season_wins, season_losses, season_draws, recent_attendance_rate, created_at, updated_at)
    VALUES ($1,'BLIZ2026','안양 블리자드',$2,'경기도 안양시','031-555-2002','PREPAID',
            '블리자드','U10','#00509E','#C8E6FA',
            '안양 지역 유소년 아이스하키 클럽. U10, U8 선수들을 집중 육성합니다.',
            '차가운 얼음 위, 뜨거운 열정!','2020-03-01','안양 아이스링크',true,'MIX',
            5,5,2,79,NOW(),NOW())
    ON CONFLICT (team_code) DO UPDATE SET name='안양 블리자드', is_active=true`,
    blizId, directorId,
  );

  // 실제 id 가져오기 (ON CONFLICT DO UPDATE 경우 원래 id 유지됨)
  const titanRow = await getOne<{ id: string }>(`SELECT id FROM teams WHERE team_code='TITANS2026'`);
  const blizRow = await getOne<{ id: string }>(`SELECT id FROM teams WHERE team_code='BLIZ2026'`);
  const teamTitanId = titanRow!.id;
  const teamBlizId = blizRow!.id;

  // CoachProfile에 팀 배정
  await prisma.$executeRawUnsafe(`UPDATE coach_profiles SET team_id=$1 WHERE user_id=$2`, teamTitanId, coachId);
  await prisma.$executeRawUnsafe(`UPDATE coach_profiles SET team_id=$1 WHERE user_id=$2`, teamBlizId, coach2Id);

  console.log(`    타이탄스: ${teamTitanId}, 블리자드: ${teamBlizId}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. TeamMember
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [5] TeamMember...');

  const memberInserts: Array<{ userId: string; teamId: string; playerName: string; playerAge: number; level?: string; role: string; joinedAt: Date }> = [
    { userId: teenId, teamId: teamTitanId, playerName: '안학생', playerAge: 15, level: 'intermediate', role: 'PLAYER', joinedAt: daysAgo(120) },
    { userId: child1Id, teamId: teamTitanId, playerName: '안주니어', playerAge: 10, level: 'beginner', role: 'PLAYER', joinedAt: daysAgo(60) },
    { userId: coachId, teamId: teamTitanId, playerName: '강코치', playerAge: 36, role: 'COACH', joinedAt: daysAgo(365) },
    { userId: coach2Id, teamId: teamBlizId, playerName: '박코치', playerAge: 34, role: 'COACH', joinedAt: daysAgo(200) },
    { userId: player1Id, teamId: teamTitanId, playerName: '김동훈', playerAge: 13, level: 'intermediate', role: 'PLAYER', joinedAt: daysAgo(90) },
    { userId: player2Id, teamId: teamTitanId, playerName: '이준서', playerAge: 12, level: 'intermediate', role: 'PLAYER', joinedAt: daysAgo(90) },
    { userId: player3Id, teamId: teamTitanId, playerName: '박민재', playerAge: 14, level: 'intermediate', role: 'PLAYER', joinedAt: daysAgo(90) },
  ];

  for (const m of memberInserts) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO team_members
        (id, user_id, team_id, player_name, player_age, player_level, approval_status, role_in_team, joined_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'approved',$7,$8::timestamp,NOW(),NOW())
      ON CONFLICT (user_id, team_id) DO UPDATE SET approval_status='approved'`,
      randomUUID(), m.userId, m.teamId, m.playerName, m.playerAge, m.level ?? null, m.role, fmt(m.joinedAt),
    );
  }

  // TeamMember id 가져오기 (이후 TeamGroupMember에 필요)
  const getMemberId = async (userId: string, teamId: string): Promise<string> => {
    const r = await getOne<{ id: string }>(`SELECT id FROM team_members WHERE user_id=$1 AND team_id=$2`, userId, teamId);
    return r!.id;
  };

  const tmTeenId = await getMemberId(teenId, teamTitanId);
  const tmChild1Id = await getMemberId(child1Id, teamTitanId);
  const tmPlayer1Id = await getMemberId(player1Id, teamTitanId);
  const tmPlayer2Id = await getMemberId(player2Id, teamTitanId);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. TeamGroup + TeamGroupMember
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [6] TeamGroup...');

  const getOrCreateGroup = async (teamId: string, name: string, ageGroup: string): Promise<string> => {
    const existing = await getOne<{ id: string }>(`SELECT id FROM team_groups WHERE team_id=$1 AND name=$2`, teamId, name);
    if (existing) return existing.id;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO team_groups (id, team_id, name, age_group, created_id, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW())`,
      id, teamId, name, ageGroup, directorId,
    );
    return id;
  };

  const groupU12Id = await getOrCreateGroup(teamTitanId, 'U12 그룹', 'U12');
  const groupU10Id = await getOrCreateGroup(teamTitanId, 'U10 그룹', 'U10');

  const groupMemberData = [
    { groupId: groupU12Id, memberId: tmTeenId, position: 'forward', jersey: 17 },
    { groupId: groupU10Id, memberId: tmChild1Id, position: 'defense', jersey: 5 },
    { groupId: groupU12Id, memberId: tmPlayer1Id, position: 'goalie', jersey: 30 },
    { groupId: groupU12Id, memberId: tmPlayer2Id, position: 'forward', jersey: 31 },
  ];

  for (const gm of groupMemberData) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO team_group_members (id, group_id, member_id, joined_at, position, jersey_number, is_captain, is_alt_captain, status)
      VALUES ($1,$2,$3,NOW(),$4,$5,false,false,'active')
      ON CONFLICT (group_id, member_id) DO NOTHING`,
      randomUUID(), gm.groupId, gm.memberId, gm.position, gm.jersey,
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 7. Class + ClassProduct + ClassSchedule
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [7] 수업 + 상품 + 일정...');

  const classBase = thisWeekDay(1, 18, 0); // 이번 주 월요일 18:00
  const classBaseEnd = thisWeekDay(1, 20, 0);

  const getOrCreateClass = async (teamId: string | null, academyId: string | null, className: string, extra: Record<string, unknown>): Promise<string> => {
    const cond = teamId ? `team_id=$2 AND class_name=$3` : `academy_id=$2 AND class_name=$3`;
    const param2 = teamId ?? academyId;
    const existing = await getOne<{ id: string }>(
      `SELECT id FROM classes WHERE ${cond}`,
      param2, className,
    ).catch(() => null);
    if (existing) return existing.id;

    const id = randomUUID();
    const startTime = extra.startTime as Date;
    const endTime = extra.endTime as Date;
    await prisma.$executeRawUnsafe(`
      INSERT INTO classes
        (id, team_id, academy_id, class_name, description, training_type, instructor_name, capacity,
         age_min, age_max, level_required, start_time, end_time, is_active, approval_status,
         coach_id, category, required_coaches, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamp,$13::timestamp,true,'APPROVED',$14,$15,$16,NOW(),NOW())`,
      id,
      teamId, academyId,
      className,
      extra.description ?? null,
      extra.trainingType ?? null,
      extra.instructorName,
      extra.capacity,
      extra.ageMin ?? null,
      extra.ageMax ?? null,
      extra.levelRequired ?? null,
      fmt(startTime),
      fmt(endTime),
      extra.coachId ?? null,
      extra.category ?? null,
      extra.requiredCoaches ?? 1,
    );
    return id;
  };

  const classRegularId = await getOrCreateClass(teamTitanId, null, 'U12 정규 훈련', {
    description: 'U12 연령대 정규 아이스하키 훈련. 기초 스케이팅부터 전술까지 체계적으로 지도합니다.',
    trainingType: 'regular', instructorName: '강코치', capacity: 15, ageMin: 10, ageMax: 12,
    levelRequired: 'intermediate', startTime: classBase, endTime: classBaseEnd,
    coachId: coachId, category: 'JUNIOR', requiredCoaches: 2,
  });

  const classSkatingId = await getOrCreateClass(teamTitanId, null, '기초 스케이팅 클래스', {
    description: '스케이팅 기초를 배우는 입문 수업. 처음 빙상을 타는 어린이도 OK!',
    trainingType: 'regular', instructorName: '강코치', capacity: 12, ageMin: 6, ageMax: 10,
    levelRequired: 'beginner',
    startTime: new Date(classBase.getTime() + 2 * 86400000),
    endTime: new Date(classBaseEnd.getTime() + 2 * 86400000),
    coachId: coachId, category: 'KIDS', requiredCoaches: 1,
  });

  const classBlizId = await getOrCreateClass(teamBlizId, null, 'U10 기초 훈련', {
    description: '블리자드 U10 선수들의 기초 체력·스케이팅 훈련.',
    trainingType: 'regular', instructorName: '박코치', capacity: 10, ageMin: 8, ageMax: 10,
    levelRequired: 'beginner',
    startTime: new Date(classBase.getTime() + 1 * 86400000),
    endTime: new Date(classBaseEnd.getTime() + 1 * 86400000),
    coachId: coach2Id, category: 'KIDS', requiredCoaches: 1,
  });

  console.log(`    classRegular: ${classRegularId}, classSkating: ${classSkatingId}`);

  // ClassProduct
  const getOrCreateProduct = async (classId: string, productName: string, price: number, sessionsPerMonth: number, feeType: string): Promise<string> => {
    const existing = await getOne<{ id: string }>(`SELECT id FROM class_products WHERE class_id=$1 AND product_name=$2`, classId, productName);
    if (existing) return existing.id;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO class_products (id, class_id, product_name, price, sessions_per_month, duration_days, fee_type, billing_timing, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,30,$6,'PREPAID',true,NOW(),NOW())`,
      id, classId, productName, price, sessionsPerMonth, feeType,
    );
    return id;
  };

  const productRegularId = await getOrCreateProduct(classRegularId, '월정액 8회권', 200000, 8, 'MONTHLY_FIXED');
  const productSkatingId = await getOrCreateProduct(classSkatingId, '월정액 4회권', 120000, 4, 'MONTHLY_FIXED');
  await getOrCreateProduct(classBlizId, '월정액 4회권', 100000, 4, 'MONTHLY_FIXED');

  // ClassSchedule
  const getOrCreateSchedule = async (classId: string, date: Date): Promise<string> => {
    const dateStr = date.toISOString().split('T')[0];
    const existing = await getOne<{ id: string }>(
      `SELECT id FROM class_schedules WHERE class_id=$1 AND DATE(scheduled_date)=$2::date`,
      classId, dateStr,
    );
    if (existing) return existing.id;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO class_schedules (id, class_id, scheduled_date, is_cancelled, created_at, updated_at)
      VALUES ($1,$2,$3::timestamp,false,NOW(),NOW())`,
      id, classId, fmt(date),
    );
    return id;
  };

  const regularScheduleDates = [daysAgo(14), daysAgo(7), daysAgo(3), now, daysLater(4), daysLater(7), daysLater(11), daysLater(14)];
  const regularScheduleIds: string[] = [];
  for (const d of regularScheduleDates) {
    regularScheduleIds.push(await getOrCreateSchedule(classRegularId, d));
  }

  const skatingScheduleDates = [daysAgo(10), daysAgo(3), daysLater(4), daysLater(11)];
  const skatingScheduleIds: string[] = [];
  for (const d of skatingScheduleDates) {
    skatingScheduleIds.push(await getOrCreateSchedule(classSkatingId, d));
  }

  console.log(`    정규 일정: ${regularScheduleIds.length}건, 스케이팅 일정: ${skatingScheduleIds.length}건`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 8. ClassRegistration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [8] ClassRegistration...');

  await prisma.$executeRawUnsafe(`
    INSERT INTO class_registrations (id, class_id, user_id, registration_date, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4::timestamp,'active',NOW(),NOW())
    ON CONFLICT (class_id, user_id) DO UPDATE SET status='active'`,
    randomUUID(), classRegularId, teenId, fmt(daysAgo(90)),
  );
  await prisma.$executeRawUnsafe(`
    INSERT INTO class_registrations (id, class_id, user_id, registration_date, status, created_at, updated_at)
    VALUES ($1,$2,$3,$4::timestamp,'active',NOW(),NOW())
    ON CONFLICT (class_id, user_id) DO UPDATE SET status='active'`,
    randomUUID(), classSkatingId, child1Id, fmt(daysAgo(45)),
  );
  // 더미 선수들도 등록
  for (const pid of [player1Id, player2Id]) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO class_registrations (id, class_id, user_id, registration_date, status, created_at, updated_at)
      VALUES ($1,$2,$3,NOW(),'active',NOW(),NOW())
      ON CONFLICT (class_id, user_id) DO UPDATE SET status='active'`,
      randomUUID(), classRegularId, pid,
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 9. Payment + MemberCredit + CreditTransaction
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [9] Payment + MemberCredit + CreditTransaction...');

  // Payment
  const getOrCreatePayment = async (orderNumber: string, userId: string, productId: string, amount: number, completedAt: Date): Promise<string> => {
    const existing = await getOne<{ id: string }>(`SELECT id FROM payments WHERE order_number=$1`, orderNumber);
    if (existing) return existing.id;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO payments (id, order_number, user_id, product_id, amount, payment_status, payment_method, tid, created_at, updated_at, completed_at)
      VALUES ($1,$2,$3,$4,$5,'completed','card',$6,NOW(),NOW(),$7::timestamp)`,
      id, orderNumber, userId, productId, amount, `INICIS-DEMO-TID-${orderNumber}`, fmt(completedAt),
    );
    return id;
  };

  const pay1Id = await getOrCreatePayment('ORD-DEMO-001', parentId, productRegularId, 200000, daysAgo(30));
  const pay2Id = await getOrCreatePayment('ORD-DEMO-002', parentId, productSkatingId, 120000, daysAgo(20));

  // MemberCredit
  const getOrCreateCredit = async (userId: string, classId: string, total: number, used: number, paymentId: string, expiresIn: number): Promise<string> => {
    const existing = await getOne<{ id: string }>(`SELECT id FROM member_credits WHERE user_id=$1 AND class_id=$2`, userId, classId);
    if (existing) return existing.id;
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO member_credits (id, user_id, class_id, total_sessions, used_sessions, expires_at, created_at, issued_date, updated_at, payment_id)
      VALUES ($1,$2,$3,$4,$5,$6::timestamp,NOW(),NOW(),NOW(),$7)`,
      id, userId, classId, total, used, fmt(daysLater(expiresIn)), paymentId,
    );
    return id;
  };

  const creditTeenId = await getOrCreateCredit(teenId, classRegularId, 8, 3, pay1Id, 60);
  const creditChild1Id = await getOrCreateCredit(child1Id, classSkatingId, 4, 1, pay2Id, 40);

  // CreditTransaction
  const txTeenCount = await getOne<{ cnt: bigint }>(`SELECT COUNT(*) AS cnt FROM credit_transactions WHERE member_credit_id=$1`, creditTeenId);
  if (Number(txTeenCount?.cnt ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO credit_transactions (id, member_credit_id, type, amount, balance_after, reason, created_at, updated_at)
      VALUES ($1,$2,'earned',8,8,'월정액 8회권 결제',NOW(),NOW())`,
      randomUUID(), creditTeenId,
    );
    for (let i = 0; i < 3; i++) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO credit_transactions (id, member_credit_id, type, amount, balance_after, schedule_id, reason, created_at, updated_at)
        VALUES ($1,$2,'deducted',1,$3,$4,$5,NOW(),NOW())`,
        randomUUID(), creditTeenId, 8 - (i + 1),
        regularScheduleIds[i] ?? null,
        `${i + 1}회 출석 차감`,
      );
    }
  }

  const txChild1Count = await getOne<{ cnt: bigint }>(`SELECT COUNT(*) AS cnt FROM credit_transactions WHERE member_credit_id=$1`, creditChild1Id);
  if (Number(txChild1Count?.cnt ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO credit_transactions (id, member_credit_id, type, amount, balance_after, reason, created_at, updated_at)
      VALUES ($1,$2,'earned',4,4,'월정액 4회권 결제',NOW(),NOW())`,
      randomUUID(), creditChild1Id,
    );
    await prisma.$executeRawUnsafe(`
      INSERT INTO credit_transactions (id, member_credit_id, type, amount, balance_after, schedule_id, reason, created_at, updated_at)
      VALUES ($1,$2,'deducted',1,3,$3,'1회 출석 차감',NOW(),NOW())`,
      randomUUID(), creditChild1Id, skatingScheduleIds[0] ?? null,
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 10. ClassAttendance (과거 3회 출석 기록)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [10] ClassAttendance...');

  for (const schedId of regularScheduleIds.slice(0, 3)) {
    // teen 출석
    await prisma.$executeRawUnsafe(`
      INSERT INTO class_attendances (id, schedule_id, member_id, attendance_status, checked_in_at, credit_deducted, checked_in_via, checked_in_by, created_at, updated_at)
      VALUES ($1,$2,$3,'present',NOW(),true,'coach_manual',$4,NOW(),NOW())
      ON CONFLICT (schedule_id, member_id) DO NOTHING`,
      randomUUID(), schedId, teenId, coachId,
    );
    // player1 출석 (1회는 결석)
    const status = schedId === regularScheduleIds[1] ? 'absent' : 'present';
    await prisma.$executeRawUnsafe(`
      INSERT INTO class_attendances (id, schedule_id, member_id, attendance_status, checked_in_at, credit_deducted, checked_in_via, checked_in_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,${status === 'present' ? 'NOW()' : 'NULL'},${status === 'present' ? 'true' : 'false'},'coach_manual',$5,NOW(),NOW())
      ON CONFLICT (schedule_id, member_id) DO NOTHING`,
      randomUUID(), schedId, player1Id, status, coachId,
    );
  }

  // child1 스케이팅 출석
  if (skatingScheduleIds[0]) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO class_attendances (id, schedule_id, member_id, attendance_status, checked_in_at, credit_deducted, checked_in_via, checked_in_by, created_at, updated_at)
      VALUES ($1,$2,$3,'present',NOW(),true,'parent_button',$4,NOW(),NOW())
      ON CONFLICT (schedule_id, member_id) DO NOTHING`,
      randomUUID(), skatingScheduleIds[0], child1Id, parentId,
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 11. SystemNotice
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [11] SystemNotice...');

  const noticeCount = await getOne<{ cnt: bigint }>(`SELECT COUNT(*) AS cnt FROM system_notices`);
  if (Number(noticeCount?.cnt ?? 0) === 0) {
    const notices = [
      { title: '[필독] 2026 시즌 대회 일정 안내', content: '안녕하세요, TEAMPLUS 입니다.\n\n2026 시즌 대회 일정이 확정되었습니다.\n\n■ U12 전국대회: 2026년 7월 15일 ~ 17일 (장소: 태릉 국제빙상장)\n■ U10 지역예선: 2026년 6월 20일 ~ 21일 (장소: 안양 아이스링크)\n\n자세한 내용은 팀별 공지를 참고해주세요.', priority: 10, targetType: 'all', pinned: true },
      { title: '앱 업데이트 안내 (v2.5.0)', content: '새로운 버전이 출시되었습니다.\n\n■ 개선 사항:\n- QR 출석 체크 속도 개선\n- 크레딧 내역 화면 UI 개선\n- 버그 수정 3건\n\n앱 스토어에서 최신 버전으로 업데이트해주세요.', priority: 5, targetType: 'all', pinned: false },
      { title: '[코치 전용] 6월 코치 회의 일정', content: '코치 여러분께\n\n6월 정기 코치 회의 일정을 안내드립니다.\n\n■ 일시: 2026년 6월 10일 (수) 오후 3시\n■ 장소: 타이탄스 클럽룸', priority: 3, targetType: 'coach', pinned: false },
    ];
    for (const n of notices) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO system_notices (id, title, content, priority, target_type, is_active, view_count, pinned, created_by, display_locations_json, created_at)
        VALUES ($1,$2,$3,$4,$5,true,0,$6,'admin','[]'::jsonb,NOW())`,
        randomUUID(), n.title, n.content, n.priority, n.targetType, n.pinned,
      );
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 12. Notification
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [12] Notification...');

  const existingNotif = await getOne<{ cnt: bigint }>(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id=$1`, directorId);
  if (Number(existingNotif?.cnt ?? 0) < 2) {
    const notifications = [
      { userId: directorId, type: 'membership_approved', title: '신규 회원 가입 요청', message: '김동훈 선수가 타이탄스 팀 가입을 요청했습니다.', isRead: false },
      { userId: directorId, type: 'class_created', title: '수업 승인 완료', message: 'U12 정규 훈련 수업 승인이 완료되었습니다.', isRead: true },
      { userId: coachId, type: 'attendance_reminder', title: '오늘 수업 출석 체크 안내', message: 'U12 정규 훈련 수업이 오늘 오후 6시에 있습니다. 출석 QR을 준비해주세요.', isRead: false },
      { userId: coachId, type: 'class_enrollment', title: '새 수강 등록', message: '안학생 학생이 U12 정규 훈련에 등록했습니다.', isRead: true },
      { userId: parentId, type: 'payment_success', title: '결제 완료', message: 'U12 정규 훈련 월정액 8회권 결제(200,000원)가 완료되었습니다.', isRead: true },
      { userId: parentId, type: 'attendance_checked', title: '자녀 출석 확인', message: '안학생 학생이 U12 정규 훈련에 출석했습니다.', isRead: false },
      { userId: teenId, type: 'class_schedule', title: '이번 주 훈련 일정', message: 'U12 정규 훈련이 이번 주에 2회 예정되어 있습니다.', isRead: false },
      { userId: teenId, type: 'credit_balance', title: '수업권 잔여 안내', message: 'U12 정규 훈련 수업권이 5회 남았습니다.', isRead: false },
      { userId: academyDirId, type: 'academy_created', title: '아카데미 개설 완료', message: '블랙아이스 아카데미가 성공적으로 개설되었습니다.', isRead: false },
      { userId: academyDirId, type: 'academy_inquiry', title: '아카데미 문의', message: '안학부모 님이 블랙아이스 아카데미 체험 레슨을 문의했습니다.', isRead: false },
    ];
    for (const n of notifications) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO notifications (id, user_id, notification_type, title, message, is_read, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
        randomUUID(), n.userId, n.type, n.title, n.message, n.isRead,
      );
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 13. Academy (ACADEMY_DIRECTOR용) + 오픈클래스
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [13] Academy...');

  let academyId: string;
  const existingAcademy = await getOne<{ id: string }>(`SELECT id FROM academies WHERE director_id=$1`, academyDirId);
  if (existingAcademy) {
    academyId = existingAcademy.id;
  } else {
    academyId = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO academies (id, director_id, name, code, description, region, contact_phone, contact_email, is_active, created_at, updated_at)
      VALUES ($1,$2,'블랙아이스 아카데미','BIA-2026',
              '전문 코치진이 운영하는 아이스하키 전문 아카데미. 개인 레슨부터 그룹 클래스까지 맞춤형 프로그램을 제공합니다.',
              '인천','010-5555-0001','academy@teamplus.com',true,NOW(),NOW())
      ON CONFLICT (code) DO NOTHING`,
      academyId, academyDirId,
    );
    // ON CONFLICT 시 원래 id 재조회
    const aca = await getOne<{ id: string }>(`SELECT id FROM academies WHERE code='BIA-2026'`);
    academyId = aca!.id;
  }

  const academyClassId = await getOrCreateClass(null, academyId, '아카데미 개인 레슨', {
    description: '전문 코치의 1:1 개인 레슨. 체계적인 커리큘럼으로 실력 향상을 보장합니다.',
    trainingType: 'lesson', instructorName: '김원장', capacity: 5, ageMin: 6, ageMax: 18,
    levelRequired: 'beginner',
    startTime: new Date(classBase.getTime() + 3 * 86400000), // 목요일
    endTime: new Date(classBaseEnd.getTime() + 3 * 86400000),
    coachId: academyDirId, category: 'KIDS', requiredCoaches: 1,
  });

  await getOrCreateProduct(academyClassId, '4회 레슨 패키지', 320000, 4, 'MONTHLY_FIXED');

  // 아카데미 수업 일정
  for (const d of [daysLater(3), daysLater(10)]) {
    await getOrCreateSchedule(academyClassId, d);
  }

  // 아카데미 코치 등록
  await prisma.$executeRawUnsafe(`
    INSERT INTO academy_coaches (id, academy_id, user_id, role, is_active, joined_at, created_at, updated_at)
    VALUES ($1,$2,$3,'ASSISTANT_COACH',true,NOW(),NOW(),NOW())
    ON CONFLICT (academy_id, user_id) DO NOTHING`,
    randomUUID(), academyId, coachId,
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 14. TeamPost (팀 커뮤니티 화면 채우기)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('  [14] TeamPost...');

  const postCount = await getOne<{ cnt: bigint }>(`SELECT COUNT(*) AS cnt FROM team_posts WHERE team_id=$1`, teamTitanId);
  if (Number(postCount?.cnt ?? 0) === 0) {
    const posts = [
      { authorId: directorId, title: '[공지] 6월 훈련 일정 변경 안내', content: '안녕하세요 타이탄스 가족 여러분!\n\n6월 넷째 주 훈련 일정이 아래와 같이 변경됩니다.\n\n■ 월요일(6/23): 오후 6시 → 오후 7시로 변경 (링크 사정)\n■ 수요일(6/25): 정상 진행\n\n불편을 드려 죄송합니다.', postType: 'announcement', isPinned: true, likeCount: 5, commentCount: 2, viewCount: 34 },
      { authorId: coachId, title: '이번 주 훈련 포인트: 백체킹 집중 훈련', content: '이번 주 U12 훈련의 핵심 포인트를 공유합니다.\n\n■ 주제: 백체킹(Back-checking) 강화\n■ 목표: 수비 전환 속도 15% 향상\n\n선수들 모두 열심히 준비해오세요!', postType: 'lesson', isPinned: false, likeCount: 8, commentCount: 3, viewCount: 21 },
      { authorId: directorId, title: '[대회] U12 지역 선발전 출전 신청 마감 D-7', content: '7월 지역 선발전 출전 신청 마감이 1주일 남았습니다.\n\n■ 대회명: 2026 인천·경기 U12 선발전\n■ 일시: 7월 5일(토) ~ 6일(일)\n■ 신청 마감: 6월 28일(토) 자정', postType: 'tournament', isPinned: false, likeCount: 12, commentCount: 7, viewCount: 58 },
    ];
    for (const p of posts) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO team_posts (id, team_id, author_id, title, content, post_type, is_pinned, is_active, like_count, comment_count, view_count, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,NOW(),NOW())`,
        randomUUID(), teamTitanId, p.authorId, p.title, p.content, p.postType, p.isPinned, p.likeCount, p.commentCount, p.viewCount,
      );
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 완료 출력
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n✅ [manual-demo] 시드 완료!\n');
  console.log('─────────────────────────────────────────────');
  console.log('  로그인 계정 (비밀번호 공통: Test1234!)');
  console.log('─────────────────────────────────────────────');
  console.log('  DIRECTOR          : director@teamplus.com');
  console.log('  COACH             : coach@teamplus.com');
  console.log('  PARENT            : parent@teamplus.com');
  console.log('  TEEN              : teen@teamplus.com');
  console.log('  ACADEMY_DIRECTOR  : academy@teamplus.com');
  console.log('─────────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ 시드 오류:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
