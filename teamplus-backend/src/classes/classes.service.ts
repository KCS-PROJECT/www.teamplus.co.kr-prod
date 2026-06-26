import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "@/attendance/attendance-audit-log.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";
import {
  computePackageGuardMeta,
  isClassEnded as isClassEndedUtil,
  shouldHideInactiveFor,
} from "./utils/package-guard.util";
import { CreateClassDto, DayScheduleItemDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { CreateClassProductDto } from "./dto/create-product.dto";
import { GetClassesQueryDto } from "./dto/get-classes-query.dto";
import { TeamsService } from "@/teams/teams.service";

/**
 * ClassProduct 생성 헬퍼 — 입력 가격 + 정기 패키지 메타로 1~2개 상품 생성.
 *
 * 정기 패키지 단위는 "주 N회 + 주 수 + 총 회수" 정수 단위로 표현 (회의록 2026-04-23 정합).
 *  - durationDays = packageWeeks × 7 (만료일 SoT)
 *  - sessionsPerMonth = packageTotalSessions (발급 크레딧 수량 — 컬럼명 무관 "총 회수" 의미)
 *  - sessionsPerWeek = classDays.length (주 빈도 — 항상 정수)
 *  - 입력 누락 시 안전 폴백: weeks=4, totalSessions=4, perWeek=1 (기존 시드 호환)
 *
 */
function buildClassProducts(
  classId: string,
  dto: {
    singlePrice?: number;
    monthlyPrice?: number;
    packageWeeks?: number;
    packageTotalSessions?: number;
    classDays?: string[];
    billingMode?: string;
  },
): Array<{
  classId: string;
  productName: string;
  description?: string;
  feeType: string;
  price: number;
  sessionsPerMonth: number;
  sessionsPerWeek?: number;
  durationDays: number;
  billingTiming?: string;
  feePerSession?: number;
  isActive?: boolean;
}> {
  const products: ReturnType<typeof buildClassProducts> = [];

  // [Phase B-5] 후불(POSTPAID) — "1회 수업료"(singlePrice=feePerSession) 상품 1개.
  //   출석 횟수 × feePerSession 으로 월말 정산(B-3). price 는 단가 스냅샷.
  if (dto.billingMode === "POSTPAID") {
    if (dto.singlePrice) {
      products.push({
        classId,
        productName: "1회 수업료",
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        price: dto.singlePrice,
        feePerSession: dto.singlePrice,
        sessionsPerMonth: 1,
        durationDays: 30,
      });
    }
    return products;
  }

  // BOTH(선택형): 1회 수업료 PER_SESSION 을 "후불 옵션"(billingTiming=POSTPAID·판매)으로 생성.
  //   학생이 후불을 택1하면 이 상품을 classProductId 로 선택 → feePerSession 으로 월말 정산.
  //   정액(MONTHLY_FIXED, 선불 옵션)은 monthlyPrice 또는 PackageManageSection 경유로 함께 제공.
  // PREPAID(선불 전용): 1회 수업료 PER_SESSION 은 비판매(isActive:false)로 보존 —
  //   단가 참고·표시용이며 구매/발급 경로에 노출되지 않는다.
  const isBoth = dto.billingMode === "BOTH";

  if (dto.singlePrice) {
    products.push({
      classId,
      productName: "1회 수업료",
      feeType: "PER_SESSION",
      billingTiming: isBoth ? "POSTPAID" : "PREPAID",
      isActive: isBoth, // BOTH=판매(후불옵션) / PREPAID=비판매(참고용)
      price: dto.singlePrice,
      feePerSession: isBoth ? dto.singlePrice : undefined,
      sessionsPerMonth: 1,
      durationDays: 30,
    });
  }

  if (dto.monthlyPrice) {
    const weeks = Math.max(1, Math.min(52, dto.packageWeeks ?? 4));
    const totalSessions = Math.max(
      1,
      Math.min(728, dto.packageTotalSessions ?? 4),
    );
    // SPEC §8 cross 검증: totalSessions ≥ weeks (최소 주 1회) · totalSessions ≤ weeks × 14
    if (totalSessions < weeks) {
      throw new BadRequestException(
        `정기 패키지 총 회수(${totalSessions})는 주 수(${weeks}) 이상이어야 합니다.`,
      );
    }
    if (totalSessions > weeks * 14) {
      throw new BadRequestException(
        `정기 패키지 총 회수(${totalSessions})는 주 수×14(${weeks * 14}) 이하여야 합니다.`,
      );
    }
    const perWeek = Math.max(
      1,
      dto.classDays?.length ?? Math.ceil(totalSessions / weeks),
    );
    products.push({
      classId,
      productName: `${weeks}주 정기권`,
      description: `${weeks}주간 총 ${totalSessions}회 수강 · 주 ${perWeek}회`,
      feeType: "MONTHLY_FIXED",
      price: dto.monthlyPrice,
      sessionsPerMonth: totalSessions,
      sessionsPerWeek: perWeek,
      durationDays: weeks * 7,
    });
  }

  return products;
}

// ─── ClassDaySchedule 헬퍼 ──────────────────────────────────────────────────

/** buildDayTimeMap 전용 최소 입력 타입 — venueId 없는 plain 호출(bulk 경로)도 수용. */
type DayTimeInput = { dayOfWeek: string; startTime: string; endTime: string; venueId?: string };

/**
 * daySchedules 배열을 요일 → {startHH, startMM, endHH, endMM, venueId} 맵으로 변환.
 * 빈 입력이면 빈 Map 반환.
 */
function buildDayTimeMap(
  daySchedules?: DayTimeInput[],
): Map<string, { startHH: number; startMM: number; endHH: number; endMM: number; venueId?: string }> {
  const map = new Map<string, { startHH: number; startMM: number; endHH: number; endMM: number; venueId?: string }>();
  if (!daySchedules || daySchedules.length === 0) return map;
  for (const ds of daySchedules) {
    const [startHH, startMM] = ds.startTime.split(":").map(Number);
    const [endHH, endMM] = ds.endTime.split(":").map(Number);
    map.set(ds.dayOfWeek, { startHH, startMM, endHH, endMM, venueId: ds.venueId });
  }
  return map;
}

/**
 * daySchedules 에서 "가장 이른 startTime" 요일의 대표값을 산출.
 * Class.startTime/endTime/venueId/classDays 하위호환 채움용.
 *
 * 반환값의 startTime/endTime 은 기존 코드가 getUTCHours/getUTCMinutes 로
 * 시:분을 추출하는 방식과 일관되도록 UTC Date(today 기준 Y-m-d + HH:MM:00 UTC) 로 생성.
 *
 * 입력이 없으면 null 반환 — 기존 단일 startTime 경로로 폴백.
 */
function deriveRepresentative(daySchedules?: DayScheduleItemDto[]): {
  startTime: Date;
  endTime: Date;
  venueId?: string;
  classDays: string[];
} | null {
  if (!daySchedules || daySchedules.length === 0) return null;

  let earliest = daySchedules[0];
  for (const ds of daySchedules) {
    const [h, m] = ds.startTime.split(":").map(Number);
    const [eh, em] = earliest.startTime.split(":").map(Number);
    if (h < eh || (h === eh && m < em)) earliest = ds;
  }

  const [startHH, startMM] = earliest.startTime.split(":").map(Number);
  const [endHH, endMM] = earliest.endTime.split(":").map(Number);

  // UTC 기반 Date 생성 (기존 일정 생성 코드의 dt.setHours(hh, mm, 0, 0) 패턴과 동일).
  const now = new Date();
  const startTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), startHH, startMM, 0, 0));
  const endTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), endHH, endMM, 0, 0));

  return {
    startTime,
    endTime,
    venueId: earliest.venueId,
    classDays: daySchedules.map((ds) => ds.dayOfWeek),
  };
}

/**
 * dateSchedules(날짜별 일정)에서 Class.startTime/endTime/venueId/classDays 대표값 산출.
 * 가장 이른 날짜·시간의 항목을 대표로 사용.
 * classDays: 모든 날짜의 요일 집합 (중복 제거 · 월~일 순 정렬).
 * 입력이 없으면 null 반환.
 */
function deriveRepresentativeFromDateSchedules(
  dateSchedules?: import("./dto/create-class.dto").DateScheduleItemDto[],
): {
  startTime: Date;
  endTime: Date;
  venueId?: string;
  classDays: string[];
} | null {
  if (!dateSchedules || dateSchedules.length === 0) return null;

  // 가장 이른 날짜+시간 항목 선택
  let earliest = dateSchedules[0];
  for (const s of dateSchedules) {
    if (s.date < earliest.date) {
      earliest = s;
    } else if (s.date === earliest.date) {
      const [h, m] = s.startTime.split(":").map(Number);
      const [eh, em] = earliest.startTime.split(":").map(Number);
      if (h < eh || (h === eh && m < em)) earliest = s;
    }
  }

  const [startHH, startMM] = earliest.startTime.split(":").map(Number);
  const [endHH, endMM] = earliest.endTime.split(":").map(Number);
  const now = new Date();
  const startTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), startHH, startMM, 0, 0));
  const endTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), endHH, endMM, 0, 0));

  // 날짜별 요일 파생 — 중복 제거 후 월~일 순 정렬
  const KO_DAY_NAMES: Record<number, string> = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };
  const KO_DAY_ORDER: Record<string, number> = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };
  const daySet = new Set<string>();
  for (const s of dateSchedules) {
    const dow = new Date(`${s.date}T00:00:00`).getDay();
    const name = KO_DAY_NAMES[dow];
    if (name) daySet.add(name);
  }
  const classDays = Array.from(daySet).sort(
    (a, b) => (KO_DAY_ORDER[a] ?? 99) - (KO_DAY_ORDER[b] ?? 99),
  );

  return { startTime, endTime, venueId: earliest.venueId, classDays };
}

/** "HH:mm" → 분(0~1439). 형식은 DTO @Matches 가 보장. */
function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 회차 단위 시간 순서 검증 — daySchedules/dateSchedules 각 행의 시작<종료 보장.
 * Class 레벨 startTime/endTime(ISO) 검증과 별개로, "HH:mm" 회차 시간이 역전되면
 * 잘못된 일정이 그대로 저장되던 구멍을 막는다. 한 행이라도 시작>=종료면 400.
 */
