/**
 * 알림함 테스트 데이터 시드 — /notifications 화면 검증용
 *
 * 실행:
 *   npm run seed:notifications
 *   (또는) npx tsx prisma/seeds/notifications.seed.ts
 *
 * 멱등성:
 *   동일 (userId, notificationType, title) 조합이 이미 존재하면 skip.
 *   재실행 시 created=0, skipped=N 으로 보고됨.
 *
 * 시간 분포:
 *   `offsetMs` 만큼 과거 시점으로 createdAt 설정 → 프론트
 *   `groupNotificationsByDate` (오늘/어제/이번 주/이전) 4 그룹 모두 검증 가능.
 *
 * 카테고리 분포 (parent@teamplus.com 11개 기준):
 *   수업 5 / 결제 2 / 공지 3 / 시스템 1 — 카테고리 탭 필터 전수 검증 가능.
 *
 * 매핑 검증:
 *   teamplus-web/src/lib/notification-mapper.ts 의 normalizeNotificationType + deriveCategory
 *   조합이 이 fixture 의 notificationType 11종을 어떻게 분류하는지를 화면으로 시각 확인.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface NotificationFixture {
  type: string;
  title: string;
  message: string;
  /** Date.now() 기준 과거로 얼마나 거슬러 올라갈지(ms) */
  offsetMs: number;
  isRead: boolean;
  linkUrl?: string;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// parent@teamplus.com 풀세트 11개 — 카테고리 4종 + 날짜 그룹 4종 + 읽음/미읽음 혼합
const PARENT_FIXTURES: NotificationFixture[] = [
  {
    type: 'child_attendance',
    title: '자녀 출석이 확인되었습니다',
    message: '강민준 학생이 오늘 오후 4시 수업에 출석했습니다.',
    offsetMs: 30 * 1000, // 방금
    isRead: false,
    linkUrl: '/attendance-history',
  },
  {
    type: 'class_coach_assigned',
    title: '새 수업에 코치가 배정되었습니다',
    message: '5월 22일 화요일 수업에 강민호 코치가 배정되었습니다.',
    offsetMs: 30 * MIN,
    isRead: false,
    linkUrl: '/classes',
  },
  {
    type: 'payment_success',
    title: '결제가 완료되었습니다',
    message: '5월 수업 4회권 240,000원 결제가 완료되었습니다.',
    offsetMs: 2 * HOUR,
    isRead: false,
    linkUrl: '/payment-history',
  },
  {
    type: 'rsvp_reminder',
    title: '수업 참석 응답이 필요합니다',
    message: '내일 오전 10시 수업 참석 여부를 알려주세요.',
    offsetMs: 1 * DAY + 2 * HOUR,
    isRead: true,
    linkUrl: '/rsvp',
  },
  {
    type: 'payment_reminder',
    title: '미결제 안내',
    message: '3일 내 결제하지 않으면 수업 등록이 취소됩니다.',
    offsetMs: 1 * DAY + 5 * HOUR,
    isRead: true,
    linkUrl: '/credits',
  },
  {
    type: 'membership_approved',
    title: '회원 가입이 승인되었습니다',
    message: 'TEAMPLUS 학부모 회원으로 등록되셨습니다.',
    offsetMs: 3 * DAY,
    isRead: true,
    linkUrl: '/parent',
  },
  {
    type: 'academy_notice',
    title: '아카데미 공지 — 5월 일정 변경 안내',
    message: '징검다리 연휴 기간 일부 수업 일정이 변경됩니다.',
    offsetMs: 4 * DAY,
    isRead: true,
    linkUrl: '/notice',
  },
  {
    type: 'class_reminder',
    title: '내일 오전 10시 수업 알림',
    message: '강민준 학생의 빙상 기본기 수업이 예정되어 있습니다.',
    offsetMs: 5 * DAY,
    isRead: true,
    linkUrl: '/calendar',
  },
  {
    type: 'attendance_confirmed',
    title: '출석이 확인되었습니다',
    message: '5월 13일 오후 4시 수업 출석이 정상 처리되었습니다.',
    offsetMs: 7 * DAY,
    isRead: true,
    linkUrl: '/attendance-history',
  },
  {
    type: 'trip_waitlist_promoted',
    title: '해외원정 대기열에서 확정으로 승격되었습니다',
    message: '7월 캐나다 원정 대기 중이던 자리가 확정으로 변경되었습니다.',
    offsetMs: 14 * DAY,
    isRead: true,
    linkUrl: '/overseas-trips',
  },
  {
    type: 'account_dormant',
    title: '30일 이상 미접속 — 휴면 전환 안내',
    message: '90일 미접속 시 계정이 휴면 처리됩니다. 로그인하여 활동을 유지해 주세요.',
    offsetMs: 35 * DAY,
    isRead: true,
    linkUrl: '/settings',
  },
];

