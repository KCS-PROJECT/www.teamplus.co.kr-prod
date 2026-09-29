import { ForbiddenException } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";

/**
 * 회원 출석 이력 조회 — 수업 단위(classId) 필터 계약.
 *   - classId 미지정: 기존 "최근 N건" 조회 그대로(where memberId, take=limit).
 *   - classId 지정: 해당 수업(취소 회차 제외) 출석만, limit 대신 상한(500)으로 전체 조회.
 *   - 권한 검사는 classId 유무와 무관하게 동일(부모-자녀 관계 없으면 403).
 */
describe("AttendanceService.getMemberAttendanceHistory — classId 필터", () => {
  const build = (opts: { isParentOf?: boolean } = {}) => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      parentChild: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.isParentOf === false ? null : { id: "pc-1" }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ userType: "PARENT" }),
      },
      teamMember: { findFirst: jest.fn().mockResolvedValue(null) },
      team: { findFirst: jest.fn().mockResolvedValue(null) },
      classAttendance: { findMany },
    };
    const service = new AttendanceService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, findMany };
  };

  it("classId 미지정 — 기존 조회 조건·limit 유지", async () => {
    const { service, findMany } = build();
    await service.getMemberAttendanceHistory("parent-1", "child-1", 10);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ memberId: "child-1" });
    expect(args.take).toBe(10);
  });

  it("classId 지정 — 해당 수업만, limit 대신 상한 500", async () => {
    const { service, findMany } = build();
    await service.getMemberAttendanceHistory(
      "parent-1",
      "child-1",
      10,
      "class-1",
    );
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      memberId: "child-1",
      schedule: { classId: "class-1", isCancelled: false },
    });
    expect(args.take).toBe(500);
  });

  it("부모-자녀 관계가 없으면 classId 를 넘겨도 403 — 조회 없음", async () => {
    const { service, findMany } = build({ isParentOf: false });
    await expect(
      service.getMemberAttendanceHistory(
        "parent-1",
        "child-9",
        10,
        "class-1",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
