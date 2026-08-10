import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { ViewCounterService } from "@/common/view-counter/view-counter.service";
import { NoticesService } from "./notices.service";

/**
 * 고정 한도 불변식 — **실제 PostgreSQL** 동시성 검증 (AC 3-7 · 3-12).
 *
 * 단위 spec 의 mock $transaction 은 격리 수준을 검증할 수 없다. 이 spec 은 dev DB 에
 * 실제 Serializable 트랜잭션으로 동시 togglePin 을 쏘아, count→update 레이스에서
 * **3번째 고정이 커밋되지 않음**을 DB 상태로 확인한다.
 *
 * 데이터 위생: `targetTeamId` 는 FK 가 없어 합성 ID 를 그대로 쓸 수 있다 —
 * 실행마다 고유한 합성 팀 풀에서만 생성·검증하고 finally 에서 전량 삭제한다.
 * (공유 dev DB 의 실데이터와 절대 겹치지 않음)
 */
describe("고정 한도 — PostgreSQL Serializable 동시성 (integration)", () => {
  // 실행 격리용 합성 풀 ID — Date.now 대신 프로세스 고유값 (재실행 충돌 방지)
  const POOL_ID = `pin-race-test-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const CONCURRENCY = 5;

  let prisma: PrismaService;
  let service: NoticesService;
  let noticeIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    // 외부 부수효과(레디스 캐시·알림)는 통합 대상이 아님 — no-op 스텁
    const redisStub = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      incr: async () => 1,
    } as unknown as RedisService;
    const notificationsStub = {
      notifyTeamAudience: async () => undefined,
      notifyAllAppUsers: async () => undefined,
    } as unknown as NotificationsService;
    const viewCounterStub = {
      tryIncrement: async () => false,
    } as unknown as ViewCounterService;

    service = new NoticesService(
      prisma,
      viewCounterStub,
      redisStub,
      notificationsStub,
    );

    // 합성 풀에 미고정 공지 N개 생성 (직접 insert — 서비스 권한 경로 우회)
    const created = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        prisma.systemNotice.create({
          data: {
            title: `pin-race-${i}`,
            content: "고정 동시성 통합 테스트 전용 행입니다.",
            targetType: "all",
            pinned: false,
            isActive: false, // audience 노출 차단 — 테스트 행이 화면에 잡히지 않게
            targetTeamId: POOL_ID,
          },
          select: { id: true },
        }),
      ),
    );
    noticeIds = created.map((n) => n.id);
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma.systemNotice.deleteMany({
        where: { targetTeamId: POOL_ID },
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it(`동시 고정 ${CONCURRENCY}건 중 커밋은 최대 2건 — 3번째 고정은 어떤 인터리빙에서도 실패한다`, async () => {
    // userId 생략 = 권한 검사 생략 경로(컨트롤러가 항상 전달하는 값의 테스트 전용 우회) —
    // 이 spec 의 관심사는 권한이 아니라 격리 수준이다.
    const results = await Promise.allSettled(
      noticeIds.map((id) => service.togglePin(id)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const pinnedInDb = await prisma.systemNotice.count({
      where: { targetTeamId: POOL_ID, pinned: true },
    });

    // 핵심 불변식: DB 에 커밋된 고정 ≤ 2 (레이스로 3번째가 스며들면 즉시 실패)
    expect(pinnedInDb).toBeLessThanOrEqual(2);
    // 살아있는 경로 확인: 직렬화 충돌 재시도 소진을 감안해도 최소 1건은 성공해야 한다
    expect(fulfilled).toBeGreaterThanOrEqual(1);
    expect(pinnedInDb).toBe(Math.min(fulfilled, 2) === fulfilled ? fulfilled : 2);

    // 실패분은 한도(409) 또는 직렬화 충돌 소진 — 다른 예외가 섞이면 결함
    for (const r of results) {
      if (r.status === "rejected") {
        const err = r.reason as { status?: number; code?: string };
        const isPinLimit = err?.status === 409;
        const isSerializationExhausted = err?.code === "P2034";
        expect(isPinLimit || isSerializationExhausted).toBe(true);
      }
    }
  }, 30_000);
});
