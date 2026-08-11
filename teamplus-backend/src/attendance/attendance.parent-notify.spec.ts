import { AttendanceService } from "./attendance.service";

/**
 * 출석 상태 변경 → 학부모 알림 메시지 빌더 검증.
 *
 * 회귀 배경: 알림 발송 조건이 "수업권 변동"에 묶여 있어 수업권 미사용 정책
 * 전환(2026-07-13) 이후 인앱/푸시 알림이 전면 누락됐다. 조건을 출석 상태
 * 변동으로 교체하면서 최초 마킹·정정·취소 3가지 문구가 갈라졌다.
 */
describe("AttendanceService.notifyParentsOfModification", () => {
  const createService = () =>
    new AttendanceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  const createTx = (parentIds: string[] = ["parent-1"]) => {
    const createMany = jest.fn().mockResolvedValue({ count: parentIds.length });
    return {
      createMany,
      tx: {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ firstName: "길동", lastName: "홍" }),
        },
        parentChild: {
          findMany: jest
            .fn()
            .mockResolvedValue(parentIds.map((id) => ({ parentId: id }))),
        },
        notification: { createMany },
      } as never,
    };
  };

  const baseParams = {
    childUserId: "child-1",
    className: "화요일반",
    attendanceDate: new Date("2026-08-11T00:00:00Z"),
    reason: "",
  };

  it("최초 마킹(미체크 → 출석)도 알림을 보내고 '정정' 문구를 쓰지 않는다", async () => {
    const { tx, createMany } = createTx();
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: null,
      toStatus: "present",
    });

    expect(result.parentIds).toEqual(["parent-1"]);
    expect(result.message).toContain("화요일반에 출석 처리되었습니다");
    expect(result.message).not.toContain("정정");
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("수업권 정보가 없으면 '잔여 회차' 줄을 붙이지 않는다", async () => {
    const { tx } = createTx();
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: null,
      toStatus: "absent",
    });

    expect(result.message).toContain("결석 처리되었습니다");
    expect(result.message).not.toContain("잔여 회차");
    expect(result.message).not.toContain("0회");
  });

  it("상태 정정은 기존 문구를 유지하고 수업권 변동을 함께 표기한다", async () => {
    const { tx } = createTx();
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: "absent",
      toStatus: "present",
      creditsBefore: 3,
      creditsAfter: 2,
    });

    expect(result.message).toContain("결석에서 출석으로 정정되었습니다");
    expect(result.message).toContain("잔여 회차: 3회 → 2회");
  });

  it("처리 취소(→ 미체크)도 알림을 보낸다", async () => {
    const { tx } = createTx();
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: "present",
      toStatus: "unchecked",
    });

    expect(result.message).toContain("출석 처리가 취소되었습니다");
    expect(result.message).not.toContain("잔여 회차");
  });

  it("사유가 있으면 사유 줄을 덧붙인다", async () => {
    const { tx } = createTx();
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: "present",
      toStatus: "absent",
      reason: "지각 확인",
    });

    expect(result.message).toContain("사유: 지각 확인.");
  });

  it("보호자 전원에게 동일 제목으로 인앱 알림을 적재한다", async () => {
    const { tx, createMany } = createTx(["parent-1", "parent-2"]);
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: null,
      toStatus: "present",
    });

    expect(result.parentIds).toEqual(["parent-1", "parent-2"]);
    expect(result.title).toBe("자녀 출석 안내");
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: "parent-1",
          notificationType: "attendance_modified",
          title: "자녀 출석 안내",
          linkUrl: "/attendance-history",
        }),
        expect.objectContaining({ userId: "parent-2" }),
      ],
    });
  });

  it("보호자가 없으면 알림을 적재하지 않는다", async () => {
    const { tx, createMany } = createTx([]);
    const result = await createService().notifyParentsOfModification(tx, {
      ...baseParams,
      fromStatus: null,
      toStatus: "present",
    });

    expect(result.parentIds).toEqual([]);
    expect(createMany).not.toHaveBeenCalled();
  });
});
