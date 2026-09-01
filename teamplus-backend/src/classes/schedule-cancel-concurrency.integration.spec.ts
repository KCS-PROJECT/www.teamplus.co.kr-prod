/**
 * [설계 v4 §4.3-① · QA 20 · Codex R2-B2] PREPAID 동시 취소 실경쟁 integration spec.
 *
 * mock 게이트 검증(count=0 분기)이 증명하지 못하는 것 — 실제 PostgreSQL 에서
 * 서로 다른 connection/transaction 두 개가 같은 PREPAID 회차를 동시에 취소할 때
 * `class-schedule:{classId}` advisory lock + 승자 게이트가 부수효과(일정 전환·
 * 크레딧 복원·CreditTransaction·AuditLog)를 정확히 1회만 실행하는지 — 를 실측한다.
 *
 * 실행 전제(opt-in): `RUN_DB_INTEGRATION=1` 환경변수 + DB(.env DATABASE_URL) 접근.
 *   미설정 시 전체 skip — 일반 `npm test`·CI·sandbox 에서 DB 접근이 발생하지 않는다.
 *   실행: RUN_DB_INTEGRATION=1 npm test -- schedule-cancel-concurrency
 * 테스트 데이터는 기존 user/team 1건을 참조만 하고, 생성한 row(수업·일정·출석·
 * 수업권·원장·감사)는 전부 정리한다. teardown 은 부분 setup 실패를 기본 시나리오로
 * 간주 — null 초기화 + 존재 가드 + try/finally + allSettled disconnect (Codex R3-RG-01).
 */
import { PrismaClient } from "@prisma/client";
import { ClassesService } from "./classes.service";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "@/attendance/attendance-audit-log.service";

jest.setTimeout(60_000);

/** cancel 경로에서 실제로 쓰이는 의존성만 실체 — 나머지는 도달하지 않는 stub. */
function buildService(prisma: PrismaService): ClassesService {
  const teamsStub = {
    assertTeamManagerPermission: jest.fn().mockResolvedValue(undefined),
  };
  const stub = {} as never;
  return new ClassesService(
    prisma,
    stub, // RedisService — cancel 경로 미사용
    stub, // ConfigService — cancel 경로 미사용
    teamsStub as never,
    new CreditDomainService(),
    new AttendanceAuditLogService(prisma),
    stub, // ResourceAccessService — cancel 경로 미사용
    stub, // NotificationsService — cancel 경로 미사용
  );
}

// opt-in 게이트 — 명시 활성화 없이는 어떤 환경에서도 DB 를 건드리지 않는다.
const RUN = process.env.RUN_DB_INTEGRATION === "1";
const describeIf = RUN ? describe : describe.skip;

