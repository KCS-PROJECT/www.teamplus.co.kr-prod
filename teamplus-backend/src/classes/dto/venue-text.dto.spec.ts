import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CreateClassDto,
  DateScheduleItemDto,
  DayScheduleItemDto,
} from "./create-class.dto";
import { UpdateClassDto } from "./update-class.dto";
import {
  ApplyDraftAdditionDto,
  ApplyDraftEditDto,
} from "./apply-schedule-draft.dto";
import {
  CreateBulkScheduleDto,
  UpdateScheduleDto,
} from "./create-schedule.dto";

/**
 * [venueText v5.2 §3.3 · §7 · Codex IMPL-R1-M1] 장소 텍스트 100/101자 경계 — Nest ValidationPipe 와
 * 동일한 class-validator 계약(`@MaxLength(100)`)을 DTO 인스턴스에 직접 실행해 검증한다.
 * 프론트 `maxLength` 와 삭제 승격 `left(...,100)` 이 이 경계와 일치해야 한다(체크리스트 L).
 */
const text = (n: number) => "가".repeat(n);

const cases: {
  name: string;
  cls: new () => object;
  base: Record<string, unknown>;
}[] = [
  {
    name: "DayScheduleItemDto",
    cls: DayScheduleItemDto,
    base: { dayOfWeek: "월", startTime: "17:00", endTime: "18:00" },
  },
  { name: "UpdateClassDto", cls: UpdateClassDto, base: {} },
  {
    name: "ApplyDraftAdditionDto",
    cls: ApplyDraftAdditionDto,
    base: { date: "2026-09-10" },
  },
  {
    name: "ApplyDraftEditDto",
    cls: ApplyDraftEditDto,
    base: { scheduleId: "sch-1", baseUpdatedAt: "2026-09-01T10:00:00.000Z" },
  },
  {
    name: "CreateBulkScheduleDto (레거시)",
    cls: CreateBulkScheduleDto,
    base: {},
  },
  { name: "UpdateScheduleDto (레거시)", cls: UpdateScheduleDto, base: {} },
  // [IMPL-R2 Deferred] 독립 선언 8곳 전수 — 나머지 2종.
  {
    name: "CreateClassDto",
    cls: CreateClassDto,
    base: {
      className: "수업",
      instructorName: "코치",
      capacity: 10,
      billingMode: "PREPAID",
    },
  },
  {
    name: "DateScheduleItemDto",
    cls: DateScheduleItemDto,
    base: { date: "2026-09-10", startTime: "17:00", endTime: "18:00" },
  },
];

describe("venueText DTO 경계 — 100자 허용 / 101자 거부", () => {
  for (const { name, cls, base } of cases) {
    it(`${name}: 100자 통과`, async () => {
      const dto = plainToInstance(cls, { ...base, venueText: text(100) });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === "venueText")).toHaveLength(0);
    });

    it(`${name}: 101자 MaxLength 거부`, async () => {
      const dto = plainToInstance(cls, { ...base, venueText: text(101) });
      const errors = await validate(dto);
      const err = errors.find((e) => e.property === "venueText");
      expect(err).toBeDefined();
      expect(Object.keys(err!.constraints ?? {})).toContain("maxLength");
    });

    it(`${name}: 미전송은 통과(optional)`, async () => {
      const dto = plainToInstance(cls, { ...base });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === "venueText")).toHaveLength(0);
    });
  }

  it("빈 문자열은 validator 를 통과한다 — 삭제(null) 의미는 서비스 정규화가 담당", async () => {
    const dto = plainToInstance(UpdateScheduleDto, { venueText: "" });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === "venueText")).toHaveLength(0);
  });
});