// coach@teamplus.com — 수업 관리 중심 7개
const COACH_FIXTURES: NotificationFixture[] = [
  {
    type: 'class_coach_assigned',
    title: '신규 수업에 배정되었습니다',
    message: '5월 22일 화요일 빙상 기본기 수업에 배정되셨습니다.',
    offsetMs: 1 * HOUR,
    isRead: false,
    linkUrl: '/classes-manage',
  },
  {
    type: 'rsvp_reminder',
    title: '내일 수업 RSVP 마감 임박',
    message: '8명 중 3명이 아직 응답하지 않았습니다.',
    offsetMs: 3 * HOUR,
    isRead: false,
    linkUrl: '/coach-rsvp',
  },
  {
    type: 'class_reminder',
    title: '오늘 오후 6시 수업 시작 1시간 전',
    message: '주니어 골키퍼 수업 — 참가자 10명',
    offsetMs: 8 * HOUR,
    isRead: false,
    linkUrl: '/coach-schedules',
  },
  {
    type: 'child_attendance',
    title: '학생 출석 완료',
    message: '강민준 학생이 출석했습니다 (오후 4:02)',
    offsetMs: 1 * DAY,
    isRead: true,
    linkUrl: '/attendance-manage',
  },
  {
    type: 'membership_approved',
    title: '코치 활동 자격 갱신 완료',
    message: '2026년 코치 활동 자격이 자동 갱신되었습니다.',
    offsetMs: 3 * DAY,
    isRead: true,
  },
  {
    type: 'academy_notice',
    title: '5월 정기 코치 미팅 공지',
    message: '5월 25일 토요일 오후 7시 코치 정기 미팅이 있습니다.',
    offsetMs: 6 * DAY,
    isRead: true,
    linkUrl: '/notice',
  },
  {
    type: 'attendance_confirmed',
    title: '주간 출석 리포트 발행',
    message: '지난 주 담당 수업 8건 출석률 92% 입니다.',
    offsetMs: 9 * DAY,
    isRead: true,
  },
];

// director@teamplus.com — 클럽 운영 중심 5개
const DIRECTOR_FIXTURES: NotificationFixture[] = [
  {
    type: 'membership_approved',
    title: '신규 회원 5명 승인 대기',
    message: '학부모 4명, 코치 1명의 가입 신청을 확인해 주세요.',
    offsetMs: 2 * HOUR,
    isRead: false,
    linkUrl: '/director-approvals',
  },
  {
    // [2026-06-18] 실존하지 않는 데모 집계 알림 제거 (사용자 지적 — 굿즈/일일 결제 집계는 실제 이벤트 아님).
    type: 'class_coach_assigned',
    title: '7월 캠프 코치 배정 완료',
    message: '하계 캠프 4개 반 모두 코치 배정이 완료되었습니다.',
    offsetMs: 2 * DAY,
    isRead: true,
    linkUrl: '/director-coaches',
  },
  {
    type: 'academy_notice',
    title: '아카데미 정기 점검 일정',
    message: '5월 28일 새벽 2시~5시 빙상장 정기 점검이 있습니다.',
    offsetMs: 5 * DAY,
    isRead: true,
    linkUrl: '/notice',
  },
  {
    type: 'trip_waitlist_promoted',
    title: '해외원정 모집 마감 알림',
    message: '7월 캐나다 원정 신청이 정원에 도달했습니다.',
    offsetMs: 10 * DAY,
    isRead: true,
    linkUrl: '/director-overseas-trips',
  },
];

// child@teamplus.com — 아동 화면용 (4개, 친근한 톤)
const CHILD_FIXTURES: NotificationFixture[] = [
  {
    type: 'class_reminder',
    title: '내일 빙상장에서 만나요!',
    message: '내일 오후 4시 수업이에요. 장비 챙기는 거 잊지 마세요.',
    offsetMs: 1 * HOUR,
    isRead: false,
    linkUrl: '/schedule',
  },
  {
    type: 'attendance_confirmed',
    title: '출석 도장 받았어요!',
    message: '오늘 수업도 멋지게 해냈어요. 스티커 1개 적립!',
    offsetMs: 1 * DAY,
    isRead: false,
    linkUrl: '/stickers',
  },
  {
    type: 'academy_notice',
    title: '5월의 어린이 이벤트',
    message: '어린이날 특별 빙상 체험 행사가 열려요.',
    offsetMs: 4 * DAY,
    isRead: true,
    linkUrl: '/notice',
  },
  {
    type: 'class_coach_assigned',
    title: '강민호 코치 선생님이 오셨어요',
    message: '다음 주부터 새로운 코치 선생님과 수업해요.',
    offsetMs: 8 * DAY,
    isRead: true,
  },
];