describeIf("PREPAID 동시 취소 실경쟁 (integration — 실제 DEV DB)", () => {
  // 서로 다른 connection pool 두 개 — 동일 프로세스 내 lock 공유를 배제.
  const prismaA = new PrismaService();
  const prismaB = new PrismaService();
  const raw = new PrismaClient();

  // [R3-RG-01] null 초기화 — beforeAll 중간 실패 시 undefined 가 Prisma where 에서
  //   "조건 생략"으로 축소되어 무가드 대량 삭제가 되는 것을 원천 차단.
  let classId: string | null = null;
  let scheduleId: string | null = null;
  let creditId: string | null = null;
  let attendanceId: string | null = null;
  let memberUserId: string | null = null;
  let actorUserId: string | null = null;

  beforeAll(async () => {
    // 기존 데이터 참조 — 신규 user/team 생성 없이 FK 만족.
    const anyUser = await raw.user.findFirstOrThrow({ select: { id: true } });
    const anyTeam = await raw.team.findFirstOrThrow({ select: { id: true } });
    memberUserId = anyUser.id;
    actorUserId = anyUser.id;

    const future0 = new Date();
    future0.setUTCDate(future0.getUTCDate() + 7);
    const cls = await raw.class.create({
      data: {
        teamId: anyTeam.id,
        className: "[integration] 동시취소 검증용",
        instructorName: "integration",
        capacity: 10,
        startTime: future0,
        endTime: new Date(future0.getTime() + 3600_000),
        billingMode: "PREPAID",
        trainingType: "regular",
        approvalStatus: "APPROVED",
      },
      select: { id: true },
    });
    classId = cls.id;

    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 7);
    future.setUTCHours(0, 0, 0, 0);
    const sched = await raw.classSchedule.create({
      data: { classId, scheduledDate: future },
      select: { id: true },
    });
    scheduleId = sched.id;

    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const credit = await raw.memberCredit.create({
      data: {
        userId: memberUserId,
        classId,
        totalSessions: 4,
        usedSessions: 1, // 차감 1회 — 복원 여지 정확히 1
        expiresAt: expires,
      },
      select: { id: true },
    });
    creditId = credit.id;

    const att = await raw.classAttendance.create({
      data: {
        scheduleId,
        memberId: memberUserId,
        attendanceStatus: "present",
        creditDeducted: true,
      },
      select: { id: true },
    });
    attendanceId = att.id;
  });

  afterAll(async () => {
    // [R3-RG-01] 생성 역순 정리 — 각 삭제는 해당 id 가 실제 확보된 경우에만 실행
    //   (부분 setup 실패 시 undefined where 로 축소된 무가드 대량 삭제 차단).
    //   정리 실패가 disconnect 를 막지 않도록 try/finally + allSettled.
    try {
      if (creditId) {
        await raw.creditTransaction.deleteMany({
          where: { memberCreditId: creditId },
        });
      }
      if (scheduleId) {
        await raw.attendanceAuditLog.deleteMany({ where: { scheduleId } });
        await raw.classAttendance.deleteMany({ where: { scheduleId } });
      }
      if (creditId) {
        await raw.memberCredit.deleteMany({ where: { id: creditId } });
      }
      if (scheduleId) {
        await raw.classSchedule.deleteMany({ where: { id: scheduleId } });
      }
      if (classId) {
        await raw.class.deleteMany({ where: { id: classId } });
      }
    } finally {
      await Promise.allSettled([
        prismaA.$disconnect(),
        prismaB.$disconnect(),
        raw.$disconnect(),
      ]);
    }
  });

  it("두 connection 이 동시에 같은 회차를 취소해도 부수효과는 정확히 1회 (AC-1)", async () => {
    // setup 완전성 가드 — 이후 로직에서 non-null 로 안전 사용.
    if (!classId || !scheduleId || !creditId || !attendanceId || !actorUserId) {
      throw new Error("integration setup incomplete");
    }
    const svcA = buildService(prismaA);
    const svcB = buildService(prismaB);

    const [ra, rb] = await Promise.allSettled([
      svcA.cancelClassSchedule(actorUserId, scheduleId, "동시취소 A"),
      svcB.cancelClassSchedule(actorUserId, scheduleId, "동시취소 B"),
    ]);

    // 두 요청 모두 성공(승자 = 취소 실행, 패자 = 멱등 no-op) — 예외 없음.
    expect(ra.status).toBe("fulfilled");
    expect(rb.status).toBe("fulfilled");
    if (ra.status === "fulfilled") expect(ra.value.isCancelled).toBe(true);
    if (rb.status === "fulfilled") expect(rb.value.isCancelled).toBe(true);

    // 일정 전환 1회 — 취소 확정 + 사유는 승자 것 하나만 기록.
    const sched = await raw.classSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
      select: { isCancelled: true, cancellationReason: true },
    });
    expect(sched.isCancelled).toBe(true);
    expect(["동시취소 A", "동시취소 B"]).toContain(sched.cancellationReason);

    // 크레딧 복원 정확히 1회 — usedSessions 1 → 0 (0 미만·이중 감소 없음).
    const credit = await raw.memberCredit.findUniqueOrThrow({
      where: { id: creditId },
      select: { usedSessions: true },
    });
    expect(credit.usedSessions).toBe(0);

    // CreditTransaction(restored) 정확히 1건.
    const restoredTx = await raw.creditTransaction.findMany({
      where: { memberCreditId: creditId, type: "restored" },
    });
    expect(restoredTx).toHaveLength(1);

    // AuditLog 정확히 1건 + 복원 성공 결합(creditDelta=1).
    const audits = await raw.attendanceAuditLog.findMany({
      where: { scheduleId, attendanceId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].creditDelta).toBe(1);

    // 복원 성공분의 차감 플래그 해제 (Codex R2-B1 성공 결합).
    const att = await raw.classAttendance.findUniqueOrThrow({
      where: { id: attendanceId },
      select: { creditDeducted: true, attendanceStatus: true },
    });
    expect(att.creditDeducted).toBe(false);
    expect(att.attendanceStatus).toBe("cancelled");
  });
});
