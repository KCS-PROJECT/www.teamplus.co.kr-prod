import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ClassesService } from "./classes.service";
import { BulkClassProductsDto } from "./dto/bulk-products.dto";

/**
 * bulkUpsertClassProducts 단위 테스트.
 *
 * 공유 모듈(classes.service.spec.ts)의 DI 셋업과 독립적으로,
 * ClassesService 를 hand-rolled mock 으로 직접 생성하여 bulk 트랜잭션·검증·권한만 검증한다.
 */
describe("ClassesService.bulkUpsertClassProducts", () => {
  const classId = "class-1";
  const teamId = "team-1";
  const userId = "coach-1";

  let service: ClassesService;
  let tx: {
    classProduct: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let prisma: any;
  let teamsService: { assertTeamManagerPermission: jest.Mock };
  let redisService: { del: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    tx = {
      classProduct: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    prisma = {
      // assertClassManagerPermission → 팀 수업으로 판별
      class: {
        findUnique: jest.fn().mockResolvedValue({
          id: classId,
          teamId,
          academyId: null,
        }),
      },
      // getClassProducts(반환용) — class 조회 + product 목록
      classProduct: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      academy: { findUnique: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    // getClassProducts 내부의 class.findUnique select 호환 (id/endTime/academyId)
    prisma.class.findUnique = jest.fn().mockResolvedValue({
      id: classId,
      teamId,
      academyId: null,
      endTime: null,
    });

    teamsService = { assertTeamManagerPermission: jest.fn().mockResolvedValue(undefined) };
    redisService = { del: jest.fn() };
    configService = {
      get: jest.fn(() => ({ keyPrefix: { class: "class:" } })),
    };

    service = new ClassesService(
      prisma,
      redisService as any,
      configService as any,
      teamsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // ResourceAccessService — bulkUpsert 경로 미사용
    );
  });

  it("혼합(create+update+delete)을 단일 트랜잭션으로 반영한다", async () => {
    // update 대상 패키지는 classId 소속
    tx.classProduct.findUnique
      // deleteIds[0] 조회 (이력 없음 → hard delete)
      .mockResolvedValueOnce({
        id: "del-1",
        classId,
        _count: { payments: 0, enrollments: 0 },
      })
      // upserts update 대상 소속 확인
      .mockResolvedValueOnce({ id: "upd-1", classId });

    await service.bulkUpsertClassProducts(userId, "COACH", classId, {
      upserts: [
        {
          productName: "신규 횟수권",
          price: 30000,
          feeType: "PER_SESSION",
          sessionsPerMonth: 1,
        },
        {
          id: "upd-1",
          productName: "수정된 정기권",
          price: 240000,
          feeType: "MONTHLY_FIXED",
          sessionsPerMonth: 8,
          sessionsPerWeek: 2,
        },
      ],
      deleteIds: ["del-1"],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.classProduct.delete).toHaveBeenCalledWith({ where: { id: "del-1" } });
    expect(tx.classProduct.create).toHaveBeenCalledTimes(1);
    expect(tx.classProduct.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "upd-1" } }),
    );
    // W2 — MONTHLY_FIXED update 의 durationDays 는 weeks×7 로 도출.
    //   sessionsPerMonth=8, sessionsPerWeek=2 → weeks=4 → durationDays=28
    const updCall = tx.classProduct.update.mock.calls.find(
      ([arg]) => arg?.where?.id === "upd-1",
    );
    expect(updCall?.[0].data.durationDays).toBe(28);
    // PER_SESSION create 는 기존대로 30 유지.
    expect(tx.classProduct.create.mock.calls[0][0].data.durationDays).toBe(30);
    // 결제 이력 없는 삭제는 hard delete 이므로 isActive=false update 미발생
    expect(
      tx.classProduct.update.mock.calls.some(
        ([arg]) => arg?.where?.id === "del-1",
      ),
    ).toBe(false);
  });

  it("발급 수량 0 정기권(미발급 기본)은 회차 검증을 통과하고 전송된 durationDays 를 보존한다", async () => {
    await service.bulkUpsertClassProducts(userId, "COACH", classId, {
      upserts: [
        {
          productName: "크레딧 미사용 정기권",
          price: 200000,
          feeType: "MONTHLY_FIXED",
          sessionsPerMonth: 0,
          durationDays: 28,
        },
      ],
      deleteIds: [],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.classProduct.create).toHaveBeenCalledTimes(1);
    const createData = tx.classProduct.create.mock.calls[0][0].data;
    expect(createData.sessionsPerMonth).toBe(0);
    // 0 은 회차 역산 대상이 아니므로 전송된 durationDays(28) 를 그대로 사용(주수 1로 오도출 금지).
    expect(createData.durationDays).toBe(28);
  });

  it("정기권 회수 검증 위반 시 트랜잭션 진입 전 예외(롤백)", async () => {
    // perWeek=20 → weeks=ceil(20/20)=1, totalSessions(20) > weeks×14(14) → 위반
    await expect(
      service.bulkUpsertClassProducts(userId, "COACH", classId, {
        upserts: [
          {
            productName: "위반 정기권",
            price: 100000,
            feeType: "MONTHLY_FIXED",
            sessionsPerMonth: 20,
            sessionsPerWeek: 20,
          },
        ],
        deleteIds: [],
      }),
    ).rejects.toThrow(BadRequestException);

    // 위반 케이스에서는 트랜잭션이 시작되지 않아야 함 (전부 롤백 = 진입 안 함)
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.classProduct.create).not.toHaveBeenCalled();
  });

  it("권한 없는 사용자(팀 매니저 아님)는 거부한다", async () => {
    teamsService.assertTeamManagerPermission.mockRejectedValueOnce(
      new ForbiddenException("이 수업의 감독/코치만 수강권을 수정할 수 있습니다."),
    );

    await expect(
      service.bulkUpsertClassProducts(userId, "PARENT", classId, {
        upserts: [
          {
            productName: "무단 패키지",
            price: 1000,
            feeType: "PER_SESSION",
            sessionsPerMonth: 1,
          },
        ],
        deleteIds: [],
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("빈 입력은 no-op 으로 현재 목록을 반환한다", async () => {
    const result = await service.bulkUpsertClassProducts(
      userId,
      "COACH",
      classId,
      { upserts: [], deleteIds: [] },
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(true);
  });

  it("deleteIds 가 타 수업 소속이면 NotFound(롤백)", async () => {
    tx.classProduct.findUnique.mockResolvedValueOnce({
      id: "del-x",
      classId: "other-class",
      _count: { payments: 0, enrollments: 0 },
    });

    await expect(
      service.bulkUpsertClassProducts(userId, "COACH", classId, {
        upserts: [],
        deleteIds: ["del-x"],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it("지난 월분 row 는 update/delete 모두 거부한다 (이력 불가침)", async () => {
    const pastMonth = new Date("2020-01-01T00:00:00.000Z");

    // update 시도 — 지난 월분
    tx.classProduct.findUnique.mockResolvedValueOnce({
      id: "past-1",
      classId,
      billingMonth: pastMonth,
    });
    await expect(
      service.bulkUpsertClassProducts(userId, "COACH", classId, {
        upserts: [
          {
            id: "past-1",
            productName: "지난 월분",
            price: 100000,
            feeType: "MONTHLY_FIXED",
            sessionsPerMonth: 0,
          },
        ],
        deleteIds: [],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.classProduct.update).not.toHaveBeenCalled();

    // delete 시도 — 지난 월분
    tx.classProduct.findUnique.mockResolvedValueOnce({
      id: "past-2",
      classId,
      billingMonth: pastMonth,
      _count: { payments: 0, enrollments: 0 },
    });
    await expect(
      service.bulkUpsertClassProducts(userId, "COACH", classId, {
        upserts: [],
        deleteIds: ["past-2"],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.classProduct.delete).not.toHaveBeenCalled();
  });

  it("월분 갱신 — billingMonth 는 create 에 UTC 자정으로 매핑, isActive 는 update 에만 반영", async () => {
    // 무월(레거시) 원본 update 대상 소속 확인
    tx.classProduct.findUnique.mockResolvedValueOnce({
      id: "legacy-1",
      classId,
    });

    await service.bulkUpsertClassProducts(userId, "COACH", classId, {
      upserts: [
        {
          productName: "월 결제",
          price: 200000,
          feeType: "MONTHLY_FIXED",
          sessionsPerMonth: 0,
          durationDays: 30,
          billingMonth: "2026-08",
        },
        {
          id: "legacy-1",
          productName: "월 결제",
          price: 200000,
          feeType: "MONTHLY_FIXED",
          sessionsPerMonth: 0,
          durationDays: 30,
          isActive: false,
        },
      ],
      deleteIds: [],
    });

    // create — "YYYY-MM" → 그 달 1일 UTC 자정 (@db.Date 규약, 단건 생성과 동일).
    const createData = tx.classProduct.create.mock.calls[0][0].data;
    expect(createData.billingMonth).toEqual(
      new Date("2026-08-01T00:00:00.000Z"),
    );
    // update — 무월 레거시 비활성 전환. billingMonth 는 생성 후 불변이라 update 에 미전송.
    const updCall = tx.classProduct.update.mock.calls.find(
      ([arg]) => arg?.where?.id === "legacy-1",
    );
    expect(updCall?.[0].data.isActive).toBe(false);
    expect(updCall?.[0].data.billingMonth).toBeUndefined();
  });
});

/**
 * W1 — DTO 레벨 feeType 화이트리스트(@IsIn) 검증.
 *   ValidationPipe 와 동일한 class-validator 경로로 불량값 거부를 확인한다.
 */
describe("BulkClassProductsDto feeType 검증", () => {
  const base = {
    productName: "테스트 패키지",
    price: 10000,
    sessionsPerMonth: 1,
  };

  it("허용 외 feeType 은 거부한다", async () => {
    const dto = plainToInstance(BulkClassProductsDto, {
      upserts: [{ ...base, feeType: "PER_SESSION_X" }],
      deleteIds: [],
    });
    const errors = await validate(dto, { whitelist: true });
    // 중첩(upserts[0].feeType) 위반이 보고되어야 함
    expect(errors.length).toBeGreaterThan(0);
    const flat = JSON.stringify(errors);
    expect(flat).toContain("feeType");
  });

  it("허용 feeType(PER_SESSION/MONTHLY_FIXED)은 통과한다", async () => {
    for (const feeType of ["PER_SESSION", "MONTHLY_FIXED"]) {
      const dto = plainToInstance(BulkClassProductsDto, {
        upserts: [{ ...base, feeType }],
        deleteIds: [],
      });
      const errors = await validate(dto, { whitelist: true });
      expect(errors).toHaveLength(0);
    }
  });

  it("billingMonth 는 YYYY-MM 형식만 허용한다", async () => {
    const bad = plainToInstance(BulkClassProductsDto, {
      upserts: [{ ...base, feeType: "MONTHLY_FIXED", billingMonth: "2026-8" }],
      deleteIds: [],
    });
    const badErrors = await validate(bad, { whitelist: true });
    expect(JSON.stringify(badErrors)).toContain("billingMonth");

    const ok = plainToInstance(BulkClassProductsDto, {
      upserts: [{ ...base, feeType: "MONTHLY_FIXED", billingMonth: "2026-08" }],
      deleteIds: [],
    });
    expect(await validate(ok, { whitelist: true })).toHaveLength(0);
  });
});
