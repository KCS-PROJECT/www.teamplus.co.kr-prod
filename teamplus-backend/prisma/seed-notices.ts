/**
 * SystemNotice 역할별 시드 스크립트
 *
 * 대시보드 공지사항 표시 테스트용 샘플 데이터.
 * 실행: `npx tsx prisma/seed-notices.ts` (teamplus-backend 디렉토리 내부)
 *
 * 각 역할(all/parent/coach/director/teen/child/admin)별 샘플 공지를 upsert한다.
 * 재실행해도 안전 (id 고정 + upsert).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedNotice {
  id: string;
  title: string;
  content: string;
  targetType: string | null;
  pinned: boolean;
  priority: number;
}

const SEED: SeedNotice[] = [
  {
    id: "seed_notice_all_1",
    title: "TEAMPLUS 서비스 정기 점검 안내",
    content:
      "매주 일요일 새벽 3시부터 5시까지 정기 점검이 진행됩니다. 서비스 이용에 참고해 주세요.",
    targetType: "all",
    pinned: true,
    priority: 100,
  },
  {
    id: "seed_notice_parent_1",
    title: "학부모 전용 - 4월 수업료 납부 일정 안내",
    content:
      "4월 수업료 납부는 4월 5일까지입니다. 자녀의 크레딧이 부족하지 않도록 충전해 주세요.",
    targetType: "parent",
    pinned: false,
    priority: 50,
  },
  {
    id: "seed_notice_parent_2",
    title: "학부모 전용 - 자녀 출석률 리포트 발송",
    content: "매월 1일 자녀의 출석률 리포트가 알림톡으로 발송됩니다.",
    targetType: "parent",
    pinned: false,
    priority: 40,
  },
  {
    id: "seed_notice_coach_1",
    title: "코치 전용 - 월간 수업 리포트 작성 안내",
    content: "이번 달 담당 수업의 월간 리포트를 25일까지 제출해 주세요.",
    targetType: "coach",
    pinned: false,
    priority: 50,
  },
  {
    id: "seed_notice_director_1",
    title: "감독 전용 - 신규 클럽 승인 대기 건",
    content:
      "현재 대기 중인 클럽 가입 신청이 있습니다. 관리 페이지에서 확인해 주세요.",
    targetType: "director",
    pinned: false,
    priority: 50,
  },
  {
    id: "seed_notice_teen_1",
    title: "청소년 - 4월 친선 경기 참가 신청",
    content:
      "4월 20일 청소년부 친선 경기 참가 신청을 받고 있어요. 코치님께 문의해 주세요.",
    targetType: "teen",
    pinned: false,
    priority: 30,
  },
  {
    id: "seed_notice_child_1",
    title: "어린이 - 즐거운 아이스하키 시간! 🏒",
    content: "안전 장비를 꼭 착용하고 수업에 참여해 주세요. 오늘도 힘내요!",
    targetType: "child",
    pinned: false,
    priority: 30,
  },
  {
    id: "seed_notice_admin_1",
    title: "관리자 전용 - 주간 운영 지표 대시보드 업데이트",
    content:
      "관리자 대시보드에 신규 운영 지표가 추가되었습니다. 확인 부탁드립니다.",
    targetType: "admin",
    pinned: false,
    priority: 50,
  },
];

async function main() {
  console.log("SystemNotice 시드 시작...");
  let upserted = 0;

  for (const n of SEED) {
    await prisma.systemNotice.upsert({
      where: { id: n.id },
      update: {
        title: n.title,
        content: n.content,
        targetType: n.targetType,
        pinned: n.pinned,
        priority: n.priority,
        isActive: true,
      },
      create: {
        id: n.id,
        title: n.title,
        content: n.content,
        targetType: n.targetType,
        pinned: n.pinned,
        priority: n.priority,
        isActive: true,
      },
    });
    upserted++;
    console.log(`  ✓ [${n.targetType ?? "NULL"}] ${n.title}`);
  }

  const total = await prisma.systemNotice.count();
  const active = await prisma.systemNotice.count({ where: { isActive: true } });
  console.log(
    `\n완료: ${upserted}건 upsert | 전체 ${total}건 (활성 ${active}건)`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("시드 실패:", e);
  prisma.$disconnect();
  process.exit(1);
});
