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
      new ForbiddenException("이 수업의 감독/코치만 패키지를 수정할 수 있습니다."),
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
});
