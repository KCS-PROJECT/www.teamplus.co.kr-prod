import {
  findBlockingOwnership,
  findBlockingOwnershipDetailed,
  OwnershipCountDb,
} from "./withdrawal-guard.util";
import { eligibleEnrollmentWhereAnyOf } from "@/common/billing/enrollment-eligibility.util";
import { countUnbilledPostpaidAttendance } from "./withdrawal-guard.util";

/** 기준일 고정 — 2026-09-14(KST) 의 UTC 자정. 창 = 2026-09 ∪ 2026-10. */
const TODAY = new Date("2026-09-14T00:00:00Z");
const SEP = new Date("2026-09-01T00:00:00Z");
const OCT = new Date("2026-10-01T00:00:00Z");

/**
 * count(+findMany) 만 가진 최소 DB mock.
 * tournament.count 는 두 갈래(진행 중 status IN / 후불 미정산 billingMode)로 호출되므로
 * where 인자를 보고 각각의 카운트를 돌려준다.
 */
function buildDb(counts: {
  team?: number;
  class?: number;
  tournamentActive?: number;
  tournamentUnsettled?: number;
  academy?: number;
  enrollment?: number;
  postpaidLine?: number;
  refund?: number;
  tournamentReg?: number;
  ownedTeamIds?: string[];
  ownedAcademyIds?: string[];
  /** 후불 수강 (자녀, 수업) 쌍 — countUnbilledPostpaidAttendance 1단계 */
  postpaidPairs?: Array<{ childId: string; classId: string }>;
  /** present 출석 — 2단계 */
  attendances?: Array<{
    memberId: string;
    schedule: { classId: string; scheduledDate: Date };
  }>;
  /** 확정된 정산 (수업, 월) — 3단계 */
  confirmedBillings?: Array<{ classId: string; yearMonth: string }>;
}): OwnershipCountDb & {
  team: { count: jest.Mock; findMany: jest.Mock };
  class: { count: jest.Mock };
  tournament: { count: jest.Mock };
  academy: { count: jest.Mock; findMany: jest.Mock };
  enrollment: { count: jest.Mock; findMany: jest.Mock };
  classAttendance: { findMany: jest.Mock };
  monthlyPostpaidBilling: { findMany: jest.Mock };
  monthlyPostpaidBillingLine: { count: jest.Mock };
  tournamentRegistration: { count: jest.Mock };
  refundRequest: { count: jest.Mock };
} {
  return {
    team: {
      count: jest.fn().mockResolvedValue(counts.team ?? 0),
      findMany: jest
        .fn()
        .mockResolvedValue((counts.ownedTeamIds ?? []).map((id) => ({ id }))),
    },
    class: { count: jest.fn().mockResolvedValue(counts.class ?? 0) },
    tournament: {
      count: jest.fn().mockImplementation(({ where }: any) => {
        if (where.billingMode === "POSTPAID") {
          return Promise.resolve(counts.tournamentUnsettled ?? 0);
        }
        return Promise.resolve(counts.tournamentActive ?? 0);
      }),
    },
    academy: {
      count: jest.fn().mockResolvedValue(counts.academy ?? 0),
      findMany: jest
        .fn()
        .mockResolvedValue(
          (counts.ownedAcademyIds ?? []).map((id) => ({ id })),
        ),
    },
    enrollment: {
      count: jest.fn().mockResolvedValue(counts.enrollment ?? 0),
      findMany: jest.fn().mockResolvedValue(counts.postpaidPairs ?? []),
    },
    classAttendance: {
      findMany: jest.fn().mockResolvedValue(counts.attendances ?? []),
    },
    monthlyPostpaidBilling: {
      findMany: jest.fn().mockResolvedValue(counts.confirmedBillings ?? []),
    },
    monthlyPostpaidBillingLine: {
      count: jest.fn().mockResolvedValue(counts.postpaidLine ?? 0),
    },
    tournamentRegistration: {
      count: jest.fn().mockResolvedValue(counts.tournamentReg ?? 0),
    },
    refundRequest: { count: jest.fn().mockResolvedValue(counts.refund ?? 0) },
  };
}

