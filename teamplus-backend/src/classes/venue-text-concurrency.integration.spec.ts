/**
 * [venueText v5.2 §7 · AC-R2-5] Venue 삭제(텍스트 승격) ↔ 수업 장소 수정 실경쟁 integration spec.
 *
 * mock 검증이 증명하지 못하는 것 — 실제 PostgreSQL 에서 서로 다른 connection 두 개가
 * `venue:{venueId}` advisory lock 을 공유할 때, 어느 순서로 겹치더라도 링크장명이 유실되지
 * 않는지(= 최종 venue_text 가 "링크장명 …" 또는 수정 전 세부를 포함한 승격값이며, 세부 텍스트
 * 단독("B실")으로 남는 경우가 없는지) — 를 실측한다. W8(apply-draft 텍스트 단독 edit) · W7(단건
 * 수정) · W4(updateClass) · W5(updateAcademyClass) 네 writer 각각 삭제와 겹치고, 승격의 실제
 * 100자 절단 결과를 확인한다(Codex IMPL-R1-M1).
 *
 * 실행 전제(opt-in): `RUN_DB_INTEGRATION=1` + DB(.env DATABASE_URL) 접근 + **venue_text 컬럼 적용**
 *   (prisma/manual-migrations/20260903_class_venue_text.sql — release gate ①). 미설정 시 전체 skip.
 *   실행: RUN_DB_INTEGRATION=1 npm test -- venue-text-concurrency
 * 생성 row(링크장·수업·요일 기본값·회차·ledger)는 전부 정리한다 — null 초기화 + 존재 가드 +
 * try/finally + allSettled disconnect (schedule-cancel-concurrency 와 동일 규약).
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { ClassesService } from "./classes.service";
import { VenuesService } from "@/venues/venues.service";
import { PrismaService } from "@/prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "@/attendance/attendance-audit-log.service";

jest.setTimeout(120_000);

function buildClassesService(prisma: PrismaService): ClassesService {
  const teamsStub = {
    assertTeamManagerPermission: jest.fn().mockResolvedValue(undefined),
  };
  // updateClass 는 캐시 무효화·알림 협력자를 호출할 수 있어 no-op stub 을 준다.
  const redisStub = { del: jest.fn(), get: jest.fn(), set: jest.fn() };
  const configStub = {
    get: jest.fn(() => ({
      keyPrefix: { class: "class:" },
      cacheTTL: { classList: 300 },
    })),
  };
  const notificationsStub = {
    notifyTeamParents: jest.fn(),
    createNotification: jest.fn(),
  };
  const accessStub = {
    assertManageableClass: jest.fn().mockResolvedValue(undefined),
    assertManageableClassRecord: jest.fn().mockResolvedValue(undefined),
    assertTeamManager: jest.fn().mockResolvedValue(undefined),
    assertAcademyManager: jest.fn().mockResolvedValue(undefined),
  };
  return new ClassesService(
    prisma,
    redisStub as never,
    configStub as never,
    teamsStub as never,
    new CreditDomainService(),
    new AttendanceAuditLogService(prisma),
    accessStub as never,
    notificationsStub as never,
  );
}

const RUN = process.env.RUN_DB_INTEGRATION === "1";
const describeIf = RUN ? describe : describe.skip;

type Fixture = {
  venueId: string;
  venueName: string;
  classId: string;
  scheduleId: string;
  scheduleUpdatedAt: Date;
};

describeIf(
  "venueText — Venue 삭제 ↔ 장소 수정 실경쟁 (integration — 실제 DEV DB)",
  () => {
    const prismaA = new PrismaService(); // 삭제 측
    const prismaB = new PrismaService(); // 수정 측
    const raw = new PrismaClient();

    let teamId: string | null = null;
    let actorUserId: string | null = null;
    const createdVenueIds: string[] = [];
    const createdClassIds: string[] = [];
    // [IMPL-R2] W5 케이스용 아카데미 — 환경 의존 skip(false PASS) 대신 테스트가 직접 생성·정리.
    let createdAcademyId: string | null = null;

    /** 링크장 1 + 수업 1(대표·요일 기본값·회차 3층 모두 같은 링크장 + initialText) 픽스처. */
    const makeFixture = async (
      tag: string,
      opts: { academyId?: string; initialText?: string } = {},
    ): Promise<Fixture> => {
      if (!teamId) throw new Error("integration setup incomplete");
      const initialText = opts.initialText ?? "A실";
      const venueName = `[integration] 링크장 ${tag} ${Date.now()}`;
      const venue = await raw.venue.create({
        data: { name: venueName, status: "active" },
        select: { id: true },
      });
      createdVenueIds.push(venue.id);

      const future = new Date();
      future.setUTCDate(future.getUTCDate() + 10);
      future.setUTCHours(0, 0, 0, 0);
      const cls = await raw.class.create({
        data: {
          ...(opts.academyId
            ? { teamId: null, academyId: opts.academyId }
            : { teamId }),
          className: `[integration] venueText ${tag}`,
          instructorName: "integration",
          capacity: 10,
          startTime: future,
          endTime: new Date(future.getTime() + 3600_000),
          billingMode: "PREPAID",
          trainingType: opts.academyId ? "lesson" : "regular",
          approvalStatus: "APPROVED",
          venueId: venue.id,
          venueText: initialText,
          dayScheduleEntries: {
            create: {
              dayOfWeek: "월",
              startTime: "17:00",
              endTime: "18:00",
              venueId: venue.id,
              venueText: initialText,
            },
          },
          schedules: {
            create: {
              scheduledDate: future,
              startTime: "17:00",
              endTime: "18:00",
              venueId: venue.id,
              venueText: initialText,
            },
          },
        },
        select: {
          id: true,
          schedules: { select: { id: true, updatedAt: true } },
        },
      });
      createdClassIds.push(cls.id);
      return {
        venueId: venue.id,
        venueName,
        classId: cls.id,
        scheduleId: cls.schedules[0].id,
        scheduleUpdatedAt: cls.schedules[0].updatedAt,
      };
    };

    const readTexts = async (f: Fixture) => {
      const [c, d, s] = await Promise.all([
        raw.class.findUniqueOrThrow({
          where: { id: f.classId },
          select: { venueId: true, venueText: true },
        }),
        raw.classDaySchedule.findFirstOrThrow({
          where: { classId: f.classId },
          select: { venueId: true, venueText: true },
        }),
        raw.classSchedule.findUniqueOrThrow({
          where: { id: f.scheduleId },
          select: { venueId: true, venueText: true },
        }),
      ]);
      return { c, d, s };
    };

    beforeAll(async () => {
      const anyTeam = await raw.team.findFirstOrThrow({ select: { id: true } });
      const anyUser = await raw.user.findFirstOrThrow({ select: { id: true } });
      teamId = anyTeam.id;
      actorUserId = anyUser.id;
    });

    afterAll(async () => {
      try {
        if (createdClassIds.length > 0) {
          await raw.scheduleApplyOperation.deleteMany({
            where: { classId: { in: createdClassIds } },
          });
          await raw.classSchedule.deleteMany({
            where: { classId: { in: createdClassIds } },
          });
          await raw.classDaySchedule.deleteMany({
            where: { classId: { in: createdClassIds } },
          });
          await raw.class.deleteMany({
            where: { id: { in: createdClassIds } },
          });
        }
        if (createdVenueIds.length > 0) {
          await raw.venue.deleteMany({
            where: { id: { in: createdVenueIds } },
          });
        }
        if (createdAcademyId) {
          await raw.academy.deleteMany({ where: { id: createdAcademyId } });
        }
      } finally {
        await Promise.allSettled([
          prismaA.$disconnect(),
          prismaB.$disconnect(),
          raw.$disconnect(),
        ]);
      }
    });

    const draftEdit = (f: Fixture, venueText: string) =>
      ({
        operationId: randomUUID(),
        additions: [],
        edits: [
          {
            scheduleId: f.scheduleId,
            baseUpdatedAt: f.scheduleUpdatedAt.toISOString(),
            venueText,
          },
        ],
        cancellations: [],
      }) as never;

    // 허용 결과 2가지: 수정 선행(승격에 수정 세부 포함) / 삭제 선행(수정 409 → 원 세부 승격).
    const invariant = (
      text: string | null,
      venueName: string,
      editedDetail: string,
    ) => {
      expect([`${venueName} ${editedDetail}`, `${venueName} A실`]).toContain(
        text,
      );
    };

    // ── 순차: 수정 선행 → 삭제 ──
    it("수정 선행 — W8 텍스트 단독 edit 뒤 삭제하면 승격값에 수정된 세부가 포함된다", async () => {
      if (!actorUserId) throw new Error("integration setup incomplete");
      const f = await makeFixture("seq-edit-first");
      const svcB = buildClassesService(prismaB);
      const venues = new VenuesService(prismaA);

      await svcB.applyScheduleDraft(
        actorUserId,
        f.classId,
        draftEdit(f, "B실"),
        { teamId: teamId! },
      );
      await venues.deleteVenue(f.venueId, "ADMIN");

      const { c, d, s } = await readTexts(f);
      expect(s).toEqual({ venueId: null, venueText: `${f.venueName} B실` });
      expect(d).toEqual({ venueId: null, venueText: `${f.venueName} A실` });
      expect(c).toEqual({ venueId: null, venueText: `${f.venueName} A실` });
    });

    // ── 순차: 삭제 선행 → stale 수정 ──
    it("삭제 선행 — 승격(updated_at 갱신) 뒤 stale baseUpdatedAt 의 W8 edit 은 409 이고 승격 텍스트가 유지된다", async () => {
      if (!actorUserId) throw new Error("integration setup incomplete");
      const f = await makeFixture("seq-delete-first");
      const svcB = buildClassesService(prismaB);
      const venues = new VenuesService(prismaA);

      await venues.deleteVenue(f.venueId, "ADMIN");
      await expect(
        svcB.applyScheduleDraft(actorUserId, f.classId, draftEdit(f, "B실"), {
          teamId: teamId!,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "DRAFT_CONFLICT" }),
      });

      const { s } = await readTexts(f);
      expect(s.venueText).toBe(`${f.venueName} A실`);
    });

    // ── 실경쟁: 어느 순서든 링크장명 무손실 ──
    it("W8 텍스트 단독 edit 과 삭제가 동시에 겹쳐도 회차 venue_text 는 링크장명을 잃지 않는다", async () => {
      if (!actorUserId) throw new Error("integration setup incomplete");
      const f = await makeFixture("race-w8");
      const svcB = buildClassesService(prismaB);
      const venues = new VenuesService(prismaA);

      const [rd, re] = await Promise.allSettled([
        venues.deleteVenue(f.venueId, "ADMIN"),
        svcB.applyScheduleDraft(actorUserId, f.classId, draftEdit(f, "B실"), {
          teamId: teamId!,
        }),
      ]);
      expect(rd.status).toBe("fulfilled");
      // 수정은 성공(선행) 또는 409(후행) 둘 중 하나 — 다른 실패 유형은 없어야 한다.
      if (re.status === "rejected") {
        expect(re.reason).toMatchObject({
          response: expect.objectContaining({ errorCode: "DRAFT_CONFLICT" }),
        });
      }
      const { s } = await readTexts(f);
      expect(s.venueId).toBeNull();
      invariant(s.venueText, f.venueName, "B실");
    });

    it("W7 단건 수정(텍스트 단독)과 삭제가 겹쳐도 회차 venue_text 는 링크장명을 잃지 않는다", async () => {
      if (!actorUserId) throw new Error("integration setup incomplete");
      const f = await makeFixture("race-w7");
      const svcB = buildClassesService(prismaB);
      const venues = new VenuesService(prismaA);

      const [rd, re] = await Promise.allSettled([
        venues.deleteVenue(f.venueId, "ADMIN"),
        svcB.updateClassSchedule(
          actorUserId,
          f.scheduleId,
          { venueText: "B실" },
          { teamId: teamId! },
        ),
      ]);
      expect(rd.status).toBe("fulfilled");
      if (re.status === "rejected") {
        expect(re.reason).toMatchObject({
          response: expect.objectContaining({ errorCode: "VENUE_CHANGED" }),
        });
      }
      const { s } = await readTexts(f);
      expect(s.venueId).toBeNull();
      invariant(s.venueText, f.venueName, "B실");
    });

    it("W4 updateClass(venueText 단독)과 삭제가 겹쳐도 대표 Class venue_text 는 링크장명을 잃지 않는다", async () => {
      if (!actorUserId || !teamId)
        throw new Error("integration setup incomplete");
      const f = await makeFixture("race-w4");
      const svcB = buildClassesService(prismaB);
      const venues = new VenuesService(prismaA);

      const [rd, re] = await Promise.allSettled([
        venues.deleteVenue(f.venueId, "ADMIN"),
        svcB.updateClass(actorUserId, teamId, f.classId, {
          venueText: "B실",
        } as never),
      ]);
      expect(rd.status).toBe("fulfilled");
      if (re.status === "rejected") {
        expect(re.reason).toMatchObject({
          response: expect.objectContaining({ errorCode: "VENUE_CHANGED" }),
        });
      }
      const { c } = await readTexts(f);
      expect(c.venueId).toBeNull();
      invariant(c.venueText, f.venueName, "B실");
    });

    // [Codex IMPL-R1-M1] W5 — 아카데미 수업 대표 Class 텍스트 단독 수정과 삭제 실경쟁 (W4 대칭).
    it("W5 updateAcademyClass(venueText 단독)과 삭제가 겹쳐도 대표 Class venue_text 는 링크장명을 잃지 않는다", async () => {
      if (!actorUserId) throw new Error("integration setup incomplete");
      // 자급 fixture — 기존 user 를 감독으로 하는 아카데미를 생성해 W5 분기가 반드시 실행되게 한다.
      const academy = await raw.academy.create({
        data: {
          directorId: actorUserId,
          name: "[integration] venueText academy",
          code: `IT-VT-${Date.now()}`,
        },
        select: { id: true, directorId: true },
      });
      createdAcademyId = academy.id;
      const f = await makeFixture("race-w5", { academyId: academy.id });
      const svcB = buildClassesService(prismaB);
      const venues = new VenuesService(prismaA);

      const [rd, re] = await Promise.allSettled([
        venues.deleteVenue(f.venueId, "ADMIN"),
        svcB.updateAcademyClass(academy.directorId, academy.id, f.classId, {
          venueText: "B실",
        } as never),
      ]);
      expect(rd.status).toBe("fulfilled");
      if (re.status === "rejected") {
        expect(re.reason).toMatchObject({
          response: expect.objectContaining({ errorCode: "VENUE_CHANGED" }),
        });
      }
      const { c } = await readTexts(f);
      expect(c.venueId).toBeNull();
      invariant(c.venueText, f.venueName, "B실");
    });

    // [Codex IMPL-R1-M1] 삭제 승격 100자 절단 — `left(concat_ws(' ', name, venue_text), 100)` 실제 결과.
    it("삭제 승격은 링크장명을 보존하고 100자에서 절단한다", async () => {
      const longDetail = "세".repeat(95); // 링크장명(30자 내외) + ' ' + 95자 > 100
      const f = await makeFixture("promote-100", { initialText: longDetail });
      const venues = new VenuesService(prismaA);
      await venues.deleteVenue(f.venueId, "ADMIN");

      const { c, d, s } = await readTexts(f);
      for (const row of [c, d, s]) {
        expect(row.venueId).toBeNull();
        expect(row.venueText).toHaveLength(100);
        expect(row.venueText!.startsWith(`${f.venueName} `)).toBe(true);
      }
    });
  },
);