function assertScheduleTimeRanges(
  daySchedules?: { startTime: string; endTime: string }[],
  dateSchedules?: { startTime: string; endTime: string }[],
): void {
  for (const s of [...(daySchedules ?? []), ...(dateSchedules ?? [])]) {
    if (hhmmToMinutes(s.startTime) >= hhmmToMinutes(s.endTime)) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly teamsService: TeamsService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 수업 일정 취소 시 일괄 복원
    private readonly auditLog: AttendanceAuditLogService, // PR-C (v0.6): AuditLog
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 수업 생성 (감독만)
   */
  async createClass(
    coachUserId: string,
    teamId: string,
    createDto: CreateClassDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수업을 생성할 수 있습니다.",
    );

    // 클럽 존재 확인
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!club) {
      throw new NotFoundException("클럽을 찾을 수 없습니다.");
    }

    // 시간 검증
    if (
      createDto.startTime &&
      createDto.endTime &&
      new Date(createDto.startTime) >= new Date(createDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(createDto.daySchedules, createDto.dateSchedules);

    // 카테고리 자동 계산
    let category = createDto.category;
    if (!category && (createDto.ageMin || createDto.ageMax)) {
      if (createDto.ageMax && createDto.ageMax <= 12) category = "KIDS";
      else if (
        createDto.ageMin &&
        createDto.ageMin >= 13 &&
        createDto.ageMax &&
        createDto.ageMax <= 18
      )
        category = "JUNIOR";
      else if (createDto.ageMin && createDto.ageMin >= 19) category = "ADULT";
    }

    // 2026-05-12: 배정 코치 ID 정합 검증 — 회의록 정합 (정해진 감독 코치만, 외부 게스트 제외).
    //   - DIRECTOR/감독: Team.coachId (owner) 매핑 — CoachProfile 없을 수 있음
    //   - COACH/학원 감독: CoachProfile.teamId 매핑
    //   - 둘 중 하나라도 같은 팀이면 통과.
    // 1번째 = LEAD, 나머지 = ASSISTANT. coachUserIds 비어있으면 createDto.coachId 또는 팀 감독(club.coachId) 폴백.
    const assignedCoachUserIds: string[] = [];
    if (createDto.coachUserIds && createDto.coachUserIds.length > 0) {
      const [validProfiles, teamOwners] = await Promise.all([
        this.prisma.coachProfile.findMany({
          where: { userId: { in: createDto.coachUserIds }, teamId },
          select: { userId: true },
        }),
        this.prisma.team.findMany({
          where: { id: teamId, coachId: { in: createDto.coachUserIds } },
          select: { coachId: true },
        }),
      ]);
      const validSet = new Set<string>([
        ...validProfiles.map((p) => p.userId),
        ...teamOwners.map((t) => t.coachId),
      ]);
      for (const uid of createDto.coachUserIds) {
        if (validSet.has(uid)) assignedCoachUserIds.push(uid);
      }
    }
    const primaryCoachId =
      assignedCoachUserIds[0] || createDto.coachId || club.coachId;

    // 수업 + 수강료 상품을 원자적으로 생성 — 중간 실패 시 가격 없는 좀비 수업 방지
    // [2026-06-05] daySchedules 대표값 산출 — daySchedules 가 있으면 가장 이른 요일의 시각으로
    //   Class.startTime/endTime/venueId/classDays 를 채운다 (하위호환 보장).
    const hasDateSchedules = (createDto.dateSchedules?.length ?? 0) > 0;
    const dateRepresentative = hasDateSchedules
      ? deriveRepresentativeFromDateSchedules(createDto.dateSchedules)
      : null;
    const hasDaySchedules = (createDto.daySchedules?.length ?? 0) > 0;
    const representative = hasDaySchedules ? deriveRepresentative(createDto.daySchedules) : null;

    const classRecord = await this.prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          teamId,
          className: createDto.className,
          description: createDto.description,
          instructorName: createDto.instructorName ?? "",
          capacity: createDto.capacity ?? 0,
          targetBirthYears: createDto.targetBirthYears ?? [],
          // targetBirthYears(SoT) 가 있으면 ageMin/ageMax 는 한국나이 파생값으로 기록,
          //   없으면 기존 ageMin/ageMax 값을 그대로 유지(하위호환 — 구 폼/타 화면 대응).
          ...(createDto.targetBirthYears && createDto.targetBirthYears.length > 0
            ? this.deriveAgeRangeFromBirthYears(createDto.targetBirthYears)
            : { ageMin: createDto.ageMin, ageMax: createDto.ageMax }),
          levelRequired: createDto.levelRequired,
          // 우선순위: dateSchedules 대표값 > daySchedules 대표값 > 기존 단일 startTime 경로(하위호환)
          startTime: dateRepresentative?.startTime
            ?? representative?.startTime
            ?? (createDto.startTime ? new Date(createDto.startTime) : new Date()),
          endTime: dateRepresentative?.endTime
            ?? representative?.endTime
            ?? (createDto.endTime ? new Date(createDto.endTime) : new Date()),
          trainingType: createDto.trainingType,
          coachId: primaryCoachId,
          venueId: dateRepresentative !== null
            ? (dateRepresentative.venueId ?? null)
            : representative?.venueId !== undefined
              ? (representative.venueId ?? null)
              : (createDto.venueId ?? null),
          // dateSchedules/daySchedules 있으면 날짜/요일 집합으로 자동 세팅.
          classDays: dateRepresentative?.classDays ?? representative?.classDays ?? createDto.classDays ?? [],
          category,
          requiredCoaches: createDto.requiredCoaches ?? 1,
          // 결제 방식 — 감독 지정 (PREPAID 선불 / POSTPAID 후불 / BOTH 선택형). 미전송 시 BOTH(기본).
          billingMode: createDto.billingMode ?? "BOTH",
          // 2026-05-08: 수업 자동 승인 — 감독/코치가 만든 수업은 즉시 활성화.
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedBy: coachUserId,
          isActive: true,
        },
      });

      // [2026-06-05] ClassDaySchedule 행 생성 (daySchedules 전송 시)
      if (hasDaySchedules && createDto.daySchedules && createDto.daySchedules.length > 0) {
        await tx.classDaySchedule.createMany({
          data: createDto.daySchedules.map((ds) => ({
            classId: created.id,
            dayOfWeek: ds.dayOfWeek,
            startTime: ds.startTime,
            endTime: ds.endTime,
            venueId: ds.venueId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      if (createDto.singlePrice || createDto.monthlyPrice) {
        const products = buildClassProducts(created.id, {
          ...createDto,
          billingMode: createDto.billingMode ?? "BOTH",
        });
        if (products.length > 0) {
          await tx.classProduct.createMany({ data: products });
        }
      }

      // 날짜별 일정(dateSchedules) → ClassSchedule 직접 생성 (요일 기반 자동 생성과 배타적).
      if (createDto.dateSchedules && createDto.dateSchedules.length > 0) {
        await tx.classSchedule.createMany({
          data: createDto.dateSchedules.map((s) => ({
            classId: created.id,
            scheduledDate: new Date(`${s.date}T00:00:00`),
            startTime: s.startTime,
            endTime: s.endTime,
            venueId: s.venueId ?? null,
          })),
        });
      }

      // 정규 수업은 등록 시 일정을 생성하지 않는다 — 일정은 개설 후 일정 관리 화면(미니달력)에서
      //   별도로 누적 추가한다. (시작일/종료일 기반 자동 일괄 생성 폐기)
      //   · dateSchedules(미니달력 직접 입력) 경로는 위에서 별도 처리.

      // 2026-05-12: 배정 코치 ClassCoachAssignment 자동 생성 (status: ACCEPTED).
      //  - 1번째 = LEAD, 나머지 = ASSISTANT
      //  - 회의록 정합: "정해진 감독 코치" 같은 팀 코치만 (CoachProfile 검증 위에서 완료)
      //  - 즉시 ACCEPTED 처리 — 폼 등록자가 본인 권한으로 배정 (응답 단계 불필요)
      if (assignedCoachUserIds.length > 0) {
        const now = new Date();
        await tx.classCoachAssignment.createMany({
          data: assignedCoachUserIds.map((userId, idx) => ({
            classId: created.id,
            coachUserId: userId,
            invitedBy: coachUserId,
            role: idx === 0 ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    // 캐시 무효화 — 트랜잭션 외부(Redis I/O)
    await this.invalidateClassCache(teamId);

    // 2026-05-12: 배정된 코치에게 "수업 배정 알림" 발송 (등록자 본인 제외).
    //  - 회의록 5:50 "감독 공지" 패턴 정합 — 출처(감독) 명시 메시지.
    //  - 알림 페이지(/notifications) + 종 아이콘 배지에 즉시 반영됨.
    const notifyTargets = assignedCoachUserIds.filter(
      (uid) => uid !== coachUserId,
    );
    if (notifyTargets.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: coachUserId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "DIRECTOR"
          ? "감독"
          : inviter?.userType === "ACADEMY_DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: notifyTargets.map((userId) => ({
          userId,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${classRecord.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    // 팀 소속 학생의 학부모에게 새 수업 등록 알림 (실패 격리)
    void this.notificationsService.notifyTeamParents(teamId, {
      notificationType: "class_created",
      title: "새 수업 등록",
      message: classRecord.className,
      linkUrl: `/classes/${classRecord.id}`,
    });

    return {
      id: classRecord.id,
      teamId: classRecord.teamId,
      className: classRecord.className,
      instructorName: classRecord.instructorName,
      capacity: classRecord.capacity,
      startTime: classRecord.startTime,
      endTime: classRecord.endTime,
      isActive: classRecord.isActive,
      createdAt: classRecord.createdAt,
    };
  }

  /**
   * 아카데미 수업 생성 (아카데미 감독만)
   */
  async createAcademyClass(
    directorUserId: string,
    academyId: string,
    createDto: CreateClassDto,
  ) {
    // 아카데미 존재 + 감독 권한 확인
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== directorUserId) {
      // 소속 코치인지 확인
      const academyCoach = await this.prisma.academyCoach.findUnique({
        where: {
          academyId_userId: { academyId, userId: directorUserId },
        },
      });
      if (!academyCoach) {
        throw new ForbiddenException(
          "이 아카데미의 감독 또는 코치만 수업을 생성할 수 있습니다.",
        );
      }
    }

    // orphan 방지: academyId가 반드시 존재해야 함
    if (!academyId) {
      throw new BadRequestException("클럽 또는 아카데미 중 하나는 필수입니다.");
    }

    // 시간 검증
    if (
      createDto.startTime &&
      createDto.endTime &&
      new Date(createDto.startTime) >= new Date(createDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(createDto.daySchedules, createDto.dateSchedules);

    // 카테고리 자동 계산
    let category = createDto.category;
    if (!category && (createDto.ageMin || createDto.ageMax)) {
      if (createDto.ageMax && createDto.ageMax <= 12) category = "KIDS";
      else if (
        createDto.ageMin &&
        createDto.ageMin >= 13 &&
        createDto.ageMax &&
        createDto.ageMax <= 18
      )
        category = "JUNIOR";
      else if (createDto.ageMin && createDto.ageMin >= 19) category = "ADULT";
    }

    // [2026-05-13] 배정 코치 정합 검증 — 팀 createClass 패턴을 학원 도메인으로 이식.
    //   - 학원 코치: AcademyCoach.where({ academyId, userId }) 매핑
    //   - 학원 감독(directorId) 본인도 배정 가능 (별도 AcademyCoach 행 없을 수 있음)
    //   - 둘 중 하나라도 해당하면 통과.
    //   1번째 = LEAD, 나머지 = ASSISTANT. coachUserIds 비어있으면 createDto.coachId 또는 학원 감독(academy.directorId) 폴백.
    const assignedCoachUserIds: string[] = [];
    if (createDto.coachUserIds && createDto.coachUserIds.length > 0) {
      const validAcademyCoaches = await this.prisma.academyCoach.findMany({
        where: {
          academyId,
          userId: { in: createDto.coachUserIds },
          isActive: true,
        },
        select: { userId: true },
      });
      const validSet = new Set<string>([
        ...validAcademyCoaches.map((c) => c.userId),
        // 감독 본인도 배정 가능 (위에서 academy 조회 완료, directorId 확정)
        academy.directorId,
      ]);
      for (const uid of createDto.coachUserIds) {
        if (validSet.has(uid)) assignedCoachUserIds.push(uid);
      }
    }
    const primaryCoachId =
      assignedCoachUserIds[0] || createDto.coachId || academy.directorId;

    // 수업 + 수강료 상품을 원자적으로 생성 — 중간 실패 시 가격 없는 좀비 수업 방지
    // schedulesCreated 는 트랜잭션 내부에서 setting 후 응답 객체로 노출 (운영자 즉시 피드백용)
    // [2026-06-05] daySchedules 대표값 산출 (학원 도메인 — lesson 전용)
    const hasDaySchedulesAcademy = (createDto.daySchedules?.length ?? 0) > 0;
    const representativeAcademy = hasDaySchedulesAcademy ? deriveRepresentative(createDto.daySchedules) : null;
    const dayTimeMapAcademy = hasDaySchedulesAcademy ? buildDayTimeMap(createDto.daySchedules) : new Map();

    let schedulesCreated = 0;
    const classRecord = await this.prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          teamId: null,
          academyId,
          className: createDto.className,
          description: createDto.description,
          instructorName: createDto.instructorName ?? "",
          capacity: createDto.capacity ?? 0,
          targetBirthYears: createDto.targetBirthYears ?? [],
          // targetBirthYears(SoT) 가 있으면 ageMin/ageMax 는 한국나이 파생값으로 기록,
          //   없으면 기존 ageMin/ageMax 값을 그대로 유지(하위호환 — 구 폼/타 화면 대응).
          ...(createDto.targetBirthYears && createDto.targetBirthYears.length > 0
            ? this.deriveAgeRangeFromBirthYears(createDto.targetBirthYears)
            : { ageMin: createDto.ageMin, ageMax: createDto.ageMax }),
          levelRequired: createDto.levelRequired,
          // daySchedules 있으면 대표값, 없으면 기존 단일 경로(하위호환)
          startTime: representativeAcademy?.startTime
            ?? (createDto.startTime ? new Date(createDto.startTime) : new Date()),
          endTime: representativeAcademy?.endTime
            ?? (createDto.endTime ? new Date(createDto.endTime) : new Date()),
          trainingType: createDto.trainingType ?? "lesson",
          coachId: primaryCoachId,
          venueId: representativeAcademy?.venueId !== undefined
            ? (representativeAcademy.venueId ?? null)
            : (createDto.venueId ?? null),
          classDays: representativeAcademy?.classDays ?? createDto.classDays ?? [],
          category,
          requiredCoaches: createDto.requiredCoaches ?? 1,
          // 결제 방식 — 감독 지정 (PREPAID 선불 / POSTPAID 후불 / BOTH 선택형). 미전송 시 BOTH(기본).
          billingMode: createDto.billingMode ?? "BOTH",
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedBy: directorUserId,
          isActive: true,
        },
      });

      // [2026-06-05] ClassDaySchedule 행 생성 (daySchedules 전송 시)
      if (hasDaySchedulesAcademy && createDto.daySchedules && createDto.daySchedules.length > 0) {
        await tx.classDaySchedule.createMany({
          data: createDto.daySchedules.map((ds) => ({
            classId: created.id,
            dayOfWeek: ds.dayOfWeek,
            startTime: ds.startTime,
            endTime: ds.endTime,
            venueId: ds.venueId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      // [2026-06-09] 오픈클래스 날짜별 일정(dateSchedules) → ClassSchedule 직접 생성.
      //   미니달력으로 입력한 날짜/시간/장소를 그대로 저장. (요일 기반 자동 생성과 배타적)
      if (createDto.dateSchedules && createDto.dateSchedules.length > 0) {
        await tx.classSchedule.createMany({
          data: createDto.dateSchedules.map((s) => ({
            classId: created.id,
            scheduledDate: new Date(`${s.date}T00:00:00`),
            startTime: s.startTime,
            endTime: s.endTime,
            venueId: s.venueId ?? null,
          })),
        });
      }

      // 오픈클래스도 팀과 동일하게 singlePrice/monthlyPrice → buildClassProducts 경로 사용.
      //   상세 패키지(다중 플랜)는 수업 상세 "수강 플랜" 섹션에서 PackageEditSheet 로 관리.
      if (createDto.singlePrice || createDto.monthlyPrice) {
        const products = buildClassProducts(created.id, {
          ...createDto,
          billingMode: createDto.billingMode ?? "BOTH",
        });
        if (products.length > 0) {
          await tx.classProduct.createMany({ data: products });
        }
      }

      // [2026-05-13] 오픈클래스 수업 일정 자동 일괄 생성 — 팀 정규와 동일 패턴.
      // [2026-06-05] daySchedules 있으면 요일별 시각 적용, 없으면 기존 단일 startTime 경로(하위호환).
      //   - autoGenerateSchedules=true(또는 미전송) + startDate/endDate/effectiveClassDays 모두 있을 때
      //   - 안전 상한 200건
      //   - 4개 필드 중 누락 시 명시적 logger.warn 사유 기록 (silent skip 제거)
      //   - 응답 객체에 schedulesCreated 카운트 포함 → 운영자가 폼 누락 즉시 인지 가능
      const effectiveClassDaysAcademy = representativeAcademy?.classDays ?? createDto.classDays;
      if (createDto.dateSchedules && createDto.dateSchedules.length > 0) {
        // [2026-06-09] 날짜별 일정으로 ClassSchedule 직접 생성됨 — 요일 기반 자동 생성 스킵.
      } else if (createDto.autoGenerateSchedules === false) {
        this.logger.warn(
          `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — autoGenerateSchedules=false (사용자 선택)`,
        );
      } else {
        const missingFields: string[] = [];
        if (!createDto.startDate) missingFields.push("startDate");
        if (!createDto.endDate) missingFields.push("endDate");
        if (!effectiveClassDaysAcademy?.length) missingFields.push("classDays");
        if (!hasDaySchedulesAcademy && !createDto.startTime) missingFields.push("startTime");

        if (missingFields.length > 0) {
          this.logger.warn(
            `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 누락 필드: ${missingFields.join(", ")}`,
          );
        } else {
          const start = new Date(`${createDto.startDate}T00:00:00`);
          const end = new Date(`${createDto.endDate}T23:59:59`);
          if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
            this.logger.warn(
              `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 잘못된 날짜 범위 (start=${createDto.startDate}, end=${createDto.endDate})`,
            );
          } else {
            const dayMap: Record<string, number> = {
              일: 0,
              월: 1,
              화: 2,
              수: 3,
              목: 4,
              금: 5,
              토: 6,
            };
            const dowToNameAcademy: Record<number, string> = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };
            const targetDows = new Set(
              effectiveClassDaysAcademy!
                .map((d) => dayMap[d])
                .filter((v) => v !== undefined),
            );
            if (targetDows.size === 0) {
              this.logger.warn(
                `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 유효한 요일 없음 (classDays=${JSON.stringify(effectiveClassDaysAcademy)})`,
              );
            } else {
              // 단일 startTime 폴백 hh/mm
              const fallbackDtAcademy = createDto.startTime ? new Date(createDto.startTime) : null;
              const fallbackHHAcademy = fallbackDtAcademy?.getUTCHours() ?? 0;
              const fallbackMMAcademy = fallbackDtAcademy?.getUTCMinutes() ?? 0;

              const candidateDates: Date[] = [];
              const cursor = new Date(start);
              cursor.setHours(0, 0, 0, 0);
              while (cursor <= end && candidateDates.length <= 200) {
                const dow = cursor.getDay();
                if (targetDows.has(dow)) {
                  const dt = new Date(cursor);
                  if (hasDaySchedulesAcademy) {
                    const dayName = dowToNameAcademy[dow];
                    const entry = dayName ? dayTimeMapAcademy.get(dayName) : undefined;
                    dt.setHours(entry?.startHH ?? fallbackHHAcademy, entry?.startMM ?? fallbackMMAcademy, 0, 0);
                  } else {
                    dt.setHours(fallbackHHAcademy, fallbackMMAcademy, 0, 0);
                  }
                  candidateDates.push(dt);
                }
                cursor.setDate(cursor.getDate() + 1);
              }

              if (candidateDates.length > 200) {
                throw new BadRequestException(
                  "한 번에 생성 가능한 일정은 최대 200건입니다.",
                );
              }

              if (candidateDates.length > 0) {
                const result = await tx.classSchedule.createMany({
                  data: candidateDates.map((scheduledDate) => ({
                    classId: created.id,
                    scheduledDate,
                  })),
                });
                schedulesCreated = result.count;
                this.logger.log(
                  `[AcademyClass:${created.id}] schedule 자동 생성 OK — ${schedulesCreated}건 (${createDto.startDate}~${createDto.endDate}, ${createDto.classDays!.join("/")})`,
                );
              } else {
                this.logger.warn(
                  `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 기간 내 요일 매칭 0건`,
                );
              }
            }
          }
        }
      }

      // [2026-05-13] 배정 코치 ClassCoachAssignment 자동 생성 (status: ACCEPTED).
      //  - 1번째 = LEAD, 나머지 = ASSISTANT
      //  - 팀 createClass 패턴 이식
      if (assignedCoachUserIds.length > 0) {
        const now = new Date();
        await tx.classCoachAssignment.createMany({
          data: assignedCoachUserIds.map((userId, idx) => ({
            classId: created.id,
            coachUserId: userId,
            invitedBy: directorUserId,
            role: idx === 0 ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }

      // [2026-05-15] 오픈클래스 팀 노출 — ClassTeamVisibility 생성.
      //   visibleTeamIds 에 지정된 팀의 소속자(감독·코치·학부모·학생)에게만
      //   이 오픈클래스가 수업목록·캘린더·대시보드에 노출된다.
      //   존재하지 않는 teamId 는 skipDuplicates + FK 로 자연 방어, 추가로 사전 검증.
      if (createDto.visibleTeamIds && createDto.visibleTeamIds.length > 0) {
        const uniqueTeamIds = [...new Set(createDto.visibleTeamIds)];
        const validTeams = await tx.team.findMany({
          where: { id: { in: uniqueTeamIds }, isActive: true },
          select: { id: true },
        });
        if (validTeams.length > 0) {
          await tx.classTeamVisibility.createMany({
            data: validTeams.map((t) => ({
              classId: created.id,
              teamId: t.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      return created;
    });

    // [2026-05-13] 배정된 코치에게 "수업 배정 알림" 발송 (등록자 본인 제외).
    //  - 팀 createClass line 273~302 패턴 이식
    const notifyTargets = assignedCoachUserIds.filter(
      (uid) => uid !== directorUserId,
    );
    if (notifyTargets.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: directorUserId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "ACADEMY_DIRECTOR"
          ? "감독"
          : inviter?.userType === "DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: notifyTargets.map((userId) => ({
          userId,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${classRecord.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    return {
      id: classRecord.id,
      academyId: classRecord.academyId,
      className: classRecord.className,
      instructorName: classRecord.instructorName,
      capacity: classRecord.capacity,
      startTime: classRecord.startTime,
      endTime: classRecord.endTime,
      isActive: classRecord.isActive,
      schedulesCreated,
      createdAt: classRecord.createdAt,
    };
  }

  /**
   * 대상 출생연도 목록(SoT) → ageMin/ageMax(한국나이) 파생값.
   *  한국나이(age.util.ts §) = currentYear - birthYear + 1.
   *   · ageMin = 가장 어린 나이 = currentYear - max(birthYear) + 1
   *   · ageMax = 가장 많은 나이 = currentYear - min(birthYear) + 1
   *  빈 배열 → { null, null } (전 연령 대상 = 제한 없음).
   */
  private deriveAgeRangeFromBirthYears(birthYears?: number[] | null): {
    ageMin: number | null;
    ageMax: number | null;
  } {
    if (!Array.isArray(birthYears) || birthYears.length === 0) {
      return { ageMin: null, ageMax: null };
    }
    const currentYear = new Date().getFullYear();
    const ages = birthYears.map((y) => currentYear - y + 1);
    return { ageMin: Math.min(...ages), ageMax: Math.max(...ages) };
  }

  /**
   * 뷰어(PARENT=자녀 합집합 / CHILD·TEEN=본인)의 출생연도 집합.
   *  나이 SoT 는 birthDate (age.util.ts §) — ChildProfile.birthDate 우선, 없으면 User.birthDate 폴백.
   *  반환 빈 배열 = 생년 정보 없음 → 호출부에서 연령 필터 미적용(전체 노출).
   */
  private async resolveViewerBirthYears(
    user: JwtUserPayload,
  ): Promise<number[]> {
    let userIds: string[] = [];
    if (user.userType === "PARENT") {
      const pcs = await this.prisma.parentChild.findMany({
        where: { parentId: user.id },
        select: { childId: true },
      });
      userIds = pcs.map((p) => p.childId);
    } else if (user.userType === "CHILD" || user.userType === "TEEN") {
      userIds = [user.id];
    }
    if (userIds.length === 0) return [];

    const found = new Map<string, Date>();
    const profiles = await this.prisma.childProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, birthDate: true },
    });
    profiles.forEach((p) => p.birthDate && found.set(p.userId, p.birthDate));
    const missing = userIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: missing } },
        select: { id: true, birthDate: true },
      });
      users.forEach((u) => u.birthDate && found.set(u.id, u.birthDate));
    }

    const years = new Set<number>();
    found.forEach((d) => {
      const y = new Date(d).getFullYear();
      if (!Number.isNaN(y)) years.add(y);
    });
    return Array.from(years);
  }

  /**
   * 전체 수업 목록 조회 (클럽 무관)
   *
   * 학부모(PARENT) 토큰일 때는 본인 소속 팀의 수업만 반환한다.
   * - 가입 시 teamCode 필수 + TeamMember(approved, PARENT) 즉시 생성 (auth.service §학부모 가입)
   * - 따라서 정상 가입한 학부모는 항상 1개 이상의 teamId 보유
   * - teamIds 비어 있으면 정합성 깨진 극단 케이스 → 빈 결과 반환 (오인 노출 차단)
   *
   * [2026-05-15] 오픈클래스(academyId) 노출 제한:
   * - ADMIN 외 사용자는 ClassTeamVisibility 에 본인 소속 팀이 등록된 오픈클래스만 본다.
   * - 오픈클래스 감독이 "블리자드/타이탄스" 선택 → 그 팀 소속자(감독·코치·학부모·학생)만 노출.
   */
  async getAllClasses(query: GetClassesQueryDto, user?: JwtUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // [2026-05-15] 오픈클래스 노출 제한 — ADMIN 외 사용자는 본인 소속 팀이
    //  ClassTeamVisibility 에 등록된 오픈클래스만 볼 수 있다.
    //  isAdmin → undefined (제한 없음) / 그 외 → 소속 팀 ID 배열
    const isAdmin = user?.userType === "ADMIN";
    // childId 지정 시(학부모 자녀 선택) 해당 자녀 소속 팀으로만 좁힘.
    const viewerTeamIds =
      user && !isAdmin
        ? await resolveViewerTeamIds(this.prisma, user.id, user.userType, {
            childId: query.childId,
          })
        : null;
    // 오픈클래스(academyId) WHERE 조건.
    //  · ADMIN — 전체 오픈클래스
    //  · ACADEMY_DIRECTOR — 본인이 운영하는 academy 의 수업만 (팀 가입/visibility 무관)
    //  · 그 외 (PARENT/CHILD/TEEN/COACH/DIRECTOR) — 본인 소속 팀이 visibility 등록된 수업
    const openClassWhere: Prisma.ClassWhereInput = isAdmin
      ? { academyId: { not: null } }
      : user?.userType === "ACADEMY_DIRECTOR"
        ? {
            academyId: { not: null },
            academy: { directorId: user.id },
          }
        : {
            academyId: { not: null },
            teamVisibilities: {
              some: { teamId: { in: viewerTeamIds ?? [] } },
            },
          };

    // 상위 분류(category) 분기 — FE class-categories SoT 와 정합.
    //  - regular : 클럽 정규 수업 (teamId 있음, academyId 없음)
    //  - open    : 아카데미 오픈클래스 (academyId 있음 + 노출 팀 매칭)
    //  - 미지정  : 전체 (regular + open)
    const where: Prisma.ClassWhereInput = {
      approvalStatus: "APPROVED",
      // [추가 2026-05-15] 비활성 수업(isActive=false) 은 수업목록 노출 제외.
      //   감독이 수업 비활성화한 경우(또는 검증용 임시 수업)가 목록에 새지 않도록 가드.
      isActive: true,
      ...(query.trainingType && { trainingType: query.trainingType }),
      ...(query.category === "regular" && {
        teamId: { not: null },
        academyId: null,
      }),
      ...(query.category === "open" && openClassWhere),
    };

    // 학부모 가드 — 자녀 경유 팀 ID(viewerTeamIds)로 정규수업 필터.
    //  viewerTeamIds 는 line 941 에서 resolveViewerTeamIds(..., { childId }) 로 해석되어
    //  childId 지정 시 해당 자녀 소속 팀만, 미지정 시 모든 자녀 팀 합집합.
    //  자녀 0명/팀 0개(또는 타 자녀 childId)면 빈 결과 — 오인 노출 차단.
    if (user?.userType === "PARENT" && query.category !== "open") {
      const teamIds = viewerTeamIds ?? [];
      if (teamIds.length === 0) {
        return {
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
      // 'regular' 탭이면 정규 수업만, '전체' 탭이면 자녀 소속 팀의 모든 수업 + 노출 오픈클래스.
      if (query.category === "regular") {
        where.teamId = { in: teamIds };
      } else {
        // 전체 탭 (category 미지정): 자녀 팀의 수업 OR 노출 허용된 오픈클래스
        //  [2026-05-15] 오픈클래스도 ClassTeamVisibility 매칭된 것만 (openClassWhere).
        where.OR = [{ teamId: { in: teamIds } }, openClassWhere];
      }
    } else if (
      user &&
      !isAdmin &&
      (user.userType === "CHILD" || user.userType === "TEEN")
    ) {
      // [수정 2026-05-15] CHILD/TEEN — 본인 소속 팀의 정규 수업 + 노출 허용 오픈클래스만.
      //  기존엔 미지정 탭에서 모든 팀 정규수업이 무제한 노출되어, 학생이 다른 팀
      //  (예: test2/나코치) 수업까지 다 보이던 버그. PARENT 와 동일 패턴으로 viewerTeamIds 매칭.
      const studentTeamIds = viewerTeamIds ?? [];
      if (query.category === "regular") {
        where.teamId = { in: studentTeamIds };
      } else if (query.category === "open") {
        // openClassWhere 가 이미 visibility 매칭 처리.
      } else {
        // 전체 탭: 본인 팀 수업 OR 노출 오픈클래스.
        where.OR = [{ teamId: { in: studentTeamIds } }, openClassWhere];
      }
    } else if (
      user &&
      !isAdmin &&
      (user.userType === "COACH" || user.userType === "DIRECTOR") &&
      query.category !== "open"
    ) {
      // [2026-05-19] COACH/DIRECTOR — 본인 소속 팀의 정규 수업 + 노출 허용 오픈클래스만.
      //   기존엔 academyId=null OR openClassWhere 라 모든 정규수업이 전부 노출되어
      //   다른 팀 수업까지 다 보이던 버그(예: 임감독 → 모든 팀의 모든 수업).
      //   resolveViewerTeamIds 는 CoachProfile.teamId + Team.coachId=본인 으로 본인 운영 팀 추출.
      const teamIds = viewerTeamIds ?? [];
      if (teamIds.length === 0) {
        return {
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
      if (query.category === "regular") {
        where.teamId = { in: teamIds };
      } else {
        // 전체 탭(category 미지정): 본인 팀 정규 수업 OR 노출 허용 오픈클래스
        where.OR = [{ teamId: { in: teamIds } }, openClassWhere];
      }
    } else if (
      user &&
      !isAdmin &&
      user.userType === "ACADEMY_DIRECTOR" &&
      query.category === undefined
    ) {
      // ACADEMY_DIRECTOR — 본인 academy 의 오픈클래스만 (라인 770-782 academyId/directorId 매칭 활용).
      //   본인 소속 팀이 있으면 그 정규 수업도 함께.
      const teamIds = viewerTeamIds ?? [];
      where.OR =
        teamIds.length > 0
          ? [{ teamId: { in: teamIds } }, openClassWhere]
          : [openClassWhere];
    }

    // [연령 노출 필터] PARENT(자녀 출생연도 합집합)·CHILD·TEEN 은 본인/자녀의
    //   출생연도가 수업의 targetBirthYears 에 포함된 경우에만 노출한다.
    //   · targetBirthYears = [] (전 연령 대상) 수업은 항상 노출.
    //   · 생년 정보가 전혀 없으면(viewerBirthYears 빈 배열) 필터 미적용 → 기존 팀 기반 노출 유지.
    //   · COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN 은 관리 목적이므로 연령 필터 미적용.
    if (
      user &&
      !isAdmin &&
      (user.userType === "PARENT" ||
        user.userType === "CHILD" ||
        user.userType === "TEEN")
    ) {
      const viewerBirthYears = await this.resolveViewerBirthYears(user);
      if (viewerBirthYears.length > 0) {
        const ageFilter: Prisma.ClassWhereInput = {
          OR: [
            { targetBirthYears: { isEmpty: true } },
            { targetBirthYears: { hasSome: viewerBirthYears } },
          ],
        };
        where.AND = Array.isArray(where.AND)
          ? [...where.AND, ageFilter]
          : where.AND
            ? [where.AND, ageFilter]
            : [ageFilter];
      }
    }

    const [classes, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          className: true,
          description: true,
          trainingType: true,
          instructorName: true,
          capacity: true,
          ageMin: true,
          ageMax: true,
          targetBirthYears: true,
          levelRequired: true,
          startTime: true,
          endTime: true,
          isActive: true,
          category: true,
          classDays: true,
          teamId: true,
          academyId: true,
          createdAt: true,
          team: { select: { id: true, name: true, logoUrl: true } },
          coach: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          venue: { select: { id: true, name: true } },
          // PACKAGE_WEEKS_SPEC §6 응답 필드 매핑용 — durationDays/sessionsPerMonth/sessionsPerWeek 필수.
          // PACKAGE_END_GUARD (2026-05-22): 대표가 산정 시 활성 패키지 우선 위해 isActive 추가 select.
          products: {
            select: {
              feeType: true,
              price: true,
              durationDays: true,
              sessionsPerMonth: true,
              sessionsPerWeek: true,
              isActive: true,
            },
          },
          registrations: {
            where: { status: "active" },
            select: { id: true },
          },
          // 2026-05-12: 다중 코치 배정 (LEAD/ASSISTANT)
          coachAssignments: {
            where: { status: "ACCEPTED" },
            select: {
              id: true,
              coachUserId: true,
              role: true,
              coach: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  userType: true,
                  avatarUrl: true,
                },
              },
            },
            orderBy: [{ role: "asc" }, { respondedAt: "asc" }],
          },
          // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule) — venue는 id/name만 선택해 응답 최소화
          dayScheduleEntries: {
            select: {
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              venueId: true,
              venue: { select: { id: true, name: true } },
            },
          },
          // [2026-06-09] 오픈클래스 날짜별 일정 — 목록 카드에 실제 일정 날짜 표시용.
          // [2026-06-10] 회차별 실제 시각(startTime/endTime "HH:mm") — 카드 시간 표시용.
          schedules: {
            where: { isCancelled: false },
            select: { scheduledDate: true, startTime: true, endTime: true },
            orderBy: { scheduledDate: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.class.count({ where }),
    ]);

    return {
      data: classes.map((c) => {
        // PACKAGE_WEEKS_SPEC §6 정기 패키지 단위 응답 필드 — FE 카드 가격 라벨 SoT.
        // PACKAGE_END_GUARD (v3 SoT): 대표가는 isActive=true 패키지 우선, 없으면 첫 매칭 폴백.
        //   isClassEnded 는 utils/package-guard.util.ts:isClassEnded() 단일화.
        const monthlyProduct =
          c.products?.find(
            (p) => p.feeType === "MONTHLY_FIXED" && p.isActive !== false,
          ) ?? c.products?.find((p) => p.feeType === "MONTHLY_FIXED");
        const singleProduct =
          c.products?.find(
            (p) => p.feeType === "PER_SESSION" && p.isActive !== false,
          ) ?? c.products?.find((p) => p.feeType === "PER_SESSION");

        const isClassEnded = isClassEndedUtil(c.endTime);

        return {
          ...c,
          // 수업목록 카드 좌측 아이콘에 팀 프로필(로고) 표시용 — 없으면 프론트가 기본 아이콘 폴백.
          teamLogoUrl: c.team?.logoUrl ?? null,
          enrolledCount: c.registrations?.length ?? 0,
          coachAssignments: (c.coachAssignments ?? []).map((a) => ({
            id: a.id,
            coachUserId: a.coachUserId,
            role: a.role,
            coachName:
              `${a.coach?.lastName ?? ""}${a.coach?.firstName ?? ""}`.trim(),
            coachUserType: a.coach?.userType ?? null,
          })),
          singlePrice: singleProduct?.price ?? 0,
          monthlyPrice: monthlyProduct?.price ?? 0,
          packageWeeks: monthlyProduct?.durationDays
            ? Math.max(1, Math.round(monthlyProduct.durationDays / 7))
            : null,
          packageTotalSessions: monthlyProduct?.sessionsPerMonth ?? null,
          // PACKAGE_WEEKS_SPEC §3 정의 — "주 N회 = classDays.length".
          // 구 데이터(sessionsPerWeek null) 는 classDays 길이로 파생 표시.
          packageSessionsPerWeek:
            monthlyProduct?.sessionsPerWeek ??
            (Array.isArray(c.classDays) ? c.classDays.length : null),
          isClassEnded,
          // 2026-06-05: 요일별 시간·장소 규칙 — getClass 와 동일 DOW_ORDER 정렬.
          //   없으면 [] — 기존 단일 startTime/endTime/venueId 경로로 폴백 표시.
          daySchedules: (() => {
            const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
            return (c.dayScheduleEntries ?? [])
              .slice()
              .sort(
                (a, b) =>
                  DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
              )
              .map((ds) => ({
                dayOfWeek: ds.dayOfWeek,
                startTime: ds.startTime,
                endTime: ds.endTime,
                venueId: ds.venueId ?? null,
                venueName: ds.venue?.name ?? null,
              }));
          })(),
          // [2026-06-09] 오픈클래스 날짜별 일정(ISO) — 카드에 실제 일정 날짜 표시.
          scheduledDates: (c.schedules ?? []).map((s) =>
            s.scheduledDate.toISOString(),
          ),
          // [2026-06-10] 오픈클래스 카드 시간 — 첫 회차 실제 시각("HH:mm - HH:mm").
          //   Class.startTime/endTime 은 회차 시각이 아니므로(등록/회차판정용) 부적합.
          scheduleTimeLabel: (() => {
            const f = c.schedules?.[0] as
              | { startTime?: string | null; endTime?: string | null }
              | undefined;
            if (!f?.startTime) return null;
            return f.endTime ? `${f.startTime} - ${f.endTime}` : f.startTime;
          })(),
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 수업 상세 조회 (classId)
   */
  async getClassById(classId: string, requester?: JwtUserPayload) {
    return this.getClass(classId, requester);
  }

  /**
   * 매니저 역할(COACH/DIRECTOR/ACADEMY_DIRECTOR)의 수업 접근 권한 가드.
   *
   * 본인 소속이 아닌 팀/오픈클래스 수업 진입을 차단한다. ADMIN 및 PARENT/CHILD/TEEN 은
   * 통과 (학부모 결제 검토·오픈클래스 영업 흐름 보존). 회의록 2026-05-15 정합.
   *
   * 검증 경로:
   *  - 팀 수업: Team.coachId(owner) OR TeamMember(승인 코치/매니저)
   *  - 오픈클래스: Academy.directorId OR AcademyCoach(active)
   *
   * [보안 수정 2026-05-21] CoachProfile 경로 제거. 가입 시 pending 과 함께 자동 생성되어
   *  pending coach 가 다른 팀 수업까지 접근하던 결함. owner 또는 approved 멤버만 통과.
   */
  private async assertClassAccessForManager(
    classRecord: { teamId: string | null; academyId: string | null },
    requester: JwtUserPayload,
  ): Promise<void> {
    const role = requester.userType;
    if (role === "ADMIN") return;
    if (!["COACH", "DIRECTOR", "ACADEMY_DIRECTOR"].includes(role)) return;

    const { teamId, academyId } = classRecord;

    if (teamId) {
      const [ownedTeam, approvedMember] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: teamId, coachId: requester.id },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: requester.id,
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      if (ownedTeam || approvedMember) return;
    }

    if (academyId) {
      const academy = await this.prisma.academy.findUnique({
        where: { id: academyId },
        select: { directorId: true },
      });
      if (academy?.directorId === requester.id) return;

      const academyCoach = await this.prisma.academyCoach.findUnique({
        where: { academyId_userId: { academyId, userId: requester.id } },
        select: { isActive: true },
      });
      if (academyCoach?.isActive) return;
    }

    throw new ForbiddenException("이 수업에 접근할 권한이 없습니다.");
  }

  /**
   * 수업 조회
   */
  async getClass(classId: string, requester?: JwtUserPayload) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coach: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        coach: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
        venue: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        schedules: {
          where: { scheduledDate: { gte: today } },
          select: { id: true, scheduledDate: true, isCancelled: true },
          orderBy: { scheduledDate: "asc" },
          take: 10,
        },
        products: {
          select: {
            id: true,
            productName: true,
            description: true,
            price: true,
            sessionsPerMonth: true,
            durationDays: true,
            // 결제 플로우에서 feeType 분기 및 PER_SESSION 가격 계산에 필수
            feeType: true,
            feePerSession: true,
            sessionsPerWeek: true,
            billingTiming: true,
            isActive: true,
          },
        },
        registrations: {
          where: { status: "active" },
          select: {
            id: true,
            userId: true,
            status: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userType: true,
                koreanAge: true,
              },
            },
          },
        },
        waitlists: {
          select: { id: true },
        },
        // 2026-05-12: ClassCoachAssignment (다중 코치 배정)
        coachAssignments: {
          where: { status: "ACCEPTED" },
          select: {
            id: true,
            coachUserId: true,
            role: true,
            respondedAt: true,
            coach: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                userType: true,
              },
            },
          },
          orderBy: [{ role: "asc" }, { respondedAt: "asc" }],
        },
        // 2026-05-15: 오픈클래스 노출 팀 — 수정 화면에서 기존 선택값 표시용
        teamVisibilities: {
          select: {
            teamId: true,
            team: { select: { id: true, name: true, teamCode: true } },
          },
        },
        // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule)
        dayScheduleEntries: {
          include: {
            venue: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // 매니저 역할(COACH/DIRECTOR/ACADEMY_DIRECTOR) 의 비소속 수업 접근 차단.
    // requester 미전달은 레거시 호출 경로(테스트·내부 헬퍼) — 통과.
    if (requester) {
      await this.assertClassAccessForManager(
        { teamId: classRecord.teamId, academyId: classRecord.academyId },
        requester,
      );
    }

    // [추가 2026-05-15] 결제이력(paid Enrollment) 카운트 — 삭제 가드 UI 판정용.
    //   사용자 명시: "1명이라도 결제이력이 있으면 삭제할수없게".
    const paidEnrollmentCount = await this.prisma.enrollment.count({
      where: { classId, status: "paid" },
    });

    const coachName = classRecord.coach
      ? `${classRecord.coach.lastName ?? ""}${classRecord.coach.firstName ?? ""}`.trim() ||
        classRecord.coach.email
      : classRecord.team && classRecord.team.coach
        ? `${classRecord.team.coach.lastName ?? ""}${classRecord.team.coach.firstName ?? ""}`.trim()
        : classRecord.instructorName;

    return {
      id: classRecord.id,
      teamId: classRecord.teamId ?? null,
      academyId: classRecord.academyId ?? null,
      className: classRecord.className,
      description: classRecord.description,
      // 승인 상태는 프론트 ApprovalBanner 렌더링에 필수 — 누락 시 기본 경고 fallback 유발
      approvalStatus: classRecord.approvalStatus,
      rejectionReason: classRecord.rejectionReason,
      approvedAt: classRecord.approvedAt,
      trainingType: classRecord.trainingType,
      instructorName: classRecord.instructorName,
      capacity: classRecord.capacity,
      ageMin: classRecord.ageMin,
      ageMax: classRecord.ageMax,
      targetBirthYears: classRecord.targetBirthYears,
      levelRequired: classRecord.levelRequired,
      startTime: classRecord.startTime,
      endTime: classRecord.endTime,
      isActive: classRecord.isActive,
      // [Phase B] 결제 방식 — 프론트 후불/선불 등록 분기에 필수.
      billingMode: classRecord.billingMode,
      category: classRecord.category,
      classDays: classRecord.classDays ?? [],
      coachId: classRecord.coachId,
      coachName,
      coachProfileImage: null,
      venueId: classRecord.venue?.id ?? null,
      venueName: classRecord.venue?.name ?? null,
      venueAddress: classRecord.venue?.address ?? null,
      venueLatitude: classRecord.venue?.latitude
        ? Number(classRecord.venue.latitude)
        : null,
      venueLongitude: classRecord.venue?.longitude
        ? Number(classRecord.venue.longitude)
        : null,
      currentEnrollment: classRecord.registrations?.length ?? 0,
      // [추가 2026-05-13] 명단관리용 — 배치된 학생 목록 (ClassRegistration active).
      //  결제 흐름(Enrollment) 과 별개. 코치가 직접 배치한 학생도 여기에 포함된다.
      enrollments: (classRecord.registrations ?? []).map((r) => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        userName:
          `${r.user?.lastName ?? ""}${r.user?.firstName ?? ""}`.trim() || "",
      })),
      waitlistCount: classRecord.waitlists?.length ?? 0,
      teamLogoUrl: classRecord.team?.logoUrl ?? null,
      club: classRecord.team
        ? { id: classRecord.team.id, name: classRecord.team.name }
        : null,
      schedules: classRecord.schedules ?? [],
      paidEnrollmentCount,
      // PACKAGE_END_GUARD (v3 · SoT 단일화 2026-05-22):
      //   classes/utils/package-guard.util.ts:computePackageGuardMeta() 호출로 메타 주입.
      //   shouldHideInactiveFor(requester?.userType) — PARENT/CHILD/TEEN 비활성 제외.
      products: (() => {
        // [2026-06-09] 오픈클래스(academyId)는 종료일 개념이 날짜별 일정과 맞지 않아
        //   종료 판정에서 제외(endTime=null) → 전체(MONTHLY_FIXED) 등이 학부모에게 정상 노출.
        const endTime = classRecord.academyId ? null : (classRecord.endTime ?? null);
        const productsWithMeta = (classRecord.products ?? []).map((p) => ({
          ...p,
          ...computePackageGuardMeta(p, endTime),
        }));
        return shouldHideInactiveFor(requester?.userType)
          ? productsWithMeta.filter((p) => p.isPurchasable !== false)
          : productsWithMeta;
      })(),
      // 2026-05-12: ClassCoachAssignment 다중 코치 배정 (LEAD/ASSISTANT)
      coachAssignments: (classRecord.coachAssignments ?? []).map((a) => ({
        id: a.id,
        coachUserId: a.coachUserId,
        role: a.role,
        coachName:
          `${a.coach?.lastName ?? ""}${a.coach?.firstName ?? ""}`.trim() ||
          a.coach?.email ||
          "",
        coachEmail: a.coach?.email ?? "",
        coachUserType: a.coach?.userType ?? null,
      })),
      // 2026-05-15: 오픈클래스 노출 팀 목록 — 수정 화면에서 기존 선택값 복원용
      visibleTeams: (classRecord.teamVisibilities ?? []).map((v) => ({
        id: v.team?.id ?? v.teamId,
        name: v.team?.name ?? "",
        teamCode: v.team?.teamCode ?? null,
      })),
      // 2026-06-05: 요일별 시간·장소 규칙 — ClassDaySchedule 행 목록.
      //   없으면 빈 배열 (기존 단일 startTime/endTime/venueId 경로로 폴백 표시).
      daySchedules: (() => {
        const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
        return (classRecord.dayScheduleEntries ?? [])
          .slice()
          .sort(
            (a, b) =>
              DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
          )
          .map((ds) => ({
            dayOfWeek: ds.dayOfWeek,
            startTime: ds.startTime,
            endTime: ds.endTime,
            venueId: ds.venueId ?? null,
            venueName: ds.venue?.name ?? null,
          }));
      })(),
      createdAt: classRecord.createdAt,
    };
  }

  /**
   * 클럽의 수업 목록 조회 (캐싱 적용 - 5분)
   */
  async getClubClasses(
    teamId: string,
    query?: {
      search?: string;
      category?: string;
      status?: string;
      coachId?: string;
    },
  ) {
    // 필터 파라미터가 있으면 캐시 우회
    const hasFilters =
      query?.search || query?.category || query?.status || query?.coachId;

    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.class;
    const cacheTTL = redisConfig.cacheTTL.classList;
    const cacheKey = `${keyPrefix}list:${teamId}`;

    if (!hasFilters) {
      const cachedClasses = await this.redisService.get<any[]>(cacheKey);
      if (cachedClasses) return cachedClasses;
    }

    const where: Record<string, unknown> = { teamId };
    if (query?.category) where.category = query.category;
    if (query?.status === "ACTIVE") where.isActive = true;
    if (query?.status === "INACTIVE") where.isActive = false;
    if (query?.coachId) where.coachId = query.coachId;
    if (query?.search) {
      where.OR = [
        { className: { contains: query.search, mode: "insensitive" } },
        { instructorName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const classes = await this.prisma.class.findMany({
      where,
      select: {
        id: true,
        className: true,
        trainingType: true,
        instructorName: true,
        capacity: true,
        startTime: true,
        endTime: true,
        ageMin: true,
        ageMax: true,
        targetBirthYears: true,
        isActive: true,
        approvalStatus: true,
        category: true,
        classDays: true,
        coachId: true,
        // 분류 SoT (FE class-categories.ts) 기반 외래키 — regular/open 식별용.
        teamId: true,
        academyId: true,
        levelRequired: true,
        description: true,
        createdAt: true,
        // [수정 2026-05-11] coach.userType 추가 — 프론트에서 코치 실제 역할(감독/코치 등) 호칭 동적 표시용.
        coach: {
          select: { id: true, firstName: true, lastName: true, userType: true },
        },
        team: { select: { logoUrl: true } },
        venue: { select: { id: true, name: true, address: true } },
        products: {
          select: {
            id: true,
            productName: true,
            price: true,
            feeType: true,
            // 정기 패키지 단위(주 수 + 총 회수 + 주 빈도) 응답 노출용
            durationDays: true,
            sessionsPerMonth: true,
            sessionsPerWeek: true,
          },
        },
        // [추가 2026-05-12] 수업 운영 기간 계산용 — schedules 첫/마지막 날짜.
        //  · startTime/endTime 은 "하루 세션 시간"(예: 06:00~07:00)이라 기간 표기에 부적합.
        //  · 화면 카드의 "기간 + N주/단일" 표기를 위해 schedules 의 min/max scheduledDate 필요.
        schedules: {
          where: { isCancelled: false },
          select: { scheduledDate: true },
          orderBy: { scheduledDate: "asc" },
        },
        // 2026-05-09: 학생 카운트는 ClassRegistration(active 등록) 기준 — 수업상세(currentEnrollment)와
        // 동일 source 로 정합. 기존엔 Enrollment(결제 흐름) 기반이라 결제 전 학생이 0으로 표시되던 버그.
        // 2026-05-20: registrations 카운트에 status='active' 필터 추가 — 상세(getClass)와 동일하게
        //  배치 해제(inactive) 학생을 제외. 필터 누락 시 만료/해제 학생까지 카운트되어 목록>상세 불일치 발생.
        _count: {
          select: {
            registrations: { where: { status: "active" } },
            enrollments: true,
            waitlists: true,
          },
        },
        // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule) — venue는 id/name만 선택해 응답 최소화
        dayScheduleEntries: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            venueId: true,
            venue: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = classes.map((c) => {
      const days = Array.isArray(c.classDays)
        ? (c.classDays as string[]).join(", ")
        : "";
      // Class.startTime/endTime 은 벽시계 시각을 KST 변환 없이 naive 저장(timestamp without tz).
      //   Prisma 가 UTC 로 역직렬화하므로 getUTCHours/getUTCMinutes 로 추출해야 입력 시각과 일치한다.
      //   (toLocaleTimeString 은 서버 로컬 타임존으로 재변환해 학부모 /classes 목록과 시각이 어긋남.)
      const fmtNaive = (d: Date) =>
        `${String(d.getUTCHours()).padStart(2, "0")}:${String(
          d.getUTCMinutes(),
        ).padStart(2, "0")}`;
      const st = c.startTime ? fmtNaive(new Date(c.startTime)) : "";
      const et = c.endTime ? fmtNaive(new Date(c.endTime)) : "";
      const coachName = c.coach
        ? `${c.coach.lastName ?? ""}${c.coach.firstName ?? ""}`.trim() ||
          c.instructorName
        : c.instructorName;
      return {
        id: c.id,
        className: c.className,
        trainingType: c.trainingType,
        teamId: c.teamId,
        teamLogoUrl: c.team?.logoUrl ?? null,
        academyId: c.academyId,
        dayOfWeek: days,
        time: st && et ? `${st} - ${et}` : "",
        startTime: c.startTime,
        endTime: c.endTime,
        location: c.venue?.name ?? "",
        venueAddress: c.venue?.address ?? "",
        studentCount: c._count.registrations,
        maxStudents: c.capacity,
        level: c.levelRequired,
        category: c.category,
        // [추가 2026-05-13] ageMin/ageMax — 수업목록에서 U10 자동 라벨 표시용.
        //  기존엔 응답에서 누락되어 frontend 가 ALL 로 fallback 했음.
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        targetBirthYears: c.targetBirthYears,
        status: c.isActive ? "ACTIVE" : "INACTIVE",
        approvalStatus: c.approvalStatus,
        coach: coachName,
        // [추가 2026-05-13] 코치의 user.id — director-coaches 페이지에서 코치별 수업 카운트
        //  계산용. 기존엔 coachId 가 응답에 누락되어 항상 0으로 표시됨.
        coachId: c.coachId ?? c.coach?.id ?? null,
        // [추가 2026-05-11] 코치의 실제 userType — 프론트 호칭("감독"/"코치") 결정용.
        coachUserType: c.coach?.userType ?? null,
        // [추가 2026-05-12] 실제 운영 기간 (first/last schedule scheduledDate).
        //  · UI 카드의 "기간 + N주/단일" 표기에 사용.
        firstScheduleDate:
          c.schedules && c.schedules.length > 0
            ? c.schedules[0].scheduledDate.toISOString()
            : null,
        lastScheduleDate:
          c.schedules && c.schedules.length > 0
            ? c.schedules[c.schedules.length - 1].scheduledDate.toISOString()
            : null,
        isActive: c.isActive,
        description: c.description,
        // [수정 2026-05-15 db-keeper] 가격 정책 (T03/F1):
        //   · PER_SESSION 또는 MONTHLY_FIXED 상품이 없으면 null 반환 (0 → null).
        //   · `singlePriceLabel` / `monthlyPriceLabel` 로 표시 정책 명시.
        //     - "tbd"   : 별도 책정 (단가 미정) — 단건 미정 클래스
        //     - "krw"   : 정상 금액 표시
        //   · 프론트는 라벨에 따라 "별도 책정"/"₩XXX" 분기 표시.
        singlePrice:
          c.products?.find((p) => p.feeType === "PER_SESSION")?.price ?? null,
        singlePriceLabel: (() => {
          const p = c.products?.find((pp) => pp.feeType === "PER_SESSION");
          if (p && typeof p.price === "number" && p.price > 0) return "krw";
          return "tbd";
        })(),
        monthlyPrice:
          c.products?.find((p) => p.feeType === "MONTHLY_FIXED")?.price ?? null,
        monthlyPriceLabel: (() => {
          const p = c.products?.find((pp) => pp.feeType === "MONTHLY_FIXED");
          if (p && typeof p.price === "number" && p.price > 0) return "krw";
          return "tbd";
        })(),
        // 정기 패키지 단위(주 수 + 총 회수 + 주 빈도) — 회의록 2026-04-23 정합.
        // 기존 시드(durationDays=30) 는 packageWeeks=4 로 자연 표시.
        packageWeeks: (() => {
          const p = c.products?.find((pp) => pp.feeType === "MONTHLY_FIXED");
          return p?.durationDays
            ? Math.max(1, Math.round(p.durationDays / 7))
            : null;
        })(),
        packageTotalSessions:
          c.products?.find((p) => p.feeType === "MONTHLY_FIXED")
            ?.sessionsPerMonth ?? null,
        packageSessionsPerWeek:
          c.products?.find((p) => p.feeType === "MONTHLY_FIXED")
            ?.sessionsPerWeek ?? null,
        waitlistCount: c._count.waitlists,
        createdAt: c.createdAt,
        // 2026-06-05: 요일별 시간·장소 규칙 — getClass 와 동일 DOW_ORDER 정렬.
        //   없으면 [] — 기존 단일 startTime/endTime/venueId 경로로 폴백 표시.
        daySchedules: (() => {
          const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
          return (c.dayScheduleEntries ?? [])
            .slice()
            .sort(
              (a, b) =>
                DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
            )
            .map((ds) => ({
              dayOfWeek: ds.dayOfWeek,
              startTime: ds.startTime,
              endTime: ds.endTime,
              venueId: ds.venueId ?? null,
              venueName: ds.venue?.name ?? null,
            }));
        })(),
      };
    });

    // 필터 없을 때만 캐시
    if (!hasFilters) {
      await this.redisService.set(cacheKey, result, cacheTTL);
    }

    return result;
  }

  /**
   * 수업 수정 (감독만)
   */
  /**
   * 2026-05-08: 수업별 결제 현황 (등록 학생 전체 + 최근 Enrollment + Payment 매핑).
   *
   * 학생 리스트는 ClassRegistration(active) 전체. 각 학생의 결제 상태는 가장 최근
   * Enrollment(class+child) 1건의 status 와 연결된 Payment 정보로 표시한다.
   */
  async getClassPayments(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        className: true,
        teamId: true,
        // [Phase B 연동] 결제 방식 — PREPAID(선불) / POSTPAID(후불). 선수정보 결제 탭 모드 분기용.
        billingMode: true,
        startTime: true,
        endTime: true,
        team: { select: { id: true, name: true, teamCode: true } },
        products: {
          select: {
            id: true,
            productName: true,
            price: true,
            feeType: true,
            // 후불 모드 회당 단가 표시용 (출석 × 단가 정산 안내).
            billingTiming: true,
            feePerSession: true,
          },
        },
      },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // [수정 2026-05-13] status='active' 필터 제거 — inactive(미납) 학생도 명단에 노출.
    //  inactive 면 resolveState 가 'unpaid' 로 분류하여 frontend 가 "미납" 으로 표시.
    //  이렇게 해야 5월 정규수업 신학생/권학생 처럼 ClassRegistration.status=inactive 인
    //  학생이 결제확인 명단에 보임. 다른 수업의 미납 학생도 동일하게 보임.
    const registrations = await this.prisma.classRegistration.findMany({
      where: { classId },
      select: {
        id: true,
        userId: true,
        status: true,
        registrationDate: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
          },
        },
      },
    });

    const userIds = registrations.map((r) => r.userId);
    const enrollments = userIds.length
      ? await this.prisma.enrollment.findMany({
          where: { classId, childId: { in: userIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            childId: true,
            status: true,
            paymentId: true,
            paidAt: true,
            classProductId: true,
            product: {
              select: {
                id: true,
                productName: true,
                price: true,
                feeType: true,
              },
            },
            payment: {
              select: {
                id: true,
                amount: true,
                paymentStatus: true,
                paymentMethod: true,
                completedAt: true,
                // [추가 2026-05-14] 결제자(보통 학부모) 정보 — admin 결제관리에서 "결제한 부모" 노출용
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    userType: true,
                  },
                },
              },
            },
          },
        })
      : [];

    const enrollmentByChild = new Map<string, (typeof enrollments)[number]>();
    for (const e of enrollments) {
      // updatedAt desc 이므로 첫 번째가 최신 — 이미 매핑된 childId 는 건너뜀
      if (!enrollmentByChild.has(e.childId)) {
        enrollmentByChild.set(e.childId, e);
      }
    }

    // [수정 2026-05-14] 수업 결제 상태는 "미납 / 결제완료" 2-state 만 (+취소/환불).
    //  '승인대기(pending)' 라는 결제 상태는 없음 — 결제 완료가 아니면 모두 'unpaid'(미납).
    //  pending/approved/pending_approval enrollment 도 결제 전이므로 미납으로 통합.
    type PaymentState = "paid" | "unpaid" | "cancelled" | "refunded";
    const resolveState = (
      enrollment: (typeof enrollments)[number] | undefined,
    ): PaymentState => {
      if (!enrollment) return "unpaid";
      const ps = enrollment.payment?.paymentStatus;
      if (ps === "completed" || enrollment.status === "paid") return "paid";
      if (ps === "refunded") return "refunded";
      if (
        enrollment.status === "cancelled" ||
        enrollment.status === "rejected" ||
        enrollment.status === "expired"
      )
        return "cancelled";
      // 그 외(pending/approved 등 결제 전 상태) 전부 미납.
      return "unpaid";
    };

    // [Phase B] 후불(POSTPAID) 결제 상태 — enrollment 가 아닌 "가장 최근 확정 정산월"의
    //   MonthlyPostpaidBillingLine 으로 판정한다. 후불 enrollment 는 approved 에 머물고
    //   Payment 와 무연결이라 enrollment 기준으로는 결제 완료여도 영원히 미납으로 보임.
    //   (선수정보 결제 탭 미납 오표시의 직접 원인 — BillingLine.payment 로 정확히 판정.)
    const isPostpaid = (cls.billingMode ?? "PREPAID") === "POSTPAID";
    type PostpaidLineInfo = {
      isPaid: boolean;
      amount: number;
      paymentMethod: string | null;
      paidAt: Date | null;
      payerId: string | null;
      payerName: string | null;
    };
    const postpaidLineByUser = new Map<string, PostpaidLineInfo>();
    if (isPostpaid) {
      const latestBilling = await this.prisma.monthlyPostpaidBilling.findFirst({
        where: { classId, status: "confirmed" },
        orderBy: { yearMonth: "desc" },
        select: {
          items: {
            select: {
              userId: true,
              amount: true,
              paymentStatus: true,
              payment: {
                select: {
                  paymentStatus: true,
                  paymentMethod: true,
                  completedAt: true,
                  user: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      for (const ln of latestBilling?.items ?? []) {
        const payer = ln.payment?.user;
        postpaidLineByUser.set(ln.userId, {
          // BillingLine.paymentStatus 가 stale 이어도 Payment 관계로 정확히 판정.
          isPaid:
            ln.paymentStatus === "paid" ||
            ln.payment?.paymentStatus === "completed",
          amount: ln.amount,
          paymentMethod: ln.payment?.paymentMethod ?? null,
          paidAt: ln.payment?.completedAt ?? null,
          payerId: payer?.id ?? null,
          payerName: payer
            ? `${payer.lastName ?? ""}${payer.firstName ?? ""}`.trim() ||
              payer.email
            : null,
        });
      }
    }

    // [Phase C] 당월(이번 달) 출석 집계 — 선수정보 탭 "출석 N회" 표시용 (기획 D7).
    //   취소(isCancelled) 제외 일정의 present 출석을 회원별로 카운트. 결제 상태와 독립.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const attendanceSchedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: { gte: monthStart, lte: monthEnd },
        isCancelled: false,
      },
      select: {
        attendances: {
          where: { attendanceStatus: "present" },
          select: { memberId: true },
        },
      },
    });
    const attendanceByUser = new Map<string, number>();
    for (const s of attendanceSchedules) {
      for (const a of s.attendances) {
        attendanceByUser.set(
          a.memberId,
          (attendanceByUser.get(a.memberId) ?? 0) + 1,
        );
      }
    }

    const students = registrations.map((reg) => {
      const en = enrollmentByChild.get(reg.userId);
      const fullName =
        `${reg.user.lastName ?? ""}${reg.user.firstName ?? ""}`.trim() ||
        reg.user.email;
      const attendanceCount = attendanceByUser.get(reg.userId) ?? 0;

      // [Phase B] 후불: 최근 확정 정산월 BillingLine 기준으로 상태/금액/결제자를 채운다.
      //   응답 필드 구조는 선불과 동일하게 유지(프론트 결제 탭 무수정).
      if (isPostpaid) {
        const ln = postpaidLineByUser.get(reg.userId);
        return {
          registrationId: reg.id,
          memberId: reg.userId,
          memberName: fullName,
          memberType: reg.user.userType,
          registrationDate: reg.registrationDate,
          enrollmentId: en?.id ?? null,
          enrollmentStatus: en?.status ?? null,
          productName: en?.product?.productName ?? null,
          amount: ln?.amount ?? null,
          paymentMethod: ln?.paymentMethod ?? null,
          paidAt: ln?.paidAt ?? null,
          paymentState: (ln?.isPaid ? "paid" : "unpaid") as PaymentState,
          payerId: ln?.payerId ?? null,
          payerName: ln?.payerName ?? null,
          attendanceCount,
        };
      }

      // 선불(PREPAID): 기존 enrollment 기준.
      // [수정 2026-05-13] ClassRegistration.status='inactive' → 'unpaid'(미납) 강제.
      //  (코치가 명단 해제했거나 결제 취소된 상태)
      const state = reg.status === "inactive" ? "unpaid" : resolveState(en);
      // [추가 2026-05-14] 결제자(학부모) 표시명 — payment.user 우선, 없으면 null.
      const payer = en?.payment?.user;
      const payerName = payer
        ? `${payer.lastName ?? ""}${payer.firstName ?? ""}`.trim() ||
          payer.email
        : null;
      return {
        registrationId: reg.id,
        memberId: reg.userId,
        memberName: fullName,
        memberType: reg.user.userType,
        registrationDate: reg.registrationDate,
        enrollmentId: en?.id ?? null,
        enrollmentStatus: en?.status ?? null,
        productName: en?.product?.productName ?? null,
        amount: en?.payment?.amount ?? en?.product?.price ?? null,
        paymentMethod: en?.payment?.paymentMethod ?? null,
        paidAt: en?.paidAt ?? en?.payment?.completedAt ?? null,
        paymentState: state,
        // 결제자(학부모) — 미결제 학생은 null
        payerId: payer?.id ?? null,
        payerName,
        attendanceCount,
      };
    });

    const counts = students.reduce(
      (acc, s) => {
        acc[s.paymentState] = (acc[s.paymentState] ?? 0) + 1;
        return acc;
      },
      { paid: 0, unpaid: 0, cancelled: 0, refunded: 0 } as Record<
        PaymentState,
        number
      >,
    );

    const totalPaidAmount = students.reduce(
      (sum, s) =>
        s.paymentState === "paid" && s.amount ? sum + s.amount : sum,
      0,
    );

    return {
      classId: cls.id,
      className: cls.className,
      // [Phase B 연동] 결제 방식 — 프론트 결제 탭 모드 분기 (선불/후불). 기본 PREPAID.
      billingMode: cls.billingMode ?? "PREPAID",
      teamId: cls.team?.id ?? cls.teamId,
      teamName: cls.team?.name ?? "",
      teamCode: cls.team?.teamCode ?? "",
      products: cls.products,
      total: students.length,
      counts,
      totalPaidAmount,
      students,
    };
  }

  async updateClass(
    coachUserId: string,
    teamId: string,
    classId: string,
    updateDto: UpdateClassDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수업을 수정할 수 있습니다.",
    );

    // 수업 존재 및 클럽 소속 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // trainingType 변경 차단 — 등록 후 유형 전환 금지 (사용자 정책 2026-05-11)
    // 이미 등록된 enrollment/ClassRegistration 의 결제·정산 흐름이 깨질 위험 방지.
    if (
      updateDto.trainingType !== undefined &&
      updateDto.trainingType !== classRecord.trainingType
    ) {
      throw new BadRequestException(
        "수업 유형(정규/레슨)은 등록 후 변경할 수 없습니다.",
      );
    }

    // 시간 검증
    if (
      updateDto.startTime &&
      updateDto.endTime &&
      new Date(updateDto.startTime) >= new Date(updateDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(updateDto.daySchedules, updateDto.dateSchedules);

    // 2026-05-12: 배정 코치 동기화 사전 검증 — 회의록 정합 (Team owner + CoachProfile 통합).
    //   - DIRECTOR/감독: Team.coachId 매핑 — CoachProfile 없을 수 있음
    //   - COACH/학원 감독: CoachProfile.teamId 매핑
    // undefined = 변경 없음 / [] = 전부 제거 / 배열 = 동기화 (1번째 = LEAD).
    let assignedCoachUserIds: string[] | undefined = undefined;
    if (updateDto.coachUserIds !== undefined) {
      if (updateDto.coachUserIds.length === 0) {
        assignedCoachUserIds = [];
      } else {
        const [validProfiles, teamOwners] = await Promise.all([
          this.prisma.coachProfile.findMany({
            where: {
              userId: { in: updateDto.coachUserIds },
              teamId: classRecord.teamId,
            },
            select: { userId: true },
          }),
          this.prisma.team.findMany({
            where: {
              id: classRecord.teamId,
              coachId: { in: updateDto.coachUserIds },
            },
            select: { coachId: true },
          }),
        ]);
        const validSet = new Set<string>([
          ...validProfiles.map((p) => p.userId),
          ...teamOwners.map((t) => t.coachId),
        ]);
        assignedCoachUserIds = updateDto.coachUserIds.filter((id) =>
          validSet.has(id),
        );
      }
    }
    const newLeadCoachId =
      assignedCoachUserIds && assignedCoachUserIds.length > 0
        ? assignedCoachUserIds[0]
        : undefined;

    // 신규 추가 코치 알림 발송용 — 기존 ACCEPTED 배정자와 비교
    const newlyAddedCoachIds: string[] = [];
    if (assignedCoachUserIds !== undefined) {
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { coachUserId: true },
      });
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      for (const uid of assignedCoachUserIds) {
        if (!existingSet.has(uid) && uid !== coachUserId) {
          newlyAddedCoachIds.push(uid);
        }
      }
    }

    // [추가 2026-05-13] ageMin/ageMax → category(U8~U12) 자동 도출.
    //  수업 수정 후 수업목록/명단관리에서 ageRange 가 즉시 라벨로 노출되도록.
    let derivedCategory = updateDto.category ?? classRecord.category;
    const newAgeMin = updateDto.ageMin ?? classRecord.ageMin;
    const newAgeMax = updateDto.ageMax ?? classRecord.ageMax;
    if (updateDto.category === undefined && newAgeMax != null) {
      if (newAgeMax >= 8 && newAgeMax <= 12) derivedCategory = `U${newAgeMax}`;
    }

    // [2026-06-05] daySchedules 재동기화 — updateClass 트랜잭션 내에서 처리
    const hasDaySchedulesUpdate = (updateDto.daySchedules?.length ?? 0) > 0;
    const representativeUpdate = hasDaySchedulesUpdate ? deriveRepresentative(updateDto.daySchedules) : null;

    // dateSchedules 대표값 산출 (전송 시에만)
    const hasDateSchedulesUpdate = updateDto.dateSchedules !== undefined;
    const dateRepresentativeUpdate = (hasDateSchedulesUpdate && updateDto.dateSchedules && updateDto.dateSchedules.length > 0)
      ? deriveRepresentativeFromDateSchedules(updateDto.dateSchedules)
      : null;

    const updatedClass = await this.prisma.$transaction(async (txUpdate) => {
      // [2026-06-05] daySchedules 전송 시: ClassDaySchedule 전체 교체
      if (updateDto.daySchedules !== undefined) {
        await txUpdate.classDaySchedule.deleteMany({ where: { classId } });
        if (updateDto.daySchedules.length > 0) {
          await txUpdate.classDaySchedule.createMany({
            data: updateDto.daySchedules.map((ds) => ({
              classId,
              dayOfWeek: ds.dayOfWeek,
              startTime: ds.startTime,
              endTime: ds.endTime,
              venueId: ds.venueId ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }

      // dateSchedules 전송 시: ClassSchedule 전체 교체 (미전송 시 기존 보존)
      if (hasDateSchedulesUpdate) {
        await txUpdate.classSchedule.deleteMany({ where: { classId } });
        if (updateDto.dateSchedules && updateDto.dateSchedules.length > 0) {
          await txUpdate.classSchedule.createMany({
            data: updateDto.dateSchedules.map((s) => ({
              classId,
              scheduledDate: new Date(`${s.date}T00:00:00`),
              startTime: s.startTime,
              endTime: s.endTime,
              venueId: s.venueId ?? null,
            })),
          });
        }
      }

      return txUpdate.class.update({
        where: { id: classId },
        data: {
          className: updateDto.className ?? classRecord.className,
          description: updateDto.description ?? classRecord.description,
          instructorName: updateDto.instructorName ?? classRecord.instructorName,
          capacity: updateDto.capacity ?? classRecord.capacity,
          // targetBirthYears 전송 시 SoT 갱신 + ageMin/ageMax 파생 재계산(빈 배열=전 연령→null).
          //   미전송(undefined) 시 기존 ageMin/ageMax 유지(하위호환).
          ...(updateDto.targetBirthYears !== undefined
            ? {
                targetBirthYears: updateDto.targetBirthYears,
                ...this.deriveAgeRangeFromBirthYears(updateDto.targetBirthYears),
              }
            : {
                ageMin: updateDto.ageMin ?? classRecord.ageMin,
                ageMax: updateDto.ageMax ?? classRecord.ageMax,
              }),
          levelRequired: updateDto.levelRequired ?? classRecord.levelRequired,
          // 우선순위: dateSchedules 대표값 > daySchedules 대표값 > 단일 startTime > 기존값 유지
          startTime: dateRepresentativeUpdate?.startTime
            ?? representativeUpdate?.startTime
            ?? updateDto.startTime
            ?? classRecord.startTime,
          endTime: dateRepresentativeUpdate?.endTime
            ?? representativeUpdate?.endTime
            ?? updateDto.endTime
            ?? classRecord.endTime,
          isActive: updateDto.isActive ?? classRecord.isActive,
          // trainingType 은 변경 차단 정책에 따라 기존 값 그대로 유지
          trainingType: classRecord.trainingType,
          // coachId 우선순위: coachUserIds[0] (LEAD) > coachId 명시 > 기존 값
          coachId:
            newLeadCoachId ??
            (updateDto.coachId !== undefined
              ? updateDto.coachId
              : classRecord.coachId),
          venueId: dateRepresentativeUpdate !== null
            ? (dateRepresentativeUpdate.venueId ?? null)
            : representativeUpdate?.venueId !== undefined
              ? (representativeUpdate.venueId ?? null)
              : (updateDto.venueId !== undefined ? updateDto.venueId : classRecord.venueId),
          // classDays 우선순위: dateSchedules 기반 요일 집합 > daySchedules 요일 집합 > updateDto.classDays > 기존 유지
          classDays: dateRepresentativeUpdate?.classDays !== undefined
            ? dateRepresentativeUpdate.classDays
            : (hasDateSchedulesUpdate && updateDto.dateSchedules?.length === 0)
              ? []
              : representativeUpdate?.classDays !== undefined
                ? representativeUpdate.classDays
                : (updateDto.classDays !== undefined ? updateDto.classDays : undefined),
          category: derivedCategory,
        },
        include: {
          team: {
            select: {
              name: true,
            },
          },
        },
      });
    });

    // [추가 2026-05-13] ageMin/ageMax 변경 시 매칭 PLAYER 자동 배치.
    //  팀 PLAYER(TEEN/CHILD) 중 새 ageRange 에 부합하는 학생을 ClassRegistration(active) 으로 upsert.
    //  결제 흐름(Enrollment) 은 별개 — 명단상 배치만 자동화. 정원(capacity) 초과는 자동 배치 제한.
    const ageChanged =
      (updateDto.ageMin !== undefined &&
        updateDto.ageMin !== classRecord.ageMin) ||
      (updateDto.ageMax !== undefined &&
        updateDto.ageMax !== classRecord.ageMax);
    if (
      ageChanged &&
      classRecord.teamId &&
      newAgeMin != null &&
      newAgeMax != null
    ) {
      const matched = await this.prisma.teamMember.findMany({
        where: {
          teamId: classRecord.teamId,
          leftAt: null,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
          playerAge: { gte: newAgeMin, lte: newAgeMax },
        },
        select: { user: { select: { id: true } } },
      });
      const capacity = updatedClass.capacity ?? Number.MAX_SAFE_INTEGER;
      const currentActive = await this.prisma.classRegistration.count({
        where: { classId, status: "active" },
      });
      let slot = capacity - currentActive;
      // N+1 해소: matched 사용자 id 일괄 추출 후 existing registration 한 번에 조회
      const matchedUserIds = matched
        .map((m) => m.user?.id)
        .filter((id): id is string => !!id);
      const existingRegistrations =
        matchedUserIds.length > 0
          ? await this.prisma.classRegistration.findMany({
              where: { classId, userId: { in: matchedUserIds } },
              select: { userId: true, status: true },
            })
          : [];
      const existingByUser = new Map(
        existingRegistrations.map((e) => [e.userId, e.status]),
      );
      // 누락/비활성 사용자만 upsert (단순화: createMany skipDuplicates 사용)
      const toUpsertIds: string[] = [];
      for (const m of matched) {
        const uid = m.user?.id;
        if (!uid || slot <= 0) break;
        if (existingByUser.get(uid) === "active") continue;
        toUpsertIds.push(uid);
        slot -= 1;
      }
      if (toUpsertIds.length > 0) {
        const existingIds = new Set(existingRegistrations.map((e) => e.userId));
        const newIds = toUpsertIds.filter((id) => !existingIds.has(id));
        const reactivateIds = toUpsertIds.filter((id) => existingIds.has(id));
        await Promise.all([
          newIds.length > 0
            ? this.prisma.classRegistration.createMany({
                data: newIds.map((userId) => ({
                  classId,
                  userId,
                  status: "active" as const,
                })),
                skipDuplicates: true,
              })
            : Promise.resolve(),
          reactivateIds.length > 0
            ? this.prisma.classRegistration.updateMany({
                where: {
                  classId,
                  userId: { in: reactivateIds },
                },
                data: { status: "active" },
              })
            : Promise.resolve(),
        ]);
      }
    }

    // 2026-05-12: ClassCoachAssignment 동기화 (제거 → REMOVED, 신규 추가 → ACCEPTED)
    if (assignedCoachUserIds !== undefined) {
      const now = new Date();
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { id: true, coachUserId: true },
      });
      const newSet = new Set(assignedCoachUserIds);
      // 제거된 코치 → REMOVED
      const toRemoveIds = existing
        .filter((a) => !newSet.has(a.coachUserId))
        .map((a) => a.id);
      if (toRemoveIds.length > 0) {
        await this.prisma.classCoachAssignment.updateMany({
          where: { id: { in: toRemoveIds } },
          data: { status: "REMOVED" },
        });
      }
      // 신규 추가 코치 → ACCEPTED (LEAD/ASSISTANT 자동)
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      const toAdd = assignedCoachUserIds.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await this.prisma.classCoachAssignment.createMany({
          data: toAdd.map((userId) => ({
            classId,
            coachUserId: userId,
            invitedBy: coachUserId,
            role: userId === assignedCoachUserIds![0] ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      // 기존 LEAD 가 1번째가 아닌 경우 role 재조정 (LEAD ↔ ASSISTANT)
      if (assignedCoachUserIds.length > 0) {
        const leadId = assignedCoachUserIds[0];
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: leadId,
            role: { not: "LEAD" },
          },
          data: { role: "LEAD" },
        });
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: { not: leadId },
            role: "LEAD",
          },
          data: { role: "ASSISTANT" },
        });
      }
    }

    // 수강료 업데이트 (ClassProduct)
    //   - delete → create 를 단일 트랜잭션으로 원자화 (중간 실패 시 좀비 상품 0건 방지)
    //   - classDays 입력이 없으면 기존 Class.classDays 활용 → sessionsPerWeek 계산 정합
    if (
      updateDto.singlePrice !== undefined ||
      updateDto.monthlyPrice !== undefined
    ) {
      const effectiveClassDays =
        updateDto.classDays ?? (classRecord.classDays as string[] | undefined);
      const products = buildClassProducts(
        classId,
        {
          singlePrice: updateDto.singlePrice,
          monthlyPrice: updateDto.monthlyPrice,
          packageWeeks: updateDto.packageWeeks,
          packageTotalSessions: updateDto.packageTotalSessions,
          classDays: effectiveClassDays,
          // 기존 수업의 결제방식 기준으로 PER_SESSION 판매/비판매·billingTiming 결정 (B2).
          billingMode: classRecord.billingMode,
        },
      );

      // [M-1] id 보존 reconcile — enrollment/payment 참조 ClassProduct 의 FK 단절 방지.
      await this.prisma.$transaction(async (tx) => {
        await this.reconcileClassProducts(tx, classId, products);
      });
    }

    // 캐시 무효화
    await this.invalidateClassCache(teamId);

    // 2026-05-12: 신규 추가 코치에게 "수업 배정 알림" 발송 (등록자 본인 제외).
    //  - createClass 와 동일 패턴 (회의록 5:50 "감독 공지" 정합).
    //  - 알림 페이지(/notifications) + 종 아이콘 배지에 즉시 반영.
    if (newlyAddedCoachIds.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: coachUserId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "DIRECTOR"
          ? "감독"
          : inviter?.userType === "ACADEMY_DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: newlyAddedCoachIds.map((userId) => ({
          userId,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${updatedClass.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    return {
      id: updatedClass.id,
      className: updatedClass.className,
      instructorName: updatedClass.instructorName,
      name: updatedClass.team?.name ?? "",
      isActive: updatedClass.isActive,
      updatedAt: new Date(),
    };
  }

  /**
   * 수업 삭제 (감독만)
   */
  async deleteClass(coachUserId: string, teamId: string, classId: string) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수업을 삭제할 수 있습니다.",
    );

    // 수업 존재 및 클럽 소속 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // [수정 2026-05-15] 결제이력(paid) 기준 가드 — 한 명이라도 결제한 학부모가
    //   있으면 삭제 불가. 사용자 명시: "1명이라도 결제이력이 있으면 삭제할수없고".
    const paidCount = await this.prisma.enrollment.count({
      where: { classId, status: "paid" },
    });
    if (paidCount > 0) {
      throw new ConflictException(
        `결제 이력이 있는 수업은 삭제할 수 없습니다. (결제자 ${paidCount}명)`,
      );
    }

    await this.prisma.class.delete({
      where: { id: classId },
    });

    // 캐시 무효화
    await this.invalidateClassCache(teamId);

    return {
      id: classId,
      deletedAt: new Date(),
    };
  }

  /**
   * 학원(아카데미) 수업 수정 — PR-E C3 fix.
   *
   * 기존 `updateClass` 의 핵심 로직(필드 갱신·ClassCoachAssignment 동기화·ClassProduct 갱신)을
   * academyId 컨텍스트로 재구성. teamMember 기반 ageRange 자동 배치는 학원에 부적합하여 제외.
   * 권한: 학원 감독(directorId) 본인 또는 활성 학원 코치(AcademyCoach.isActive).
   */
  async updateAcademyClass(
    userId: string,
    academyId: string,
    classId: string,
    updateDto: UpdateClassDto,
  ) {
    await this.assertAcademyManagerPermission(
      userId,
      academyId,
      "이 아카데미의 감독/코치만 수업을 수정할 수 있습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classRecord || classRecord.academyId !== academyId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    if (
      updateDto.trainingType !== undefined &&
      updateDto.trainingType !== classRecord.trainingType
    ) {
      throw new BadRequestException(
        "수업 유형(정규/레슨)은 등록 후 변경할 수 없습니다.",
      );
    }

    if (
      updateDto.startTime &&
      updateDto.endTime &&
      new Date(updateDto.startTime) >= new Date(updateDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(updateDto.daySchedules, updateDto.dateSchedules);

    // 학원 코치 배정 검증 — createAcademyClass 패턴 미러링
    let assignedCoachUserIds: string[] | undefined = undefined;
    if (updateDto.coachUserIds !== undefined) {
      if (updateDto.coachUserIds.length === 0) {
        assignedCoachUserIds = [];
      } else {
        const [academy, validCoaches] = await Promise.all([
          this.prisma.academy.findUnique({
            where: { id: academyId },
            select: { directorId: true },
          }),
          this.prisma.academyCoach.findMany({
            where: {
              academyId,
              userId: { in: updateDto.coachUserIds },
              isActive: true,
            },
            select: { userId: true },
          }),
        ]);
        const validSet = new Set<string>([
          ...validCoaches.map((c) => c.userId),
          ...(academy?.directorId ? [academy.directorId] : []),
        ]);
        assignedCoachUserIds = updateDto.coachUserIds.filter((id) =>
          validSet.has(id),
        );
      }
    }
    const newLeadCoachId =
      assignedCoachUserIds && assignedCoachUserIds.length > 0
        ? assignedCoachUserIds[0]
        : undefined;

    const newlyAddedCoachIds: string[] = [];
    if (assignedCoachUserIds !== undefined) {
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { coachUserId: true },
      });
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      for (const uid of assignedCoachUserIds) {
        if (!existingSet.has(uid) && uid !== userId) {
          newlyAddedCoachIds.push(uid);
        }
      }
    }

    const newAgeMax = updateDto.ageMax ?? classRecord.ageMax;
    let derivedCategory = updateDto.category ?? classRecord.category;
    if (updateDto.category === undefined && newAgeMax != null) {
      if (newAgeMax >= 8 && newAgeMax <= 12) derivedCategory = `U${newAgeMax}`;
    }

    // [2026-06-05] daySchedules 재동기화 (학원 도메인)
    const hasDaySchedulesAcademyUpdate = (updateDto.daySchedules?.length ?? 0) > 0;
    const representativeAcademyUpdate = hasDaySchedulesAcademyUpdate
      ? deriveRepresentative(updateDto.daySchedules)
      : null;

    const updatedClass = await this.prisma.$transaction(async (txAcademyUpdate) => {
      // daySchedules 전송 시 — ClassDaySchedule 전체 교체
      if (updateDto.daySchedules !== undefined) {
        await txAcademyUpdate.classDaySchedule.deleteMany({ where: { classId } });
        if (updateDto.daySchedules.length > 0) {
          await txAcademyUpdate.classDaySchedule.createMany({
            data: updateDto.daySchedules.map((ds) => ({
              classId,
              dayOfWeek: ds.dayOfWeek,
              startTime: ds.startTime,
              endTime: ds.endTime,
              venueId: ds.venueId ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }

      return txAcademyUpdate.class.update({
        where: { id: classId },
        data: {
          className: updateDto.className ?? classRecord.className,
          description: updateDto.description ?? classRecord.description,
          instructorName: updateDto.instructorName ?? classRecord.instructorName,
          capacity: updateDto.capacity ?? classRecord.capacity,
          // targetBirthYears 전송 시 SoT 갱신 + ageMin/ageMax 파생 재계산(빈 배열=전 연령→null).
          //   미전송(undefined) 시 기존 ageMin/ageMax 유지(하위호환).
          ...(updateDto.targetBirthYears !== undefined
            ? {
                targetBirthYears: updateDto.targetBirthYears,
                ...this.deriveAgeRangeFromBirthYears(updateDto.targetBirthYears),
              }
            : {
                ageMin: updateDto.ageMin ?? classRecord.ageMin,
                ageMax: updateDto.ageMax ?? classRecord.ageMax,
              }),
          levelRequired: updateDto.levelRequired ?? classRecord.levelRequired,
          startTime: representativeAcademyUpdate?.startTime ?? updateDto.startTime ?? classRecord.startTime,
          endTime: representativeAcademyUpdate?.endTime ?? updateDto.endTime ?? classRecord.endTime,
          isActive: updateDto.isActive ?? classRecord.isActive,
          trainingType: classRecord.trainingType,
          coachId:
            newLeadCoachId ??
            (updateDto.coachId !== undefined
              ? updateDto.coachId
              : classRecord.coachId),
          venueId: representativeAcademyUpdate?.venueId !== undefined
            ? (representativeAcademyUpdate.venueId ?? null)
            : (updateDto.venueId !== undefined ? updateDto.venueId : classRecord.venueId),
          classDays: representativeAcademyUpdate?.classDays !== undefined
            ? representativeAcademyUpdate.classDays
            : (updateDto.classDays !== undefined ? updateDto.classDays : undefined),
          category: derivedCategory,
        },
      });
    });

    if (assignedCoachUserIds !== undefined) {
      const now = new Date();
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { id: true, coachUserId: true },
      });
      const newSet = new Set(assignedCoachUserIds);
      const toRemoveIds = existing
        .filter((a) => !newSet.has(a.coachUserId))
        .map((a) => a.id);
      if (toRemoveIds.length > 0) {
        await this.prisma.classCoachAssignment.updateMany({
          where: { id: { in: toRemoveIds } },
          data: { status: "REMOVED" },
        });
      }
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      const toAdd = assignedCoachUserIds.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await this.prisma.classCoachAssignment.createMany({
          data: toAdd.map((cid) => ({
            classId,
            coachUserId: cid,
            invitedBy: userId,
            role: cid === assignedCoachUserIds![0] ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      if (assignedCoachUserIds.length > 0) {
        const leadId = assignedCoachUserIds[0];
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: leadId,
            role: { not: "LEAD" },
          },
          data: { role: "LEAD" },
        });
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: { not: leadId },
            role: "LEAD",
          },
          data: { role: "ASSISTANT" },
        });
      }
    }

    // ClassProduct 갱신
    if (
      updateDto.singlePrice !== undefined ||
      updateDto.monthlyPrice !== undefined
    ) {
      const effectiveClassDays =
        updateDto.classDays ?? (classRecord.classDays as string[] | undefined);
      const products = buildClassProducts(
        classId,
        {
          singlePrice: updateDto.singlePrice,
          monthlyPrice: updateDto.monthlyPrice,
          packageWeeks: updateDto.packageWeeks,
          packageTotalSessions: updateDto.packageTotalSessions,
          classDays: effectiveClassDays,
          // 기존 수업의 결제방식 기준으로 PER_SESSION 판매/비판매·billingTiming 결정 (B2).
          billingMode: classRecord.billingMode,
        },
      );

      // [M-1] id 보존 reconcile — enrollment/payment 참조 ClassProduct 의 FK 단절 방지.
      await this.prisma.$transaction(async (tx) => {
        await this.reconcileClassProducts(tx, classId, products);
      });
    }

    // [2026-05-15] 오픈클래스 노출 팀 전체 replace.
    //   visibleTeamIds 가 전달된 경우만 — undefined 면 기존 노출 유지.
    //   유효한 활성 팀만 ClassTeamVisibility 로 저장.
    if (updateDto.visibleTeamIds !== undefined) {
      await this.prisma.$transaction(async (tx) => {
        await tx.classTeamVisibility.deleteMany({ where: { classId } });
        const uniqueTeamIds = [...new Set(updateDto.visibleTeamIds)];
        if (uniqueTeamIds.length > 0) {
          const validTeams = await tx.team.findMany({
            where: { id: { in: uniqueTeamIds }, isActive: true },
            select: { id: true },
          });
          if (validTeams.length > 0) {
            await tx.classTeamVisibility.createMany({
              data: validTeams.map((t) => ({ classId, teamId: t.id })),
              skipDuplicates: true,
            });
          }
        }
      });
    }

    // 신규 코치 배정 알림 발송
    if (newlyAddedCoachIds.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "DIRECTOR"
          ? "감독"
          : inviter?.userType === "ACADEMY_DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: newlyAddedCoachIds.map((uid) => ({
          userId: uid,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${updatedClass.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    return {
      id: updatedClass.id,
      className: updatedClass.className,
      instructorName: updatedClass.instructorName,
      name: "",
      isActive: updatedClass.isActive,
      updatedAt: new Date(),
    };
  }

  /**
   * 학원(아카데미) 수업 삭제 — PR-E C3 fix.
   *
   * deleteClass(:1708) 의 학원 버전. 활성 수강생 가드 동일.
   * 권한: 학원 감독(directorId) 본인 또는 활성 학원 코치.
   */
  async deleteAcademyClass(userId: string, academyId: string, classId: string) {
    await this.assertAcademyManagerPermission(
      userId,
      academyId,
      "이 아카데미의 감독/코치만 수업을 삭제할 수 있습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, academyId: true },
    });
    if (!classRecord || classRecord.academyId !== academyId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // [수정 2026-05-15] 결제이력(paid) 기준 가드 — 한 명이라도 결제한 학부모가
    //   있으면 삭제 불가. 사용자 명시: "1명이라도 결제이력이 있으면 삭제할수없고".
    const paidCount = await this.prisma.enrollment.count({
      where: { classId, status: "paid" },
    });
    if (paidCount > 0) {
      throw new ConflictException(
        `결제 이력이 있는 수업은 삭제할 수 없습니다. (결제자 ${paidCount}명)`,
      );
    }

    await this.prisma.class.delete({ where: { id: classId } });

    return { id: classId, deletedAt: new Date() };
  }

  /**
   * 수업 활성/비활성 토글
   */
  async toggleClassStatus(
    userId: string,
    teamId: string,
    classId: string,
    isActive: boolean,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      userId,
      teamId,
      "이 클럽의 수업 상태를 변경할 권한이 없습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
    await this.invalidateClassCache(teamId);
    return updated;
  }

  /**
   * [신규 2026-05-13] 명단관리 — 학생을 수업에 배치.
   *  코치/감독 권한 검증 후 ClassRegistration(active) 생성 또는 복구.
   *  enrollment(결제) 흐름과는 별도로 명단상 배치만 처리. 결제는 후속으로 학부모가 진행.
   */
  async assignStudentToClass(
    coachUserId: string,
    classId: string,
    studentUserId: string,
  ): Promise<{
    success: boolean;
    classId: string;
    userId: string;
    status: string;
  }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, capacity: true },
    });
    if (!cls) throw new NotFoundException("수업을 찾을 수 없습니다.");
    if (!cls.teamId) {
      throw new BadRequestException(
        "팀 소속 수업에서만 명단을 관리할 수 있습니다.",
      );
    }
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      cls.teamId,
      "이 수업의 감독/코치만 학생을 배치할 수 있습니다.",
    );
    const student = await this.prisma.user.findUnique({
      where: { id: studentUserId },
      select: { id: true, userType: true },
    });
    if (!student) throw new NotFoundException("학생을 찾을 수 없습니다.");

    // 정원 체크
    if (cls.capacity != null) {
      const activeCount = await this.prisma.classRegistration.count({
        where: { classId, status: "active" },
      });
      if (activeCount >= cls.capacity) {
        throw new BadRequestException("정원이 모두 찼습니다.");
      }
    }

    // upsert — 이미 inactive 등록이 있으면 active 로 복구
    const reg = await this.prisma.classRegistration.upsert({
      where: { classId_userId: { classId, userId: studentUserId } },
      update: { status: "active" },
      create: { classId, userId: studentUserId, status: "active" },
      select: { id: true, status: true },
    });
    await this.invalidateClassCache(cls.teamId);
    return {
      success: true,
      classId,
      userId: studentUserId,
      status: reg.status,
    };
  }

  /**
   * [신규 2026-05-13] 명단관리 — 학생 배치 해제(soft).
   *  ClassRegistration.status = 'inactive' 로 변경.
   */
  async unassignStudentFromClass(
    coachUserId: string,
    classId: string,
    studentUserId: string,
  ): Promise<{ success: boolean }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true },
    });
    if (!cls) throw new NotFoundException("수업을 찾을 수 없습니다.");
    if (!cls.teamId) {
      throw new BadRequestException(
        "팀 소속 수업에서만 명단을 관리할 수 있습니다.",
      );
    }
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      cls.teamId,
      "이 수업의 감독/코치만 학생 배치를 해제할 수 있습니다.",
    );
    await this.prisma.classRegistration.updateMany({
      where: { classId, userId: studentUserId },
      data: { status: "inactive" },
    });
    await this.invalidateClassCache(cls.teamId);
    return { success: true };
  }

  /**
   * 수업 일정 일괄 생성 — 기간 + 요일 + 시간 기반
   *
   * startDate ~ endDate 범위에서 classDays 에 포함된 요일만 선택해
   * ClassSchedule 일괄 생성. 이미 같은 날짜가 존재하면 skip.
   * 각 신규 일정에 대해 결제 완료 수강생 RSVP 자동 생성.
   *
   * @returns { created, skipped, schedules: [...] }
   */
  async createBulkClassSchedules(
    coachUserId: string,
    teamId: string,
    classId: string,
    dto: {
      startDate?: string;
      endDate?: string;
      classDays?: string[];
      startTime?: string;
      endTime?: string;
      dates?: string[];
      venueId?: string;
    },
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 일정을 생성할 수 있습니다.",
    );

    // 수업 존재 + 승인 상태 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      // [2026-06-05] ClassDaySchedule 로드 — 요일별 시각 적용용
      include: {
        dayScheduleEntries: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
      },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    if (classRecord.approvalStatus !== "APPROVED") {
      throw new ForbiddenException(
        "승인된 수업에만 일정을 생성할 수 있습니다.",
      );
    }

    // candidateDates 산출 — dates(미니달력 선택) 모드 우선, 없으면 기존 기간+요일 모드.
    const useDates = !!(dto.dates && dto.dates.length > 0);
    let candidateDates: Date[];
    if (useDates) {
      // 미니달력으로 선택한 날짜 배열 — 자정 기준 ClassSchedule 생성.
      //   시각·장소는 ClassSchedule.startTime/endTime/venueId 필드로 별도 저장(오픈클래스 방식 통일).
      candidateDates = dto.dates!.map((d) => new Date(`${d}T00:00:00`));
      if (candidateDates.some((d) => isNaN(d.getTime()))) {
        throw new ForbiddenException("올바른 날짜 형식을 입력해주세요.");
      }
    } else {
      if (
        !dto.startDate ||
        !dto.endDate ||
        !dto.classDays ||
        dto.classDays.length === 0
      ) {
        throw new ForbiddenException(
          "기간(시작일·종료일)과 요일을 지정하거나 날짜를 선택해주세요.",
        );
      }
      // 날짜 범위 · 요일 · 시간 파싱
      const start = new Date(`${dto.startDate}T00:00:00`);
      const end = new Date(`${dto.endDate}T23:59:59`);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new ForbiddenException("시작일이 종료일보다 이후일 수 없습니다.");
      }

      const dayMap: Record<string, number> = {
        일: 0,
        월: 1,
        화: 2,
        수: 3,
        목: 4,
        금: 5,
        토: 6,
      };
      const targetDows = new Set(
        dto.classDays.map((d) => dayMap[d]).filter((v) => v !== undefined),
      );
      if (targetDows.size === 0) {
        throw new ForbiddenException("유효한 요일을 선택해주세요.");
      }

      // [2026-06-05] ClassDaySchedule 요일별 시각 맵 구성 — 규칙이 있으면 요일별, 없으면 단일 폴백
      const bulkDayTimeMap = buildDayTimeMap(
        classRecord.dayScheduleEntries?.map((e) => ({
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
        })) ?? [],
      );
      const hasBulkDaySchedules = bulkDayTimeMap.size > 0;
      const dowToNameBulk: Record<number, string> = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };

      // startTime (HH:mm) — dto 지정 > 수업 ClassDaySchedule 요일별 > Class.startTime 단일 폴백
      const resolvedTime = dto.startTime
        ? dto.startTime
        : `${String(classRecord.startTime.getUTCHours()).padStart(2, "0")}:${String(classRecord.startTime.getUTCMinutes()).padStart(2, "0")}`;
      const [fallbackHhBulk, fallbackMmBulk] = resolvedTime.split(":").map((n) => parseInt(n, 10));

      // 기간 내 요일 매칭 날짜 수집
      const dates: Date[] = [];
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const dow = cursor.getDay();
        if (targetDows.has(dow)) {
          const dt = new Date(cursor);
          if (hasBulkDaySchedules && !dto.startTime) {
            // ClassDaySchedule 요일별 시각 적용 (dto.startTime 미지정 시에만)
            const dayName = dowToNameBulk[dow];
            const entry = dayName ? bulkDayTimeMap.get(dayName) : undefined;
            dt.setHours(entry?.startHH ?? fallbackHhBulk, entry?.startMM ?? fallbackMmBulk, 0, 0);
          } else {
            dt.setHours(fallbackHhBulk || 0, fallbackMmBulk || 0, 0, 0);
          }
          dates.push(dt);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      candidateDates = dates;
    }

    if (candidateDates.length === 0) {
      return { created: 0, skipped: 0, schedules: [] };
    }

    // 안전 상한 — 1회 호출에 최대 200건 (악의적/실수 방어)
    if (candidateDates.length > 200) {
      throw new ForbiddenException(
        "한 번에 생성 가능한 일정은 최대 200건입니다.",
      );
    }

    // 기존 일정 중복 제거 (정확히 동일 scheduledDate) — 취소된 일정은 제외하여 재등록 허용.
    const existing = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: {
          gte: candidateDates[0],
          lte: candidateDates[candidateDates.length - 1],
        },
        isCancelled: false,
      },
      select: { scheduledDate: true },
    });
    const existingSet = new Set(existing.map((e) => e.scheduledDate.getTime()));
    const toCreate = candidateDates.filter(
      (d) => !existingSet.has(d.getTime()),
    );

    if (toCreate.length === 0) {
      return { created: 0, skipped: candidateDates.length, schedules: [] };
    }

    // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ─────────────────────────
    // [STATUS] 비활성 — 팀 bulk 일정 추가 시 RSVP 자동 생성 차단
    // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개)
    // [TO RE-ENABLE] 아래 enrollments 조회 + RSVP createMany 블록 주석 해제
    // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 5곳 일괄 검색 → 블록 통째 삭제
    // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
    /*
    // 결제 완료 수강생 조회 (RSVP 자동 생성용)
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, status: "paid" },
      select: { childId: true, requestedBy: true },
    });
    */
    // ─── RSVP_DISABLED_2026-05-28 ─── END ───────────────────────────

    // 날짜 배열 모드: 선택 날짜들에 공통 시각·장소를 ClassSchedule 필드로 저장 (오픈클래스 방식 통일).
    //   요일 모드(하위호환)는 기존대로 scheduledDate 시각만 사용(필드 미저장).
    const scheduleExtra = useDates
      ? {
          startTime: dto.startTime ?? null,
          endTime: dto.endTime ?? null,
          venueId: dto.venueId ?? null,
        }
      : {};

    // 트랜잭션 — 일정 일괄 생성 (RSVP 자동 생성 비활성)
    const created = await this.prisma.$transaction(async (tx) => {
      const schedules = await Promise.all(
        toCreate.map((scheduledDate) =>
          tx.classSchedule.create({
            data: { classId, scheduledDate, ...scheduleExtra },
          }),
        ),
      );

      // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ───────────────────────
      // [STATUS] 비활성 — RSVP createMany 블록 차단
      // [TO RE-ENABLE] 위 enrollments 조회 블록과 함께 주석 해제
      /*
      // N+1 해소: 신규 schedule 들이므로 기존 RSVP 없음 — 바로 createMany skipDuplicates
      if (enrollments.length > 0 && schedules.length > 0) {
        const rsvpRows = schedules.flatMap((schedule) =>
          enrollments.map((e) => ({
            scheduleId: schedule.id,
            userId: e.requestedBy,
            childId: e.childId,
            status: "PENDING" as const,
          })),
        );
        if (rsvpRows.length > 0) {
          await tx.classRsvp.createMany({
            data: rsvpRows,
            skipDuplicates: true,
          });
        }
      }
      */
      // ─── RSVP_DISABLED_2026-05-28 ─── END ─────────────────────────

      return schedules;
    });

    return {
      created: created.length,
      skipped: candidateDates.length - created.length,
      schedules: created.map((s) => ({
        id: s.id,
        classId: s.classId,
        scheduledDate: s.scheduledDate,
        isCancelled: s.isCancelled,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * 학원(아카데미) 권한 검증 — 감독 본인 또는 소속 코치만 통과.
   *
   * createAcademyClass(line 326-346) 와 동일 패턴을 메서드로 추출.
   * bulkAddAcademySchedules 에서 재사용한다.
   */
  private async assertAcademyManagerPermission(
    userId: string,
    academyId: string,
    errorMessage = "이 아카데미의 감독 또는 코치만 작업할 수 있습니다.",
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, directorId: true },
    });
    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }
    if (academy.directorId === userId) return;

    const academyCoach = await this.prisma.academyCoach.findUnique({
      where: { academyId_userId: { academyId, userId } },
      select: { userId: true, isActive: true },
    });
    if (!academyCoach || !academyCoach.isActive) {
      throw new ForbiddenException(errorMessage);
    }
  }

  /**
   * 학원(아카데미) 수업 일정 일괄 생성 — 기간 + 요일 + 시간.
   *
   * 팀용 `createBulkClassSchedules` (line 1853~) 미러링.
   *  - 가드: classRecord.academyId !== academyId
   *  - 최대 200건/회 상한 유지
   *  - 트랜잭션 내 schedule + RSVP createMany skipDuplicates 동일
   */
  async bulkAddAcademySchedules(
    userId: string,
    academyId: string,
    classId: string,
    dto: {
      startDate?: string;
      endDate?: string;
      classDays?: string[];
      startTime?: string;
      endTime?: string;
      dates?: string[];
      venueId?: string;
    },
  ) {
    await this.assertAcademyManagerPermission(
      userId,
      academyId,
      "이 아카데미의 감독/코치만 일정을 생성할 수 있습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      // [2026-06-05] ClassDaySchedule 로드 — 요일별 시각 적용용
      include: {
        dayScheduleEntries: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
      },
    });

    if (!classRecord || classRecord.academyId !== academyId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    if (classRecord.approvalStatus !== "APPROVED") {
      throw new ForbiddenException(
        "승인된 수업에만 일정을 생성할 수 있습니다.",
      );
    }

    // candidateDates 산출 — dates(미니달력 선택) 모드 우선, 없으면 기존 기간+요일 모드.
    const useDates = !!(dto.dates && dto.dates.length > 0);
    let candidateDates: Date[];
    if (useDates) {
      candidateDates = dto.dates!.map((d) => new Date(`${d}T00:00:00`));
      if (candidateDates.some((d) => isNaN(d.getTime()))) {
        throw new ForbiddenException("올바른 날짜 형식을 입력해주세요.");
      }
    } else {
      if (
        !dto.startDate ||
        !dto.endDate ||
        !dto.classDays ||
        dto.classDays.length === 0
      ) {
        throw new ForbiddenException(
          "기간(시작일·종료일)과 요일을 지정하거나 날짜를 선택해주세요.",
        );
      }
      const start = new Date(`${dto.startDate}T00:00:00`);
      const end = new Date(`${dto.endDate}T23:59:59`);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new ForbiddenException("시작일이 종료일보다 이후일 수 없습니다.");
      }

      const dayMap: Record<string, number> = {
        일: 0,
        월: 1,
        화: 2,
        수: 3,
        목: 4,
        금: 5,
        토: 6,
      };
      const targetDows = new Set(
        dto.classDays.map((d) => dayMap[d]).filter((v) => v !== undefined),
      );
      if (targetDows.size === 0) {
        throw new ForbiddenException("유효한 요일을 선택해주세요.");
      }

      // [2026-06-05] ClassDaySchedule 요일별 시각 맵 구성 — 학원 도메인
      const bulkAcademyDayTimeMap = buildDayTimeMap(
        classRecord.dayScheduleEntries?.map((e) => ({
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
        })) ?? [],
      );
      const hasBulkAcademyDaySchedules = bulkAcademyDayTimeMap.size > 0;
      const dowToNameBulkAcademy: Record<number, string> = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };

      const resolvedTime = dto.startTime
        ? dto.startTime
        : `${String(classRecord.startTime.getUTCHours()).padStart(2, "0")}:${String(classRecord.startTime.getUTCMinutes()).padStart(2, "0")}`;
      const [fallbackHhAcademyBulk, fallbackMmAcademyBulk] = resolvedTime.split(":").map((n) => parseInt(n, 10));

      const dates: Date[] = [];
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= end) {
        const dow = cursor.getDay();
        if (targetDows.has(dow)) {
          const dt = new Date(cursor);
          if (hasBulkAcademyDaySchedules && !dto.startTime) {
            const dayName = dowToNameBulkAcademy[dow];
            const entry = dayName ? bulkAcademyDayTimeMap.get(dayName) : undefined;
            dt.setHours(entry?.startHH ?? fallbackHhAcademyBulk, entry?.startMM ?? fallbackMmAcademyBulk, 0, 0);
          } else {
            dt.setHours(fallbackHhAcademyBulk || 0, fallbackMmAcademyBulk || 0, 0, 0);
          }
          dates.push(dt);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      candidateDates = dates;
    }

    if (candidateDates.length === 0) {
      return { created: 0, skipped: 0, schedules: [] };
    }

    if (candidateDates.length > 200) {
      throw new ForbiddenException(
        "한 번에 생성 가능한 일정은 최대 200건입니다.",
      );
    }

    // 취소된 일정은 중복으로 보지 않음 — 취소했던 날짜에 재등록 허용.
    const existing = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: {
          gte: candidateDates[0],
          lte: candidateDates[candidateDates.length - 1],
        },
        isCancelled: false,
      },
      select: { scheduledDate: true },
    });
    const existingSet = new Set(existing.map((e) => e.scheduledDate.getTime()));
    const toCreate = candidateDates.filter(
      (d) => !existingSet.has(d.getTime()),
    );

    if (toCreate.length === 0) {
      return { created: 0, skipped: candidateDates.length, schedules: [] };
    }

    // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ─────────────────────────
    // [STATUS] 비활성 — 아카데미 bulk 일정 추가 시 RSVP 자동 생성 차단
    // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개)
    // [TO RE-ENABLE] 아래 enrollments 조회 + RSVP createMany 블록 주석 해제
    // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 5곳 일괄 검색 → 블록 통째 삭제
    // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
    /*
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, status: "paid" },
      select: { childId: true, requestedBy: true },
    });
    */
    // ─── RSVP_DISABLED_2026-05-28 ─── END ───────────────────────────

    // 날짜 배열 모드: 선택 날짜들에 공통 시각·장소를 ClassSchedule 필드로 저장 (오픈클래스 방식 통일).
    const scheduleExtra = useDates
      ? {
          startTime: dto.startTime ?? null,
          endTime: dto.endTime ?? null,
          venueId: dto.venueId ?? null,
        }
      : {};

    const createdSchedules = await this.prisma.$transaction(async (tx) => {
      const schedules = await Promise.all(
        toCreate.map((scheduledDate) =>
          tx.classSchedule.create({
            data: { classId, scheduledDate, ...scheduleExtra },
          }),
        ),
      );

      // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ───────────────────────
      // [STATUS] 비활성 — RSVP createMany 블록 차단
      // [TO RE-ENABLE] 위 enrollments 조회 블록과 함께 주석 해제
      /*
      if (enrollments.length > 0 && schedules.length > 0) {
        const rsvpRows = schedules.flatMap((schedule) =>
          enrollments.map((e) => ({
            scheduleId: schedule.id,
            userId: e.requestedBy,
            childId: e.childId,
            status: "PENDING" as const,
          })),
        );
        if (rsvpRows.length > 0) {
          await tx.classRsvp.createMany({
            data: rsvpRows,
            skipDuplicates: true,
          });
        }
      }
      */
      // ─── RSVP_DISABLED_2026-05-28 ─── END ─────────────────────────

      return schedules;
    });

    return {
      created: createdSchedules.length,
      skipped: candidateDates.length - createdSchedules.length,
      schedules: createdSchedules.map((s) => ({
        id: s.id,
        classId: s.classId,
        scheduledDate: s.scheduledDate,
        isCancelled: s.isCancelled,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * 수업 일정 취소
   *
   * 2026-05-14: expectedOwner 옵션 추가 — 학원 도메인 컨트롤러에서 path 의
   *   academyId 일치 검증 + 학원 권한 가드 분기 위한 보강.
   *   - expectedOwner.teamId 가 주어지면 schedule.class.teamId 일치 확인
   *   - expectedOwner.academyId 가 주어지면 schedule.class.academyId 일치 확인
   *   - 미지정 호출(기존 팀 컨트롤러)은 schedule.class.teamId 기반 기존 동작 유지
   */
  async cancelClassSchedule(
    coachUserId: string,
    scheduleId: string,
    cancellationReason?: string,
    expectedOwner?: { teamId?: string; academyId?: string },
  ) {
    // 일정 확인
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    // path owner 일치 검증 (옵션)
    if (
      expectedOwner?.teamId &&
      schedule.class.teamId !== expectedOwner.teamId
    ) {
      throw new ForbiddenException("이 일정을 취소할 권한이 없습니다.");
    }
    if (
      expectedOwner?.academyId &&
      schedule.class.academyId !== expectedOwner.academyId
    ) {
      throw new ForbiddenException("이 일정을 취소할 권한이 없습니다.");
    }

    // 권한 검증 — owner 종류별 분기
    if (schedule.class.teamId) {
      // 팀 수업: 기존 팀 매니저 가드
      await this.teamsService.assertTeamManagerPermission(
        coachUserId,
        schedule.class.teamId,
        "이 일정을 취소할 권한이 없습니다.",
      );
    } else if (schedule.class.academyId) {
      // 학원 수업: 학원 감독/소속 코치 가드
      await this.assertAcademyManagerPermission(
        coachUserId,
        schedule.class.academyId,
        "이 일정을 취소할 권한이 없습니다.",
      );
    } else {
      // orphan (teamId·academyId 모두 null) — 정상 데이터에선 발생 안 함
      throw new ForbiddenException("이 일정을 취소할 권한이 없습니다.");
    }

    // 일정 취소 + 출석 상태 변경 + 크레딧 복원 — 원자적 트랜잭션
    const cancelledSchedule = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.classSchedule.update({
        where: { id: scheduleId },
        data: {
          isCancelled: true,
          cancellationReason,
        },
      });

      // 크레딧이 차감된 출석 기록 조회
      const deductedAttendances = await tx.classAttendance.findMany({
        where: { scheduleId, creditDeducted: true },
      });

      // 출석 상태 일괄 변경
      await tx.classAttendance.updateMany({
        where: { scheduleId },
        data: {
          attendanceStatus: "cancelled",
        },
      });

      // 수업권 복원 (차감되었던 출석 기록에 대해서만) — 2026-04-27 (N-9): User × Class 단위
      if (deductedAttendances.length > 0) {
        const userIds = deductedAttendances.map((a) => a.memberId); // memberId 는 User.id
        const classId = schedule.class.id;
        const now = new Date();

        // 1) 해당 수업의 유효한 수업권 1회 조회 (userId 별 만료 임박순)
        const memberCredits = await tx.memberCredit.findMany({
          where: {
            userId: { in: userIds },
            classId,
            expiresAt: { gte: now },
          },
          orderBy: { expiresAt: "asc" },
          select: {
            id: true,
            userId: true,
            totalSessions: true,
            usedSessions: true,
          },
        });

        // userId → 첫 번째 유효 수업권 매핑
        const creditByUser = new Map<string, (typeof memberCredits)[0]>();
        for (const c of memberCredits) {
          if (!creditByUser.has(c.userId)) {
            creditByUser.set(c.userId, c);
          }
        }

        const creditIdsToRestore: string[] = [];
        for (const attendance of deductedAttendances) {
          const credit = creditByUser.get(attendance.memberId);
          if (credit) {
            creditIdsToRestore.push(credit.id);
          }
        }

        if (creditIdsToRestore.length > 0) {
          // PR-B (v0.5): CreditDomainService.bulkRestoreOne 위임
          // (내부에서 updateMany + 가드 + CreditTransaction(restored) 일괄 INSERT)
          const { restoredCount } = await this.creditDomain.bulkRestoreOne(tx, {
            creditIds: creditIdsToRestore,
            reason: `수업 일정 취소 - 수업권 복원 (사유: ${cancellationReason || "미기재"})`,
            adjustedBy: coachUserId,
            scheduleId,
          });

          if (restoredCount < creditIdsToRestore.length) {
            this.logger.warn(
              `수업권 복원 부분 실패: 대상 ${creditIdsToRestore.length}개 중 ${restoredCount}개만 복원 (나머지는 usedSessions=0 으로 이미 복원됨)`,
            );
          }

          // PR-C (v0.6): AuditLog INSERT — 수업 일정 취소로 복원된 학생별
          for (const attendance of deductedAttendances) {
            await this.auditLog.record(tx, {
              attendanceId: attendance.id,
              scheduleId,
              memberId: attendance.memberId,
              actorUserId: coachUserId,
              actionType: "clear",
              fromStatus: "present",
              toStatus: "cancelled",
              creditDelta: 1,
              reason: `수업 일정 취소 (사유: ${cancellationReason || "미기재"})`,
            });
          }
        }
      }

      return updated;
    });

    return {
      id: cancelledSchedule.id,
      scheduledDate: cancelledSchedule.scheduledDate,
      isCancelled: cancelledSchedule.isCancelled,
      cancellationReason: cancelledSchedule.cancellationReason,
      updatedAt: new Date(),
    };
  }

  /**
   * 개별 회차 시간·장소 수정 — 팀/학원 공용 (cancelClassSchedule 권한 분기 미러링).
   *  - expectedOwner 로 path owner 일치 검증 + owner 종류별 매니저 가드.
   *  - 취소된 일정은 수정 불가.
   *  - 전달된 필드만 부분 반영(venueId 빈 문자열 → null 장소 해제).
   */
  async updateClassSchedule(
    coachUserId: string,
    scheduleId: string,
    dto: { startTime?: string; endTime?: string; venueId?: string },
    expectedOwner?: { teamId?: string; academyId?: string },
  ) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: { class: true },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    if (
      expectedOwner?.teamId &&
      schedule.class.teamId !== expectedOwner.teamId
    ) {
      throw new ForbiddenException("이 일정을 수정할 권한이 없습니다.");
    }
    if (
      expectedOwner?.academyId &&
      schedule.class.academyId !== expectedOwner.academyId
    ) {
      throw new ForbiddenException("이 일정을 수정할 권한이 없습니다.");
    }

    if (schedule.class.teamId) {
      await this.teamsService.assertTeamManagerPermission(
        coachUserId,
        schedule.class.teamId,
        "이 일정을 수정할 권한이 없습니다.",
      );
    } else if (schedule.class.academyId) {
      await this.assertAcademyManagerPermission(
        coachUserId,
        schedule.class.academyId,
        "이 일정을 수정할 권한이 없습니다.",
      );
    } else {
      throw new ForbiddenException("이 일정을 수정할 권한이 없습니다.");
    }

    if (schedule.isCancelled) {
      throw new ForbiddenException("취소된 일정은 수정할 수 없습니다.");
    }

    const data: { startTime?: string | null; endTime?: string | null; venueId?: string | null } = {};
    if (dto.startTime !== undefined) data.startTime = dto.startTime || null;
    if (dto.endTime !== undefined) data.endTime = dto.endTime || null;
    if (dto.venueId !== undefined) data.venueId = dto.venueId || null;

    const updated = await this.prisma.classSchedule.update({
      where: { id: scheduleId },
      data,
      include: { venue: { select: { id: true, name: true } } },
    });

    return {
      id: updated.id,
      classId: updated.classId,
      scheduledDate: updated.scheduledDate,
      startTime: updated.startTime,
      endTime: updated.endTime,
      venue: updated.venue,
      isCancelled: updated.isCancelled,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * 특정 기간의 수업 일정 조회
   */
  async getClassSchedulesByDateRange(
    classId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // date-only('2026-04-21') 입력 시 양 경계가 동일 UTC 자정이 되어 쿼리가 단일 시점으로 축소됨.
    // endDate를 해당 날짜 끝(23:59:59.999)까지 확장해 "그 날까지 포함" 의미를 유지한다.
    // 기간 경계는 주어진 것만 적용 — startDate·endDate 둘 다 없으면 해당 수업 전체 회차 반환.
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        ...(startDate || endDate ? { scheduledDate: dateFilter } : {}),
      },
      include: {
        attendances: {
          select: {
            id: true,
            memberId: true,
            attendanceStatus: true,
          },
        },
        // [2026-06-09] 오픈클래스 날짜별 일정 — 장소명 표시용 venue 조인.
        venue: { select: { id: true, name: true } },
      },
      orderBy: {
        scheduledDate: "asc",
      },
    });

    return schedules;
  }

  /**
   * 수업 상품 생성 (감독만)
   */
  async createClassProduct(
    coachUserId: string,
    teamId: string,
    classId: string,
    createProductDto: CreateClassProductDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 상품을 생성할 수 있습니다.",
    );

    // 수업 존재 및 클럽 소속 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // 정액(MONTHLY_FIXED) 무차감 기간제 — sessionsPerMonth 미전송 시 주수×주빈도로 파생(표시/정합용).
    const derivedWeeks = Math.max(
      1,
      Math.round((createProductDto.durationDays ?? 30) / 7),
    );
    const resolvedSessionsPerMonth =
      createProductDto.sessionsPerMonth ??
      (createProductDto.feeType === "MONTHLY_FIXED"
        ? Math.max(1, (createProductDto.sessionsPerWeek ?? 1) * derivedWeeks)
        : 1);

    const product = await this.prisma.classProduct.create({
      data: {
        classId,
        productName: createProductDto.productName,
        description: createProductDto.description,
        price: createProductDto.price,
        sessionsPerMonth: resolvedSessionsPerMonth,
        durationDays: createProductDto.durationDays || 30,
      },
    });

    // 상품이 수업 조회 응답에 포함되므로 캐시 무효화 (학부모 결제 화면 stale 방지)
    await this.invalidateClassCache(teamId);

    return {
      id: product.id,
      classId: product.classId,
      productName: product.productName,
      description: product.description,
      price: product.price,
      sessionsPerMonth: product.sessionsPerMonth,
      durationDays: product.durationDays,
      createdAt: product.createdAt,
    };
  }

  /**
   * 수업 상품 목록 조회
   *
   * [사용자 직접 지시 2026-05-22] PARENT/CHILD/TEEN 시점에는 비활성 패키지를 응답에서 제외.
   *   `/classes/[id]` 수업 상세 + `/payment/options` 결제 화면 모두 동일하게 학부모/학생 시점
   *   에선 결제 가능한 옵션만 노출 → 시각 노이즈 최소화 + UX 일관성.
   *   COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN 은 모두 노출 (운영 디버깅 + PackageManageSection 연동).
   *   requester 미전달은 레거시 호출(테스트·내부 헬퍼) — 보수적으로 모두 노출.
   */
  async getClassProducts(classId: string, requester?: JwtUserPayload) {
    // PACKAGE_END_GUARD (2026-05-22) — Class.endTime 동반 조회.
    // 응답에 isPurchasable / expectedExpiresAt / classEndDate / disabledReason 계산 필드 부여.
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, endTime: true, academyId: true },
    });

    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const products = await this.prisma.classProduct.findMany({
      where: { classId },
      select: {
        id: true,
        productName: true,
        description: true,
        price: true,
        sessionsPerMonth: true,
        durationDays: true,
        // 결제 플로우(/payment/options)에서 Fee Type Selection / 횟수제 가격 계산에 필수
        feeType: true,
        feePerSession: true,
        sessionsPerWeek: true,
        billingTiming: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        price: "asc",
      },
    });

    // PACKAGE_END_GUARD (v3 · SoT 단일화 2026-05-22):
    //   classes/utils/package-guard.util.ts:computePackageGuardMeta() 호출로 메타 주입.
    //   shouldHideInactiveFor(requester?.userType) — PARENT/CHILD/TEEN 비활성 제외.
    // [2026-06-09] 오픈클래스는 종료일 개념이 날짜별 일정과 맞지 않아 종료 판정 제외(endTime=null)
    //   → 전체(MONTHLY_FIXED) 등이 isPurchasable=true 로 결제 옵션에 정상 노출.
    const endTime = classRecord.academyId ? null : (classRecord.endTime ?? null);
    const productsWithMeta = products.map((p) => ({
      ...p,
      ...computePackageGuardMeta(p, endTime),
    }));
    return shouldHideInactiveFor(requester?.userType)
      ? productsWithMeta.filter((p) => p.isPurchasable !== false)
      : productsWithMeta;
  }

  /**
   * 수업 패키지(상품) 부분 수정 (2026-05-22 신규).
   *
   * 권한: 해당 팀의 감독·코치·아카데미 원장·관리자 (assertTeamManagerPermission).
   * Soft delete 호환: isActive=false 전환은 본 메서드로 처리.
   */
  async updateClassProduct(
    coachUserId: string,
    teamId: string,
    classId: string,
    productId: string,
    dto: import("./dto/update-product.dto").UpdateClassProductDto,
  ) {
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 패키지를 수정할 수 있습니다.",
    );

    // 수업 + 패키지 소속 확인 (cross-tenant 차단)
    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        classId: true,
        class: { select: { id: true, teamId: true } },
      },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("패키지를 찾을 수 없습니다.");
    }
    if (product.class.teamId !== teamId) {
      throw new NotFoundException("패키지를 찾을 수 없습니다.");
    }

    const updated = await this.prisma.classProduct.update({
      where: { id: productId },
      data: {
        ...(dto.productName !== undefined && { productName: dto.productName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.sessionsPerMonth !== undefined && {
          sessionsPerMonth: dto.sessionsPerMonth,
        }),
        ...(dto.durationDays !== undefined && {
          durationDays: dto.durationDays,
        }),
        ...(dto.sessionsPerWeek !== undefined && {
          sessionsPerWeek: dto.sessionsPerWeek,
        }),
        ...(dto.feePerSession !== undefined && {
          feePerSession: dto.feePerSession,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        // 2026-05-22 옵션 H — feeType 수정 허용.
        ...(dto.feeType !== undefined && { feeType: dto.feeType }),
      },
      select: {
        id: true,
        classId: true,
        productName: true,
        description: true,
        price: true,
        sessionsPerMonth: true,
        durationDays: true,
        sessionsPerWeek: true,
        feePerSession: true,
        feeType: true,
        billingTiming: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await this.invalidateClassCache(teamId);

    return updated;
  }

  /**
   * 수업 패키지(상품) 삭제 (2026-05-22 신규).
   *
   * 정책:
   *  - 결제·수강 이력 FK 가 존재하면 hard delete 불가 → 자동 soft delete (isActive=false).
   *  - FK 없으면 hard delete.
   * 권한: 해당 팀의 감독·코치·아카데미 원장·관리자.
   */
  async deleteClassProduct(
    coachUserId: string,
    teamId: string,
    classId: string,
    productId: string,
  ): Promise<{ id: string; deleted: "hard" | "soft" }> {
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 패키지를 삭제할 수 있습니다.",
    );

    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        classId: true,
        class: { select: { teamId: true } },
        _count: {
          select: {
            payments: true,
            enrollments: true,
          },
        },
      },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("패키지를 찾을 수 없습니다.");
    }
    if (product.class.teamId !== teamId) {
      throw new NotFoundException("패키지를 찾을 수 없습니다.");
    }

    const hasHistory =
      (product._count?.payments ?? 0) > 0 ||
      (product._count?.enrollments ?? 0) > 0;

    if (hasHistory) {
      // 결제·수강 이력 있음 → soft delete (isActive=false).
      await this.prisma.classProduct.update({
        where: { id: productId },
        data: { isActive: false },
      });
      await this.invalidateClassCache(teamId);
      return { id: productId, deleted: "soft" };
    }

    // 이력 없음 → hard delete.
    await this.prisma.classProduct.delete({ where: { id: productId } });
    await this.invalidateClassCache(teamId);
    return { id: productId, deleted: "hard" };
  }

  // ============================================================
  // 통합 패키지 CRUD (2026-05-22 신규)
  //   경로: /api/v1/classes/:classId/products (teamId 불요)
  //   Class.teamId 우선 → academyId 자동 판별 후 권한 검증.
  // ============================================================

  /**
   * Class 소유자 권한 검증 (통합). owner 종류·식별자 반환.
   *  - 팀 수업 (teamId): TeamsService.assertTeamManagerPermission
   *  - 오픈클래스 (academyId): Academy.directorId === userId 또는 ADMIN
   */
  private async assertClassManagerPermission(
    userId: string,
    userType: string,
    classId: string,
    errorMessage: string,
  ): Promise<{
    ownerType: "team" | "academy";
    ownerId: string;
    billingMode: string;
  }> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, academyId: true, billingMode: true },
    });
    if (!klass) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    const billingMode = klass.billingMode ?? "PREPAID";
    if (klass.teamId) {
      await this.teamsService.assertTeamManagerPermission(
        userId,
        klass.teamId,
        errorMessage,
      );
      return { ownerType: "team", ownerId: klass.teamId, billingMode };
    }
    if (klass.academyId) {
      if (userType === "ADMIN") {
        return { ownerType: "academy", ownerId: klass.academyId, billingMode };
      }
      const academy = await this.prisma.academy.findUnique({
        where: { id: klass.academyId },
        select: { directorId: true },
      });
      if (!academy) {
        throw new NotFoundException("아카데미를 찾을 수 없습니다.");
      }
      if (academy.directorId !== userId) {
        throw new ForbiddenException(errorMessage);
      }
      return { ownerType: "academy", ownerId: klass.academyId, billingMode };
    }
    // orphan class (teamId/academyId 모두 null) — schema CHECK 위반이지만 안전 차단.
    throw new BadRequestException("수업 소유자를 확인할 수 없습니다.");
  }

  /**
   * 통합 패키지 생성 — classId 만으로 owner 자동 판별.
   */
  async createClassProductByClassId(
    userId: string,
    userType: string,
    classId: string,
    dto: CreateClassProductDto,
  ) {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 패키지를 생성할 수 있습니다.",
      );

    // 후불(POSTPAID) 수업은 "후불 수업료"(출석 횟수 × 1회 단가, 월말 정산) 단일 상품만
    //   사용한다. 추가 패키지(정기권·회차권 등)는 정산 모델과 충돌하므로 신규 생성을 차단.
    if (billingMode === "POSTPAID") {
      throw new BadRequestException(
        "후불 수업은 출석 기반 정산만 지원하므로 추가 패키지를 등록할 수 없습니다.",
      );
    }

    // 정액(MONTHLY_FIXED)은 무차감 기간제라 sessionsPerMonth 가 출석 회차를 제한하지 않는다.
    //   프론트가 "수업 횟수"를 보내지 않아도 주수(durationDays/7)×주빈도(sessionsPerWeek)로
    //   파생해 표시/정합용 값을 채운다. PER_SESSION 등은 1회권 의미로 1.
    const derivedWeeks = Math.max(1, Math.round((dto.durationDays ?? 30) / 7));
    const resolvedSessionsPerMonth =
      dto.sessionsPerMonth ??
      (dto.feeType === "MONTHLY_FIXED"
        ? Math.max(1, (dto.sessionsPerWeek ?? 1) * derivedWeeks)
        : 1);

    const product = await this.prisma.classProduct.create({
      data: {
        classId,
        productName: dto.productName,
        description: dto.description,
        price: dto.price,
        sessionsPerMonth: resolvedSessionsPerMonth,
        durationDays: dto.durationDays || 30,
        // 2026-05-22 옵션 H — PackageEditSheet 가 전달한 feeType/sessionsPerWeek 저장.
        ...(dto.feeType ? { feeType: dto.feeType } : {}),
        ...(dto.sessionsPerWeek
          ? { sessionsPerWeek: dto.sessionsPerWeek }
          : {}),
      },
      select: {
        id: true,
        classId: true,
        productName: true,
        description: true,
        price: true,
        sessionsPerMonth: true,
        durationDays: true,
        sessionsPerWeek: true,
        feePerSession: true,
        feeType: true,
        billingTiming: true,
        isActive: true,
        createdAt: true,
      },
    });

    // 캐시 무효화 — 팀 수업만 (오픈클래스 캐시 키 별도)
    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }

    return product;
  }

  /**
   * 통합 패키지 수정 — classId + productId.
   */
  async updateClassProductByClassId(
    userId: string,
    userType: string,
    classId: string,
    productId: string,
    dto: import("./dto/update-product.dto").UpdateClassProductDto,
  ) {
    const { ownerType, ownerId } = await this.assertClassManagerPermission(
      userId,
      userType,
      classId,
      "이 수업의 감독/코치만 패키지를 수정할 수 있습니다.",
    );

    // 패키지 소속 확인 (cross-class 차단)
    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: { id: true, classId: true },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("패키지를 찾을 수 없습니다.");
    }

    const updated = await this.prisma.classProduct.update({
      where: { id: productId },
      data: {
        ...(dto.productName !== undefined && { productName: dto.productName }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.sessionsPerMonth !== undefined && {
          sessionsPerMonth: dto.sessionsPerMonth,
        }),
        ...(dto.durationDays !== undefined && {
          durationDays: dto.durationDays,
        }),
        ...(dto.sessionsPerWeek !== undefined && {
          sessionsPerWeek: dto.sessionsPerWeek,
        }),
        ...(dto.feePerSession !== undefined && {
          feePerSession: dto.feePerSession,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        // 2026-05-22 옵션 H — feeType 수정 허용.
        ...(dto.feeType !== undefined && { feeType: dto.feeType }),
      },
      select: {
        id: true,
        classId: true,
        productName: true,
        description: true,
        price: true,
        sessionsPerMonth: true,
        durationDays: true,
        sessionsPerWeek: true,
        feePerSession: true,
        feeType: true,
        billingTiming: true,
        isActive: true,
        updatedAt: true,
      },
    });

    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }

    return updated;
  }

  /**
   * 통합 패키지 삭제 — classId + productId.
   * 결제·수강 이력 있으면 soft delete (isActive=false).
   */
  async deleteClassProductByClassId(
    userId: string,
    userType: string,
    classId: string,
    productId: string,
  ): Promise<{ id: string; deleted: "hard" | "soft" }> {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 패키지를 삭제할 수 있습니다.",
      );

    // 후불 수업은 "1회 수업료" 단일 상품으로 출석 기반 정산하므로 삭제를 차단한다.
    if (billingMode === "POSTPAID") {
      throw new BadRequestException(
        "후불 수업은 출석 기반 정산에 필요한 1회 수업료 상품을 삭제할 수 없습니다.",
      );
    }

    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        classId: true,
        _count: { select: { payments: true, enrollments: true } },
      },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("패키지를 찾을 수 없습니다.");
    }

    const hasHistory =
      (product._count?.payments ?? 0) > 0 ||
      (product._count?.enrollments ?? 0) > 0;

    if (hasHistory) {
      await this.prisma.classProduct.update({
        where: { id: productId },
        data: { isActive: false },
      });
      if (ownerType === "team") {
        await this.invalidateClassCache(ownerId);
      }
      return { id: productId, deleted: "soft" };
    }

    await this.prisma.classProduct.delete({ where: { id: productId } });
    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }
    return { id: productId, deleted: "hard" };
  }

  /**
   * 정기권(MONTHLY_FIXED) 회수 cross 검증 — buildClassProducts 규칙과 일관.
   *   weeks 는 총 회수 ÷ 주당 회수로 역산(주당 미지정 시 1회로 간주).
   *   - 1 ≤ weeks ≤ 52
   *   - totalSessions ≥ weeks (최소 주 1회)
   *   - totalSessions ≤ weeks × 14
   */
  private assertMonthlyFixedSessions(
    productName: string,
    totalSessions: number,
    sessionsPerWeek?: number,
  ): void {
    const perWeek = Math.max(1, sessionsPerWeek ?? 1);
    const weeks = Math.ceil(totalSessions / perWeek);
    if (weeks < 1 || weeks > 52) {
      throw new BadRequestException(
        `정기 패키지(${productName}) 주 수(${weeks})는 1~52 범위여야 합니다.`,
      );
    }
    if (totalSessions < weeks) {
      throw new BadRequestException(
        `정기 패키지(${productName}) 총 회수(${totalSessions})는 주 수(${weeks}) 이상이어야 합니다.`,
      );
    }
    if (totalSessions > weeks * 14) {
      throw new BadRequestException(
        `정기 패키지(${productName}) 총 회수(${totalSessions})는 주 수×14(${weeks * 14}) 이하여야 합니다.`,
      );
    }
  }

  /**
   * bulk 항목의 durationDays 도출 — buildClassProducts 만료일 SoT 와 일치.
   *   - MONTHLY_FIXED(정기권): weeks×7 (weeks = ceil(총 회수 ÷ 주당 회수), 1~52 clamp).
   *     PACKAGE_END_GUARD 만료일 계산이 정기권 등록 경로와 동일해지도록 강제.
   *   - 그 외(PER_SESSION 등): 입력값 우선, 없으면 30.
   */
  private deriveBulkDurationDays(item: {
    feeType: string;
    sessionsPerMonth: number;
    sessionsPerWeek?: number;
    durationDays?: number;
  }): number {
    if (item.feeType === "MONTHLY_FIXED") {
      const perWeek = Math.max(1, item.sessionsPerWeek ?? 1);
      const weeks = Math.max(
        1,
        Math.min(52, Math.ceil(item.sessionsPerMonth / perWeek)),
      );
      return weeks * 7;
    }
    return item.durationDays ?? 30;
  }

  /**
   * 수업 패키지 일괄 반영 (2026-06-19 신규).
   *
   * '수정하기' 클릭 시 추가/수정/삭제를 한 번에 원자적으로 반영하기 위한 엔드포인트.
   *  - upserts: id 없음 → create / id 있음 → update
   *  - deleteIds: 결제·수강 이력 있으면 soft delete(isActive=false), 없으면 hard delete
   *  - 전부 성공 또는 전부 롤백 ($transaction)
   * 권한: 단건 패키지 경로와 동일 (assertClassManagerPermission).
   */
  async bulkUpsertClassProducts(
    userId: string,
    userType: string,
    classId: string,
    dto: import("./dto/bulk-products.dto").BulkClassProductsDto,
  ) {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 패키지를 수정할 수 있습니다.",
      );

    const upserts = dto.upserts ?? [];
    const deleteIds = dto.deleteIds ?? [];

    // 빈 입력은 no-op — 현재 목록만 반환.
    if (upserts.length === 0 && deleteIds.length === 0) {
      return this.getClassProducts(classId, {
        id: userId,
        userType,
      } as JwtUserPayload);
    }

    // 후불(POSTPAID) 수업은 "1회 수업료" 단일 상품으로 출석 기반 정산하므로 신규 패키지
    //   추가(id 없는 upsert)와 삭제(deleteIds)를 차단한다. 기존 상품 수정(id 있음, 단가 변경
    //   등)만 허용 — UI 우회 직접 호출까지 막는 최종 방어선.
    if (billingMode === "POSTPAID") {
      if (upserts.some((item) => !item.id)) {
        throw new BadRequestException(
          "후불 수업은 출석 기반 정산만 지원하므로 추가 패키지를 등록할 수 없습니다.",
        );
      }
      if (deleteIds.length > 0) {
        throw new BadRequestException(
          "후불 수업은 출석 기반 정산에 필요한 1회 수업료 상품을 삭제할 수 없습니다.",
        );
      }
    }

    // 정기권 회수 cross 검증을 트랜잭션 진입 전 선검증 (불필요한 DB 작업 회피).
    for (const item of upserts) {
      if (item.feeType === "MONTHLY_FIXED") {
        this.assertMonthlyFixedSessions(
          item.productName,
          item.sessionsPerMonth,
          item.sessionsPerWeek,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1) deleteIds — soft/hard 판정. 모든 대상이 해당 classId 소속인지 확인.
      for (const productId of deleteIds) {
        const product = await tx.classProduct.findUnique({
          where: { id: productId },
          select: {
            id: true,
            classId: true,
            _count: { select: { payments: true, enrollments: true } },
          },
        });
        if (!product || product.classId !== classId) {
          throw new NotFoundException("패키지를 찾을 수 없습니다.");
        }
        const hasHistory =
          (product._count?.payments ?? 0) > 0 ||
          (product._count?.enrollments ?? 0) > 0;
        if (hasHistory) {
          await tx.classProduct.update({
            where: { id: productId },
            data: { isActive: false },
          });
        } else {
          await tx.classProduct.delete({ where: { id: productId } });
        }
      }

      // 2) upserts — id 없으면 create, 있으면 update(소속 확인).
      for (const item of upserts) {
        if (!item.id) {
          await tx.classProduct.create({
            data: {
              classId,
              productName: item.productName,
              description: item.description,
              price: item.price,
              feeType: item.feeType,
              sessionsPerMonth: item.sessionsPerMonth,
              durationDays: this.deriveBulkDurationDays(item),
              ...(item.sessionsPerWeek !== undefined && {
                sessionsPerWeek: item.sessionsPerWeek,
              }),
            },
          });
        } else {
          const existing = await tx.classProduct.findUnique({
            where: { id: item.id },
            select: { id: true, classId: true },
          });
          if (!existing || existing.classId !== classId) {
            throw new NotFoundException("패키지를 찾을 수 없습니다.");
          }
          await tx.classProduct.update({
            where: { id: item.id },
            data: {
              productName: item.productName,
              description: item.description,
              price: item.price,
              feeType: item.feeType,
              sessionsPerMonth: item.sessionsPerMonth,
              durationDays: this.deriveBulkDurationDays(item),
              ...(item.sessionsPerWeek !== undefined && {
                sessionsPerWeek: item.sessionsPerWeek,
              }),
            },
          });
        }
      }
    });

    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }

    // 갱신 후 활성 목록을 단건 GET 과 동일 형태로 반환 (운영자 시점 — 전체 노출).
    return this.getClassProducts(classId, {
      id: userId,
      userType,
    } as JwtUserPayload);
  }

  /**
   * Private: 클럽의 수업 목록 캐시 무효화
   * clubId가 null/undefined인 경우(아카데미 수업 등) 아무 작업도 하지 않음
   */
  private async invalidateClassCache(teamId: string | null | undefined) {
    if (!teamId) return;

    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.class;
    const cacheKey = `${keyPrefix}list:${teamId}`;

    await this.redisService.del(cacheKey);
  }

  /**
   * [M-1] 수강료(ClassProduct) 갱신 — wholesale delete+create 대신 id 보존 reconcile.
   *
   *   기존 코드의 deleteMany→createMany 는 enrollment/payment 가 참조하던 ClassProduct 를
   *   삭제해 FK(Enrollment.product onDelete:SetNull)를 끊었다. 그 결과 BOTH 수업의 후불 수강생
   *   enrollment.classProductId 가 NULL 이 되어 isStudentPostpaidForBothClass 가 후불을
   *   선불로 오판정(차감·노출·정산 깨짐)했다.
   *
   *   - 기존 행과 (feeType, billingTiming) 매칭 → 가격/회수 등 갱신(id 유지 → FK 보존)
   *   - 매칭 없는 desired → create
   *   - 매칭 안 된 잔여 기존 행 → enrollment/payment 미참조 시에만 delete(참조 시 FK 보존 위해 유지)
   */
  private async reconcileClassProducts(
    tx: Prisma.TransactionClient,
    classId: string,
    desired: ReturnType<typeof buildClassProducts>,
  ): Promise<void> {
    const existing = await tx.classProduct.findMany({
      where: { classId },
      select: {
        id: true,
        feeType: true,
        billingTiming: true,
        _count: { select: { enrollments: true, payments: true } },
      },
    });

    const keyOf = (p: {
      feeType: string;
      billingTiming?: string | null;
    }): string => `${p.feeType}::${p.billingTiming ?? "PREPAID"}`;

    const usedExistingIds = new Set<string>();
    for (const d of desired) {
      const match = existing.find(
        (e) => keyOf(e) === keyOf(d) && !usedExistingIds.has(e.id),
      );
      if (match) {
        usedExistingIds.add(match.id);
        await tx.classProduct.update({
          where: { id: match.id },
          data: {
            productName: d.productName,
            description: d.description ?? null,
            price: d.price,
            sessionsPerMonth: d.sessionsPerMonth,
            sessionsPerWeek: d.sessionsPerWeek ?? null,
            durationDays: d.durationDays,
            feePerSession: d.feePerSession ?? null,
            isActive: d.isActive ?? true,
          },
        });
      } else {
        await tx.classProduct.create({ data: d });
      }
    }

    // 잔여(매칭 안 된) 기존 행은 참조가 없을 때만 삭제 — 참조 중이면 FK 보존 위해 유지.
    for (const e of existing) {
      if (usedExistingIds.has(e.id)) continue;
      const referenced = e._count.enrollments > 0 || e._count.payments > 0;
      if (!referenced) {
        await tx.classProduct.delete({ where: { id: e.id } });
      }
    }
  }
}