describe("findBlockingOwnership", () => {
  it("DIRECTOR: 보유 자산별 라벨을 순서대로 조합해 반환한다", async () => {
    const db = buildDb({
      team: 2,
      class: 3,
      tournamentActive: 1,
      academy: 1,
    });

    const blockers = await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(blockers).toEqual([
      "운영 중인 팀 2개",
      "활성 수업 3개",
      "진행 중인 대회 1개",
      "운영 중인 오픈클래스 1개",
    ]);
  });

  it("DIRECTOR: 자산이 하나도 없으면 빈 배열", async () => {
    const db = buildDb({});
    expect(await findBlockingOwnership(db, "u-1", "DIRECTOR")).toEqual([]);
  });

  it("DIRECTOR: 진행 대회 count 는 status IN(scheduled, ongoing) 로만 집계한다", async () => {
    const db = buildDb({ tournamentActive: 1 });

    await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(db.tournament.count).toHaveBeenCalledWith({
      where: {
        team: { coachId: "u-1" },
        status: { in: ["scheduled", "ongoing"] },
      },
    });
  });

  it("DIRECTOR: 후불 미납 정산·미정산 후불 대회·처리 중 환불 요청도 차단 라벨로 반환한다", async () => {
    const db = buildDb({
      postpaidLine: 2,
      tournamentUnsettled: 1,
      refund: 3,
      ownedTeamIds: ["t-1"],
    });

    const blockers = await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(blockers).toEqual([
      "미납된 후불 정산 2건",
      "정산되지 않은 후불 대회 1개",
      "처리 중인 환불 요청 3건",
    ]);
  });

  it("DIRECTOR: 후불 대회 미정산 쿼리는 billingMode=POSTPAID + UNPAID/PENDING + 미취소로 제한한다 (선불 PENDING 배제)", async () => {
    const db = buildDb({ tournamentUnsettled: 1 });

    await findBlockingOwnership(db, "u-1", "DIRECTOR");

    expect(db.tournament.count).toHaveBeenCalledWith({
      where: {
        team: { coachId: "u-1" },
        billingMode: "POSTPAID",
        status: { not: "cancelled" },
        registrations: {
          some: {
            cancelledAt: null,
            paymentStatus: { in: ["UNPAID", "PENDING"] },
          },
        },
      },
    });
  });

  it("DIRECTOR: 환불 요청 count 는 소유 팀/아카데미 스코프 키로만 집계하고, 스코프가 없으면 쿼리하지 않는다", async () => {
    const scoped = buildDb({
      refund: 1,
      ownedTeamIds: ["t-1", "t-2"],
      ownedAcademyIds: ["a-1"],
    });
    await findBlockingOwnership(scoped, "u-1", "DIRECTOR");
    expect(scoped.refundRequest.count).toHaveBeenCalledWith({
      where: {
        status: { in: ["pending", "executing", "execution_failed"] },
        OR: [
          { teamId: { in: ["t-1", "t-2"] } },
          { academyId: { in: ["a-1"] } },
        ],
      },
    });

    const noScope = buildDb({ refund: 9 });
    expect(await findBlockingOwnership(noScope, "u-1", "DIRECTOR")).toEqual([]);
    expect(noScope.refundRequest.count).not.toHaveBeenCalled();
  });

  it("ACADEMY_DIRECTOR: academy 경로 수업/오픈클래스도 동일 로직으로 집계", async () => {
    const db = buildDb({ class: 1, academy: 2 });

    const blockers = await findBlockingOwnership(db, "u-9", "ACADEMY_DIRECTOR");

    expect(blockers).toEqual(["활성 수업 1개", "운영 중인 오픈클래스 2개"]);
  });

  it("PARENT: 자녀의 이번 달·다음 달 수강 자격이 있으면 라벨 반환", async () => {
    const db = buildDb({ enrollment: 3 });

    const blockers = await findBlockingOwnership(db, "p-1", "PARENT", TODAY);

    expect(blockers).toEqual(["자녀의 이번 달·다음 달 수강 3건"]);
    // 감독 자산 쿼리는 실행되지 않음
    expect(db.team.count).not.toHaveBeenCalled();
  });

  it("PARENT: 수강 자격 쿼리는 상태 목록이 아니라 귀속월 자격(이번 달 ∪ 다음 달)으로 집계한다", async () => {
    const db = buildDb({ enrollment: 1 });

    await findBlockingOwnership(db, "p-1", "PARENT", TODAY);

    expect(db.enrollment.count).toHaveBeenCalledWith({
      where: {
        child: { childParents: { some: { parentId: "p-1" } } },
        OR: [
          eligibleEnrollmentWhereAnyOf([SEP, OCT]),
          {
            billingTiming: "PREPAID",
            status: "paid",
            billingMonth: { gte: SEP },
            class: { trainingType: "spot" },
          },
        ],
      },
    });
    const where = db.enrollment.count.mock.calls[0][0].where;
    // 옛 상태 목록 판정(pending/pending_approval/approved)이 남아 있지 않다
    expect(where.status).toBeUndefined();
    // 정기 수업 분기: 선불은 paid 만, 후불은 approved|paid — 미결제 선불 pending/approved 는 집합 밖
    expect(where.OR[0].billingMonth).toEqual({ in: [SEP, OCT] });
    expect(where.OR[0].OR).toEqual([
      { billingTiming: "PREPAID", status: "paid" },
      { billingTiming: "POSTPAID", status: { in: ["approved", "paid"] } },
    ]);
    // 스팟 분기: 판매 상한이 없어 두 달 밖 결제도 월 무관(아직 안 지난 것)으로 잡는다
    expect(where.OR[1].class).toEqual({ trainingType: "spot" });
  });

  it("PARENT: 정산 확정 전 후불 출석이 있으면 별도 사유로 차단한다", async () => {
    const db = buildDb({
      postpaidPairs: [{ childId: "c-1", classId: "cls-1" }],
      attendances: [
        {
          memberId: "c-1",
          schedule: {
            classId: "cls-1",
            scheduledDate: new Date("2026-08-05T00:00:00Z"),
          },
        },
        {
          memberId: "c-1",
          schedule: {
            classId: "cls-1",
            scheduledDate: new Date("2026-08-12T00:00:00Z"),
          },
        },
        // 후불 수강자가 아닌 (자녀, 수업) 조합의 출석은 제외
        {
          memberId: "c-1",
          schedule: {
            classId: "cls-9",
            scheduledDate: new Date("2026-08-19T00:00:00Z"),
          },
        },
      ],
    });

    const detailed = await findBlockingOwnershipDetailed(
      db,
      "p-1",
      "PARENT",
      TODAY,
    );

    // 같은 (자녀, 수업, 월)은 출석 횟수와 무관하게 1건
    expect(detailed).toEqual([
      { key: "postpaidUnbilled", count: 1, label: "정산 전 후불 출석 1건" },
    ]);
    expect(db.enrollment.findMany).toHaveBeenCalledWith({
      where: {
        child: { childParents: { some: { parentId: "p-1" } } },
        billingTiming: "POSTPAID",
        status: { in: ["approved", "paid"] },
      },
      select: { childId: true, classId: true },
    });
    expect(db.classAttendance.findMany.mock.calls[0][0].where).toEqual({
      memberId: { in: ["c-1"] },
      attendanceStatus: "present",
      schedule: { classId: { in: ["cls-1"] }, isCancelled: false },
    });
    expect(db.monthlyPostpaidBilling.findMany.mock.calls[0][0].where).toEqual({
      classId: { in: ["cls-1"] },
      yearMonth: { in: ["2026-08"] },
      status: "confirmed",
    });
  });

  it("PARENT: 정산이 확정된 달의 후불 출석은 차단하지 않는다 (청구 라인 축이 이어받음)", async () => {
    const db = buildDb({
      postpaidPairs: [{ childId: "c-1", classId: "cls-1" }],
      attendances: [
        {
          memberId: "c-1",
          schedule: {
            classId: "cls-1",
            scheduledDate: new Date("2026-08-05T00:00:00Z"),
          },
        },
      ],
      confirmedBillings: [{ classId: "cls-1", yearMonth: "2026-08" }],
    });

    expect(await findBlockingOwnership(db, "p-1", "PARENT", TODAY)).toEqual([]);
  });

  it("countUnbilledPostpaidAttendance: 후불 수강 쌍이 없으면 출석·정산을 조회하지 않고 0", async () => {
    const db = buildDb({});

    expect(await countUnbilledPostpaidAttendance(db, { childId: "c-1" })).toBe(
      0,
    );
    expect(db.classAttendance.findMany).not.toHaveBeenCalled();
    expect(db.monthlyPostpaidBilling.findMany).not.toHaveBeenCalled();
  });

  it("PARENT: 창은 연말에도 다음 해 1월로 넘어간다", async () => {
    const db = buildDb({ enrollment: 1 });

    await findBlockingOwnership(
      db,
      "p-1",
      "PARENT",
      new Date("2026-12-20T00:00:00Z"),
    );

    const where = db.enrollment.count.mock.calls[0][0].where;
    expect(where.OR[0].billingMonth).toEqual({
      in: [new Date("2026-12-01T00:00:00Z"), new Date("2027-01-01T00:00:00Z")],
    });
    expect(where.OR[1].billingMonth).toEqual({
      gte: new Date("2026-12-01T00:00:00Z"),
    });
  });

  it("PARENT: 후불 미납·처리 중 환불·후불 대회 참가도 차단 라벨로 반환한다", async () => {
    const db = buildDb({ postpaidLine: 1, refund: 2, tournamentReg: 1 });

    const blockers = await findBlockingOwnership(db, "p-1", "PARENT");

    expect(blockers).toEqual([
      "미납된 후불 정산 1건",
      "처리 중인 환불 요청 2건",
      "정산 예정인 후불 대회 참가 1건",
    ]);
  });

  it("PARENT: 후불 대회 참가 쿼리는 billingMode=POSTPAID 대회로 제한한다 (선불 결제 이탈 PENDING 배제)", async () => {
    const db = buildDb({ tournamentReg: 1 });

    await findBlockingOwnership(db, "p-1", "PARENT");

    expect(db.tournamentRegistration.count).toHaveBeenCalledWith({
      where: {
        userId: "p-1",
        cancelledAt: null,
        paymentStatus: { in: ["UNPAID", "PENDING"] },
        tournament: { billingMode: "POSTPAID", status: { not: "cancelled" } },
      },
    });
  });

  it("PARENT: 미납 후불 쿼리는 본인 직접 청구와 자녀 청구를 모두 포함한다", async () => {
    const db = buildDb({ postpaidLine: 1 });

    await findBlockingOwnership(db, "p-1", "PARENT");

    expect(db.monthlyPostpaidBillingLine.count).toHaveBeenCalledWith({
      where: {
        paymentStatus: "pending",
        OR: [
          { userId: "p-1" },
          { user: { childParents: { some: { parentId: "p-1" } } } },
        ],
      },
    });
  });

  it("PARENT: 차단 사유가 없으면 빈 배열", async () => {
    const db = buildDb({});
    expect(await findBlockingOwnership(db, "p-1", "PARENT")).toEqual([]);
  });

  it("비대상 역할(COACH/TEEN 등)은 쿼리 없이 빈 배열", async () => {
    const db = buildDb({ team: 5, enrollment: 5 });

    expect(await findBlockingOwnership(db, "c-1", "COACH")).toEqual([]);
    expect(db.team.count).not.toHaveBeenCalled();
    expect(db.enrollment.count).not.toHaveBeenCalled();
  });
});

describe("findBlockingOwnershipDetailed", () => {
  it("key·count·label 구조로 반환한다 (eligibility API 계약)", async () => {
    const db = buildDb({ team: 1, postpaidLine: 2, ownedTeamIds: ["t-1"] });

    const detailed = await findBlockingOwnershipDetailed(db, "u-1", "DIRECTOR");

    expect(detailed).toEqual([
      { key: "team", count: 1, label: "운영 중인 팀 1개" },
      { key: "postpaidUnpaid", count: 2, label: "미납된 후불 정산 2건" },
    ]);
  });
});
