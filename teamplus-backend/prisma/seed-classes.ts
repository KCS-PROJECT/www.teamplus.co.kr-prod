import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type SampleClass = {
  className: string;
  category: string;
  instructorFallback: string;
  capacity: number;
  ageMin: number;
  ageMax: number;
  levelRequired: string;
  days: string[];
  startHour: number;
  startMinute: number;
  durationHours: number;
  description: string;
  singlePrice: number;
  monthlyPrice: number;
  sessionsPerMonth: number;
};

const SAMPLES: SampleClass[] = [
  {
    className: 'U8 비기너 반',
    category: 'U8',
    instructorFallback: '김코치',
    capacity: 12,
    ageMin: 6,
    ageMax: 8,
    levelRequired: '입문',
    days: ['화', '목'],
    startHour: 16,
    startMinute: 0,
    durationHours: 1,
    description: '처음 아이스하키를 시작하는 어린이를 위한 기초반입니다.',
    singlePrice: 35000,
    monthlyPrice: 240000,
    sessionsPerMonth: 8,
  },
  {
    className: 'U9 펀더멘털 반',
    category: 'U9',
    instructorFallback: '김코치',
    capacity: 14,
    ageMin: 8,
    ageMax: 9,
    levelRequired: '기초',
    days: ['월', '수'],
    startHour: 17,
    startMinute: 0,
    durationHours: 1,
    description: '스케이팅 기본기와 간단한 패스·슛을 익히는 기초반입니다.',
    singlePrice: 40000,
    monthlyPrice: 280000,
    sessionsPerMonth: 8,
  },
  {
    className: 'U10 스케이팅 스킬',
    category: 'U10',
    instructorFallback: '김코치',
    capacity: 14,
    ageMin: 9,
    ageMax: 10,
    levelRequired: '중급',
    days: ['화', '목'],
    startHour: 18,
    startMinute: 0,
    durationHours: 1,
    description: '스케이팅 스킬을 집중적으로 훈련하는 중급반입니다.',
    singlePrice: 45000,
    monthlyPrice: 320000,
    sessionsPerMonth: 8,
  },
  {
    className: 'U11 전술 드릴',
    category: 'U11',
    instructorFallback: '김코치',
    capacity: 16,
    ageMin: 10,
    ageMax: 11,
    levelRequired: '중급',
    days: ['월', '수', '금'],
    startHour: 17,
    startMinute: 30,
    durationHours: 1,
    description: '포지션별 전술과 드릴을 학습하는 심화반입니다.',
    singlePrice: 50000,
    monthlyPrice: 420000,
    sessionsPerMonth: 12,
  },
  {
    className: 'U12 실전 경기반',
    category: 'U12',
    instructorFallback: '김코치',
    capacity: 18,
    ageMin: 11,
    ageMax: 12,
    levelRequired: '상급',
    days: ['토'],
    startHour: 10,
    startMinute: 0,
    durationHours: 2,
    description: '실전 경기 중심으로 진행되는 상급반입니다.',
    singlePrice: 70000,
    monthlyPrice: 260000,
    sessionsPerMonth: 4,
  },
];

const DAY_INDEX: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

function nextOccurrence(base: Date, dayIdx: number, hour: number, minute: number): Date {
  const d = new Date(base);
  const delta = (dayIdx - d.getDay() + 7) % 7;
  // 2026-04-27: 오늘 요일에 시작하는 클래스도 오늘부터 포함 (개발 편의 + 학부모 출석 버튼 즉시 테스트).
  // 기존 `delta === 0 ? 7 : delta` 는 오늘 요일 클래스를 다음 주로 미루어 seed 직후 오늘 일정 0건 문제 발생.
  d.setDate(d.getDate() + delta);
  d.setHours(hour, minute, 0, 0);
  return d;
}