// teen@teamplus.com — 청소년 (4개, 대회/통계 중심)
const TEEN_FIXTURES: NotificationFixture[] = [
  {
    type: 'class_reminder',
    title: '내일 훈련 일정',
    message: '오후 6시 주전 스쿼드 훈련 — 풀 장비',
    offsetMs: 2 * HOUR,
    isRead: false,
    linkUrl: '/schedule',
  },
  {
    type: 'attendance_confirmed',
    title: '이번 주 출석률 95%',
    message: '주간 5회 훈련 중 4회 출석 — 잘 하고 있어요.',
    offsetMs: 1 * DAY + 3 * HOUR,
    isRead: false,
    linkUrl: '/stats',
  },
  {
    type: 'academy_notice',
    title: '동계 청소년 대회 참가 신청',
    message: '2026 동계 청소년 컵 참가 신청이 시작되었습니다.',
    offsetMs: 3 * DAY,
    isRead: true,
    linkUrl: '/tournaments',
  },
  {
    type: 'trip_waitlist_promoted',
    title: '하계 캠프 확정',
    message: '7월 캐나다 하계 캠프 참가가 확정되었습니다.',
    offsetMs: 11 * DAY,
    isRead: true,
    linkUrl: '/overseas-trips',
  },
];

// 2026-05-19 실측 DB 확인: 활성 도메인은 `@icetime.com`
// (TEAMPLUS 이전 브랜드명 IceTime). CLAUDE.md 의 `parent@teamplus.com` 명세는
// 일부 환경에서만 존재하므로, 실제 시드된 계정을 우선 대상으로 사용한다.
//
// 적용 범위 정책 (v2, 2026-05-19):
//   "어떤 계정으로 로그인해도 알림이 표시되어야 한다" — 프론트 화면 검증의 안정성을 위해
//   기본은 역할별 모든 활성 사용자에게 적용한다. 특정 사용자만 대상으로 좁히려면
//   환경변수 `SEED_NOTIFICATIONS_EMAILS="a@x.com,b@x.com"` 를 사용한다.
const ROLE_FIXTURES: Record<string, NotificationFixture[]> = {
  PARENT: PARENT_FIXTURES,
  COACH: COACH_FIXTURES,
  DIRECTOR: DIRECTOR_FIXTURES,
  CHILD: CHILD_FIXTURES,
  TEEN: TEEN_FIXTURES,
  // ADMIN/SYSTEM/OPER/ACADEMY_DIRECTOR 는 별도 디렉터급 운영 화면 대상 — 시드 보류
};

async function getTargetUsers(): Promise<
  { id: string; email: string; userType: string }[]
> {
  const explicitEmails = (process.env.SEED_NOTIFICATIONS_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (explicitEmails.length > 0) {
    const users = await prisma.user.findMany({
      where: { email: { in: explicitEmails } },
      select: { id: true, email: true, userType: true },
    });
    console.log(
      `[notifications.seed] target=explicit (${users.length}/${explicitEmails.length} resolved)`,
    );
    return users;
  }

  // 기본: ROLE_FIXTURES 가 정의된 모든 역할의 활성 사용자
  const targetRoles = Object.keys(ROLE_FIXTURES);
  const users = await prisma.user.findMany({
    where: {
      userType: { in: targetRoles as ('PARENT' | 'COACH' | 'DIRECTOR' | 'CHILD' | 'TEEN')[] },
      status: { not: 'WITHDRAWN' },
    },
    select: { id: true, email: true, userType: true },
    orderBy: [{ userType: 'asc' }, { email: 'asc' }],
  });
  console.log(
    `[notifications.seed] target=byRole (${users.length} users, roles=${targetRoles.join('|')})`,
  );
  return users;
}

async function main(): Promise<void> {
  const now = Date.now();
  let created = 0;
  let skipped = 0;
  let skippedByRole = 0;

  console.log('[notifications.seed] start');

  const users = await getTargetUsers();

  for (const user of users) {
    const fixtures = ROLE_FIXTURES[user.userType];
    if (!fixtures || fixtures.length === 0) {
      skippedByRole++;
      continue;
    }

    let createdForUser = 0;
    let skippedForUser = 0;

    for (const f of fixtures) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: user.id,
          notificationType: f.type,
          title: f.title,
        },
        select: { id: true },
      });

      if (existing) {
        skippedForUser++;
        skipped++;
        continue;
      }

      const createdAt = new Date(now - f.offsetMs);
      const readAt = f.isRead
        ? new Date(createdAt.getTime() + Math.min(f.offsetMs, 30 * MIN))
        : null;

      await prisma.notification.create({
        data: {
          userId: user.id,
          notificationType: f.type,
          title: f.title,
          message: f.message,
          isRead: f.isRead,
          readAt,
          linkUrl: f.linkUrl ?? null,
          createdAt,
        },
      });
      createdForUser++;
      created++;
    }

    console.log(
      `[notifications.seed]   ${user.userType.padEnd(10)} ${user.email}  +${createdForUser} (skip ${skippedForUser})`,
    );
  }

  console.log(
    `[notifications.seed] ✓ users=${users.length} · created=${created} · skipped=${skipped} · skippedByRole=${skippedByRole}`,
  );
}

main()
  .catch((err) => {
    console.error('[notifications.seed] ✗ failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