(async () => {
  const director = await prisma.user.findFirst({
    where: { userType: 'DIRECTOR' },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!director) {
    console.error('❌ DIRECTOR 유저 없음 — 먼저 npm run db:seed 실행');
    process.exit(1);
  }
  const club = await prisma.club.findFirst({
    where: { coachId: director.id },
    select: { id: true, clubName: true },
  });
  if (!club) {
    console.error('❌ 감독이 owner인 클럽 없음');
    process.exit(1);
  }
  console.log(`🏒 대상 클럽: [${club.id}] ${club.clubName} (감독 ${director.email})`);

  const coachUser = await prisma.user.findFirst({
    where: { userType: 'COACH' },
    select: { id: true, firstName: true, lastName: true },
  });
  const coachName = coachUser
    ? `${coachUser.lastName ?? ''}${coachUser.firstName ?? ''}`.trim() || '김코치'
    : '김코치';
  console.log(`👤 담당 코치: ${coachName}${coachUser ? ` (${coachUser.id})` : ' (코치 미등록)'}`);

  const existing = await prisma.class.count({ where: { clubId: club.id } });
  if (existing > 0) {
    console.log(`ℹ️  이미 수업 ${existing}건 존재 — 기존 데이터 유지하고 중복 명칭은 스킵합니다.`);
  }

  const now = new Date();
  const seasonStart = new Date(now);
  seasonStart.setHours(0, 0, 0, 0);
  const seasonEnd = new Date(seasonStart);
  seasonEnd.setMonth(seasonEnd.getMonth() + 3);

  let createdCount = 0;
  let skippedCount = 0;

  for (const sample of SAMPLES) {
    const duplicate = await prisma.class.findFirst({
      where: { clubId: club.id, className: sample.className },
      select: { id: true },
    });
    if (duplicate) {
      skippedCount++;
      continue;
    }

    const firstDayIdx = DAY_INDEX[sample.days[0]];
    const start = nextOccurrence(seasonStart, firstDayIdx, sample.startHour, sample.startMinute);
    const end = new Date(start);
    end.setHours(end.getHours() + sample.durationHours);

    const cls = await prisma.class.create({
      data: {
        clubId: club.id,
        className: sample.className,
        description: sample.description,
        instructorName: coachName || sample.instructorFallback,
        coachId: coachUser?.id ?? null,
        capacity: sample.capacity,
        ageMin: sample.ageMin,
        ageMax: sample.ageMax,
        levelRequired: sample.levelRequired,
        startTime: seasonStart,
        endTime: seasonEnd,
        isActive: true,
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: director.id,
        category: sample.category,
        classDays: sample.days,
        requiredCoaches: 1,
        trainingType: 'regular',
      },
    });

    await prisma.classProduct.createMany({
      data: [
        {
          classId: cls.id,
          productName: `${sample.className} · 1회권`,
          description: '1회 참여 가능한 단회권입니다.',
          price: sample.singlePrice,
          sessionsPerMonth: 1,
          durationDays: 30,
          feeType: 'PER_SESSION',
          billingTiming: 'PREPAID',
          isActive: true,
        },
        {
          classId: cls.id,
          productName: `${sample.className} · 월정액`,
          description: '한 달간 정해진 횟수에 참여 가능한 월정액 상품입니다.',
          price: sample.monthlyPrice,
          sessionsPerMonth: sample.sessionsPerMonth,
          durationDays: 30,
          feeType: 'MONTHLY_FIXED',
          billingTiming: 'PREPAID',
          isActive: true,
        },
      ],
    });

    const scheduleDates: Date[] = [];
    for (let w = 0; w < 4; w++) {
      for (const dayKorean of sample.days) {
        const dayIdx = DAY_INDEX[dayKorean];
        const occurrence = nextOccurrence(seasonStart, dayIdx, sample.startHour, sample.startMinute);
        occurrence.setDate(occurrence.getDate() + w * 7);
        scheduleDates.push(occurrence);
      }
    }
    if (scheduleDates.length > 0) {
      await prisma.classSchedule.createMany({
        data: scheduleDates.map((d) => ({
          classId: cls.id,
          scheduledDate: d,
          isCancelled: false,
        })),
      });
    }

    createdCount++;
    console.log(`  ✅ ${sample.className} (${sample.category}) — 상품 2개 + 스케줄 ${scheduleDates.length}건`);
  }

  console.log(`\n🎉 완료 — 신규 ${createdCount}건 · 스킵 ${skippedCount}건 (전체 샘플 ${SAMPLES.length}건)`);
  const total = await prisma.class.count({ where: { clubId: club.id } });
  console.log(`📊 클럽 수업 총계: ${total}건`);

  await prisma.$disconnect();
})().catch((e) => {
  console.error('❌ 시드 실패:', e);
  process.exit(1);
});
